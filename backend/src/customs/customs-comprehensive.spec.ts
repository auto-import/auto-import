import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CustomsService } from './customs.service';

describe('Phase 2 Customs Comprehensive Tests', () => {
  let customsService: CustomsService;

  const mockPrisma: any = {
    customsFile: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    customsStatusHistory: {
      create: jest.fn(),
    },
    partner: {
      findFirst: jest.fn(),
    },
    dossier: {
      findFirst: jest.fn(),
    },
    commerceSequence: {
      upsert: jest.fn().mockResolvedValue({ value: 10 }),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    customsService = new CustomsService(mockPrisma);
  });

  it('should compute customsAmount correctly as sum of duty, tax and fees', async () => {
    mockPrisma.partner.findFirst.mockResolvedValue({ id: 'broker-1' });
    mockPrisma.customsFile.create.mockImplementation((args: any) => ({
      id: 'cust-1',
      ...args.data,
    }));

    const file = await customsService.create('org-1', 'user-1', {
      brokerPartnerId: 'broker-1',
      declarationNumber: 'DUM-2026-99',
      customsValue: 5000000,
      dutyAmount: 750000,
      taxAmount: 950000,
      feesAmount: 50000,
    });

    expect(file.customsAmount.toString()).toBe('1750000');
  });

  it('should transition to cleared and stamp clearedAt timestamp', async () => {
    mockPrisma.customsFile.findFirst.mockResolvedValue({
      id: 'cust-1',
      organizationId: 'org-1',
      status: 'inInspection',
      clearedAt: null,
      releasedAt: null,
      closedAt: null,
    });

    mockPrisma.customsFile.update.mockResolvedValue({
      id: 'cust-1',
      status: 'cleared',
      clearedAt: new Date(),
    });

    const cleared = await customsService.transition(
      'cust-1',
      'org-1',
      'user-1',
      {
        status: 'cleared',
        comment: 'Inspection complete and taxes cleared',
      },
    );

    expect(cleared.status).toBe('cleared');
    expect(mockPrisma.customsStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromStatus: 'inInspection',
        toStatus: 'cleared',
      }),
    });
  });

  it('should reject cross-tenant customs file access', async () => {
    mockPrisma.customsFile.findFirst.mockResolvedValue(null);

    await expect(
      customsService.findOne('cust-other-tenant', 'org-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
