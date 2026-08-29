import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContractsV2Service } from './contracts-v2.service';
import { FinanceLedgerService } from './finance-ledger.service';

describe('ERP V2 contracts and central finance', () => {
  let prisma: any;

  beforeEach(() => {
    prisma = {
      dossier: { findFirst: jest.fn() },
      gedDocument: { findFirst: jest.fn() },
      contract: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      commerceSequence: { upsert: jest.fn().mockResolvedValue({ value: 1 }) },
      auditLog: { create: jest.fn() },
      payment: { findUnique: jest.fn(), create: jest.fn() },
      financeTransaction: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
      },
      treasuryAccount: { findMany: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: any) => unknown) =>
        callback(prisma),
      ),
    };
  });

  it('rejects a contract whose schedule is not equal to its total', async () => {
    const service = new ContractsV2Service(prisma);
    await expect(
      service.create('org-1', 'user-1', {
        clientId: '00000000-0000-4000-8000-000000000001',
        dossierId: '00000000-0000-4000-8000-000000000002',
        totalAmount: 1000,
        requiredDeposit: 300,
        currency: 'DZD',
        schedule: [{ amount: 999 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('derives paid and remaining balances from confirmed collections', async () => {
    const service = new ContractsV2Service(prisma);
    prisma.contract.findFirst.mockResolvedValue({
      id: 'contract-1',
      totalAmount: new Prisma.Decimal(1000),
      requiredDeposit: new Prisma.Decimal(300),
      payments: [{ amount: new Prisma.Decimal(300) }],
      schedule: [],
      client: {},
      dossier: {},
    });
    await expect(service.findOne('contract-1', 'org-1')).resolves.toMatchObject(
      {
        totalPaid: '300',
        remainingBalance: '700',
        collectionStatus: 'DEPOSIT',
      },
    );
  });

  it('creates one opposite immutable reversal and returns it idempotently', async () => {
    const service = new FinanceLedgerService(prisma);
    const original = {
      id: 'tx-1',
      organizationId: 'org-1',
      status: 'VALIDATED',
      type: 'CUSTOMER_COLLECTION',
      direction: 'CREDIT',
      originalAmount: new Prisma.Decimal(100),
      currency: 'DZD',
      exchangeRateSnapshot: new Prisma.Decimal(1),
      amountDzd: new Prisma.Decimal(100),
      dossierId: null,
      clientId: 'client-1',
      supplierId: null,
      treasuryAccountId: null,
      paymentMode: 'CASH',
      reference: null,
    };
    prisma.financeTransaction.findFirst
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(null);
    prisma.financeTransaction.create.mockResolvedValue({
      id: 'tx-reversal',
      direction: 'DEBIT',
    });
    await expect(
      service.reverse('tx-1', 'org-1', 'user-1', { reason: 'Correction' }),
    ).resolves.toMatchObject({ direction: 'DEBIT' });
    expect(prisma.financeTransaction.create).toHaveBeenCalledTimes(1);
  });

  it('rejects reversing a non-validated ledger entry', async () => {
    const service = new FinanceLedgerService(prisma);
    prisma.financeTransaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      status: 'PENDING',
    });
    await expect(
      service.reverse('tx-1', 'org-1', 'user-1', { reason: 'Correction' }),
    ).rejects.toThrow(ConflictException);
  });
});
