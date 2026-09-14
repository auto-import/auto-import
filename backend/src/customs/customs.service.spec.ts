import { ShipmentsService } from '../shipments/shipments.service';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CustomsService } from './customs.service';
import { Prisma } from '@prisma/client';
import { CostsService } from '../finance/costs.service';

describe('CustomsService', () => {
  let service: CustomsService;
  let prisma: PrismaService;

  const mockPrisma = {
    partner: {
      findFirst: jest.fn(),
    },
    customsFile: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const mockCostsService = {
    recordCustomsActual: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ShipmentsService, useValue: { syncFromDossier: jest.fn() } },
        CustomsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CostsService, useValue: mockCostsService },
      ],
    }).compile();

    service = module.get<CustomsService>(CustomsService);
  });

  it('should transition customs file to cleared and record audit history', async () => {
    mockPrisma.customsFile.findFirst.mockResolvedValue({
      id: 'cust-1',
      organizationId: 'org-1',
      status: 'open',
      clearedAt: null,
      releasedAt: null,
      closedAt: null,
    });

    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        customsStatusHistory: {
          create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
        },
        customsFile: {
          update: jest.fn().mockResolvedValue({
            id: 'cust-1',
            status: 'cleared',
            clearedAt: new Date(),
          }),
        },
      };
      return callback(tx);
    });

    const result = await service.transition('cust-1', 'org-1', 'user-1', {
      status: 'cleared',
      comment: 'Customs duty paid and clearance granted',
    });

    expect(result.status).toBe('cleared');
    expect(mockCostsService.recordCustomsActual).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'user-1',
      expect.objectContaining({ id: 'cust-1', status: 'cleared' }),
    );
  });
});
