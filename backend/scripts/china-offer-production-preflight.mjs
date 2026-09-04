import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const requiredMigration =
  '20260904120000_reconcile_china_offer_nullable_prices';

async function query(text, values = []) {
  const result = await pool.query(text, values);
  return result.rows;
}

try {
  const [columns, migration, tables, anomalies] = await Promise.all([
    query(`
      SELECT "column_name", "is_nullable", "data_type"
      FROM "information_schema"."columns"
      WHERE "table_schema" = 'public'
        AND "table_name" = 'ChinaOffer'
        AND "column_name" IN (
          'cifPrice', 'ddpPrice', 'purchasePrice', 'supplierPrice', 'offerStatus'
        )
      ORDER BY "column_name"
    `),
    query(
      `SELECT "migration_name", "finished_at" IS NOT NULL AS "finished",
              "rolled_back_at" IS NOT NULL AS "rolledBack"
       FROM "_prisma_migrations"
       WHERE "migration_name" = $1`,
      [requiredMigration],
    ),
    query(`
      SELECT "table_name"
      FROM "information_schema"."tables"
      WHERE "table_schema" = 'public'
        AND "table_name" IN (
          'ChinaOffer', 'ChinaOfferVehicle', 'OfferPhoto', 'FileAsset',
          'Purchase', 'Cost', 'FinanceTransaction'
        )
      ORDER BY "table_name"
    `),
    query(`
      SELECT
        count(*) FILTER (
          WHERE offer."supplierPrice" IS NULL AND offer."purchasePrice" IS NULL
        )::int AS "offersWithoutSupplierPrice",
        count(*) FILTER (
          WHERE offer."offerStatus" = 'PURCHASED'
            AND NOT EXISTS (
              SELECT 1 FROM "Purchase" purchase
              WHERE purchase."sourceOfferId" = offer."id"
                AND purchase."status" <> 'cancelled'
            )
        )::int AS "purchasedOffersWithoutPurchase"
      FROM "ChinaOffer" offer
    `),
  ]);

  const storageRoot = path.resolve(
    process.env.PRIVATE_STORAGE_ROOT ??
      path.join(process.cwd(), 'storage', 'private'),
  );
  let storage = {
    rootConfigured: Boolean(process.env.PRIVATE_STORAGE_ROOT),
    accessible: false,
  };
  try {
    await fs.promises.access(
      storageRoot,
      fs.constants.R_OK | fs.constants.W_OK,
    );
    storage = { ...storage, accessible: true };
  } catch {
    // Report only the boolean result; do not disclose host paths or credentials.
  }

  const nullablePrices = ['cifPrice', 'ddpPrice'].every(
    (name) =>
      columns.find((column) => column.column_name === name)?.is_nullable ===
      'YES',
  );
  const requiredTables = [
    'ChinaOffer',
    'ChinaOfferVehicle',
    'OfferPhoto',
    'FileAsset',
    'Purchase',
    'Cost',
    'FinanceTransaction',
  ];
  const foundTables = new Set(tables.map((row) => row.table_name));
  const checks = {
    revision: process.env.APP_COMMIT_SHA ?? 'unknown',
    requiredMigrationApplied:
      migration.length === 1 &&
      migration[0].finished &&
      !migration[0].rolledBack,
    nullableLegacyPrices: nullablePrices,
    requiredTablesPresent: requiredTables.every((table) =>
      foundTables.has(table),
    ),
    storage,
    anomalies: anomalies[0] ?? {},
  };
  console.log(JSON.stringify(checks, null, 2));
  if (
    !checks.requiredMigrationApplied ||
    !checks.nullableLegacyPrices ||
    !checks.requiredTablesPresent ||
    !checks.storage.accessible
  ) {
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
