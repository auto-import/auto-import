import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import {
  normalizePassport,
  SensitiveFieldService,
} from '../src/common/security/sensitive-field.service';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const pool = new pg.Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const sensitive = new SensitiveFieldService();

async function main(): Promise<void> {
  const clients = await prisma.client.findMany({
    where: { passportNumber: { not: null } },
    select: { id: true, organizationId: true, passportNumber: true },
    orderBy: { id: 'asc' },
  });
  const prepared = clients.map((client) => {
    const normalized = normalizePassport(client.passportNumber ?? '');
    return {
      id: client.id,
      organizationId: client.organizationId,
      encrypted: sensitive.encrypt(normalized, 'pii'),
      lookupHash: sensitive.blindHash(client.organizationId, normalized),
    };
  });
  const seen = new Set<string>();
  for (const client of prepared) {
    const scopedHash = `${client.organizationId}:${client.lookupHash}`;
    if (seen.has(scopedHash)) {
      throw new Error(
        'Duplicate legacy passport identifiers exist inside one organization; resolve them before backfill',
      );
    }
    seen.add(scopedHash);
  }

  await prisma.$transaction(
    prepared.map((client) =>
      prisma.client.update({
        where: { id: client.id },
        data: {
          passportEncrypted: client.encrypted,
          passportLookupHash: client.lookupHash,
          passportNumber: null,
        },
      }),
    ),
  );
  process.stdout.write(
    `Client identity backfill complete: ${prepared.length} legacy passport value(s) encrypted and cleared.\n`,
  );
}

main()
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : 'Unknown backfill error';
    process.stderr.write(`Client identity backfill failed: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
