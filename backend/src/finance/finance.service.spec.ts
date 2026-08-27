import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from './finance.service';
import { ExchangeRatesService } from './exchange-rates.service';
import { Prisma } from '@prisma/client';

describe('FinanceService', () => {
  let service: FinanceService;

  const mockPrisma = {
    dossier: {
      findFirst: jest.fn(),
    },
    invoice: {
      findMany: jest.fn(),
    },
    payment: {
      findMany: jest.fn(),
    },
    cost: {
      findMany: jest.fn(),
    },
  };

  const mockExchangeRates = {
    findEffectiveRate: jest.fn().mockResolvedValue(new Prisma.Decimal(1)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ExchangeRatesService, useValue: mockExchangeRates },
      ],
    }).compile();

    service = module.get<FinanceService>(FinanceService);
  });

  it('should calculate 30/70 gate status and gross margin correctly', async () => {
    mockPrisma.dossier.findFirst.mockResolvedValue({
      id: 'dossier-1',
      reference: 'DOS-2026-00001',
      paymentPlans: [
        {
          id: 'plan-1',
          strategy: 'THIRTY_SEVENTY',
          totalAmount: new Prisma.Decimal(1000000),
          currency: 'DZD',
          status: 'active',
          installments: [
            {
              id: 'inst-1',
              installmentNumber: 1,
              amount: new Prisma.Decimal(300000),
              paidAmount: new Prisma.Decimal(300000),
              status: 'PAID',
              allocations: [],
            },
            {
              id: 'inst-2',
              installmentNumber: 2,
              amount: new Prisma.Decimal(700000),
              paidAmount: new Prisma.Decimal(0),
              status: 'PENDING',
              allocations: [],
            },
          ],
        },
      ],
      invoices: [],
      payments: [
        {
          id: 'pay-1',
          amount: new Prisma.Decimal(300000),
          status: 'CONFIRMED',
          allocations: [],
        },
      ],
      customerDeposits: [],
      purchases: [
        {
          id: 'pur-1',
          purchasePrice: new Prisma.Decimal(600000),
          payments: [
            {
              id: 'sp-1',
              amount: new Prisma.Decimal(600000),
              status: 'CONFIRMED',
            },
          ],
        },
      ],
      costs: [
        {
          id: 'cost-1',
          type: 'SHIPPING',
          amount: new Prisma.Decimal(100000),
          amountInBaseCurrency: new Prisma.Decimal(100000),
          status: 'POSTED',
        },
        {
          id: 'cost-2',
          type: 'CUSTOMS',
          amount: new Prisma.Decimal(50000),
          amountInBaseCurrency: new Prisma.Decimal(50000),
          status: 'POSTED',
        },
      ],
      customsFiles: [],
    });

    const summary = await service.getDossierFinancialSummary(
      'dossier-1',
      'org-1',
    );

    expect(summary.revenue.total).toBe('1000000');
    expect(summary.revenue.collected).toBe('300000');
    expect(summary.revenue.outstanding).toBe('700000');
    expect(summary.gates.upfrontPaid).toBe(true);
    expect(summary.gates.finalPaid).toBe(false);
    expect(summary.gates.canAdvanceToPurchase).toBe(true);
    expect(summary.gates.canAdvanceToDelivery).toBe(false);
    expect(summary.costs.totalInBaseCurrency).toBe('150000');
    expect(summary.profitability.grossMargin).toBe('850000');
    expect(summary.profitability.grossMarginPercentage).toBe('85');
  });

  it('keeps a completed full-upfront plan as the dossier revenue authority', async () => {
    mockPrisma.dossier.findFirst.mockResolvedValue({
      id: 'dossier-completed',
      reference: 'DOS-2026-00002',
      paymentPlans: [
        {
          id: 'plan-completed',
          strategy: 'FULL_UPFRONT',
          totalAmount: new Prisma.Decimal(100000),
          currency: 'DZD',
          status: 'completed',
          installments: [
            {
              id: 'installment-completed',
              installmentNumber: 1,
              amount: new Prisma.Decimal(100000),
              paidAmount: new Prisma.Decimal(100000),
              status: 'PAID',
              allocations: [],
            },
          ],
        },
      ],
      invoices: [],
      payments: [
        {
          id: 'payment-completed',
          amount: new Prisma.Decimal(100000),
          status: 'CONFIRMED',
          allocations: [],
        },
      ],
      customerDeposits: [],
      purchases: [],
      costs: [],
      customsFiles: [],
    });

    const summary = await service.getDossierFinancialSummary(
      'dossier-completed',
      'org-1',
    );

    expect(summary.revenue).toEqual(
      expect.objectContaining({
        total: '100000',
        collected: '100000',
        outstanding: '0.00',
        state: 'PAID',
      }),
    );
    expect(summary.gates.canAdvanceToDelivery).toBe(true);
  });
});
