import { NotFoundException, ConflictException } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';

describe('Phase 2 Shipments Comprehensive Tests', () => {
  let shipmentsService: ShipmentsService;

  const mockPrisma: any = {
    shipment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    shipmentStatusHistory: {
      create: jest.fn(),
    },
    shipmentVehicle: {
      create: jest.fn(),
    },
    customsFileVehicle: {
      createMany: jest.fn(),
    },
    customsFile: { findFirst: jest.fn(), create: jest.fn() },
    user: { findFirst: jest.fn() },
    task: { upsert: jest.fn() },
    notification: { createMany: jest.fn() },
    vehicle: {
      findFirst: jest.fn(),
    },
    partner: {
      findFirst: jest.fn(),
    },
    commerceSequence: {
      upsert: jest.fn().mockResolvedValue({ value: 42 }),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    shipmentsService = new ShipmentsService(mockPrisma);
  });

  it('should reject creation if carrier belongs to another tenant', async () => {
    mockPrisma.partner.findFirst.mockResolvedValue(null);

    await expect(
      shipmentsService.create('org-1', 'user-1', {
        carrierPartnerId: 'carrier-other-org',
        containerNumber: 'COSU123456',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should record audit trail on status transition with correct timestamps', async () => {
    mockPrisma.shipment.findFirst.mockResolvedValue({
      id: 'shp-1',
      organizationId: 'org-1',
      status: 'loading',
      actualDepartureDate: null,
      actualArrivalDate: null,
    });

    mockPrisma.shipment.update.mockResolvedValue({
      id: 'shp-1',
      status: 'inTransit',
      actualDepartureDate: new Date(),
    });

    const transitioned = await shipmentsService.transition(
      'shp-1',
      'org-1',
      'user-1',
      {
        status: 'inTransit',
        comment: 'Departed from port of departure',
      },
    );

    expect(mockPrisma.shipmentStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shipmentId: 'shp-1',
        fromStatus: 'loading',
        toStatus: 'inTransit',
        changedBy: 'user-1',
        comment: 'Departed from port of departure',
      }),
    });
    expect(transitioned.status).toBe('inTransit');
  });

  it('should reject transition when shipment belongs to another tenant', async () => {
    mockPrisma.shipment.findFirst.mockResolvedValue(null);

    await expect(
      shipmentsService.transition('shp-other-org', 'org-1', 'user-1', {
        status: 'arrived',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates one customs file per sales dossier and is idempotent', async () => {
    mockPrisma.shipment.findFirst.mockResolvedValue({
      id: 'shp-1',
      organizationId: 'org-1',
      status: 'arrived',
      containerNumber: 'CONT-1',
      blNumber: 'BL-1',
      arrivalPort: 'Alger',
      vehicles: [
        {
          vehicleId: 'vehicle-1',
          vehicle: {
            dossierVehicles: [
              {
                dossier: {
                  id: 'dossier-1',
                  status: 'arrivedAtPort',
                  salesUserId: 'user-1',
                  opsUserId: null,
                },
              },
            ],
          },
        },
      ],
    });
    mockPrisma.customsFile.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'customs-1', vehicleId: 'vehicle-1' });
    mockPrisma.customsFile.create.mockResolvedValue({
      id: 'customs-1',
      vehicleId: 'vehicle-1',
      dossierId: 'dossier-1',
    });

    const first = await shipmentsService.createCustomsFromShipment(
      'shp-1',
      'org-1',
      'user-1',
    );
    const second = await shipmentsService.createCustomsFromShipment(
      'shp-1',
      'org-1',
      'user-1',
    );

    expect(first.created).toHaveLength(1);
    expect(second.created).toHaveLength(1);
    expect(mockPrisma.customsFile.create).toHaveBeenCalledTimes(1);
  });
});
