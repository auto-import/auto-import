import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RolesService (Privilege Escalation & Platform Role Protection)', () => {
  let service: RolesService;
  let prisma: any;

  const TENANT_A = 'org-tenant-a';
  const TENANT_B = 'org-tenant-b';

  beforeEach(async () => {
    prisma = {
      role: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      userRole: {
        count: jest.fn(),
      },
      permission: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  it('should allow updating tenant-owned role in the same organization', async () => {
    prisma.role.findFirst.mockResolvedValue({
      id: 'role-1',
      name: 'Custom Role',
      organizationId: TENANT_A,
    });
    prisma.role.update.mockResolvedValue({
      id: 'role-1',
      name: 'Updated Role',
      organizationId: TENANT_A,
    });

    const result = await service.update('role-1', TENANT_A, { name: 'Updated Role' });
    expect(result.name).toBe('Updated Role');
  });

  it('should REJECT updating a platform-level role (organizationId: null) by a tenant', async () => {
    // Platform role has organizationId = null
    prisma.role.findFirst.mockResolvedValue({
      id: 'platform-admin-role',
      name: 'SuperAdmin',
      organizationId: null,
    });

    await expect(
      service.update('platform-admin-role', TENANT_A, { name: 'Hijacked Role' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should REJECT updating another tenant role', async () => {
    // Role belongs to Tenant B
    prisma.role.findFirst.mockResolvedValue(null);

    await expect(
      service.update('role-tenant-b', TENANT_A, { name: 'Compromised' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should REJECT deleting a platform-level role by a tenant', async () => {
    prisma.role.findFirst.mockResolvedValue({
      id: 'platform-admin-role',
      name: 'SuperAdmin',
      organizationId: null,
    });

    await expect(
      service.remove('platform-admin-role', TENANT_A),
    ).rejects.toThrow(ForbiddenException);
  });
});
