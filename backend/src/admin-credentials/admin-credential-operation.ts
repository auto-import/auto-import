import { constants as fsConstants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import {
  Prisma,
  PrismaClient,
  type Permission as PermissionRecord,
} from '@prisma/client';
import { ALL_PERMISSIONS } from '@auto-import/contracts';

export const ADMIN_EMAIL = 'admin@corapide.com';
export const PASSWORD_MIN_LENGTH = 20;
export const PASSWORD_MAX_LENGTH = 128;
export const BCRYPT_ROUNDS = 12;
export const BOOTSTRAP_CONFIRMATION_PREFIX = 'CREATE_INITIAL_ADMIN';
export const ROTATION_CONFIRMATION_PREFIX = 'ROTATE_ADMIN_CREDENTIALS';

export type AdministratorScenario =
  | 'empty_database'
  | 'organization_without_administrator'
  | 'single_administrator'
  | 'multiple_administrators';

export interface BootstrapAdministratorInput {
  organizationName: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
}

export interface RotateAdministratorInput {
  passwordHash: string;
  targetUserId?: string;
  targetOrganizationId?: string;
  firstName?: string;
  lastName?: string;
}

export interface AdministratorOperationResult {
  action: 'created' | 'rotated';
  scenario: AdministratorScenario;
  organizationId: string;
  userId: string;
  email: string;
  refreshSessionsDeleted: number;
}

export interface AdministratorScenarioReport {
  scenario: AdministratorScenario;
  organizationCount: number;
  userCount: number;
  organizations: Array<{
    id: string;
    name: string;
    status: string;
  }>;
  administrators: Array<{
    userId: string;
    email: string;
    status: string;
    organizationId: string;
    organizationName: string;
    organizationStatus: string;
    grantedRequiredPermissionCount: number;
    requiredPermissionCount: number;
    missingPermissions: string[];
    refreshSessionCount: number;
  }>;
}

interface AdministratorCandidate {
  userId: string;
  email: string;
  status: string;
  organizationId: string;
  organizationName: string;
  organizationStatus: string;
  adminRoleId: string;
}

export function requiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function databaseNameFromUrl(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL');
  }
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!databaseName)
    throw new Error('DATABASE_URL must include a database name');
  return databaseName;
}

export function assertDatabaseConfirmation(
  databaseUrl: string,
  confirmation: string | undefined,
  prefix: string,
): string {
  const databaseName = databaseNameFromUrl(databaseUrl);
  const expected = `${prefix}:${databaseName}`;
  if (confirmation !== expected) {
    throw new Error(`Confirmation must equal ${expected}`);
  }
  return databaseName;
}

export function validateAdministratorPassword(password: string): void {
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new Error(
      `Administrator password must contain ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`,
    );
  }
  if (/[\r\n\0]/.test(password)) {
    throw new Error(
      'Administrator password must be a single line without NUL bytes',
    );
  }
  const characterClasses = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];
  if (characterClasses.filter((pattern) => pattern.test(password)).length < 3) {
    throw new Error(
      'Administrator password must use at least three character classes',
    );
  }
}

function removeOneTerminalLineEnding(input: string): string {
  if (input.endsWith('\r\n')) return input.slice(0, -2);
  if (input.endsWith('\n')) return input.slice(0, -1);
  return input;
}

async function readPipedStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error('Piped stdin is required when the password file is -');
  }
  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    byteLength += buffer.length;
    if (byteLength > 4096) {
      throw new Error('Administrator password input is too large');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readAdministratorPassword(
  passwordFile: string,
): Promise<string> {
  let input: string;
  if (passwordFile === '-') {
    input = await readPipedStdin();
  } else {
    if (!isAbsolute(passwordFile)) {
      throw new Error('Password file path must be absolute');
    }
    if (process.platform === 'win32') {
      throw new Error(
        'Password files are supported only on POSIX; use piped stdin',
      );
    }
    const noFollow = fsConstants.O_NOFOLLOW ?? 0;
    const handle = await open(passwordFile, fsConstants.O_RDONLY | noFollow);
    try {
      const passwordStat = await handle.stat();
      if (!passwordStat.isFile())
        throw new Error('Password path must be a file');
      if ((passwordStat.mode & 0o777) !== 0o600) {
        throw new Error('Password file permissions must be exactly 600');
      }
      input = await handle.readFile('utf8');
    } finally {
      await handle.close();
    }
  }
  const password = removeOneTerminalLineEnding(input);
  validateAdministratorPassword(password);
  return password;
}

function validateEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ||
    normalized.length > 254
  ) {
    throw new Error('Administrator email must be a valid email address');
  }
  return normalized;
}

function validateIdentityValue(
  value: string,
  name: string,
  maximum: number,
): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  if (normalized.length > maximum) {
    throw new Error(`${name} exceeds the supported length`);
  }
  return normalized;
}

async function upsertRequiredPermissions(
  tx: Prisma.TransactionClient,
): Promise<PermissionRecord[]> {
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
  return permissions;
}

async function ensureAdminRolePermissions(
  tx: Prisma.TransactionClient,
  roleId: string,
  permissions: PermissionRecord[],
): Promise<void> {
  await tx.rolePermission.createMany({
    data: permissions.map((permission) => ({
      roleId,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });
}

async function administratorCandidates(
  tx: Prisma.TransactionClient,
): Promise<AdministratorCandidate[]> {
  const assignments = await tx.userRole.findMany({
    where: {
      role: {
        name: 'Admin',
        scope: 'tenant',
        organizationId: { not: null },
      },
    },
    select: {
      user: {
        select: {
          id: true,
          email: true,
          status: true,
          organizationId: true,
          organization: { select: { name: true, status: true } },
        },
      },
      role: { select: { id: true, organizationId: true } },
    },
  });

  const candidates = new Map<string, AdministratorCandidate>();
  for (const assignment of assignments) {
    if (assignment.role.organizationId !== assignment.user.organizationId)
      continue;
    candidates.set(assignment.user.id, {
      userId: assignment.user.id,
      email: assignment.user.email,
      status: assignment.user.status,
      organizationId: assignment.user.organizationId,
      organizationName: assignment.user.organization.name,
      organizationStatus: assignment.user.organization.status,
      adminRoleId: assignment.role.id,
    });
  }
  return [...candidates.values()].sort((left, right) =>
    left.userId.localeCompare(right.userId),
  );
}

function scenarioFor(
  organizationCount: number,
  userCount: number,
  candidates: AdministratorCandidate[],
): AdministratorScenario {
  if (organizationCount === 0 && userCount === 0) return 'empty_database';
  if (candidates.length === 0) return 'organization_without_administrator';
  if (candidates.length === 1) return 'single_administrator';
  return 'multiple_administrators';
}

function describeCandidates(candidates: AdministratorCandidate[]): string {
  return candidates
    .map(
      (candidate) =>
        `${candidate.userId} (${candidate.email}, organization ${candidate.organizationId})`,
    )
    .join(', ');
}

export async function inspectAdministratorScenario(
  prisma: PrismaClient,
): Promise<AdministratorScenarioReport> {
  return prisma.$transaction(
    async (tx) => {
      const [organizations, userCount, candidates] = await Promise.all([
        tx.organization.findMany({
          select: { id: true, name: true, status: true },
          orderBy: { id: 'asc' },
        }),
        tx.user.count(),
        administratorCandidates(tx),
      ]);
      const administrators = await Promise.all(
        candidates.map(async (candidate) => {
          const [grants, refreshSessionCount] = await Promise.all([
            tx.rolePermission.findMany({
              where: { roleId: candidate.adminRoleId },
              select: {
                permission: { select: { resource: true, action: true } },
              },
            }),
            tx.refreshSession.count({ where: { userId: candidate.userId } }),
          ]);
          const grantedPermissions = new Set(
            grants.map(
              ({ permission }) => `${permission.resource}:${permission.action}`,
            ),
          );
          const missingPermissions = ALL_PERMISSIONS.filter(
            (permission) => !grantedPermissions.has(permission),
          );
          return {
            userId: candidate.userId,
            email: candidate.email,
            status: candidate.status,
            organizationId: candidate.organizationId,
            organizationName: candidate.organizationName,
            organizationStatus: candidate.organizationStatus,
            grantedRequiredPermissionCount:
              ALL_PERMISSIONS.length - missingPermissions.length,
            requiredPermissionCount: ALL_PERMISSIONS.length,
            missingPermissions,
            refreshSessionCount,
          };
        }),
      );
      return {
        scenario: scenarioFor(organizations.length, userCount, candidates),
        organizationCount: organizations.length,
        userCount,
        organizations,
        administrators,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function bootstrapInitialAdministrator(
  prisma: PrismaClient,
  input: BootstrapAdministratorInput,
): Promise<AdministratorOperationResult> {
  const organizationName = validateIdentityValue(
    input.organizationName,
    'Organization name',
    160,
  );
  const firstName = validateIdentityValue(input.firstName, 'First name', 80);
  const lastName = validateIdentityValue(input.lastName, 'Last name', 80);
  const email = validateEmail(input.email);

  return prisma.$transaction(
    async (tx) => {
      const [organizationCount, userCount] = await Promise.all([
        tx.organization.count(),
        tx.user.count(),
      ]);
      if (organizationCount !== 0 || userCount !== 0) {
        throw new Error(
          'Bootstrap refused: organizations or users already exist; use admin:rotate-credentials',
        );
      }

      const permissions = await upsertRequiredPermissions(tx);
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
        },
      });
      await ensureAdminRolePermissions(tx, role.id, permissions);
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          firstName,
          lastName,
          email,
          passwordHash: input.passwordHash,
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
          newValues: { email, status: 'active', role: 'Admin', locale: 'fr' },
        },
      });
      return {
        action: 'created',
        scenario: 'empty_database',
        organizationId: organization.id,
        userId: user.id,
        email,
        refreshSessionsDeleted: 0,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function rotateOrCreateAdministrator(
  prisma: PrismaClient,
  input: RotateAdministratorInput,
): Promise<AdministratorOperationResult> {
  return prisma.$transaction(
    async (tx) => {
      const [organizationCount, userCount, candidates] = await Promise.all([
        tx.organization.count(),
        tx.user.count(),
        administratorCandidates(tx),
      ]);
      const scenario = scenarioFor(organizationCount, userCount, candidates);
      if (scenario === 'empty_database') {
        throw new Error(
          'Database is completely empty; use bootstrap:admin with CREATE_INITIAL_ADMIN confirmation',
        );
      }
      if (organizationCount === 0) {
        throw new Error(
          'Database is inconsistent: users exist without an organization',
        );
      }

      let candidate: AdministratorCandidate | undefined;
      if (input.targetUserId) {
        candidate = candidates.find(
          (possibleCandidate) =>
            possibleCandidate.userId === input.targetUserId,
        );
        if (!candidate) {
          throw new Error(
            'ADMIN_TARGET_USER_ID must identify an existing user with its own organization tenant Admin role',
          );
        }
      } else if (candidates.length === 1) {
        candidate = candidates[0];
      } else if (candidates.length > 1) {
        throw new Error(
          `Multiple administrators found; set ADMIN_TARGET_USER_ID to exactly one of: ${describeCandidates(candidates)}`,
        );
      }

      if (candidate) {
        if (
          input.targetOrganizationId &&
          input.targetOrganizationId !== candidate.organizationId
        ) {
          throw new Error(
            'ADMIN_TARGET_ORGANIZATION_ID does not match the selected administrator',
          );
        }
        if (candidate.organizationStatus !== 'active') {
          throw new Error(
            `Selected administrator organization ${candidate.organizationId} is inactive; activate it through the normal organization process first`,
          );
        }
        const conflictingUser = await tx.user.findUnique({
          where: { email: ADMIN_EMAIL },
          select: { id: true },
        });
        if (conflictingUser && conflictingUser.id !== candidate.userId) {
          throw new Error(
            `${ADMIN_EMAIL} already belongs to another user; resolve the email conflict before rotating credentials`,
          );
        }

        const permissions = await upsertRequiredPermissions(tx);
        await ensureAdminRolePermissions(
          tx,
          candidate.adminRoleId,
          permissions,
        );
        await tx.userRole.upsert({
          where: {
            userId_roleId: {
              userId: candidate.userId,
              roleId: candidate.adminRoleId,
            },
          },
          update: {},
          create: { userId: candidate.userId, roleId: candidate.adminRoleId },
        });
        await tx.user.update({
          where: { id: candidate.userId },
          data: {
            email: ADMIN_EMAIL,
            passwordHash: input.passwordHash,
            status: 'active',
          },
        });
        const deletedSessions = await tx.refreshSession.deleteMany({
          where: { userId: candidate.userId },
        });
        await tx.auditLog.create({
          data: {
            organizationId: candidate.organizationId,
            userId: candidate.userId,
            action: 'admin.credentials.rotated',
            entityType: 'User',
            entityId: candidate.userId,
            oldValues: { email: candidate.email, status: candidate.status },
            newValues: {
              email: ADMIN_EMAIL,
              status: 'active',
              role: 'Admin',
              refreshSessionsDeleted: deletedSessions.count,
            },
          },
        });
        return {
          action: 'rotated',
          scenario,
          organizationId: candidate.organizationId,
          userId: candidate.userId,
          email: ADMIN_EMAIL,
          refreshSessionsDeleted: deletedSessions.count,
        };
      }

      const organizations = await tx.organization.findMany({
        select: { id: true, name: true, status: true },
        orderBy: { id: 'asc' },
      });
      const organization = input.targetOrganizationId
        ? organizations.find((item) => item.id === input.targetOrganizationId)
        : organizations.length === 1
          ? organizations[0]
          : undefined;
      if (!organization) {
        const choices = organizations
          .map((item) => `${item.id} (${item.name})`)
          .join(', ');
        throw new Error(
          `No administrator exists and the organization is ambiguous; set ADMIN_TARGET_ORGANIZATION_ID to exactly one of: ${choices}`,
        );
      }
      if (organization.status !== 'active') {
        throw new Error(
          `Target organization ${organization.id} is inactive; activate it through the normal organization process first`,
        );
      }
      const conflictingUser = await tx.user.findUnique({
        where: { email: ADMIN_EMAIL },
        select: { id: true },
      });
      if (conflictingUser) {
        throw new Error(
          `${ADMIN_EMAIL} already belongs to a non-administrator user; resolve the email conflict before creating an administrator`,
        );
      }
      const firstName = validateIdentityValue(
        input.firstName ?? '',
        'ADMIN_FIRST_NAME',
        80,
      );
      const lastName = validateIdentityValue(
        input.lastName ?? '',
        'ADMIN_LAST_NAME',
        80,
      );
      const permissions = await upsertRequiredPermissions(tx);
      const role = await tx.role.upsert({
        where: {
          organizationId_name: {
            organizationId: organization.id,
            name: 'Admin',
          },
        },
        update: { scope: 'tenant' },
        create: {
          organizationId: organization.id,
          name: 'Admin',
          scope: 'tenant',
          description: 'Tenant administrator',
        },
      });
      await ensureAdminRolePermissions(tx, role.id, permissions);
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          firstName,
          lastName,
          email: ADMIN_EMAIL,
          passwordHash: input.passwordHash,
          locale: 'fr',
          status: 'active',
          userRoles: { create: { roleId: role.id } },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          action: 'admin.credentials.created',
          entityType: 'User',
          entityId: user.id,
          newValues: { email: ADMIN_EMAIL, status: 'active', role: 'Admin' },
        },
      });
      return {
        action: 'created',
        scenario,
        organizationId: organization.id,
        userId: user.id,
        email: ADMIN_EMAIL,
        refreshSessionsDeleted: 0,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
