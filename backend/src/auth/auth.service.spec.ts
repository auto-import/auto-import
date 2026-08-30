import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

const activeUser = {
  id: 'user-1',
  organizationId: 'org-1',
  officeId: null,
  firstName: 'Amina',
  lastName: 'Admin',
  email: 'amina@example.com',
  passwordHash: 'password-hash',
  status: 'active',
  lastLoginAt: null,
  locale: 'fr',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  organization: {
    id: 'org-1',
    name: 'Tenant',
    type: 'headquarters',
    country: null,
    city: null,
    phone: null,
    email: null,
    address: null,
    status: 'active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
  office: null,
  userRoles: [
    {
      userId: 'user-1',
      roleId: 'role-1',
      role: {
        id: 'role-1',
        organizationId: 'org-1',
        name: 'Admin',
        scope: 'tenant',
        description: null,
        rolePermissions: [
          {
            roleId: 'role-1',
            permissionId: 'permission-1',
            permission: {
              id: 'permission-1',
              resource: 'users',
              action: 'read',
              description: null,
            },
          },
        ],
      },
    },
  ],
};

describe('AuthService refresh sessions', () => {
  const userFindUnique = jest.fn<Promise<unknown>, []>();
  const userUpdate = jest.fn<Promise<unknown>, []>();
  const sessionCreate = jest.fn<
    Promise<unknown>,
    [{ data: { tokenHash: string } }]
  >();
  const sessionFindUnique = jest.fn<Promise<unknown>, []>();
  const sessionUpdateMany = jest.fn<Promise<unknown>, []>();
  const transactionSessionFindUnique = jest.fn<Promise<unknown>, []>();
  const transactionSessionUpdateMany = jest.fn<
    Promise<{ count: number }>,
    []
  >();
  const transactionSessionCreate = jest.fn<Promise<unknown>, []>();
  const transactionUserUpdate = jest.fn<Promise<unknown>, [unknown]>();
  const transactionAuditCreate = jest.fn<Promise<unknown>, [unknown]>();
  const transactionClient = {
    user: { update: transactionUserUpdate },
    refreshSession: {
      findUnique: transactionSessionFindUnique,
      updateMany: transactionSessionUpdateMany,
      create: transactionSessionCreate,
    },
    auditLog: { create: transactionAuditCreate },
  };
  const runTransaction = async <T>(
    callback: (client: typeof transactionClient) => Promise<T>,
  ): Promise<T> => callback(transactionClient);
  const prismaTransaction = jest.fn(runTransaction);
  const prisma = {
    user: { findUnique: userFindUnique, update: userUpdate },
    refreshSession: {
      create: sessionCreate,
      findUnique: sessionFindUnique,
      updateMany: sessionUpdateMany,
    },
    $transaction: prismaTransaction,
  } as unknown as PrismaService;
  const jwt = { sign: jest.fn(() => 'access-token') } as unknown as JwtService;
  const config = {
    get: jest.fn((_key: string, fallback: string) => fallback),
  } as unknown as ConfigService;
  const service = new AuthService(prisma, jwt, config);

  beforeEach(() => {
    jest.clearAllMocks();
    transactionUserUpdate.mockResolvedValue(activeUser);
    transactionAuditCreate.mockResolvedValue({ id: 'audit-1' });
  });

  it('rejects current-user loading when the organization is inactive', async () => {
    userFindUnique.mockResolvedValue({
      ...activeUser,
      organization: { ...activeUser.organization, status: 'inactive' },
    });

    await expect(service.getCurrentUser(activeUser.id)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('stores only a hash of the opaque refresh token', async () => {
    sessionCreate.mockResolvedValue({ id: 'session-1' });
    const result = await service.login(activeUser);
    const created = sessionCreate.mock.calls[0][0];

    expect(result.refreshToken).toHaveLength(64);
    expect(created.data.tokenHash).toHaveLength(64);
    expect(created.data.tokenHash).not.toBe(result.refreshToken);
  });

  it('rotates a valid refresh session and revokes the previous token', async () => {
    transactionSessionFindUnique.mockResolvedValue({
      id: 'session-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });
    transactionSessionUpdateMany.mockResolvedValue({ count: 1 });
    transactionSessionCreate.mockResolvedValue({ id: 'session-2' });

    const result = await service.refreshToken('old-refresh-token', {});

    expect(transactionSessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'session-1', revokedAt: null } }),
    );
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).not.toBe('old-refresh-token');
  });

  it('rejects a revoked refresh session', async () => {
    transactionSessionFindUnique.mockResolvedValue({
      id: 'session-1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });

    await expect(service.refreshToken('reused-token', {})).rejects.toThrow(
      UnauthorizedException,
    );
    expect(transactionSessionCreate).not.toHaveBeenCalled();
  });

  it('does not accept refresh sessions for inactive organizations', async () => {
    sessionFindUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        status: 'active',
        organization: { status: 'inactive' },
      },
    });

    await expect(service.hasValidSession('refresh-token')).resolves.toBe(false);
  });

  it('changes only the current user password, rotates the current session and revokes all others', async () => {
    const passwordHash = await bcrypt.hash('Current!Pass123', 4);
    userFindUnique.mockResolvedValue({ ...activeUser, passwordHash });
    sessionFindUnique.mockResolvedValue({
      id: 'session-1',
      userId: activeUser.id,
      revokedAt: null,
    });
    transactionSessionUpdateMany.mockResolvedValue({ count: 2 });
    transactionSessionCreate.mockResolvedValue({ id: 'session-next' });
    const result = await service.changeOwnPassword(
      activeUser.id,
      'Current!Pass123',
      'Next!Password456',
      'Next!Password456',
      'current-refresh',
      {},
    );
    expect(transactionUserUpdate).toHaveBeenCalled();
    const passwordUpdate = transactionUserUpdate.mock.calls[0][0];
    expect(passwordUpdate.where).toEqual({ id: activeUser.id });
    expect(typeof passwordUpdate.data.passwordHash).toBe('string');
    expect(transactionSessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: activeUser.id, revokedAt: null },
      }),
    );
    expect(result).toMatchObject({
      accessToken: 'access-token',
      sessionBehavior: 'current_rotated_other_sessions_revoked',
    });
    expect(JSON.stringify(result)).not.toContain('Next!Password456');
    const audit = transactionAuditCreate.mock.calls[0][0];
    expect(JSON.stringify(audit)).not.toContain('Current!Pass123');
    expect(JSON.stringify(audit)).not.toContain('Next!Password456');
  });

  it('changes the current administrator email, rotates sessions and writes a redacted audit entry', async () => {
    userFindUnique.mockResolvedValue({
      ...activeUser,
      passwordHash: await bcrypt.hash('Current!Pass123', 4),
    });
    sessionFindUnique.mockResolvedValue({
      id: 'session-1',
      userId: activeUser.id,
      revokedAt: null,
    });
    transactionSessionUpdateMany.mockResolvedValue({ count: 3 });
    transactionSessionCreate.mockResolvedValue({ id: 'session-next' });
    transactionUserUpdate.mockResolvedValue({
      ...activeUser,
      email: 'new-admin@example.com',
    });

    const result = await service.changeOwnEmail(
      activeUser.id,
      'Current!Pass123',
      'New-Admin@Example.com',
      'new-admin@example.com',
      'current-refresh',
      { ipAddress: '127.0.0.1', userAgent: 'test' },
    );

    expect(transactionUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: activeUser.id },
        data: { email: 'new-admin@example.com' },
      }),
    );
    expect(result.user.email).toBe('new-admin@example.com');
    expect(result.sessionBehavior).toBe(
      'current_rotated_other_sessions_revoked',
    );
    const audit = transactionAuditCreate.mock.calls[0][0];
    expect(audit).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'account.email.changed',
          oldValues: { email: activeUser.email },
          newValues: {
            email: 'new-admin@example.com',
            activeSessionsRevoked: 3,
          },
        }),
      }),
    );
    expect(JSON.stringify(audit)).not.toContain('Current!Pass123');
    expect(JSON.stringify(audit)).not.toContain('passwordHash');
  });

  it('returns a neutral error for a wrong current password', async () => {
    userFindUnique.mockResolvedValue({
      ...activeUser,
      passwordHash: await bcrypt.hash('Current!Pass123', 4),
    });
    await expect(
      service.changeOwnPassword(
        activeUser.id,
        'Wrong!Pass123',
        'Next!Password456',
        'Next!Password456',
        'current-refresh',
        {},
      ),
    ).rejects.toThrow('Password change unavailable');
    expect(prismaTransaction).not.toHaveBeenCalled();
  });
});
