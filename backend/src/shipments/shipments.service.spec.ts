import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ShipmentsService } from './shipments.service';

describe('ShipmentsService', () => {
  let service: ShipmentsService;
  let prisma: PrismaService;

  const mockPrisma = {
    partner: {
      findFirst: jest.fn(),
    },
    shipment: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShipmentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ShipmentsService>(ShipmentsService);
  });

  it('should transition shipment status and record audit history', async () => {
    mockPrisma.shipment.findFirst.mockResolvedValue({
      id: 'shp-1',
      organizationId: 'org-1',
      status: 'pending',
      actualDepartureDate: null,
      actualArrivalDate: null,
    });

    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        shipmentStatusHistory: {
          create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
        },
        shipment: {
          update: jest.fn().mockResolvedValue({
            id: 'shp-1',
            status: 'inTransit',
            actualDepartureDate: new Date(),
          }),
        },
      };
      return callback(tx);
    });

    const result = await service.transition('shp-1', 'org-1', 'user-1', {
      status: 'inTransit',
      comment: 'Vessel departed',
    });

    expect(result.status).toBe('inTransit');
  });
});
