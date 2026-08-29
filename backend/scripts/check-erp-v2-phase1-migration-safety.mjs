import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  scriptDirectory,
  '../prisma/migrations/20260829010000_erp_v2_phase1_crm_clients/migration.sql',
);
const sql = await readFile(migrationPath, 'utf8');

const assertions = {
  noDropTable: !/\bDROP\s+TABLE\b/i.test(sql),
  noDropColumn: !/\bDROP\s+COLUMN\b/i.test(sql),
  noTruncate: !/\bTRUNCATE\b/i.test(sql),
  noBusinessDelete: !/\bDELETE\s+FROM\b/i.test(sql),
  noPhoneProjectionUniqueIndex:
    !/CREATE\s+UNIQUE\s+INDEX[^;]*(Prospect|Client)[^;]*phoneNormalized/is.test(
      sql,
    ),
  sourcePreserved:
    /SET\s+"legacySource"\s*=\s*"source"/i.test(sql) &&
    !/DROP\s+COLUMN\s+"source"/i.test(sql),
  unknownMappingsFlagged:
    /"reconciliationRequired"\s*=\s*CASE/i.test(sql) &&
    /SET\s+"reconciliationRequired"\s*=\s*true/i.test(sql),
  archiveCompatibilityAdded:
    /ADD\s+COLUMN\s+"archivedAt"/i.test(sql) &&
    /ADD\s+COLUMN\s+"archiveReason"/i.test(sql),
  legacyRollbackColumnsRetained:
    !/DROP\s+COLUMN\s+"status"/i.test(sql) &&
    !/DROP\s+COLUMN\s+"source"/i.test(sql) &&
    !/DROP\s+COLUMN\s+"prospectId"/i.test(sql),
  contactConstraintReplacedWithoutRowMutation:
    /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+"ContactPoint_exactly_one_owner_check"/i.test(
      sql,
    ) &&
    /ADD\s+CONSTRAINT\s+"ContactPoint_at_least_one_owner_check"/i.test(sql),
};

const failures = Object.entries(assertions)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
if (failures.length > 0) {
  throw new Error(
    `Phase 1 migration safety assertions failed: ${failures.join(', ')}`,
  );
}

process.stdout.write(
  `${JSON.stringify({
    status: 'PASS',
    migration: '20260829010000_erp_v2_phase1_crm_clients',
    assertions,
    note: 'The only DROP is replacement of the incompatible ContactPoint CHECK constraint; no table, column, or business row is removed.',
  })}\n`,
);
