import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { VehicleRequestsService } from './vehicle-requests.service';
import { DossiersService } from '../dossiers/dossiers.service';
import { PartnersService } from '../partners/partners.service';
import { PrismaService } from '../prisma/prisma.service';
import { DossierWorkflowService } from '../dossiers/workflows/dossier-workflow.service';
import { DossierType } from '@auto-import/contracts';
import { DocumentsService } from '../documents/documents.service';

describe('Phase 6 — Import Operations & Vehicle Procurement Comprehensive Audit', () => {
  let vehicleRequestsService: VehicleRequestsService;
  let dossiersService: DossiersService;
  let partnersService: PartnersService;
  let prisma: any;

  const ORG_A = 'org-tenant-a';
  const ORG_B = 'org-tenant-b';

  beforeEach(async () => {
    prisma = {
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
      dossier: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      dossierVehicle: {
        findFirst: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      dossierStatusHistory: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      partner: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      purchase: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn(),
      },
      commerceSequence: {
        upsert: jest.fn().mockResolvedValue({ value: 5 }),
      },
      client: {
        findFirst: jest.fn(),
      },
      prospect: {
        findFirst: jest.fn(),
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
        VehicleRequestsService,
        DossiersService,
        PartnersService,
        DossierWorkflowService,
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

    vehicleRequestsService = module.get<VehicleRequestsService>(
      VehicleRequestsService,
    );
    dossiersService = module.get<DossiersService>(DossiersService);
    partnersService = module.get<PartnersService>(PartnersService);
  });

  // ──────────────────────────────────────────────
  // 1. VehicleRequest Lifecycle
  // ──────────────────────────────────────────────
  describe('1. VehicleRequest Lifecycle & Candidate Management', () => {
    it('should create vehicle request with valid client belonging to caller org', async () => {
      prisma.client.findFirst.mockResolvedValue({
        id: 'client-1',
        organizationId: ORG_A,
      });
      prisma.vehicleRequest.create.mockResolvedValue({
        id: 'vr-1',
        organizationId: ORG_A,
        clientId: 'client-1',
        brand: 'Geely',
        model: 'Monjaro',
        status: 'open',
      });

      const result = await vehicleRequestsService.create(
        { clientId: 'client-1', brand: 'Geely', model: 'Monjaro' },
        ORG_A,
      );

      expect(result.id).toBe('vr-1');
      expect(prisma.vehicleRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_A,
            status: 'open',
          }),
        }),
      );
    });

    it('should REJECT creating vehicle request when client belongs to another tenant', async () => {
      // Client not found in ORG_A
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(
        vehicleRequestsService.create({ clientId: 'client-of-org-b' }, ORG_A),
      ).rejects.toThrow(NotFoundException);
    });

    it('should add available vehicle as candidate to request', async () => {
      prisma.vehicleRequest.findFirst.mockResolvedValue({
        id: 'vr-1',
        organizationId: ORG_A,
        status: 'open',
      });
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'veh-1',
        organizationId: ORG_A,
        status: 'available',
      });
      prisma.dossierVehicle.findFirst.mockResolvedValue(null); // Not in any active dossier
      prisma.vehicleCandidate.create.mockResolvedValue({
        id: 'cand-1',
        vehicleRequestId: 'vr-1',
        vehicleId: 'veh-1',
        status: 'proposed',
      });

      const result = await vehicleRequestsService.addCandidate(
        { vehicleRequestId: 'vr-1', vehicleId: 'veh-1', proposedPrice: 25000 },
        ORG_A,
      );

      expect(result.id).toBe('cand-1');
      expect(prisma.vehicleCandidate.create).toHaveBeenCalled();
    });

    it('should REJECT candidate addition if vehicle status is NOT available (e.g. reserved or inTransit)', async () => {
      prisma.vehicleRequest.findFirst.mockResolvedValue({
        id: 'vr-1',
        organizationId: ORG_A,
        status: 'open',
      });
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'veh-1',
        organizationId: ORG_A,
        status: 'inTransit',
      });

      await expect(
        vehicleRequestsService.addCandidate(
          { vehicleRequestId: 'vr-1', vehicleId: 'veh-1' },
          ORG_A,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should REJECT candidate addition if vehicle is already in an active dossier', async () => {
      prisma.vehicleRequest.findFirst.mockResolvedValue({
        id: 'vr-1',
        organizationId: ORG_A,
        status: 'open',
      });
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'veh-1',
        organizationId: ORG_A,
        status: 'available',
      });
      // Vehicle is attached to another active dossier
      prisma.dossierVehicle.findFirst.mockResolvedValue({
        id: 'dv-1',
        dossierId: 'dossier-other',
      });

      await expect(
        vehicleRequestsService.addCandidate(
          { vehicleRequestId: 'vr-1', vehicleId: 'veh-1' },
          ORG_A,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ──────────────────────────────────────────────
  // 2. Candidate Validation & Concurrency Protection
  // ──────────────────────────────────────────────
  describe('2. Candidate Validation & Concurrency Protection', () => {
    it('should validate candidate atomically, reserve vehicle, and advance linked dossier to purchaseConfirmed', async () => {
      prisma.vehicleCandidate.findFirst.mockResolvedValue({
        id: 'cand-1',
        vehicleRequestId: 'vr-1',
        vehicleId: 'veh-1',
        status: 'proposed',
        vehicleRequest: {
          id: 'vr-1',
          organizationId: ORG_A,
          dossier: {
            id: 'dossier-1',
            status: 'offerSelected',
          },
        },
        vehicle: {
          id: 'veh-1',
          status: 'available',
        },
      });

      prisma.dossierVehicle.findFirst.mockResolvedValue(null); // No conflicting active dossier
      prisma.vehicle.updateMany.mockResolvedValue({ count: 1 }); // Atomic reservation succeeded
      prisma.vehicleCandidate.update.mockResolvedValue({
        id: 'cand-1',
        status: 'validated',
      });
      prisma.vehicleRequest.update.mockResolvedValue({
        id: 'vr-1',
        status: 'validated',
      });
      prisma.dossierVehicle.upsert.mockResolvedValue({ id: 'dv-1' });
      prisma.dossier.update.mockResolvedValue({
        id: 'dossier-1',
        status: 'purchaseConfirmed',
      });
      prisma.dossierStatusHistory.create.mockResolvedValue({ id: 'h-1' });

      const result = await vehicleRequestsService.validateCandidate(
        'cand-1',
        ORG_A,
        'user-sales-1',
      );

      expect(result.status).toBe('validated');
      expect(prisma.vehicle.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'veh-1',
          organizationId: ORG_A,
          status: 'available',
        },
        data: { status: 'reserved' },
      });
      expect(prisma.dossier.update).not.toHaveBeenCalled();
      expect(prisma.vehicleRequest.update).toHaveBeenCalledWith({
        where: { id: 'vr-1' },
        data: { status: 'candidateSelected' },
      });
    });

    it('Concurrency Safety: should REJECT validation if vehicle was concurrently reserved by another transaction (updateMany count = 0)', async () => {
      prisma.vehicleCandidate.findFirst.mockResolvedValue({
        id: 'cand-1',
        vehicleRequestId: 'vr-1',
        vehicleId: 'veh-1',
        status: 'proposed',
        vehicleRequest: {
          id: 'vr-1',
          organizationId: ORG_A,
          dossier: null,
        },
        vehicle: {
          id: 'veh-1',
          status: 'available',
        },
      });

      prisma.dossierVehicle.findFirst.mockResolvedValue(null);
      // Another concurrent worker reserved the vehicle in the millisecond between read and update
      prisma.vehicle.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        vehicleRequestsService.validateCandidate(
          'cand-1',
          ORG_A,
          'user-sales-1',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ──────────────────────────────────────────────
  // 3. Purchase Confirmation & Supplier Relationship
  // ──────────────────────────────────────────────
  describe('3. Purchase Confirmation & Supplier Tracking', () => {
    it('should confirm purchase, associate supplier Partner, create Purchase record, and link vehicle to dossier', async () => {
      prisma.vehicleRequest.findFirst.mockResolvedValue({
        id: 'vr-1',
        organizationId: ORG_A,
        status: 'candidateSelected',
        candidates: [
          {
            id: 'cand-1',
            vehicleId: 'veh-1',
            status: 'validated',
            vehicle: {
              id: 'veh-1',
              brand: 'Changan',
              model: 'Uni-K',
              status: 'reserved',
            },
          },
        ],
        dossier: {
          id: 'dossier-1',
          type: DossierType.VEHICLE_SALE_CIF,
          status: 'depositReceived',
        },
      });

      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'veh-1',
        organizationId: ORG_A,
        brand: 'Changan',
        model: 'Uni-K',
        status: 'reserved',
      });

      prisma.partner.findFirst.mockResolvedValue({
        id: 'partner-supplier-china',
        name: 'China Auto Export Co',
        organizationId: ORG_A,
        type: 'supplier',
      });

      prisma.dossierVehicle.findFirst.mockResolvedValue(null);
      prisma.vehicle.update.mockResolvedValue({ id: 'veh-1' });
      prisma.vehicleCandidate.update.mockResolvedValue({
        id: 'cand-1',
        status: 'validated',
      });
      prisma.vehicleRequest.update.mockResolvedValue({
        id: 'vr-1',
        status: 'validated',
      });
      prisma.dossierVehicle.upsert.mockResolvedValue({ id: 'dv-1' });
      prisma.dossier.update.mockResolvedValue({
        id: 'dossier-1',
        status: 'purchaseConfirmed',
      });
      prisma.dossierStatusHistory.create.mockResolvedValue({ id: 'h-1' });
      prisma.purchase.count.mockResolvedValue(4);
      prisma.purchase.create.mockResolvedValue({
        id: 'pur-1',
        purchaseNumber: 'PUR-2026-00005',
        supplierId: 'partner-supplier-china',
        vehicleId: 'veh-1',
        purchasePrice: 22000,
        currency: 'USD',
        status: 'confirmed',
      });

      const result = await vehicleRequestsService.confirmPurchase(
        'vr-1',
        {
          candidateId: 'cand-1',
          supplierId: 'partner-supplier-china',
          purchasePrice: 22000,
          currency: 'USD',
          notes: 'Direct factory shipment confirmed',
        },
        ORG_A,
        'user-procurement-1',
      );

      expect(result.message).toBe('Purchase confirmed successfully');
      expect(result.purchase.purchaseNumber).toBe('PUR-2026-00005');
      expect(prisma.purchase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            supplierId: 'partner-supplier-china',
            vehicleId: 'veh-1',
            purchasePrice: 22000,
            status: 'confirmed',
          }),
        }),
      );
    });

    it('should REJECT purchase confirmation if supplier belongs to another tenant', async () => {
      prisma.vehicleRequest.findFirst.mockResolvedValue({
        id: 'vr-1',
        organizationId: ORG_A,
        status: 'candidateSelected',
        candidates: [{ id: 'cand-1', vehicleId: 'veh-1', status: 'validated' }],
      });

      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'veh-1',
        organizationId: ORG_A,
        status: 'reserved',
      });

      // Supplier Partner belongs to ORG_B
      prisma.partner.findFirst.mockResolvedValue(null);

      await expect(
        vehicleRequestsService.confirmPurchase(
          'vr-1',
          { candidateId: 'cand-1', supplierId: 'partner-of-org-b' },
          ORG_A,
          'user-procurement-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────
  // 4. Dossier Vehicle Attach & Safe Detachment
  // ──────────────────────────────────────────────
  describe('4. DossierVehicle Consistency & Safety Checks', () => {
    it('DossiersService.addVehicle: atomically reserves available vehicle and attaches to dossier', async () => {
      // First call (check inside addVehicle) returns dossier without veh-1
      // Second call (inside findOne at end) returns dossier with veh-1
      prisma.dossier.findFirst
        .mockResolvedValueOnce({
          id: 'dossier-1',
          organizationId: ORG_A,
          reference: 'CA-2026-0010',
          status: 'offerSelected',
          dossierVehicles: [],
        })
        .mockResolvedValueOnce({
          id: 'dossier-1',
          organizationId: ORG_A,
          reference: 'CA-2026-0010',
          status: 'offerSelected',
          dossierVehicles: [
            {
              vehicleId: 'veh-1',
              vehicle: { id: 'veh-1', brand: 'BYD', model: 'Song Plus' },
            },
          ],
        });

      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'veh-1',
        brand: 'BYD',
        model: 'Song Plus',
        organizationId: ORG_A,
        status: 'available',
      });

      prisma.dossierVehicle.findFirst.mockResolvedValue(null); // No conflicting active dossier
      prisma.vehicle.updateMany.mockResolvedValue({ count: 1 });
      prisma.dossierVehicle.create.mockResolvedValue({ id: 'dv-1' });
      prisma.dossierStatusHistory.create.mockResolvedValue({ id: 'h-1' });

      await dossiersService.addVehicle('dossier-1', 'veh-1', ORG_A, 'user-1');

      expect(prisma.vehicle.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'veh-1',
          organizationId: ORG_A,
          status: 'available',
        },
        data: { status: 'reserved' },
      });
    });

    it('DossiersService.addVehicle: REJECTS vehicle already attached to another active dossier', async () => {
      prisma.dossier.findFirst.mockResolvedValue({
        id: 'dossier-1',
        organizationId: ORG_A,
        status: 'offerSelected',
        dossierVehicles: [],
      });

      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'veh-1',
        organizationId: ORG_A,
        status: 'available',
      });

      // Conflicting active dossier
      prisma.dossierVehicle.findFirst.mockResolvedValue({
        id: 'dv-conflict',
        dossierId: 'dossier-2',
      });

      await expect(
        dossiersService.addVehicle('dossier-1', 'veh-1', ORG_A, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('DossiersService.removeVehicle: REJECTS detachment if vehicle is inTransit, inCustoms, or sold', async () => {
      prisma.dossier.findFirst.mockResolvedValue({
        id: 'dossier-1',
        organizationId: ORG_A,
        reference: 'CA-2026-0010',
        dossierVehicles: [{ vehicleId: 'veh-1' }],
      });

      prisma.vehicle.findUnique.mockResolvedValue({
        id: 'veh-1',
        status: 'inTransit', // Vehicle is already at sea / in transit
      });

      await expect(
        dossiersService.removeVehicle('dossier-1', 'veh-1', ORG_A, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('DossiersService.removeVehicle: safely detaches reserved vehicle and reverts status to available', async () => {
      // First call (inside removeVehicle) has veh-1
      // Second call (inside findOne at end) has empty dossierVehicles
      prisma.dossier.findFirst
        .mockResolvedValueOnce({
          id: 'dossier-1',
          organizationId: ORG_A,
          reference: 'CA-2026-0010',
          status: 'purchaseConfirmed',
          dossierVehicles: [{ vehicleId: 'veh-1' }],
        })
        .mockResolvedValueOnce({
          id: 'dossier-1',
          organizationId: ORG_A,
          reference: 'CA-2026-0010',
          status: 'purchaseConfirmed',
          dossierVehicles: [],
        });

      prisma.vehicle.findUnique.mockResolvedValue({
        id: 'veh-1',
        brand: 'Geely',
        model: 'Coolray',
        status: 'reserved',
      });

      prisma.dossierVehicle.delete.mockResolvedValue({});
      prisma.vehicle.update.mockResolvedValue({
        id: 'veh-1',
        status: 'available',
      });
      prisma.dossierStatusHistory.create.mockResolvedValue({ id: 'h-1' });

      await dossiersService.removeVehicle(
        'dossier-1',
        'veh-1',
        ORG_A,
        'user-1',
      );

      expect(prisma.vehicle.update).toHaveBeenCalledWith({
        where: { id: 'veh-1' },
        data: { status: 'available' },
      });
    });
  });

  // ──────────────────────────────────────────────
  // 5. Partners Module & Multi-Tenancy
  // ──────────────────────────────────────────────
  describe('5. Partners Management & Multi-Tenant Isolation', () => {
    it('PartnersService.create: binds partner to caller organization', async () => {
      prisma.partner.create.mockResolvedValue({
        id: 'partner-1',
        organizationId: ORG_A,
        name: 'COSCO Shipping',
        type: 'carrier',
        status: 'active',
      });

      const result = await partnersService.create(
        { name: 'COSCO Shipping', type: 'carrier' },
        ORG_A,
      );

      expect(result.id).toBe('partner-1');
      expect(prisma.partner.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_A,
          }),
        }),
      );
    });

    it('PartnersService.findOne: rejects finding partner of another tenant', async () => {
      prisma.partner.findFirst.mockResolvedValue(null);

      await expect(
        partnersService.findOne('partner-of-org-b', ORG_A),
      ).rejects.toThrow(NotFoundException);
    });

    it('PartnersService.remove: archives a referenced partner without deleting it', async () => {
      prisma.partner.findFirst.mockResolvedValue({
        id: 'partner-1',
        organizationId: ORG_A,
      });
      prisma.vehicle.count.mockResolvedValue(3); // 3 vehicles linked to this supplier

      prisma.partner.update.mockResolvedValue({
        id: 'partner-1',
        status: 'archived',
      });
      await expect(partnersService.remove('partner-1', ORG_A)).resolves.toEqual(
        expect.objectContaining({ status: 'archived' }),
      );
      expect(prisma.partner.delete).not.toHaveBeenCalled();
    });
  });
});
