import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import {
  PrismaClient,
  type Permission as PermissionRecord,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ALL_PERMISSIONS } from '@auto-import/contracts';
import * as bcrypt from 'bcrypt';
import pg from 'pg';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function validatePassword(password: string): void {
  if (password.length < 20 || password.length > 128) {
    throw new Error('Bootstrap password must contain 20 to 128 characters');
  }
  const characterClasses = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];
  if (characterClasses.filter((pattern) => pattern.test(password)).length < 3) {
    throw new Error(
      'Bootstrap password must use at least three character classes',
    );
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  const databaseUrl = required('DATABASE_URL');
  const parsedDatabaseUrl = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL');
  }
  const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
  if (!databaseName)
    throw new Error('DATABASE_URL must include a database name');
  const expectedConfirmation = `CREATE_INITIAL_ADMIN:${databaseName}`;
  if (required('BOOTSTRAP_CONFIRM') !== expectedConfirmation) {
    throw new Error(`BOOTSTRAP_CONFIRM must equal ${expectedConfirmation}`);
  }

  const organizationName = required('BOOTSTRAP_ORGANIZATION_NAME');
  const firstName = required('BOOTSTRAP_ADMIN_FIRST_NAME');
  const lastName = required('BOOTSTRAP_ADMIN_LAST_NAME');
  const email = required('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  if (
    organizationName.length > 160 ||
    firstName.length > 80 ||
    lastName.length > 80
  ) {
    throw new Error('Bootstrap identity input exceeds the supported length');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
  }

  const passwordFile = required('BOOTSTRAP_PASSWORD_FILE');
  let passwordInput: string;
  if (passwordFile === '-') {
    if (process.stdin.isTTY) {
      throw new Error('Piped stdin is required when BOOTSTRAP_PASSWORD_FILE=-');
    }
    passwordInput = await readStdin();
  } else {
    if (!isAbsolute(passwordFile)) {
      throw new Error('BOOTSTRAP_PASSWORD_FILE must be an absolute path');
    }
    const passwordStat = await stat(passwordFile);
    if (!passwordStat.isFile())
      throw new Error('BOOTSTRAP_PASSWORD_FILE must be a file');
    if (process.platform !== 'win32' && (passwordStat.mode & 0o077) !== 0) {
      throw new Error(
        'BOOTSTRAP_PASSWORD_FILE must not be accessible by group or others',
      );
    }
    passwordInput = await readFile(passwordFile, 'utf8');
  }
  const password = passwordInput.replace(/[\r\n]+$/, '');
  validatePassword(password);

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await prisma.$transaction(async (tx) => {
      const [organizationCount, userCount] = await Promise.all([
        tx.organization.count(),
        tx.user.count(),
      ]);
      if (organizationCount !== 0 || userCount !== 0) {
        throw new Error(
          'Bootstrap refused: organizations or users already exist',
        );
      }

      const permissions: PermissionRecord[] = [];
      for (const permissionKey of ALL_PERMISSIONS) {
        const separator = permissionKey.lastIndexOf(':');
        const resource = permissionKey.slice(0, separator);
        const action = permissionKey.slice(separator + 1);
        permissions.push(
          await tx.permission.upsert({
            where: { resource_action: { resource, action } },
            update: {},
            create: { resource, action },
          }),
        );
      }

      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          type: 'headquarters',
          status: 'active',
        },
      });
      await tx.organizationSettings.create({
        data: {
          organizationId: organization.id,
          displayName: organizationName,
        },
      });
      const role = await tx.role.create({
        data: {
          organizationId: organization.id,
          name: 'Admin',
          scope: 'tenant',
          description: 'Initial tenant administrator',
          rolePermissions: {
            create: permissions.map((permission) => ({
              permissionId: permission.id,
            })),
          },
        },
      });
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          firstName,
          lastName,
          email,
          passwordHash,
          locale: 'fr',
          status: 'active',
          userRoles: { create: { roleId: role.id } },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          action: 'bootstrap.admin.created',
          entityType: 'User',
          entityId: user.id,
          newValues: { role: 'Admin', locale: 'fr' },
        },
      });
      return { organizationId: organization.id, userId: user.id };
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
