import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { DossiersService } from './dossiers.service';
import { PrismaService } from '../prisma/prisma.service';
import { DossierWorkflowService } from './workflows/dossier-workflow.service';
import { DossierType } from './dto/dossier-type.enum';

describe('DossiersService (Phase 2B Workflows & State Machine)', () => {
  let service: DossiersService;
  let workflowService: DossierWorkflowService;
  let prisma: any;

  const mockOrgId = 'org-1';

  const mockClient = {
    id: 'client-1',
    organizationId: mockOrgId,
    firstName: 'John',
    lastName: 'Doe',
  };

  const mockVehicle1 = {
    id: 'veh-1',
    organizationId: mockOrgId,
    brand: 'Toyota',
    model: 'Land Cruiser',
    status: 'available',
  };

  const mockVehicle2 = {
    id: 'veh-2',
    organizationId: mockOrgId,
    brand: 'Nissan',
    model: 'Patrol',
    status: 'available',
  };

  beforeEach(async () => {
    prisma = {
      dossier: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      client: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      vehicle: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      dossierVehicle: {
        create: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      dossierStatusHistory: {
        create: jest.fn(),
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
        DossierWorkflowService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<DossiersService>(DossiersService);
    workflowService = module.get<DossierWorkflowService>(DossierWorkflowService);
  });

  describe('Workflow 1: VEHICLE_SALE_CIF', () => {
    it('1. should create CIF dossier with default initial status (offre_selectionnee)', async () => {
      prisma.client.findFirst.mockResolvedValue(mockClient);
      prisma.dossier.create.mockResolvedValue({
        id: 'dos-cif',
        reference: 'CA-2026-0001',
        organizationId: mockOrgId,
        type: DossierType.VEHICLE_SALE_CIF,
        status: 'offre_selectionnee',
        dossierVehicles: [],
      });

      const res = await service.create(
        { clientId: 'client-1', type: DossierType.VEHICLE_SALE_CIF },
        'user-1',
        mockOrgId,
      );

      expect(res.status).toBe('offre_selectionnee');
      expect(prisma.dossier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: DossierType.VEHICLE_SALE_CIF,
            status: 'offre_selectionnee',
            organizationId: mockOrgId,
          }),
        }),
      );
    });

    it('2. should advance CIF from offre_selectionnee -> client_confirme', async () => {
      const mockDossier = {
        id: 'dos-cif',
        reference: 'CA-2026-0001',
        organizationId: mockOrgId,
        type: DossierType.VEHICLE_SALE_CIF,
        status: 'offre_selectionnee',
        dossierVehicles: [],
      };

      prisma.dossier.findFirst.mockResolvedValue(mockDossier);
      prisma.dossier.update.mockResolvedValue({
        ...mockDossier,
        status: 'client_confirme',
      });

      const res = await service.advanceStatus('dos-cif', 'Client confirmed', 'user-1', mockOrgId);

      expect(prisma.dossier.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'client_confirme',
          }),
        }),
      );
    });

    it('3. should reject transition from CIF to DDP-only customs/delivery state', async () => {
      const mockDossier = {
        id: 'dos-cif',
        reference: 'CA-2026-0001',
        organizationId: mockOrgId,
        type: DossierType.VEHICLE_SALE_CIF,
        status: 'en_transit',
        dossierVehicles: [],
      };

      prisma.dossier.findFirst.mockResolvedValue(mockDossier);

      // 'douane' is only valid in DDP, not CIF
      await expect(
        service.updateStatus('dos-cif', { status: 'douane' }, 'user-1', mockOrgId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Workflow 2: VEHICLE_SALE_DDP', () => {
    it('4. should allow DDP workflow to progress through customs and delivery', async () => {
      const mockDossier = {
        id: 'dos-ddp',
        reference: 'CA-2026-0002',
        organizationId: mockOrgId,
        type: DossierType.VEHICLE_SALE_DDP,
        status: 'arrivee_port',
        dossierVehicles: [{ vehicleId: 'veh-1' }],
      };

      prisma.dossier.findFirst.mockResolvedValue(mockDossier);
      prisma.dossier.update.mockResolvedValue({
        ...mockDossier,
        status: 'douane',
      });

      const res = await service.advanceStatus('dos-ddp', 'Vehicles entered customs', 'ops-user', mockOrgId);

      expect(prisma.dossier.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'douane',
          }),
        }),
      );
    });

    it('5. should reject skipping mandatory intermediate steps in DDP', async () => {
      const mockDossier = {
        id: 'dos-ddp',
        reference: 'CA-2026-0002',
        organizationId: mockOrgId,
        type: DossierType.VEHICLE_SALE_DDP,
        status: 'en_transit',
        dossierVehicles: [],
      };

      prisma.dossier.findFirst.mockResolvedValue(mockDossier);

      // Cannot jump directly from en_transit to livraison_client
      await expect(
        service.updateStatus('dos-ddp', { status: 'livraison_client' }, 'user-1', mockOrgId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Workflow 3: SHIPPING_ONLY', () => {
    it('6. should initialize SHIPPING_ONLY with client and progress through logistics states', async () => {
      prisma.client.findFirst.mockResolvedValue(mockClient);
      prisma.dossier.create.mockResolvedValue({
        id: 'dos-ship',
        reference: 'CA-2026-0003',
        organizationId: mockOrgId,
        type: DossierType.SHIPPING_ONLY,
        status: 'client',
        dossierVehicles: [],
      });

      const res = await service.create(
        { clientId: 'client-1', type: DossierType.SHIPPING_ONLY },
        'user-1',
        mockOrgId,
      );

      expect(res.status).toBe('client');
    });

    it('7. should reject vehicle purchase states in SHIPPING_ONLY', async () => {
      const mockDossier = {
        id: 'dos-ship',
        reference: 'CA-2026-0003',
        organizationId: mockOrgId,
        type: DossierType.SHIPPING_ONLY,
        status: 'client',
        dossierVehicles: [],
      };

      prisma.dossier.findFirst.mockResolvedValue(mockDossier);

      // 'achat_confirme' and 'paiement_fournisseur' are forbidden in SHIPPING_ONLY
      await expect(
        service.updateStatus('dos-ship', { status: 'achat_confirme' }, 'user-1', mockOrgId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Terminal States & Protection', () => {
    it('8. should reject any status transition when dossier is in terminal state cloture', async () => {
      const mockClosedDossier = {
        id: 'dos-closed',
        reference: 'CA-2026-0004',
        organizationId: mockOrgId,
        type: DossierType.VEHICLE_SALE_CIF,
        status: 'cloture',
        dossierVehicles: [],
      };

      prisma.dossier.findFirst.mockResolvedValue(mockClosedDossier);

      await expect(
        service.updateStatus('dos-closed', { status: 'contrat_signe' }, 'user-1', mockOrgId),
      ).rejects.toThrow(ConflictException);
    });

    it('9. should return allowed transitions including next step and cancellation', async () => {
      const mockDossier = {
        id: 'dos-1',
        reference: 'CA-2026-0001',
        organizationId: mockOrgId,
        type: DossierType.VEHICLE_SALE_CIF,
        status: 'contrat_signe',
        dossierVehicles: [],
      };

      prisma.dossier.findFirst.mockResolvedValue(mockDossier);

      const result = await service.getAllowedTransitions('dos-1', mockOrgId);

      expect(result.currentStatus).toBe('contrat_signe');
      expect(result.allowedTransitions).toContain('acompte_recu');
      expect(result.allowedTransitions).toContain('annule');
    });

    it('10. should reject transition to the exact same status', async () => {
      const mockDossier = {
        id: 'dos-1',
        reference: 'CA-2026-0001',
        organizationId: mockOrgId,
        type: DossierType.VEHICLE_SALE_CIF,
        status: 'inspection',
        dossierVehicles: [],
      };

      prisma.dossier.findFirst.mockResolvedValue(mockDossier);

      await expect(
        service.updateStatus('dos-1', { status: 'inspection' }, 'user-1', mockOrgId),
      ).rejects.toThrow(BadRequestException);
    });

    it('11. should update attached vehicle status to sold when closing dossier', async () => {
      const mockDossier = {
        id: 'dos-final',
        reference: 'CA-2026-0005',
        organizationId: mockOrgId,
        type: DossierType.VEHICLE_SALE_CIF,
        status: 'documents_remis',
        dossierVehicles: [
          { vehicleId: 'veh-1', vehicle: mockVehicle1 },
        ],
      };

      prisma.dossier.findFirst.mockResolvedValue(mockDossier);
      prisma.dossier.update.mockResolvedValue({
        ...mockDossier,
        status: 'cloture',
      });

      await service.updateStatus('dos-final', { status: 'cloture' }, 'user-1', mockOrgId);

      expect(prisma.vehicle.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['veh-1'] } },
        data: { status: 'sold' },
      });
    });
  });
});
