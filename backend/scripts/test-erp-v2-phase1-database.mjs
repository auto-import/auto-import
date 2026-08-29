import pg from 'pg';

if (process.env.PHASE1_DISPOSABLE_TEST !== 'YES') {
  throw new Error('Set PHASE1_DISPOSABLE_TEST=YES only for an isolated disposable database');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const prefix = `phase1-dbtest-${Date.now()}`;

async function concurrentTransaction(work) {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    await work(connection);
    await connection.query('COMMIT');
    return 'committed';
  } catch (error) {
    await connection.query('ROLLBACK');
    if (error && typeof error === 'object' && error.code === '23505') return 'unique-conflict';
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  const database = (await pool.query('SELECT current_database() database')).rows[0].database;
  if (!/^phase1_(fresh|legacy)$/.test(database)) {
    throw new Error(`Refusing non-disposable database ${database}`);
  }
  const organizationId = `${prefix}-org`;
  const userId = `${prefix}-user`;
  await pool.query(
    `INSERT INTO "Organization" (id,name,type,status,"createdAt","updatedAt") VALUES ($1,'Phase 1 DB test','test','active',now(),now())`,
    [organizationId],
  );
  await pool.query(
    `INSERT INTO "User" (id,"organizationId","firstName","lastName",email,"passwordHash",status,locale,"createdAt","updatedAt") VALUES ($1,$2,'DB','Test',$3,'not-a-real-hash','active','fr',now(),now())`,
    [userId, organizationId, `${prefix}@example.invalid`],
  );

  const duplicateResults = await Promise.all([
    concurrentTransaction(async (connection) => {
      await connection.query(
        `INSERT INTO "Prospect" (id,"organizationId","firstName","lastName",phone,"phoneNormalized",status,"crmStatus",qualification,"createdAt","updatedAt") VALUES ($1,$2,'Concurrent','A','0550000000','+213550000000','new','NEW','UNCLASSIFIED',now(),now())`,
        [`${prefix}-lead-a`, organizationId],
      );
      await connection.query(
        `INSERT INTO "ContactPoint" (id,"organizationId",kind,"displayValue","normalizedValue","prospectId",preferred,verified,"createdAt","updatedAt") VALUES ($1,$2,'PHONE','0550000000','+213550000000',$3,true,false,now(),now())`,
        [`${prefix}-contact-a`, organizationId, `${prefix}-lead-a`],
      );
    }),
    concurrentTransaction(async (connection) => {
      await connection.query(
        `INSERT INTO "Prospect" (id,"organizationId","firstName","lastName",phone,"phoneNormalized",status,"crmStatus",qualification,"createdAt","updatedAt") VALUES ($1,$2,'Concurrent','B','00213550000000','+213550000000','new','NEW','UNCLASSIFIED',now(),now())`,
        [`${prefix}-lead-b`, organizationId],
      );
      await connection.query(
        `INSERT INTO "ContactPoint" (id,"organizationId",kind,"displayValue","normalizedValue","prospectId",preferred,verified,"createdAt","updatedAt") VALUES ($1,$2,'PHONE','00213550000000','+213550000000',$3,true,false,now(),now())`,
        [`${prefix}-contact-b`, organizationId, `${prefix}-lead-b`],
      );
    }),
  ]);
  const duplicateCounts = await pool.query(
    `SELECT (SELECT count(*)::int FROM "Prospect" WHERE "organizationId"=$1 AND "phoneNormalized"='+213550000000') prospects, (SELECT count(*)::int FROM "ContactPoint" WHERE "organizationId"=$1 AND "normalizedValue"='+213550000000') contacts`,
    [organizationId],
  );
  if (duplicateResults.filter((value) => value === 'committed').length !== 1 || duplicateCounts.rows[0].prospects !== 1 || duplicateCounts.rows[0].contacts !== 1) {
    throw new Error('Concurrent duplicate lead protection failed');
  }

  const conversionLeadId = `${prefix}-conversion-lead`;
  await pool.query(
    `INSERT INTO "Prospect" (id,"organizationId","firstName","lastName",status,"crmStatus",qualification,"createdAt","updatedAt") VALUES ($1,$2,'Convert','Once','won','DEPOSIT','HOT',now(),now())`,
    [conversionLeadId, organizationId],
  );
  for (const suffix of ['a', 'b']) {
    await pool.query(
      `INSERT INTO "Client" (id,"organizationId","firstName","lastName",status,"assignedTo","createdAt","updatedAt") VALUES ($1,$2,'Client',$3,'active',$4,now(),now())`,
      [`${prefix}-client-${suffix}`, organizationId, suffix.toUpperCase(), userId],
    );
  }
  const conversionResults = await Promise.all(
    ['a', 'b'].map((suffix) =>
      concurrentTransaction((connection) =>
        connection.query(
          `INSERT INTO "ProspectConversion" (id,"organizationId","prospectId","clientId","convertedBy","convertedAt") VALUES ($1,$2,$3,$4,$5,now())`,
          [`${prefix}-conversion-${suffix}`, organizationId, conversionLeadId, `${prefix}-client-${suffix}`, userId],
        ),
      ),
    ),
  );
  const conversionCount = Number(
    (await pool.query(`SELECT count(*) count FROM "ProspectConversion" WHERE "prospectId"=$1`, [conversionLeadId])).rows[0].count,
  );
  if (conversionResults.filter((value) => value === 'committed').length !== 1 || conversionCount !== 1) {
    throw new Error('Concurrent conversion protection failed');
  }

  const winningClient = (
    await pool.query(`SELECT "clientId" FROM "ProspectConversion" WHERE "prospectId"=$1`, [conversionLeadId])
  ).rows[0].clientId;
  await pool.query(
    `INSERT INTO "Dossier" (id,"organizationId",reference,type,"clientId",status,"salesUserId","openedAt","createdAt","updatedAt") VALUES ($1,$2,$3,'VEHICLE_SALE_CIF',$4,'offerSelected',$5,now(),now(),now()),($6,$2,$7,'SHIPPING_ONLY',$4,'clientRegistered',$5,now(),now(),now())`,
    [`${prefix}-dossier-a`, organizationId, `${prefix}-A`, winningClient, userId, `${prefix}-dossier-b`, `${prefix}-B`],
  );
  const dossierCount = Number(
    (await pool.query(`SELECT count(*) count FROM "Dossier" WHERE "clientId"=$1`, [winningClient])).rows[0].count,
  );
  if (dossierCount !== 2) throw new Error('One client / multiple dossiers invariant failed');

  process.stdout.write(
    JSON.stringify({
      database,
      concurrentLeadTransactions: duplicateResults,
      concurrentConversionTransactions: conversionResults,
      canonicalLeadCount: duplicateCounts.rows[0].prospects,
      canonicalContactCount: duplicateCounts.rows[0].contacts,
      conversionCount,
      dossierCount,
    }) + '\n',
  );
}

main()
  .finally(async () => pool.end())
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Unknown database test error'}\n`);
    process.exitCode = 1;
  });
