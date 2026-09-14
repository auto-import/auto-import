import { Prisma } from '@prisma/client';
import { CostsService } from './costs.service';

describe('CostsService financial snapshots', () => {
  it('posts a released customs amount once in DZD with rate 1', async () => {
    const service = new CostsService({} as any, {} as any);
    const createdCost = { id: 'cost-customs-1' };
    const createdTransaction = { id: 'tx-customs-1' };
    const tx = {
      financeTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdTransaction),
      },
      cost: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdCost),
      },
    } as any;

    const result = await service.recordCustomsActual(tx, 'org-1', 'user-1', {
      id: 'customs-1',
      reference: 'CUST-2026-00001',
      dossierId: 'dossier-1',
      shipmentId: 'shipment-1',
      customsAmount: new Prisma.Decimal('500000'),
      releasedAt: new Date('2026-09-06T12:00:00Z'),
    });

    expect(result).toBe(createdTransaction);
    expect(tx.cost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'CUSTOMS',
        currency: 'DZD',
        exchangeRateSnapshot: new Prisma.Decimal(1),
        amountInBaseCurrency: new Prisma.Decimal('500000'),
        dossierId: 'dossier-1',
      }),
    });
    expect(tx.financeTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceModule: 'CUSTOMS_ACTUAL',
        sourceRecordId: 'customs-1',
        exchangeRateSnapshot: new Prisma.Decimal(1),
        amountDzd: new Prisma.Decimal('500000'),
      }),
    });
  });

  it('does not duplicate an already posted customs source', async () => {
    const service = new CostsService({} as any, {} as any);
    const existing = { id: 'existing-transaction' };
    const tx = {
      financeTransaction: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
      cost: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    } as any;

    await expect(
      service.recordCustomsActual(tx, 'org-1', 'user-1', {
        id: 'customs-1',
        reference: 'CUST-2026-00001',
        dossierId: 'dossier-1',
        customsAmount: 500000,
      }),
    ).resolves.toBe(existing);
    expect(tx.cost.create).not.toHaveBeenCalled();
    expect(tx.financeTransaction.create).not.toHaveBeenCalled();
  });
});
