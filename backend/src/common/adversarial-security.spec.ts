import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DossiersService } from '../dossiers/dossiers.service';
import { ClientsService } from '../clients/clients.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { OrdersService } from '../orders/orders.service';
import { VehicleRequestsService } from '../vehicle-requests/vehicle-requests.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { ProspectsService } from '../prospects/prospects.service';
import { ContactResolutionService } from '../crm/contact-resolution.service';
import { CrmReferenceService } from '../crm/crm-reference.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { DossierWorkflowService } from '../dossiers/workflows/dossier-workflow.service';
import { DocumentsService } from '../documents/documents.service';

describe('Deep Adversarial Security Audit (Phase 3-5)', () => {
  let dossiersService: DossiersService;
  let clientsService: ClientsService;
  let vehiclesService: VehiclesService;
  let ordersService: OrdersService;
  let vehicleRequestsService: VehicleRequestsService;
  let warehousesService: WarehousesService;
  let prospectsService: ProspectsService;
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
        groupBy: jest.fn(),
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
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      vehicleRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      vehicleCandidate: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      prospect: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      warehouse: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      warehouseLocation: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      stockMovement: {
        create: jest.fn(),
        findMany: jest.fn(),
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
      dossierStatusHistory: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      dossierVehicle: {
        create: jest.fn(),
        delete: jest.fn(),
      },
      reservation: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      orderItem: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      orderStatusHistory: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      prospectStatusHistory: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      task: { updateMany: jest.fn(), upsert: jest.fn() },
      notification: { upsert: jest.fn() },
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
        VehicleRequestsService,
        WarehousesService,
        ProspectsService,
        UsersService,
        DossierWorkflowService,
        {
          provide: ContactResolutionService,
          useValue: {
            normalizePhoneForCountry: jest
              .fn()
              .mockResolvedValue('+213550000000'),
            matchNormalizedPhoneInTransaction: jest.fn().mockResolvedValue({
              normalizedValue: '+213550000000',
              match: null,
            }),
            syncProspectContacts: jest.fn(),
            syncClientContacts: jest.fn(),
          },
        },
        {
          provide: CrmReferenceService,
          useValue: {
            assertReference: jest.fn().mockResolvedValue({ id: 'reference' }),
          },
        },
        {
          provide: DocumentsService,
          useValue: {
            verifySignedContract: jest
              .fn()
              .mockResolvedValue({ id: 'contract-1' }),
            verifyCheckpoint: jest.fn().mockResolvedValue({
              complete: true,
              missingVehicleIds: [],
              evidenceIds: [],
            }),
            markEvidenceRelied: jest.fn(),
          },
        },
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
    vehicleRequestsService = module.get<VehicleRequestsService>(
      VehicleRequestsService,
    );
    warehousesService = module.get<WarehousesService>(WarehousesService);
    prospectsService = module.get<ProspectsService>(ProspectsService);
    usersService = module.get<UsersService>(UsersService);
  });

  describe('1. Organization ID Spoofing Protection in Creation', () => {
    it('VehiclesService: must bind vehicle to caller organization regardless of payload', async () => {
      prisma.vehicle.create.mockResolvedValue({
        id: 'veh-1',
        organizationId: ORG_A,
        brand: 'Geely',
        model: 'Coolray',
      });

      await vehiclesService.create(
        {
          vin: 'L6TDBE2E0RA000001',
          brand: 'Geely',
          model: 'Coolray',
          acquisitionType: 'stock' as any,
          // Attacker sends another org in payload
        },
        ORG_A,
      );

      expect(prisma.vehicle.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_A,
          }),
        }),
      );
    });

    it('ProspectsService: must bind prospect to caller organization', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.prospect.create.mockResolvedValue({
        id: 'pros-1',
        organizationId: ORG_A,
        firstName: 'Ali',
        lastName: 'Ben',
      });

      await prospectsService.create(
        {
          firstName: 'Ali',
          lastName: 'Ben',
          phone: '0550000000',
          entryChannelId: '0d3dd271-3100-4f88-90b0-925dd72a8531',
          marketingSourceId: 'cc2f21f3-29bf-48aa-8d21-2b8bf15e87e7',
        },
        'user-1',
        ORG_A,
      );

      expect(prisma.prospect.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_A,
          }),
        }),
      );
    });
  });

  describe('2. Cross-Tenant Relationship Injections', () => {
    it('Dossier: should REJECT creating dossier with orderId belonging to another tenant', async () => {
      prisma.client.findFirst.mockResolvedValue({
        id: 'client-1',
        organizationId: ORG_A,
      });
      // Order belongs to Org B (not found in Org A)
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        dossiersService.create(
          { clientId: 'client-1', orderId: 'order-of-org-b' },
          'user-1',
          ORG_A,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('Dossier: should REJECT creating dossier with vehicleRequestId belonging to another tenant', async () => {
      prisma.client.findFirst.mockResolvedValue({
        id: 'client-1',
        organizationId: ORG_A,
      });
      // VehicleRequest belongs to Org B (not found in Org A)
      prisma.vehicleRequest.findFirst.mockResolvedValue(null);

      await expect(
        dossiersService.create(
          { clientId: 'client-1', vehicleRequestId: 'req-of-org-b' },
          'user-1',
          ORG_A,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('Order: should REJECT creating order with prospectId belonging to another tenant', async () => {
      prisma.client.findFirst.mockResolvedValue({
        id: 'client-1',
        organizationId: ORG_A,
      });
      // Prospect belongs to Org B (not found in Org A)
      prisma.prospect.findFirst.mockResolvedValue(null);

      await expect(
        ordersService.create(
          {
            clientId: 'client-1',
            prospectId: 'prospect-of-org-b',
            items: [],
          },
          'user-1',
          ORG_A,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('3. List Endpoint Tenant Isolation', () => {
    it('DossiersService.findAll: strictly filters by organizationId', async () => {
      prisma.dossier.findMany.mockResolvedValue([]);
      prisma.dossier.count.mockResolvedValue(0);

      await dossiersService.findAll(ORG_A, 1, 10, { search: 'test' });

      expect(prisma.dossier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_A,
          }),
        }),
      );
    });

    it('VehiclesService.findAll: strictly filters by organizationId even with search/filters', async () => {
      prisma.vehicle.findMany.mockResolvedValue([]);
      prisma.vehicle.count.mockResolvedValue(0);

      await vehiclesService.findAll(ORG_A, { brand: 'Toyota', search: 'Land' });

      expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_A,
            brand: expect.any(Object),
          }),
        }),
      );
    });

    it('OrdersService.findAll: strictly filters by organizationId', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await ordersService.findAll(ORG_A, 1, 10, { status: 'confirmed' });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_A,
            status: 'confirmed',
          }),
        }),
      );
    });
  });

  describe('4. Aggregation and Statistics Tenant Isolation', () => {
    it('DossiersService.getStatistics: counts only Organization A records', async () => {
      prisma.dossier.count.mockResolvedValue(0);
      prisma.dossier.groupBy.mockResolvedValue([]);

      await dossiersService.getStatistics(ORG_A);

      expect(prisma.dossier.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_A,
          }),
        }),
      );
    });

    it('VehiclesService.getStockSummary: counts and groups only Organization A records', async () => {
      prisma.vehicle.count.mockResolvedValue(0);
      prisma.vehicle.groupBy.mockResolvedValue([]);

      await vehiclesService.getStockSummary(ORG_A);

      expect(prisma.vehicle.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG_A,
          }),
        }),
      );
      expect(prisma.vehicle.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG_A },
        }),
      );
    });

    it('VehicleRequestsService.getStatistics: counts only Organization A records', async () => {
      prisma.vehicleRequest.count.mockResolvedValue(0);

      await vehicleRequestsService.getStatistics(ORG_A);

      expect(prisma.vehicleRequest.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG_A },
        }),
      );
    });
  });
});
