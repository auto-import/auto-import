import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ALL_PERMISSIONS, Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UsersService } from './users.service';
import type { PrismaService } from '../prisma/prisma.service';

type MockFn = jest.Mock<Promise<unknown>, unknown[]>;
const mockAsync = (): MockFn => jest.fn<Promise<unknown>, unknown[]>();
interface PrismaMock {
  user: {
    findUnique: MockFn;
    findFirst: MockFn;
    findMany: MockFn;
    count: MockFn;
    create: MockFn;
    update: MockFn;
    delete: MockFn;
  };
  office: { findFirst: MockFn };
  role: { findMany: MockFn };
  userRole: { count: MockFn };
  $transaction: jest.Mock<
    Promise<unknown>,
    [(transaction: PrismaMock) => unknown]
  >;
}

describe('UsersService', () => {
  const caller: AuthenticatedUser = {
    id: 'admin-a',
    email: 'admin@a.test',
    firstName: 'Admin',
    lastName: 'A',
    organizationId: 'org-a',
    office: null,
    roles: [{ id: 'admin-role', name: 'Admin', scope: 'tenant' }],
    permissions: [...ALL_PERMISSIONS],
  };
  let prisma: PrismaMock;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: mockAsync(),
        findFirst: mockAsync(),
        findMany: mockAsync(),
        count: mockAsync(),
        create: mockAsync(),
        update: mockAsync(),
        delete: mockAsync(),
      },
      office: { findFirst: mockAsync() },
      role: { findMany: mockAsync() },
      userRole: { count: mockAsync() },
      $transaction: jest.fn<
        Promise<unknown>,
        [(transaction: PrismaMock) => unknown]
      >(),
    };
    prisma.$transaction = jest.fn<
      Promise<unknown>,
      [(transaction: PrismaMock) => unknown]
    >((callback: (transaction: PrismaMock) => unknown) =>
      Promise.resolve(callback(prisma)),
    );
    service = new UsersService(prisma as unknown as PrismaService);
  });

  it('lists with tenant, search, status, role, office, and pagination filters', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.findAll('org-a', {
      search: 'nadia',
      status: 'active',
      roleId: 'role-a',
      officeId: 'office-a',
      page: 2,
      limit: 5,
    });

    const query = prisma.user.findMany.mock.calls[0][0] as {
      where: {
        organizationId: string;
        status: string;
        officeId: string;
        userRoles: { some: { roleId: string } };
        OR: unknown[];
      };
      skip: number;
      take: number;
    };
    expect(query.where).toMatchObject({
      organizationId: 'org-a',
      status: 'active',
      officeId: 'office-a',
      userRoles: { some: { roleId: 'role-a' } },
    });
    expect(query.where.OR).toHaveLength(3);
    expect(query.skip).toBe(5);
    expect(query.take).toBe(5);
  });

  it('uses an explicit public selection that cannot serialize passwordHash', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-a',
      email: 'user@a.test',
      userRoles: [],
    });

    const result = await service.findOne('user-a', 'org-a');

    const query = prisma.user.findFirst.mock.calls[0][0] as {
      select: { passwordHash?: boolean };
    };
    expect(query.select.passwordHash).toBeUndefined();
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects an office outside the authenticated organization', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.office.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        {
          email: 'new@a.test',
          password: 'LongInitialPassword!1',
          firstName: 'New',
          lastName: 'User',
          officeId: 'office-b',
        },
        'org-a',
        caller,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('persists multiple validated tenant roles without exposing credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.office.findFirst.mockResolvedValue({ id: 'office-a' });
    prisma.role.findMany.mockResolvedValue([
      { id: 'role-1', rolePermissions: [] },
      { id: 'role-2', rolePermissions: [] },
    ]);
    prisma.user.create.mockResolvedValue({
      id: 'user-a',
      email: 'new@a.test',
      userRoles: [],
    });

    const result = await service.create(
      {
        email: 'NEW@A.TEST',
        password: 'LongInitialPassword!1',
        firstName: 'New',
        lastName: 'User',
        officeId: 'office-a',
        roleIds: ['role-1', 'role-2'],
      },
      'org-a',
      caller,
    );

    const createQuery = prisma.user.create.mock.calls[0][0] as {
      data: {
        email: string;
        organizationId: string;
        userRoles: { create: Array<{ roleId: string }> };
      };
      select: { passwordHash?: boolean };
    };
    expect(createQuery.data).toMatchObject({
      email: 'new@a.test',
      organizationId: 'org-a',
      userRoles: {
        create: [{ roleId: 'role-1' }, { roleId: 'role-2' }],
      },
    });
    expect(createQuery.select.passwordHash).toBeUndefined();
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('prevents a limited administrator from assigning stronger roles', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findMany.mockResolvedValue([
      {
        id: 'role-powerful',
        rolePermissions: [
          { permission: { resource: 'roles', action: 'manage' } },
        ],
      },
    ]);
    const limited = {
      ...caller,
      permissions: [Permission.USERS_MANAGE],
    };

    await expect(
      service.create(
        {
          email: 'new@a.test',
          password: 'LongInitialPassword!1',
          firstName: 'New',
          lastName: 'User',
          roleIds: ['role-powerful'],
        },
        'org-a',
        limited,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
