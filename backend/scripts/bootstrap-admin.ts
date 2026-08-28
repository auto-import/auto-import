import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import pg from 'pg';
import {
  ADMIN_EMAIL,
  BCRYPT_ROUNDS,
  BOOTSTRAP_CONFIRMATION_PREFIX,
  assertDatabaseConfirmation,
  bootstrapInitialAdministrator,
  readAdministratorPassword,
} from '../src/admin-credentials/admin-credential-operation';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  if (process.argv.length > 2) {
    throw new Error(
      'Command-line arguments are not accepted; the password must never be passed as an argument',
    );
  }
  const databaseUrl = required('DATABASE_URL');
  assertDatabaseConfirmation(
    databaseUrl,
    process.env.BOOTSTRAP_CONFIRM,
    BOOTSTRAP_CONFIRMATION_PREFIX,
  );

  const organizationName = required('BOOTSTRAP_ORGANIZATION_NAME');
  const firstName = required('BOOTSTRAP_ADMIN_FIRST_NAME');
  const lastName = required('BOOTSTRAP_ADMIN_LAST_NAME');
  const email = required('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  if (email !== ADMIN_EMAIL) {
    throw new Error(`BOOTSTRAP_ADMIN_EMAIL must equal ${ADMIN_EMAIL}`);
  }
  const password = await readAdministratorPassword(
    required('BOOTSTRAP_PASSWORD_FILE'),
  );

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await bootstrapInitialAdministrator(prisma, {
      organizationName,
      firstName,
      lastName,
      email,
      passwordHash,
    });

    console.log(
      `Initial administrator created once (organization ${result.organizationId}, user ${result.userId}).`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown bootstrap failure';
  console.error(`Bootstrap failed: ${message}`);
  process.exitCode = 1;
});
