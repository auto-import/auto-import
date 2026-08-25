import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentPlansService } from './payment-plans.service';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { SupplierPaymentsService } from './supplier-payments.service';
import { ExchangeRatesService } from './exchange-rates.service';
import { CostsService } from './costs.service';
import { FinanceService } from './finance.service';
import { ReconciliationService } from './reconciliation.service';

describe('Phase 2 Finance Comprehensive Tests', () => {
  let paymentPlansService: PaymentPlansService;
  let invoicesService: InvoicesService;
  let paymentsService: PaymentsService;
  let supplierPaymentsService: SupplierPaymentsService;
  let exchangeRatesService: ExchangeRatesService;
  let costsService: CostsService;
  let financeService: FinanceService;
  let reconciliationService: ReconciliationService;

  let createdInstallments: any[] = [];

  const mockPrisma: any = {
    paymentPlan: {
      findFirst: jest.fn(),
      findUnique: jest.fn().mockImplementation((args: any) => ({
        id: args.where.id,
        totalAmount: new Prisma.Decimal(1000.01),
        currency: 'DZD',
        strategy: 'THIRTY_SEVENTY',
        installments: createdInstallments,
      })),
      create: jest.fn().mockImplementation((args: any) => ({
        id: 'plan-1',
        ...args.data,
      })),
      update: jest.fn(),
    },
    paymentInstallment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn().mockImplementation((args: any) => {
        createdInstallments = [args.data];
        return args.data;
      }),
      createMany: jest.fn().mockImplementation((args: any) => {
        createdInstallments = args.data;
        return { count: args.data.length };
      }),
      update: jest.fn(),
    },
    invoice: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    invoiceItem: {
      create: jest.fn(),
    },
    payment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    paymentAllocation: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    customerDeposit: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    supplierPayment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    exchangeRate: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    cost: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    purchase: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    client: {
      findFirst: jest.fn(),
    },
    dossier: {
      findFirst: jest.fn(),
    },
    commerceSequence: {
      upsert: jest.fn().mockResolvedValue({ value: 1 }),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createdInstallments = [];
    reconciliationService = new ReconciliationService(mockPrisma);
    paymentPlansService = new PaymentPlansService(mockPrisma);
    invoicesService = new InvoicesService(mockPrisma, reconciliationService);
    paymentsService = new PaymentsService(mockPrisma, reconciliationService);
    supplierPaymentsService = new SupplierPaymentsService(mockPrisma);
    exchangeRatesService = new ExchangeRatesService(mockPrisma);
    costsService = new CostsService(mockPrisma, exchangeRatesService);
    financeService = new FinanceService(
      mockPrisma,
      reconciliationService,
      exchangeRatesService,
    );
  });

  describe('1. Decimal-Safe Monetary Calculations & 30/70 Rounding', () => {
    it('should split 30/70 where installment 2 strictly equals total minus installment 1 (odd total 1000.01)', async () => {
      mockPrisma.client.findFirst.mockResolvedValue({ id: 'cli-1' });

      const plan = await paymentPlansService.create('org-1', {
        clientId: 'cli-1',
        totalAmount: 1000.01,
        currency: 'DZD',
        strategy: 'THIRTY_SEVENTY',
      });

      expect(plan.installments.length).toBe(2);
      const inst1 = plan.installments[0];
      const inst2 = plan.installments[1];

      // 1000.01 * 0.30 = 300.003 -> 300.00
      expect(inst1.amount.toString()).toBe('300');
      // 1000.01 - 300.00 = 700.01
      expect(inst2.amount.toString()).toBe('700.01');
      // Sum matches exactly
      expect(inst1.amount.add(inst2.amount).toString()).toBe('1000.01');
    });

    it('should create single 100% installment for FULL_UPFRONT strategy', async () => {
      mockPrisma.client.findFirst.mockResolvedValue({ id: 'cli-1' });

      const plan = await paymentPlansService.create('org-1', {
        clientId: 'cli-1',
        totalAmount: 5000000,
        currency: 'DZD',
        strategy: 'FULL_UPFRONT',
      });

      expect(plan.installments.length).toBe(1);
      expect(plan.installments[0].percentage.toString()).toBe('100');
      expect(plan.installments[0].amount.toString()).toBe('5000000');
    });
  });

  describe('2. Invoice Issue Immutability & Voiding', () => {
    it('should reject editing or issuing an already issued invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        status: 'ISSUED',
        organizationId: 'org-1',
      });

      await expect(invoicesService.issue('inv-1', 'org-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should void invoice and update status with reason', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        status: 'ISSUED',
        paidAmount: new Prisma.Decimal(0),
        organizationId: 'org-1',
        items: [],
        allocations: [],
      });
      mockPrisma.invoice.update.mockResolvedValue({
        id: 'inv-1',
        status: 'VOIDED',
        voidReason: 'Client cancelled order',
        items: [],
        allocations: [],
      });

      const voided = await invoicesService.void('inv-1', 'org-1', {
        reason: 'Client cancelled order',
      });
      expect(voided.status).toBe('VOIDED');
    });
  });

  describe('3. Payment Allocations, Overpayment to CustomerDeposit & Reversal', () => {
    it('should allocate payment to invoice and convert excess into CustomerDeposit', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        status: 'PENDING',
        amount: new Prisma.Decimal(500000),
        clientId: 'cli-1',
        dossierId: 'dos-1',
        invoiceId: 'inv-1',
        organizationId: 'org-1',
        allocations: [],
      });

      mockPrisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        status: 'CONFIRMED',
        amount: new Prisma.Decimal(500000),
        allocatedAmount: new Prisma.Decimal(300000),
        unallocatedAmount: new Prisma.Decimal(200000),
        allocations: [],
      });

      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        total: new Prisma.Decimal(300000),
        paidAmount: new Prisma.Decimal(0),
        status: 'ISSUED',
        organizationId: 'org-1',
      });

      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        total: new Prisma.Decimal(300000),
        paidAmount: new Prisma.Decimal(300000),
        status: 'PAID',
        allocations: [],
      });

      mockPrisma.payment.update.mockResolvedValue({
        id: 'pay-1',
        status: 'CONFIRMED',
        amount: new Prisma.Decimal(500000),
        allocatedAmount: new Prisma.Decimal(300000),
        unallocatedAmount: new Prisma.Decimal(200000),
      });

      const result = await paymentsService.confirm('pay-1', 'org-1');

      // CustomerDeposit created for 200,000 excess
      expect(mockPrisma.customerDeposit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: new Prisma.Decimal(200000),
          }),
        }),
      );
    });

    it('should unwind allocations when payment is reversed', async () => {
      mockPrisma.payment.findFirst
        .mockResolvedValueOnce({
          id: 'pay-1',
          status: 'CONFIRMED',
          amount: new Prisma.Decimal(300000),
          organizationId: 'org-1',
          allocations: [{ id: 'alloc-1', invoiceId: 'inv-1', installmentId: null }],
        })
        .mockResolvedValueOnce({
          id: 'pay-1',
          status: 'REVERSED',
          amount: new Prisma.Decimal(300000),
          organizationId: 'org-1',
          allocations: [],
        });

      mockPrisma.payment.update.mockResolvedValue({
        id: 'pay-1',
        status: 'REVERSED',
        reversalReason: 'Fraudulent transaction',
      });

      const reversed = await paymentsService.reverse('pay-1', 'org-1', {
        reason: 'Fraudulent transaction',
      });

      expect(mockPrisma.paymentAllocation.updateMany).toHaveBeenCalled();
      expect(reversed.status).toBe('REVERSED');
    });
  });

  describe('4. Historical Exchange Rates Selection & Missing Rate Rejection', () => {
    it('should select exchange rate effective at or immediately before transaction time', async () => {
      const targetDate = new Date('2026-06-15T12:00:00Z');
      mockPrisma.exchangeRate.findFirst.mockResolvedValue({
        id: 'rate-1',
        baseCurrency: 'DZD',
        quoteCurrency: 'USD',
        rate: new Prisma.Decimal(135.5),
        effectiveAt: new Date('2026-06-01T00:00:00Z'),
      });

      const rate = await exchangeRatesService.findEffectiveRate(
        'org-1',
        'DZD',
        'USD',
        targetDate,
      );
      expect(rate.toString()).toBe('135.5');
    });

    it('should calculate inverse exchange rate correctly when base and quote are swapped', async () => {
      mockPrisma.exchangeRate.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'rate-1',
          baseCurrency: 'DZD',
          quoteCurrency: 'USD',
          rate: new Prisma.Decimal(135.0),
          effectiveAt: new Date('2026-01-01T00:00:00Z'),
        });

      const rate = await exchangeRatesService.findEffectiveRate('org-1', 'USD', 'DZD');
      // 1 / 135.0 = 0.0074074074...
      expect(Number(rate.toString())).toBeCloseTo(1 / 135.0, 6);
    });

    it('should return 1 for identical base and quote currencies', async () => {
      const same = await exchangeRatesService.findEffectiveRate('org-1', 'DZD', 'DZD');
      expect(same.toString()).toBe('1');
    });
  });

  describe('5. Idempotency & Tenant Isolation', () => {
    it('should reject payment creation when idempotencyKey already exists in organization with different amount', async () => {
      mockPrisma.client.findFirst.mockResolvedValue({ id: 'cli-1' });
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: 'existing-pay',
        amount: new Prisma.Decimal(40000),
        idempotencyKey: 'idemp-12345',
        organizationId: 'org-1',
      });

      await expect(
        paymentsService.record('org-1', 'user-1', {
          clientId: 'cli-1',
          amount: 50000,
          currency: 'DZD',
          idempotencyKey: 'idemp-12345',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject cross-tenant invoice access', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        invoicesService.findOne('inv-other-tenant', 'org-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
