import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import pg from 'pg';
import {
  BCRYPT_ROUNDS,
  ROTATION_CONFIRMATION_PREFIX,
  assertDatabaseConfirmation,
  readAdministratorPassword,
  requiredEnvironmentValue,
  rotateOrCreateAdministrator,
} from '../src/admin-credentials/admin-credential-operation';

async function main(): Promise<void> {
  if (process.argv.length > 2) {
    throw new Error(
      'Command-line arguments are not accepted; passwords and selectors must never be passed as arguments',
    );
  }
  const databaseUrl = requiredEnvironmentValue(process.env, 'DATABASE_URL');
  assertDatabaseConfirmation(
    databaseUrl,
    process.env.ADMIN_ROTATE_CONFIRM,
    ROTATION_CONFIRMATION_PREFIX,
  );
  const password = await readAdministratorPassword(
    requiredEnvironmentValue(process.env, 'ADMIN_PASSWORD_FILE'),
  );
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await rotateOrCreateAdministrator(prisma, {
      passwordHash,
      targetUserId: process.env.ADMIN_TARGET_USER_ID?.trim() || undefined,
      targetOrganizationId:
        process.env.ADMIN_TARGET_ORGANIZATION_ID?.trim() || undefined,
      firstName: process.env.ADMIN_FIRST_NAME,
      lastName: process.env.ADMIN_LAST_NAME,
    });
    console.log(
      `Administrator ${result.action} safely (scenario ${result.scenario}, organization ${result.organizationId}, user ${result.userId}, email ${result.email}, refresh sessions deleted ${result.refreshSessionsDeleted}).`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : 'Unknown credential rotation failure';
  console.error(`Administrator credential operation failed: ${message}`);
  process.exitCode = 1;
});
