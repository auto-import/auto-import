import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { DossiersService } from './dossiers.service';
import { PrismaService } from '../prisma/prisma.service';
import { DossierType } from './dto/dossier-type.enum';

describe('DossiersService', () => {
  let service: DossiersService;
  let prisma: any;

  const mockClient = {
    id: 'client-1',
    firstName: 'John',
    lastName: 'Doe',
  };

  const mockVehicle1 = {
    id: 'veh-1',
    brand: 'Toyota',
    model: 'Land Cruiser',
    status: 'available',
  };

  const mockVehicle2 = {
    id: 'veh-2',
    brand: 'Nissan',
    model: 'Patrol',
    status: 'available',
  };

  const mockVehicleUnavailable = {
    id: 'veh-3',
    brand: 'BMW',
    model: 'X5',
    status: 'reserved',
  };

  beforeEach(async () => {
    prisma = {
      dossier: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      client: {
        findUnique: jest.fn(),
      },
      vehicle: {
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
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<DossiersService>(DossiersService);
  });

  describe('create with DossierType', () => {
    it('1. should create a VEHICLE_SALE_CIF Dossier', async () => {
      prisma.client.findUnique.mockResolvedValue(mockClient);
      prisma.vehicle.findUnique.mockResolvedValue(mockVehicle1);
      prisma.dossier.create.mockResolvedValue({
        id: 'dos-cif',
        reference: 'CA-2026-0001',
        type: DossierType.VEHICLE_SALE_CIF,
        clientId: 'client-1',
        status: 'prospection',
        dossierVehicles: [
          {
            id: 'dv-1',
            dossierId: 'dos-cif',
            vehicleId: 'veh-1',
            assignedAt: new Date(),
            vehicle: mockVehicle1,
          },
        ],
      });

      const result = await service.create(
        {
          clientId: 'client-1',
          type: DossierType.VEHICLE_SALE_CIF,
          vehicleId: 'veh-1',
        },
        'user-1',
      );

      expect(result).toBeDefined();
      expect(result.type).toBe(DossierType.VEHICLE_SALE_CIF);
      expect(prisma.dossier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: DossierType.VEHICLE_SALE_CIF,
          }),
        }),
      );
    });

    it('2. should create a VEHICLE_SALE_DDP Dossier', async () => {
      prisma.client.findUnique.mockResolvedValue(mockClient);
      prisma.vehicle.findUnique.mockResolvedValue(mockVehicle1);
      prisma.dossier.create.mockResolvedValue({
        id: 'dos-ddp',
        reference: 'CA-2026-0002',
        type: DossierType.VEHICLE_SALE_DDP,
        clientId: 'client-1',
        status: 'prospection',
        dossierVehicles: [
          {
            id: 'dv-1',
            dossierId: 'dos-ddp',
            vehicleId: 'veh-1',
            assignedAt: new Date(),
            vehicle: mockVehicle1,
          },
        ],
      });

      const result = await service.create(
        {
          clientId: 'client-1',
          type: DossierType.VEHICLE_SALE_DDP,
          vehicleId: 'veh-1',
        },
        'user-1',
      );

      expect(result).toBeDefined();
      expect(result.type).toBe(DossierType.VEHICLE_SALE_DDP);
      expect(prisma.dossier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: DossierType.VEHICLE_SALE_DDP,
          }),
        }),
      );
    });

    it('3. should create a SHIPPING_ONLY Dossier', async () => {
      prisma.client.findUnique.mockResolvedValue(mockClient);
      prisma.vehicle.findUnique.mockResolvedValue(mockVehicle1);
      prisma.dossier.create.mockResolvedValue({
        id: 'dos-ship',
        reference: 'CA-2026-0003',
        type: DossierType.SHIPPING_ONLY,
        clientId: 'client-1',
        status: 'prospection',
        dossierVehicles: [
          {
            id: 'dv-1',
            dossierId: 'dos-ship',
            vehicleId: 'veh-1',
            assignedAt: new Date(),
            vehicle: mockVehicle1,
          },
        ],
      });

      const result = await service.create(
        {
          clientId: 'client-1',
          type: DossierType.SHIPPING_ONLY,
          vehicleId: 'veh-1',
        },
        'user-1',
      );

      expect(result).toBeDefined();
      expect(result.type).toBe(DossierType.SHIPPING_ONLY);
      expect(prisma.dossier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: DossierType.SHIPPING_ONLY,
          }),
        }),
      );
    });

    it('4. should default to VEHICLE_SALE_CIF when type is omitted for backward compatibility', async () => {
      prisma.client.findUnique.mockResolvedValue(mockClient);
      prisma.dossier.create.mockResolvedValue({
        id: 'dos-default',
        reference: 'CA-2026-0004',
        type: DossierType.VEHICLE_SALE_CIF,
        clientId: 'client-1',
        status: 'prospection',
        dossierVehicles: [],
      });

      const result = await service.create(
        {
          clientId: 'client-1',
        },
        'user-1',
      );

      expect(result).toBeDefined();
      expect(prisma.dossier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: DossierType.VEHICLE_SALE_CIF,
          }),
        }),
      );
    });

    it('5. should create multi-vehicle dossier with specified type', async () => {
      prisma.client.findUnique.mockResolvedValue(mockClient);
      prisma.vehicle.findUnique
        .mockResolvedValueOnce(mockVehicle1)
        .mockResolvedValueOnce(mockVehicle2);

      prisma.dossier.create.mockResolvedValue({
        id: 'dos-multi',
        reference: 'CA-2026-0005',
        type: DossierType.VEHICLE_SALE_DDP,
        clientId: 'client-1',
        status: 'prospection',
        dossierVehicles: [
          {
            id: 'dv-1',
            dossierId: 'dos-multi',
            vehicleId: 'veh-1',
            assignedAt: new Date(),
            vehicle: mockVehicle1,
          },
          {
            id: 'dv-2',
            dossierId: 'dos-multi',
            vehicleId: 'veh-2',
            assignedAt: new Date(),
            vehicle: mockVehicle2,
          },
        ],
      });

      const result = await service.create(
        {
          clientId: 'client-1',
          type: DossierType.VEHICLE_SALE_DDP,
          vehicleIds: ['veh-1', 'veh-2'],
        },
        'user-1',
      );

      expect(result).toBeDefined();
      expect(result.type).toBe(DossierType.VEHICLE_SALE_DDP);
      expect(result.vehicles).toHaveLength(2);
      expect(prisma.vehicle.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['veh-1', 'veh-2'] } },
        data: { status: 'reserved' },
      });
    });
  });

  describe('findAll with type filter', () => {
    it('6. should filter dossiers by type', async () => {
      prisma.dossier.findMany.mockResolvedValue([
        {
          id: 'dos-1',
          reference: 'CA-2026-0001',
          type: DossierType.SHIPPING_ONLY,
          dossierVehicles: [],
        },
      ]);
      prisma.dossier.count.mockResolvedValue(1);

      const result = await service.findAll(1, 10, {
        type: DossierType.SHIPPING_ONLY,
      });

      expect(result.items).toHaveLength(1);
      expect(prisma.dossier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: DossierType.SHIPPING_ONLY,
          }),
        }),
      );
    });
  });

  describe('getStatistics with type breakdown', () => {
    it('7. should return statistics with byType breakdown', async () => {
      // 9 status counts + 3 type counts = 12 counts in transaction
      prisma.$transaction.mockResolvedValue([
        10, // total
        3,  // prospection
        2,  // contrat_signe
        1,  // recherche_vehicule
        1,  // achat
        1,  // shipping
        0,  // douane
        1,  // livraison
        1,  // cloture
        5,  // VEHICLE_SALE_CIF
        3,  // VEHICLE_SALE_DDP
        2,  // SHIPPING_ONLY
      ]);

      const stats = await service.getStatistics();

      expect(stats.total).toBe(10);
      expect(stats.byType).toEqual({
        VEHICLE_SALE_CIF: 5,
        VEHICLE_SALE_DDP: 3,
        SHIPPING_ONLY: 2,
      });
    });
  });

  describe('Phase 1 regression tests (vehicle assignment)', () => {
    it('8. should add a vehicle to an existing Dossier', async () => {
      const mockDossier = {
        id: 'dos-1',
        reference: 'CA-2026-0001',
        type: DossierType.VEHICLE_SALE_CIF,
        status: 'prospection',
        dossierVehicles: [
          { vehicleId: 'veh-1', vehicle: mockVehicle1, assignedAt: new Date() },
        ],
      };

      prisma.dossier.findUnique
        .mockResolvedValueOnce(mockDossier)
        .mockResolvedValueOnce({
          ...mockDossier,
          dossierVehicles: [
            { vehicleId: 'veh-1', vehicle: mockVehicle1, assignedAt: new Date() },
            { vehicleId: 'veh-2', vehicle: mockVehicle2, assignedAt: new Date() },
          ],
        });

      prisma.vehicle.findUnique.mockResolvedValue(mockVehicle2);

      const result = await service.addVehicle('dos-1', 'veh-2', 'user-1');

      expect(prisma.dossierVehicle.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dossierId: 'dos-1',
          vehicleId: 'veh-2',
        }),
      });
      expect(result.vehicles).toHaveLength(2);
    });

    it('9. should prevent duplicate vehicle assignment to the same Dossier', async () => {
      const mockDossier = {
        id: 'dos-1',
        reference: 'CA-2026-0001',
        status: 'prospection',
        dossierVehicles: [{ vehicleId: 'veh-1' }],
      };

      prisma.dossier.findUnique.mockResolvedValue(mockDossier);
      prisma.vehicle.findUnique.mockResolvedValue(mockVehicle1);

      await expect(
        service.addVehicle('dos-1', 'veh-1', 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('10. should remove a vehicle and revert status to available', async () => {
      const mockDossier = {
        id: 'dos-1',
        reference: 'CA-2026-0001',
        status: 'prospection',
        dossierVehicles: [
          { vehicleId: 'veh-1', vehicle: mockVehicle1, assignedAt: new Date() },
          { vehicleId: 'veh-2', vehicle: mockVehicle2, assignedAt: new Date() },
        ],
      };

      prisma.dossier.findUnique
        .mockResolvedValueOnce(mockDossier)
        .mockResolvedValueOnce({
          ...mockDossier,
          dossierVehicles: [
            { vehicleId: 'veh-2', vehicle: mockVehicle2, assignedAt: new Date() },
          ],
        });

      prisma.vehicle.findUnique.mockResolvedValue(mockVehicle1);

      const result = await service.removeVehicle('dos-1', 'veh-1', 'user-1');

      expect(prisma.dossierVehicle.delete).toHaveBeenCalledWith({
        where: {
          dossierId_vehicleId: {
            dossierId: 'dos-1',
            vehicleId: 'veh-1',
          },
        },
      });
      expect(result.vehicles).toHaveLength(1);
    });
  });
});
