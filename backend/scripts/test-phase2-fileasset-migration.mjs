import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const phase2Migration =
  "20260825140000_erp_phase2_finance_logistics_documents";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(scriptDirectory, "..", "prisma", "migrations");

const configuredUrl = process.env.DATABASE_URL;
if (!configuredUrl) throw new Error("DATABASE_URL is required");

const baseUrl = new URL(configuredUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname)) {
  throw new Error(
    `Refusing migration test against non-local PostgreSQL host ${baseUrl.hostname}`,
  );
}

const maintenanceUrl = new URL(baseUrl);
maintenanceUrl.pathname = "/postgres";
maintenanceUrl.search = "";

const suffix = `${process.pid}_${Date.now()}_${randomUUID().slice(0, 8)}`;
const databaseNames = {
  fresh: `codex_fa_fresh_${suffix}`,
  populated: `codex_fa_populated_${suffix}`,
  conflict: `codex_fa_conflict_${suffix}`,
  orphan: `codex_fa_orphan_${suffix}`,
};

for (const databaseName of Object.values(databaseNames)) {
  if (!/^[a-z0-9_]+$/.test(databaseName)) {
    throw new Error(`Unsafe disposable database name: ${databaseName}`);
  }
}

const migrationNames = (await readdir(migrationsDirectory, {
  withFileTypes: true,
}))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const phase2Index = migrationNames.indexOf(phase2Migration);
if (phase2Index === -1) throw new Error("Phase 2 migration was not found");
const predecessorMigrations = migrationNames.slice(0, phase2Index);
const phase2Sql = await readFile(
  join(migrationsDirectory, phase2Migration, "migration.sql"),
  "utf8",
);

async function withClient(connectionUrl, callback) {
  const client = new Client({ connectionString: connectionUrl.toString() });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

function urlFor(databaseName) {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  url.search = "";
  return url;
}

async function createDatabase(databaseName) {
  await withClient(maintenanceUrl, (client) =>
    client.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`),
  );
}

async function dropDatabase(databaseName) {
  await withClient(maintenanceUrl, async (client) => {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  });
}

async function applyMigrations(client, names) {
  for (const migrationName of names) {
    const sql = await readFile(
      join(migrationsDirectory, migrationName, "migration.sql"),
      "utf8",
    );
    await client.query(sql);
  }
}

const organizationA = "91000000-0000-4000-8000-000000000001";
const organizationB = "92000000-0000-4000-8000-000000000001";
const userA = "91000000-0000-4000-8000-000000000002";
const userB = "92000000-0000-4000-8000-000000000002";

async function insertTenants(client) {
  await client.query(
    `INSERT INTO "Organization" ("id", "name", "type", "status", "createdAt", "updatedAt")
     VALUES ($1, 'Tenant A', 'tenant', 'active', now(), now()),
            ($2, 'Tenant B', 'tenant', 'active', now(), now())`,
    [organizationA, organizationB],
  );
  await client.query(
    `INSERT INTO "User" ("id", "organizationId", "firstName", "lastName", "email", "passwordHash", "status", "createdAt", "updatedAt")
     VALUES ($1, $2, 'User', 'A', 'migration-a@example.test', 'not-a-login-hash', 'active', now(), now()),
            ($3, $4, 'User', 'B', 'migration-b@example.test', 'not-a-login-hash', 'active', now(), now())`,
    [userA, organizationA, userB, organizationB],
  );
}

async function insertVehicle(client, id, organizationId) {
  await client.query(
    `INSERT INTO "Vehicle" ("id", "organizationId", "brand", "model", "acquisitionType", "status", "createdAt", "updatedAt")
     VALUES ($1, $2, 'Migration', 'Fixture', 'stock', 'available', now(), now())`,
    [id, organizationId],
  );
}

async function insertFile(client, id, uploadedBy) {
  await client.query(
    `INSERT INTO "FileAsset" ("id", "storageKey", "originalName", "mimeType", "size", "category", "uploadedBy", "createdAt")
     VALUES ($1, $2, $3, 'application/pdf', 1, 'document', $4, now())`,
    [id, `migration/${id}`, `${id}.pdf`, uploadedBy],
  );
}

async function testFreshChain() {
  await createDatabase(databaseNames.fresh);
  await withClient(urlFor(databaseNames.fresh), async (client) => {
    await applyMigrations(client, migrationNames);
    const result = await client.query(
      `SELECT is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'FileAsset' AND column_name = 'organizationId'`,
    );
    if (result.rows[0]?.is_nullable !== "NO") {
      throw new Error("Fresh migration chain did not enforce FileAsset.organizationId NOT NULL");
    }
  });
}

async function testPopulatedPredecessor() {
  const fileUploader = "file-uploader";
  const fileParent = "file-parent";
  const fileConsistent = "file-consistent";
  const vehicleA = "vehicle-a";
  const vehicleB = "vehicle-b";
  const customsA = "customs-a";

  await createDatabase(databaseNames.populated);
  await withClient(urlFor(databaseNames.populated), async (client) => {
    await applyMigrations(client, predecessorMigrations);
    await insertTenants(client);
    await insertVehicle(client, vehicleA, organizationA);
    await insertVehicle(client, vehicleB, organizationB);
    await insertFile(client, fileUploader, userA);
    await insertFile(client, fileConsistent, userA);

    await client.query(
      `INSERT INTO "VehiclePhoto" ("id", "vehicleId", "fileId", "createdAt")
       VALUES ('photo-consistent', $1, $2, now())`,
      [vehicleA, fileConsistent],
    );
    await client.query(
      `INSERT INTO "CustomsFile" ("id", "organizationId", "reference", "status", "openedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 'CUSTOMS-A', 'open', now(), now(), now())`,
      [customsA, organizationA],
    );
    await client.query(
      `INSERT INTO "CustomsDocument" ("id", "customsFileId", "fileId", "status", "uploadedAt")
       VALUES ('customs-document-consistent', $1, $2, 'pending', now())`,
      [customsA, fileConsistent],
    );
    await client.query(
      `INSERT INTO "BusinessDocument" ("id", "fileId", "uploadedBy", "entityType", "entityId", "createdAt")
       VALUES ('business-document-consistent', $1, $2, 'vehicle', $3, now())`,
      [fileConsistent, userA, vehicleA],
    );

    // A predecessor FK normally guarantees an uploader. Dropping it only in
    // this disposable fixture proves a valid tenant parent can still provide
    // deterministic ownership for legacy data with missing uploader evidence.
    await client.query(
      `ALTER TABLE "FileAsset" DROP CONSTRAINT "FileAsset_uploadedBy_fkey"`,
    );
    await insertFile(client, fileParent, "missing-legacy-uploader");
    await client.query(
      `INSERT INTO "VehiclePhoto" ("id", "vehicleId", "fileId", "createdAt")
       VALUES ('photo-parent', $1, $2, now())`,
      [vehicleB, fileParent],
    );

    await client.query(phase2Sql);

    const ownership = await client.query(
      `SELECT "id", "organizationId" FROM "FileAsset" ORDER BY "id"`,
    );
    const actual = Object.fromEntries(
      ownership.rows.map((row) => [row.id, row.organizationId]),
    );
    const expected = {
      [fileUploader]: organizationA,
      [fileParent]: organizationB,
      [fileConsistent]: organizationA,
    };
    if (
      Object.keys(expected).some((fileId) => actual[fileId] !== expected[fileId]) ||
      Object.keys(actual).length !== Object.keys(expected).length
    ) {
      throw new Error(
        `Unexpected populated ownership result: ${JSON.stringify(actual)}`,
      );
    }

    const constraints = await client.query(
      `SELECT
         (SELECT is_nullable = 'NO' FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'FileAsset' AND column_name = 'organizationId') AS not_null,
         EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FileAsset_organizationId_fkey' AND contype = 'f') AS foreign_key,
         EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'FileAsset_organizationId_category_status_idx') AS tenant_index`,
    );
    const checks = constraints.rows[0];
    if (!checks?.not_null || !checks?.foreign_key || !checks?.tenant_index) {
      throw new Error(`Final FileAsset constraints missing: ${JSON.stringify(checks)}`);
    }
  });
}

async function expectSafeFailure(databaseName, fixture, expectedFragments) {
  await createDatabase(databaseName);
  await withClient(urlFor(databaseName), async (client) => {
    await applyMigrations(client, predecessorMigrations);
    await insertTenants(client);
    await fixture(client);
    try {
      await client.query(phase2Sql);
      throw new Error("Migration unexpectedly succeeded");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const fragment of expectedFragments) {
        if (!message.includes(fragment)) {
          throw new Error(
            `Safe failure did not report ${fragment}: ${message}`,
          );
        }
      }
    }
  });
}

async function testConflictingSources() {
  await expectSafeFailure(
    databaseNames.conflict,
    async (client) => {
      await insertVehicle(client, "vehicle-conflict", organizationB);
      await insertFile(client, "file-conflict", userA);
      await client.query(
        `INSERT INTO "VehiclePhoto" ("id", "vehicleId", "fileId", "createdAt")
         VALUES ('photo-conflict', 'vehicle-conflict', 'file-conflict', now())`,
      );
    },
    ["FileAsset ownership conflicts", "file-conflict", organizationA, organizationB],
  );
}

async function testUnownedOrphan() {
  await expectSafeFailure(
    databaseNames.orphan,
    async (client) => {
      await client.query(
        `ALTER TABLE "FileAsset" DROP CONSTRAINT "FileAsset_uploadedBy_fkey"`,
      );
      await insertFile(client, "file-orphan", "missing-legacy-uploader");
    },
    ["Unresolved FileAsset ownership", "count=1", "file-orphan", "evidence=<none>"],
  );
}

try {
  await testFreshChain();
  await testPopulatedPredecessor();
  await testConflictingSources();
  await testUnownedOrphan();
  console.log(
    "PHASE2_FILEASSET_MIGRATION_PASS fresh populated uploader parent consistent conflict orphan constraints",
  );
} finally {
  for (const databaseName of Object.values(databaseNames).reverse()) {
    await dropDatabase(databaseName);
  }
}
