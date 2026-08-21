import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSION_KEY } from '../common/decorators/require-permission.decorator';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { RolesService } from './roles.service';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';

describe('Dynamic RBAC & Database-Driven Authorization Audit (Phase 3-5)', () => {
  let permissionsGuard: PermissionsGuard;
  let reflector: Reflector;
  let jwtStrategy: JwtStrategy;
  let rolesService: RolesService;
  let usersService: UsersService;
  let mockPrisma: any;
  let mockConfigService: any;

  const ORG_A = 'org-tenant-a';
  const ORG_B = 'org-tenant-b';

  beforeEach(() => {
    reflector = new Reflector();
    permissionsGuard = new PermissionsGuard(reflector);

    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      role: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      permission: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      rolePermission: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      userRole: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
    };

    mockConfigService = {
      getOrThrow: jest.fn().mockReturnValue('test-secret-key-1234567890'),
    };

    jwtStrategy = new JwtStrategy(
      mockConfigService as ConfigService,
      mockPrisma,
    );
    rolesService = new RolesService(mockPrisma);
    usersService = new UsersService(mockPrisma);
  });

  function createMockContext(
    user: any,
    requiredPermission?: string,
  ): ExecutionContext {
    jest.spyOn(reflector, 'get').mockReturnValue(requiredPermission);

    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  // ──────────────────────────────────────────────
  // 1 & 2 & 12: Dynamic Permission Lifecycle (Assign, Revoke, Immediate Effect)
  // ──────────────────────────────────────────────
  describe('1. Dynamic Permission Lifecycle & Zero-Code Authorization Adaptation', () => {
    it('Scenario: Commercial initial state (dossiers:read only) -> can read, denied write', async () => {
      // User with Commercial role mapped dynamically to dossiers:read in DB
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-comm-1',
        email: 'commercial@orga.com',
        organizationId: ORG_A,
        status: 'active',
        organization: { status: 'active' },
        userRoles: [
          {
            role: {
              id: 'role-comm',
              name: 'Commercial',
              rolePermissions: [
                {
                  permission: { resource: 'dossiers', action: 'read' },
                },
              ],
            },
          },
        ],
      });

      const validatedUser = await jwtStrategy.validate({ sub: 'user-comm-1' });

      // GET dossier (requires dossiers:read) -> PASS
      const readContext = createMockContext(validatedUser, 'dossiers:read');
      expect(permissionsGuard.canActivate(readContext)).toBe(true);

      // POST dossier (requires dossiers:write) -> DENY
      const writeContext = createMockContext(validatedUser, 'dossiers:write');
      expect(() => permissionsGuard.canActivate(writeContext)).toThrow(
        ForbiddenException,
      );
    });

    it('Scenario: Admin dynamically adds dossiers:write to Commercial role -> write immediately passes without backend code change', async () => {
      // 1. Admin updates the Commercial role permissions in DB via rolesService
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-comm',
        name: 'Commercial',
        organizationId: ORG_A,
      });
      mockPrisma.role.update.mockResolvedValue({
        id: 'role-comm',
        name: 'Commercial',
        organizationId: ORG_A,
        rolePermissions: [
          { permission: { resource: 'dossiers', action: 'read' } },
          { permission: { resource: 'dossiers', action: 'write' } },
        ],
      });

      await rolesService.update('role-comm', ORG_A, {
        permissionIds: ['perm-dossiers-read', 'perm-dossiers-write'],
      });

      expect(mockPrisma.role.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'role-comm' },
          data: expect.objectContaining({
            rolePermissions: {
              deleteMany: {},
              create: [
                { permissionId: 'perm-dossiers-read' },
                { permissionId: 'perm-dossiers-write' },
              ],
            },
          }),
        }),
      );

      // 2. Next request by Commercial user queries DB fresh via JwtStrategy
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-comm-1',
        email: 'commercial@orga.com',
        organizationId: ORG_A,
        status: 'active',
        organization: { status: 'active' },
        userRoles: [
          {
            role: {
              id: 'role-comm',
              name: 'Commercial',
              rolePermissions: [
                { permission: { resource: 'dossiers', action: 'read' } },
                { permission: { resource: 'dossiers', action: 'write' } },
              ],
            },
          },
        ],
      });

      const updatedUser = await jwtStrategy.validate({ sub: 'user-comm-1' });

      // Now POST dossier (requires dossiers:write) -> PASS
      const writeContext = createMockContext(updatedUser, 'dossiers:write');
      expect(permissionsGuard.canActivate(writeContext)).toBe(true);
    });

    it('Scenario: Admin dynamically removes dossiers:write from Commercial role -> write immediately denied again', async () => {
      // 1. Admin removes dossiers:write
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-comm',
        name: 'Commercial',
        organizationId: ORG_A,
      });
      mockPrisma.role.update.mockResolvedValue({
        id: 'role-comm',
        name: 'Commercial',
        organizationId: ORG_A,
      });

      await rolesService.update('role-comm', ORG_A, {
        permissionIds: ['perm-dossiers-read'],
      });

      // 2. Fresh request by Commercial user
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-comm-1',
        email: 'commercial@orga.com',
        organizationId: ORG_A,
        status: 'active',
        organization: { status: 'active' },
        userRoles: [
          {
            role: {
              id: 'role-comm',
              name: 'Commercial',
              rolePermissions: [
                { permission: { resource: 'dossiers', action: 'read' } },
              ],
            },
          },
        ],
      });

      const freshUser = await jwtStrategy.validate({ sub: 'user-comm-1' });

      const writeContext = createMockContext(freshUser, 'dossiers:write');
      expect(() => permissionsGuard.canActivate(writeContext)).toThrow(
        ForbiddenException,
      );
    });
  });

  // ──────────────────────────────────────────────
  // 3: Role Reassignment (User A: Commercial -> Logistics -> Admin -> Commercial)
  // ──────────────────────────────────────────────
  describe('3. Dynamic Role Reassignment & Immediate Permission Update', () => {
    it('User reassigned from Commercial to Logistics acquires Logistics permissions and loses Commercial write', async () => {
      // Mock User reassigned to Logistics role (vehicles:read, warehouses:read)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-a',
        email: 'usera@orga.com',
        organizationId: ORG_A,
        status: 'active',
        organization: { status: 'active' },
        userRoles: [
          {
            role: {
              id: 'role-logistics',
              name: 'Logistics',
              rolePermissions: [
                { permission: { resource: 'vehicles', action: 'read' } },
                { permission: { resource: 'warehouses', action: 'read' } },
              ],
            },
          },
        ],
      });

      const logisticsUser = await jwtStrategy.validate({ sub: 'user-a' });

      expect(
        permissionsGuard.canActivate(
          createMockContext(logisticsUser, 'vehicles:read'),
        ),
      ).toBe(true);
      expect(
        permissionsGuard.canActivate(
          createMockContext(logisticsUser, 'warehouses:read'),
        ),
      ).toBe(true);
      expect(() =>
        permissionsGuard.canActivate(
          createMockContext(logisticsUser, 'dossiers:write'),
        ),
      ).toThrow(ForbiddenException);
    });

    it('User promoted to Admin gains full administrative permissions', async () => {
      // User promoted to Admin role (users:manage, roles:manage, dossiers:write, etc.)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-a',
        email: 'usera@orga.com',
        organizationId: ORG_A,
        status: 'active',
        organization: { status: 'active' },
        userRoles: [
          {
            role: {
              id: 'role-admin',
              name: 'Admin',
              rolePermissions: [
                { permission: { resource: 'users', action: 'manage' } },
                { permission: { resource: 'roles', action: 'manage' } },
                { permission: { resource: 'dossiers', action: 'write' } },
                { permission: { resource: 'vehicles', action: 'write' } },
              ],
            },
          },
        ],
      });

      const adminUser = await jwtStrategy.validate({ sub: 'user-a' });

      expect(
        permissionsGuard.canActivate(
          createMockContext(adminUser, 'users:manage'),
        ),
      ).toBe(true);
      expect(
        permissionsGuard.canActivate(
          createMockContext(adminUser, 'roles:manage'),
        ),
      ).toBe(true);
      expect(
        permissionsGuard.canActivate(
          createMockContext(adminUser, 'dossiers:write'),
        ),
      ).toBe(true);
    });

    it('User demoted from Admin back to Commercial loses administrative capabilities', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-a',
        email: 'usera@orga.com',
        organizationId: ORG_A,
        status: 'active',
        organization: { status: 'active' },
        userRoles: [
          {
            role: {
              id: 'role-comm',
              name: 'Commercial',
              rolePermissions: [
                { permission: { resource: 'clients', action: 'read' } },
                { permission: { resource: 'dossiers', action: 'read' } },
              ],
            },
          },
        ],
      });

      const demotedUser = await jwtStrategy.validate({ sub: 'user-a' });

      expect(
        permissionsGuard.canActivate(
          createMockContext(demotedUser, 'clients:read'),
        ),
      ).toBe(true);
      expect(() =>
        permissionsGuard.canActivate(
          createMockContext(demotedUser, 'roles:manage'),
        ),
      ).toThrow(ForbiddenException);
      expect(() =>
        permissionsGuard.canActivate(
          createMockContext(demotedUser, 'users:manage'),
        ),
      ).toThrow(ForbiddenException);
    });
  });

  // ──────────────────────────────────────────────
  // 4 & 5: Admin Full Access & Organization Scoping Isolation
  // ──────────────────────────────────────────────
  describe('4 & 5. Admin Organization Scoping & Isolation', () => {
    it('Org A Admin has management permissions within Org A', async () => {
      const orgAAdmin = {
        id: 'admin-a',
        organizationId: ORG_A,
        permissions: ['roles:manage', 'users:manage', 'dossiers:write'],
      };

      expect(
        permissionsGuard.canActivate(
          createMockContext(orgAAdmin, 'roles:manage'),
        ),
      ).toBe(true);
      expect(
        permissionsGuard.canActivate(
          createMockContext(orgAAdmin, 'users:manage'),
        ),
      ).toBe(true);
    });

    it('Org A Admin CANNOT view or update roles belonging to Org B', async () => {
      // Role exists in DB but belongs to ORG_B
      mockPrisma.role.findFirst.mockResolvedValue(null);

      await expect(
        rolesService.findOne('role-in-org-b', ORG_A),
      ).rejects.toThrow(NotFoundException);

      await expect(
        rolesService.update('role-in-org-b', ORG_A, { name: 'Hacked' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('Org A Admin CANNOT view or update users belonging to Org B', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        usersService.findOne('user-in-org-b', ORG_A),
      ).rejects.toThrow(NotFoundException);

      await expect(
        usersService.update('user-in-org-b', ORG_A, { firstName: 'Hacked' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────
  // 6, 7, 8: Privilege Escalation Prevention (Commercial, Logistics, Finance)
  // ──────────────────────────────────────────────
  describe('6, 7, 8. Privilege Escalation Prevention by Business Roles', () => {
    it('Commercial user cannot manage roles or access users management', () => {
      const commercialUser = {
        id: 'comm-user',
        organizationId: ORG_A,
        permissions: [
          'prospects:read',
          'prospects:write',
          'clients:read',
          'dossiers:read',
        ],
      };

      expect(() =>
        permissionsGuard.canActivate(
          createMockContext(commercialUser, 'roles:manage'),
        ),
      ).toThrow(ForbiddenException);
      expect(() =>
        permissionsGuard.canActivate(
          createMockContext(commercialUser, 'users:manage'),
        ),
      ).toThrow(ForbiddenException);
    });

    it('Logistics user cannot access finance or dossier creation', () => {
      const logisticsUser = {
        id: 'log-user',
        organizationId: ORG_A,
        permissions: [
          'vehicles:read',
          'vehicles:write',
          'warehouses:read',
          'warehouses:write',
        ],
      };

      expect(() =>
        permissionsGuard.canActivate(
          createMockContext(logisticsUser, 'roles:manage'),
        ),
      ).toThrow(ForbiddenException);
      expect(() =>
        permissionsGuard.canActivate(
          createMockContext(logisticsUser, 'dossiers:write'),
        ),
      ).toThrow(ForbiddenException);
      expect(() =>
        permissionsGuard.canActivate(
          createMockContext(logisticsUser, 'orders:write'),
        ),
      ).toThrow(ForbiddenException);
    });

    it('Finance user cannot alter roles, delete users, or modify stock', () => {
      const financeUser = {
        id: 'fin-user',
        organizationId: ORG_A,
        permissions: ['orders:read', 'orders:write', 'dossiers:read'],
      };

      expect(() =>
        permissionsGuard.canActivate(
          createMockContext(financeUser, 'roles:manage'),
        ),
      ).toThrow(ForbiddenException);
      expect(() =>
        permissionsGuard.canActivate(
          createMockContext(financeUser, 'warehouses:write'),
        ),
      ).toThrow(ForbiddenException);
      expect(() =>
        permissionsGuard.canActivate(
          createMockContext(financeUser, 'vehicles:write'),
        ),
      ).toThrow(ForbiddenException);
    });
  });

  // ──────────────────────────────────────────────
  // 9 & 10: Cross-Tenant Role & Permission Injection
  // ──────────────────────────────────────────────
  describe('9 & 10. Cross-Tenant Role & Permission Injection Protection', () => {
    it('UsersService: should reject assigning an Org B role to an Org A user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      // Attempt to assign role-org-b (which fails query because it does not match ORG_A or null)
      mockPrisma.role.findMany.mockResolvedValue([]); // 0 valid roles found for ORG_A

      await expect(
        usersService.create(
          {
            email: 'newuser@orga.com',
            password: 'Password123!',
            firstName: 'New',
            lastName: 'User',
            roleIds: ['role-from-org-b'],
          },
          ORG_A,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('UsersService: should reject updating an Org A user with an Org B role', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-a',
        organizationId: ORG_A,
        userRoles: [],
      });
      // Valid roles query for role-from-org-b scoped to ORG_A returns empty
      mockPrisma.role.findMany.mockResolvedValue([]);

      await expect(
        usersService.update('user-a', ORG_A, {
          roleIds: ['role-from-org-b'],
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ──────────────────────────────────────────────
  // 11: Platform Role Protection
  // ──────────────────────────────────────────────
  describe('11. Platform Role Protection', () => {
    it('Tenant Admin cannot modify platform-level roles (organizationId: null)', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'global-superadmin',
        name: 'Platform SuperAdmin',
        organizationId: null, // Platform scope
        scope: 'platform',
      });

      await expect(
        rolesService.update('global-superadmin', ORG_A, { name: 'Tampered' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Tenant Admin cannot delete platform-level roles (organizationId: null)', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'global-superadmin',
        name: 'Platform SuperAdmin',
        organizationId: null,
        scope: 'platform',
      });

      await expect(
        rolesService.remove('global-superadmin', ORG_A),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ──────────────────────────────────────────────
  // 13 & 14: Data-Driven Seeds & Persistence of Admin Modifications
  // ──────────────────────────────────────────────
  describe('13 & 14. Seed Data Defaults & Persistence of Custom Role Permissions', () => {
    it('RolesService.findAllPermissions returns all available system capabilities from DB', async () => {
      const dbPermissions = [
        { id: 'p1', resource: 'dossiers', action: 'read' },
        { id: 'p2', resource: 'dossiers', action: 'write' },
        { id: 'p3', resource: 'vehicles', action: 'read' },
        { id: 'p4', resource: 'vehicles', action: 'write' },
      ];
      mockPrisma.permission.findMany.mockResolvedValue(dbPermissions);

      const perms = await rolesService.findAllPermissions();
      expect(perms).toHaveLength(4);
      expect(mockPrisma.permission.findMany).toHaveBeenCalled();
    });

    it('Custom permissions assigned by Admin persist and are strictly queried on each request without code logic', async () => {
      // User with a custom created role "Regional Dispatcher" with custom permissions
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-custom',
        email: 'dispatcher@orga.com',
        organizationId: ORG_A,
        status: 'active',
        organization: { status: 'active' },
        userRoles: [
          {
            role: {
              id: 'role-dispatcher',
              name: 'Regional Dispatcher',
              rolePermissions: [
                { permission: { resource: 'warehouses', action: 'read' } },
                { permission: { resource: 'warehouses', action: 'write' } },
                { permission: { resource: 'vehicles', action: 'read' } },
              ],
            },
          },
        ],
      });

      const customUser = await jwtStrategy.validate({ sub: 'user-custom' });

      expect(customUser.roles).toContain('Regional Dispatcher');
      expect(
        permissionsGuard.canActivate(
          createMockContext(customUser, 'warehouses:write'),
        ),
      ).toBe(true);
      expect(
        permissionsGuard.canActivate(
          createMockContext(customUser, 'vehicles:read'),
        ),
      ).toBe(true);
      expect(() =>
        permissionsGuard.canActivate(
          createMockContext(customUser, 'roles:manage'),
        ),
      ).toThrow(ForbiddenException);
    });
  });
});
