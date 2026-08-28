/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import type { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS } from '@auto-import/contracts';
import {
  ADMIN_EMAIL,
  ROTATION_CONFIRMATION_PREFIX,
  assertDatabaseConfirmation,
  bootstrapInitialAdministrator,
  inspectAdministratorScenario,
  rotateOrCreateAdministrator,
  validateAdministratorPassword,
} from './admin-credential-operation';

function adminAssignment(
  userId: string,
  email: string,
  organizationId = 'org-1',
) {
  return {
    user: {
      id: userId,
      email,
      status: 'inactive',
      organizationId,
      organization: { name: 'Auto Import', status: 'active' },
    },
    role: { id: `role-${organizationId}`, organizationId },
  };
}

function transactionClient(overrides: Record<string, unknown> = {}) {
  const tx = {
    organization: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'org-1', name: 'Auto Import', status: 'active' },
        ]),
      create: jest.fn().mockResolvedValue({ id: 'org-1' }),
    },
    organizationSettings: { create: jest.fn().mockResolvedValue({}) },
    user: {
      count: jest.fn().mockResolvedValue(1),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: 'admin-1' }),
      create: jest.fn().mockResolvedValue({ id: 'admin-1' }),
    },
    userRole: {
      findMany: jest
        .fn()
        .mockResolvedValue([adminAssignment('admin-1', 'admin@example.com')]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    permission: {
      upsert: jest.fn().mockImplementation(({ create }) =>
        Promise.resolve({
          id: `permission-${create.resource}-${create.action}`,
          description: null,
          ...create,
        }),
      ),
    },
    role: {
      create: jest.fn().mockResolvedValue({ id: 'role-org-1' }),
      upsert: jest.fn().mockResolvedValue({ id: 'role-org-1' }),
    },
    rolePermission: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue(
        ALL_PERMISSIONS.map((permissionKey) => {
          const separator = permissionKey.lastIndexOf(':');
          return {
            permission: {
              resource: permissionKey.slice(0, separator),
              action: permissionKey.slice(separator + 1),
            },
          };
        }),
      ),
    },
    refreshSession: {
      count: jest.fn().mockResolvedValue(2),
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    ...overrides,
  };
  return tx;
}

function prismaFor(tx: ReturnType<typeof transactionClient>): PrismaClient {
  return {
    $transaction: jest.fn(async (callback) => callback(tx)),
  } as unknown as PrismaClient;
}

describe('administrator credential operations', () => {
  it('bootstraps an empty database with an active Admin and an audit entry', async () => {
    const tx = transactionClient();
    tx.organization.count.mockResolvedValue(0);
    tx.user.count.mockResolvedValue(0);

    const result = await bootstrapInitialAdministrator(prismaFor(tx), {
      organizationName: 'Corapide',
      firstName: 'Initial',
      lastName: 'Administrator',
      email: ADMIN_EMAIL,
      passwordHash: 'bcrypt-hash-placeholder',
    });

    expect(result).toMatchObject({
      action: 'created',
      scenario: 'empty_database',
      email: ADMIN_EMAIL,
    });
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: ADMIN_EMAIL,
          status: 'active',
          userRoles: { create: { roleId: 'role-org-1' } },
        }),
      }),
    );
    expect(tx.rolePermission.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.any(Array),
        skipDuplicates: true,
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'bootstrap.admin.created' }),
      }),
    );
  });

  it('rotates the unique existing administrator and grants every permission', async () => {
    const tx = transactionClient();
    const result = await rotateOrCreateAdministrator(prismaFor(tx), {
      passwordHash: 'new-bcrypt-hash-placeholder',
    });

    expect(result).toMatchObject({
      action: 'rotated',
      scenario: 'single_administrator',
      userId: 'admin-1',
      email: ADMIN_EMAIL,
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: {
        email: ADMIN_EMAIL,
        passwordHash: 'new-bcrypt-hash-placeholder',
        status: 'active',
      },
    });
    const permissionAssignment = tx.rolePermission.createMany.mock.calls[0][0];
    expect(permissionAssignment.data).toHaveLength(ALL_PERMISSIONS.length);
    expect(JSON.stringify(tx.auditLog.create.mock.calls[0][0])).not.toContain(
      'new-bcrypt-hash-placeholder',
    );
  });

  it('creates an administrator for the sole existing organization with none', async () => {
    const tx = transactionClient();
    tx.userRole.findMany.mockResolvedValue([]);

    const result = await rotateOrCreateAdministrator(prismaFor(tx), {
      passwordHash: 'new-bcrypt-hash-placeholder',
      firstName: 'Initial',
      lastName: 'Administrator',
    });

    expect(result).toMatchObject({
      action: 'created',
      scenario: 'organization_without_administrator',
      email: ADMIN_EMAIL,
    });
    expect(tx.role.upsert).toHaveBeenCalled();
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: ADMIN_EMAIL, status: 'active' }),
      }),
    );
  });

  it('aborts before credential changes when the target email is owned by another user', async () => {
    const tx = transactionClient();
    tx.user.findUnique.mockResolvedValue({ id: 'different-user' });

    await expect(
      rotateOrCreateAdministrator(prismaFor(tx), {
        passwordHash: 'new-bcrypt-hash-placeholder',
      }),
    ).rejects.toThrow('already belongs to another user');
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.refreshSession.deleteMany).not.toHaveBeenCalled();
  });

  it('aborts an ambiguous multiple-administrator rotation without a target id', async () => {
    const tx = transactionClient();
    tx.user.count.mockResolvedValue(2);
    tx.userRole.findMany.mockResolvedValue([
      adminAssignment('admin-1', 'first@example.com'),
      adminAssignment('admin-2', 'second@example.com', 'org-2'),
    ]);

    await expect(
      rotateOrCreateAdministrator(prismaFor(tx), {
        passwordHash: 'new-bcrypt-hash-placeholder',
      }),
    ).rejects.toThrow('set ADMIN_TARGET_USER_ID');
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('inspects multiple administrators without exposing credential material', async () => {
    const tx = transactionClient();
    tx.user.count.mockResolvedValue(2);
    tx.organization.findMany.mockResolvedValue([
      { id: 'org-1', name: 'First', status: 'active' },
      { id: 'org-2', name: 'Second', status: 'active' },
    ]);
    tx.userRole.findMany.mockResolvedValue([
      adminAssignment('admin-1', 'first@example.com'),
      adminAssignment('admin-2', 'second@example.com', 'org-2'),
    ]);

    const report = await inspectAdministratorScenario(prismaFor(tx));

    expect(report.scenario).toBe('multiple_administrators');
    expect(report.administrators).toHaveLength(2);
    expect(report.administrators[0]).toMatchObject({
      requiredPermissionCount: ALL_PERMISSIONS.length,
      grantedRequiredPermissionCount: ALL_PERMISSIONS.length,
      missingPermissions: [],
      refreshSessionCount: 2,
    });
    expect(JSON.stringify(report)).not.toContain('password');
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects confirmation not tied to the auto_import database', () => {
    expect(() =>
      assertDatabaseConfirmation(
        'postgresql://operator:secret@postgres:5432/auto_import',
        'ROTATE_ADMIN_CREDENTIALS:some_other_database',
        ROTATION_CONFIRMATION_PREFIX,
      ),
    ).toThrow('ROTATE_ADMIN_CREDENTIALS:auto_import');
  });

  it('rejects the proposed weak password and preserves the 20 character minimum', () => {
    expect(() => validateAdministratorPassword('1234567890123')).toThrow(
      '20 to 128 characters',
    );
    expect(() =>
      validateAdministratorPassword('Unique-Strong-Password-2026!'),
    ).not.toThrow();
  });

  it('deletes every refresh session for the rotated administrator', async () => {
    const tx = transactionClient();
    tx.refreshSession.deleteMany.mockResolvedValue({ count: 4 });

    const result = await rotateOrCreateAdministrator(prismaFor(tx), {
      passwordHash: 'new-bcrypt-hash-placeholder',
    });

    expect(tx.refreshSession.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'admin-1' },
    });
    expect(result.refreshSessionsDeleted).toBe(4);
  });

  it('rolls back credential and session changes when the audit write fails', async () => {
    const state = {
      email: 'admin@example.com',
      passwordHash: 'old-hash',
      status: 'inactive',
      sessions: ['session-1', 'session-2'],
    };
    const tx = transactionClient();
    tx.user.update.mockImplementation(async ({ data }) => {
      state.email = data.email;
      state.passwordHash = data.passwordHash;
      state.status = data.status;
      return { id: 'admin-1' };
    });
    tx.refreshSession.deleteMany.mockImplementation(async () => {
      const count = state.sessions.length;
      state.sessions = [];
      return { count };
    });
    tx.auditLog.create.mockRejectedValue(new Error('simulated audit failure'));
    const prisma = {
      $transaction: jest.fn(async (callback) => {
        const snapshot = { ...state, sessions: [...state.sessions] };
        try {
          return await callback(tx);
        } catch (error) {
          state.email = snapshot.email;
          state.passwordHash = snapshot.passwordHash;
          state.status = snapshot.status;
          state.sessions = snapshot.sessions;
          throw error;
        }
      }),
    } as unknown as PrismaClient;

    await expect(
      rotateOrCreateAdministrator(prisma, {
        passwordHash: 'new-bcrypt-hash-placeholder',
      }),
    ).rejects.toThrow('simulated audit failure');
    expect(state).toEqual({
      email: 'admin@example.com',
      passwordHash: 'old-hash',
      status: 'inactive',
      sessions: ['session-1', 'session-2'],
    });
  });
});
