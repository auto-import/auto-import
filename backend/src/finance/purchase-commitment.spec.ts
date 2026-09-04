import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CostsService } from './costs.service';

describe('CostsService purchase commitments', () => {
  const purchase = {
    id: 'purchase-1',
    purchaseNumber: 'PUR-2026-00001',
    purchasePrice: new Prisma.Decimal(12000),
    currency: 'USD',
    supplierId: 'supplier-1',
    dossierId: 'dossier-1',
    purchaseDate: new Date('2026-09-04T00:00:00.000Z'),
  };

  function setup() {
    const tx = {
      financeTransaction: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
      },
      exchangeRate: { findFirst: jest.fn() },
      cost: { create: jest.fn().mockResolvedValue({ id: 'cost-1' }) },
    };
    const service = new CostsService({} as never, {} as never);
    return { service, tx };
  }

  it('posts the supplier purchase as one validated debit cost', async () => {
    const { service, tx } = setup();
    tx.financeTransaction.findUnique.mockResolvedValue(null);
    tx.exchangeRate.findFirst.mockResolvedValueOnce({
      rate: new Prisma.Decimal('135.5'),
    });

    await service.recordPurchaseCommitment(
      tx as never,
      'org-1',
      'user-1',
      purchase,
    );

    expect(tx.cost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'PURCHASE',
        costScope: 'DIRECT',
        amount: new Prisma.Decimal(12000),
        amountInBaseCurrency: new Prisma.Decimal(1626000),
        purchaseId: 'purchase-1',
        status: 'POSTED',
      }),
    });
    expect(tx.financeTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'DIRECT_COST_PURCHASE',
        direction: 'DEBIT',
        sourceModule: 'PURCHASE_COMMITMENT',
        sourceRecordId: 'purchase-1',
        originalAmount: new Prisma.Decimal(12000),
        amountDzd: new Prisma.Decimal(1626000),
        status: 'VALIDATED',
      }),
    });
  });

  it('is idempotent when the purchase commitment already exists', async () => {
    const { service, tx } = setup();
    tx.financeTransaction.findUnique.mockResolvedValue({ id: 'ledger-1' });

    await expect(
      service.recordPurchaseCommitment(
        tx as never,
        'org-1',
        'user-1',
        purchase,
      ),
    ).resolves.toEqual({ id: 'ledger-1' });
    expect(tx.cost.create).not.toHaveBeenCalled();
    expect(tx.financeTransaction.create).not.toHaveBeenCalled();
  });

  it('rolls the caller transaction back when no historical exchange rate exists', async () => {
    const { service, tx } = setup();
    tx.financeTransaction.findUnique.mockResolvedValue(null);
    tx.exchangeRate.findFirst.mockResolvedValue(null);

    await expect(
      service.recordPurchaseCommitment(
        tx as never,
        'org-1',
        'user-1',
        purchase,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.cost.create).not.toHaveBeenCalled();
    expect(tx.financeTransaction.create).not.toHaveBeenCalled();
  });
});
