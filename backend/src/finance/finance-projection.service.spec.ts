import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinanceProjectionService } from './finance-projection.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FinanceProjectionService', () => {
  const organizationId = 'org-1';
  const userId = 'user-1';
  let tx: {
    exchangeRate: { findFirst: jest.Mock };
    financeTransaction: { upsert: jest.Mock };
  };
  let service: FinanceProjectionService;

  beforeEach(() => {
    tx = {
      exchangeRate: { findFirst: jest.fn() },
      financeTransaction: {
        upsert: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
      },
    };
    service = new FinanceProjectionService({} as PrismaService);
  });

  it('projects a DZD customer payment once with a fixed rate snapshot', async () => {
    await service.projectCustomerPayment(
      tx as unknown as Prisma.TransactionClient,
      organizationId,
      userId,
      {
        id: 'payment-1',
        amount: new Prisma.Decimal(12_500),
        currency: 'dzd',
        clientId: 'client-1',
        dossierId: 'dossier-1',
      },
    );

    expect(tx.exchangeRate.findFirst).not.toHaveBeenCalled();
    expect(tx.financeTransaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_sourceModule_sourceRecordId: {
            organizationId,
            sourceModule: 'CUSTOMER_PAYMENT',
            sourceRecordId: 'payment-1',
          },
        },
        create: expect.objectContaining({
          direction: 'CREDIT',
          exchangeRateSnapshot: new Prisma.Decimal(1),
          amountDzd: new Prisma.Decimal(12_500),
        }),
        update: {},
      }),
    );
  });

  it('projects a supplier payment with the historical DZD rate and dossier link', async () => {
    tx.exchangeRate.findFirst.mockResolvedValue({
      id: 'rate-1',
      baseCurrency: 'DZD',
      quoteCurrency: 'USD',
      rate: new Prisma.Decimal(140),
    });

    await service.projectSupplierPayment(
      tx as unknown as Prisma.TransactionClient,
      organizationId,
      userId,
      {
        id: 'supplier-payment-1',
        amount: new Prisma.Decimal(1000),
        currency: 'USD',
        supplierId: 'supplier-1',
        purchaseId: 'purchase-1',
        purchase: { dossierId: 'dossier-1' },
      },
    );

    expect(tx.financeTransaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          direction: 'DEBIT',
          amountDzd: new Prisma.Decimal(140_000),
          exchangeRateSnapshot: new Prisma.Decimal(140),
          dossierId: 'dossier-1',
          supplierId: 'supplier-1',
          purchaseId: 'purchase-1',
        }),
      }),
    );
  });

  it('rejects foreign-currency validation when no eligible historical rate exists', async () => {
    tx.exchangeRate.findFirst.mockResolvedValue(null);

    await expect(
      service.projectCustomerPayment(
        tx as unknown as Prisma.TransactionClient,
        organizationId,
        userId,
        {
          id: 'payment-2',
          amount: new Prisma.Decimal(100),
          currency: 'USD',
          clientId: 'client-1',
          exchangeRateId: 'rate-from-another-tenant',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.financeTransaction.upsert).not.toHaveBeenCalled();
  });
});
