import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DossiersService } from '../dossiers/dossiers.service';
import { ClientsService } from '../clients/clients.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { OrdersService } from '../orders/orders.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { DossierWorkflowService } from '../dossiers/workflows/dossier-workflow.service';

describe('Multi-Tenant Isolation & Cross-Tenant Security (Phase 3-5)', () => {
  let dossiersService: DossiersService;
  let clientsService: ClientsService;
  let vehiclesService: VehiclesService;
  let ordersService: OrdersService;
  let usersService: UsersService;
  let prisma: any;

  const ORG_A = 'org-tenant-a';
  const ORG_B = 'org-tenant-b';

  beforeEach(async () => {
    prisma = {
      dossier: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      client: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      vehicle: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      userRole: {
        count: jest.fn(),
      },
      role: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (callback) => {
        if (typeof callback === 'function') {
          return callback(prisma);
        }
        return Promise.all(callback);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DossiersService,
        ClientsService,
        VehiclesService,
        OrdersService,
        UsersService,
        DossierWorkflowService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    dossiersService = module.get<DossiersService>(DossiersService);
    clientsService = module.get<ClientsService>(ClientsService);
    vehiclesService = module.get<VehiclesService>(VehiclesService);
    ordersService = module.get<OrdersService>(OrdersService);
    usersService = module.get<UsersService>(UsersService);
  });

  describe('1. Cross-Tenant Dossier Protection', () => {
    it('should reject creating dossier with a client belonging to another tenant', async () => {
      // Client belongs to ORG_B, but request is for ORG_A
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(
        dossiersService.create(
          { clientId: 'client-from-org-b' },
          'user-1',
          ORG_A,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject creating dossier with a vehicle belonging to another tenant', async () => {
      prisma.client.findFirst.mockResolvedValue({ id: 'client-1', organizationId: ORG_A });
      // Vehicle from ORG_B not found when scoped to ORG_A
      prisma.vehicle.findFirst.mockResolvedValue(null);

      await expect(
        dossiersService.create(
          { clientId: 'client-1', vehicleId: 'veh-from-org-b' },
          'user-1',
          ORG_A,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not allow Tenant A to find Tenant B dossier', async () => {
      prisma.dossier.findFirst.mockResolvedValue(null);

      await expect(
        dossiersService.findOne('dossier-of-org-b', ORG_A),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('2. Cross-Tenant Order Protection', () => {
    it('should reject creating order with client belonging to another tenant', async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(
        ordersService.create(
          {
            clientId: 'client-of-org-b',
            items: [{ vehicleId: 'veh-1', unitPrice: 10000 }],
          },
          'user-1',
          ORG_A,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('3. User Management Security', () => {
    it('should prevent user from deleting their own account', async () => {
      await expect(
        usersService.remove('user-admin-1', ORG_A, 'user-admin-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent deleting the last admin of the organization', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-admin-1',
        organizationId: ORG_A,
        userRoles: [{ role: { name: 'Admin' } }],
      });

      // No other active admins in ORG_A
      prisma.userRole.count.mockResolvedValue(0);

      await expect(
        usersService.remove('user-admin-1', ORG_A, 'other-caller'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
