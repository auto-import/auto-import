import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const databaseName = new URL(connectionString).pathname.replace(/^\//, '');
if (!/^codex_(demo|post)_/.test(databaseName)) {
  throw new Error('Data-safety probe requires a codex task-owned database');
}

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const integration = await client.query<{
      integrationRows: number;
      encryptedRows: number;
      nonEnvelopeRows: number;
    }>(`
    SELECT
      COUNT(*)::int AS "integrationRows",
      COUNT(*) FILTER (WHERE "encryptedCredentials" LIKE 'v1.%')::int AS "encryptedRows",
      COUNT(*) FILTER (
        WHERE "encryptedCredentials" IS NOT NULL
          AND "encryptedCredentials" NOT LIKE 'v1.%'
      )::int AS "nonEnvelopeRows"
    FROM "IntegrationConfig"
  `);
    const identity = await client.query<{
      encryptedNin: number;
      encryptedPassport: number;
      legacyPlaintext: number;
    }>(`
    SELECT
      COUNT(*) FILTER (WHERE "ninEncrypted" LIKE 'v1.%')::int AS "encryptedNin",
      COUNT(*) FILTER (WHERE "passportEncrypted" LIKE 'v1.%')::int AS "encryptedPassport",
      COUNT(*) FILTER (WHERE "passportNumber" IS NOT NULL)::int AS "legacyPlaintext"
    FROM "Client"
  `);
    const evidence = await client.query<{
      evidenceRows: number;
      reliedRows: number;
    }>(`
    SELECT
      COUNT(*)::int AS "evidenceRows",
      COUNT(*) FILTER (WHERE "reliedAt" IS NOT NULL)::int AS "reliedRows"
    FROM "DossierCheckpointEvidence"
  `);

    const result = {
      integration: integration.rows[0],
      identity: identity.rows[0],
      evidence: evidence.rows[0],
    };
    if (
      result.integration.encryptedRows < 1 ||
      result.integration.nonEnvelopeRows !== 0 ||
      result.identity.encryptedNin < 1 ||
      result.identity.encryptedPassport < 1 ||
      result.identity.legacyPlaintext !== 0 ||
      result.evidence.evidenceRows < 1 ||
      result.evidence.reliedRows < 1
    ) {
      throw new Error(
        `Data-safety invariant failed: ${JSON.stringify(result)}`,
      );
    }
    console.log(`POST_UAT_DATA_SAFETY_PASS ${JSON.stringify(result)}`);
  } finally {
    await client.end();
  }
}

void main();
