import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log('--- Verifying CRM Status Cleanup in Database ---');

    // 1. Prospect grouped by crmStatus
    const prospectGroupRes = await client.query(`
      SELECT "crmStatus", COUNT(*)::int AS count
      FROM "Prospect"
      GROUP BY "crmStatus"
      ORDER BY "crmStatus" ASC NULLS LAST;
    `);
    console.log('\nProspect.crmStatus grouped:');
    console.table(prospectGroupRes.rows);

    // 2. ProspectStatusHistory grouped by toStatus
    const historyToGroupRes = await client.query(`
      SELECT "toStatus", COUNT(*)::int AS count
      FROM "ProspectStatusHistory"
      GROUP BY "toStatus"
      ORDER BY "toStatus" ASC NULLS LAST;
    `);
    console.log('\nProspectStatusHistory.toStatus grouped:');
    console.table(historyToGroupRes.rows);

    // 3. ProspectStatusHistory grouped by fromStatus
    const historyFromGroupRes = await client.query(`
      SELECT "fromStatus", COUNT(*)::int AS count
      FROM "ProspectStatusHistory"
      GROUP BY "fromStatus"
      ORDER BY "fromStatus" ASC NULLS LAST;
    `);
    console.log('\nProspectStatusHistory.fromStatus grouped:');
    console.table(historyFromGroupRes.rows);

    // 4. Exact counts for CONTRACT and DEPOSIT
    const prospectContractRes = await client.query(`
      SELECT COUNT(*)::int AS count FROM "Prospect" WHERE "crmStatus" = 'CONTRACT';
    `);
    const prospectDepositRes = await client.query(`
      SELECT COUNT(*)::int AS count FROM "Prospect" WHERE "crmStatus" = 'DEPOSIT';
    `);
    const historyToContractRes = await client.query(`
      SELECT COUNT(*)::int AS count FROM "ProspectStatusHistory" WHERE "toStatus" = 'CONTRACT';
    `);
    const historyToDepositRes = await client.query(`
      SELECT COUNT(*)::int AS count FROM "ProspectStatusHistory" WHERE "toStatus" = 'DEPOSIT';
    `);
    const historyFromContractRes = await client.query(`
      SELECT COUNT(*)::int AS count FROM "ProspectStatusHistory" WHERE "fromStatus" = 'CONTRACT';
    `);
    const historyFromDepositRes = await client.query(`
      SELECT COUNT(*)::int AS count FROM "ProspectStatusHistory" WHERE "fromStatus" = 'DEPOSIT';
    `);

    const summary = {
      prospectContract: prospectContractRes.rows[0].count,
      prospectDeposit: prospectDepositRes.rows[0].count,
      historyToContract: historyToContractRes.rows[0].count,
      historyToDeposit: historyToDepositRes.rows[0].count,
      historyFromContract: historyFromContractRes.rows[0].count,
      historyFromDeposit: historyFromDepositRes.rows[0].count,
    };

    console.log('\nSummary counts:');
    console.table(summary);

    const totalOldStatuses =
      summary.prospectContract +
      summary.prospectDeposit +
      summary.historyToContract +
      summary.historyToDeposit +
      summary.historyFromContract +
      summary.historyFromDeposit;

    if (totalOldStatuses > 0) {
      console.error(`\nFAIL: Found ${totalOldStatuses} old CONTRACT/DEPOSIT CRM status occurrences in DB!`);
      process.exit(1);
    } else {
      console.log('\nPASS: Zero CONTRACT/DEPOSIT CRM status records found in database.');
    }
  } catch (err) {
    console.error('Error during verification:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
