import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import {
  inspectAdministratorScenario,
  requiredEnvironmentValue,
} from '../src/admin-credentials/admin-credential-operation';

async function main(): Promise<void> {
  if (process.argv.length > 2) {
    throw new Error('Command-line arguments are not accepted');
  }
  const databaseUrl = requiredEnvironmentValue(process.env, 'DATABASE_URL');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const report = await inspectAdministratorScenario(prisma);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown inspection failure';
  console.error(`Administrator inspection failed: ${message}`);
  process.exitCode = 1;
});
