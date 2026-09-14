import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinanceProjectionService } from './finance-projection.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FinanceProjectionService', () => {
  it.each([
    ['USD', '10000', '250', '2500000'],
    ['CNY', '10000', '35', '350000'],
    ['USD', '0', '250', '0'],
    ['CNY', '0', '35', '0'],
    ['CNY', '1234.56', '35.12345678', '43362.01'],
    ['USD', '39999999.99', '250', '9999999997.5'],
  ])(
    'snapshots %s %s using Finance rate %s',
    async (currency, amount, rate, equivalent) => {
      const localTx = {
        treasuryAccount: {
          findFirst: jest.fn().mockImplementation(({ where }) => ({
            id: where.id,
            currency: where.currency,
            officeId: 'office',
            office: {
              id: 'office',
              organizationId: where.organizationId,
              status: 'active',
            },
          })),
        },
        exchangeRate: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 'r1', rate: new Prisma.Decimal(rate) }),
        },
        financeTransaction: { upsert: jest.fn() },
      };
      const projection = new FinanceProjectionService({} as PrismaService);
      await projection.projectCustomerPayment(
        localTx as unknown as Prisma.TransactionClient,
        'org',
        'user',
        {
          id: 'p1',
          amount: new Prisma.Decimal(amount),
          currency,
          clientId: 'c1',
        },
        { treasuryAccountId: 'account' },
      );
      expect(localTx.financeTransaction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            originalAmount: new Prisma.Decimal(amount),
            currency,
            exchangeRateSnapshot: new Prisma.Decimal(rate),
            amountDzd: new Prisma.Decimal(equivalent),
          }),
          update: {},
        }),
      );
      expect(localTx.exchangeRate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            baseCurrency: currency,
            quoteCurrency: 'DZD',
            isActive: true,
          }),
        }),
      );
    },
  );
  const organizationId = 'org-1';
  const userId = 'user-1';
  let tx: {
    treasuryAccount: { findFirst: jest.Mock };
    exchangeRate: { findFirst: jest.Mock };
    financeTransaction: { upsert: jest.Mock };
  };
  let service: FinanceProjectionService;

  beforeEach(() => {
    tx = {
      treasuryAccount: {
        findFirst: jest.fn().mockImplementation(({ where }) => ({
          id: where.id,
          currency: where.currency,
          officeId: 'office',
          office: {
            id: 'office',
            organizationId: where.organizationId,
            status: 'active',
          },
        })),
      },
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
      { treasuryAccountId: 'account' },
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
      baseCurrency: 'USD',
      quoteCurrency: 'DZD',
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
      { treasuryAccountId: 'account' },
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
        { treasuryAccountId: 'account' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.financeTransaction.upsert).not.toHaveBeenCalled();
  });
});
