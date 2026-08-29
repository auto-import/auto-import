import { access } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

if (process.env.GED_STORAGE_PREFLIGHT_READONLY !== 'YES') {
  throw new Error('Set GED_STORAGE_PREFLIGHT_READONLY=YES for an approved read-only target');
}
if (!process.env.READ_ONLY_DATABASE_URL) throw new Error('READ_ONLY_DATABASE_URL is required');
if (!process.env.PRIVATE_STORAGE_ROOT) throw new Error('PRIVATE_STORAGE_ROOT is required');

const root = path.resolve(process.env.PRIVATE_STORAGE_ROOT);
const pool = new pg.Pool({ connectionString: process.env.READ_ONLY_DATABASE_URL, max: 1 });

function resolveKey(storageKey) {
  const candidate = path.resolve(root, storageKey);
  if (!candidate.startsWith(`${root}${path.sep}`)) throw new Error('unsafe storage key');
  return candidate;
}

async function main() {
  const database = await pool.query(
    `SELECT current_database() database, current_setting('transaction_read_only') read_only`,
  );
  if (database.rows[0].read_only !== 'on') {
    throw new Error('Database session is not read-only');
  }
  const assets = await pool.query(`SELECT "storageKey" FROM "FileAsset"`);
  let missingPhysicalFiles = 0;
  let unsafeStorageKeys = 0;
  for (const { storageKey } of assets.rows) {
    try {
      await access(resolveKey(storageKey));
    } catch (error) {
      if (error instanceof Error && error.message === 'unsafe storage key') {
        unsafeStorageKeys += 1;
      } else {
        missingPhysicalFiles += 1;
      }
    }
  }
  process.stdout.write(
    `${JSON.stringify({
      database: database.rows[0].database,
      assets: assets.rowCount,
      missingPhysicalFiles,
      unsafeStorageKeys,
    })}\n`,
  );
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'GED storage preflight failed'}\n`);
    process.exitCode = 1;
  });
