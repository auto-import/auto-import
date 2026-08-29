import { readFile, access } from 'node:fs/promises';

const migrations = [
  '20260829010000_erp_v2_phase1_crm_clients',
  '20260829020000_erp_v2_phase2_central_ged',
  '20260829030000_erp_v2_phase3_suppliers_offers',
  '20260829040000_erp_v2_phase4_contracts_finance',
  '20260829050000_erp_v2_phase5_shipping_customs',
];
const scripts = [
  'erp-v2-phase1-authenticated-smoke.mjs',
  'erp-v2-phase2-storage-preflight.mjs',
  'erp-v2-preflight-readonly.sql',
  'erp-v2-phase1-crm-reconciliation-readonly.sql',
  'erp-v2-phase1-migration-verify-readonly.sql',
  'erp-v2-phase2-ged-preflight-readonly.sql',
  'erp-v2-phase2-ged-reconciliation-readonly.sql',
  'erp-v2-phase3-suppliers-offers-preflight-readonly.sql',
  'erp-v2-phase3-suppliers-offers-reconciliation-readonly.sql',
  'erp-v2-phase4-finance-preflight-readonly.sql',
  'erp-v2-phase4-finance-reconciliation-readonly.sql',
  'erp-v2-phase5-logistics-preflight-readonly.sql',
  'erp-v2-phase5-logistics-reconciliation-readonly.sql',
  'erp-v2-authenticated-readonly-smoke.mjs',
];
const destructive = /\b(DROP\s+(TABLE|COLUMN)|TRUNCATE|DELETE\s+FROM|ALTER\s+COLUMN\s+[^;]+\s+SET\s+NOT\s+NULL)\b/i;

for (const migration of migrations) {
  const path = `prisma/migrations/${migration}/migration.sql`;
  const sql = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  if (destructive.test(sql)) throw new Error(`Destructive statement detected in ${path}`);
}
for (const script of scripts) await access(new URL(script, import.meta.url));

const dockerfile = await readFile(new URL('../Dockerfile.production', import.meta.url), 'utf8');
for (const script of scripts) {
  if (!dockerfile.includes(`/scripts/${script}`)) {
    throw new Error(`Runtime Dockerfile does not include ${script}`);
  }
}

process.stdout.write(`${JSON.stringify({ status: 'PASS', migrations: migrations.length, runtimeScripts: scripts.length })}\n`);
