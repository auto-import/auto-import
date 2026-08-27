import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationService } from './reconciliation.service';
import { Prisma } from '@prisma/client';

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let prisma: PrismaService;

  const mockTx = {
    invoice: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    paymentInstallment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    paymentPlan: {
      update: jest.fn(),
    },
    payment: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
  });

  it('should mark invoice PAID when total allocations match or exceed invoice total', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      total: new Prisma.Decimal(50000),
      status: 'ISSUED',
      allocations: [
        { amount: new Prisma.Decimal(20000), status: 'ACTIVE' },
        { amount: new Prisma.Decimal(30000), status: 'ACTIVE' },
      ],
    });

    await service.reconcileInvoice(mockTx as any, 'inv-1');

    expect(mockTx.invoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: {
        paidAmount: new Prisma.Decimal(50000),
        status: 'PAID',
      },
    });
  });

  it('should mark installment and parent plan complete when paid in full', async () => {
    mockTx.paymentInstallment.findUnique.mockResolvedValue({
      id: 'inst-1',
      paymentPlanId: 'plan-1',
      amount: new Prisma.Decimal(30000),
      status: 'PENDING',
      allocations: [{ amount: new Prisma.Decimal(30000), status: 'ACTIVE' }],
      paymentPlan: {
        id: 'plan-1',
        installments: [{ id: 'inst-1' }],
      },
    });

    mockTx.paymentInstallment.findMany.mockResolvedValue([
      { id: 'inst-1', status: 'PAID' },
    ]);

    await service.reconcileInstallment(mockTx as any, 'inst-1');

    expect(mockTx.paymentInstallment.update).toHaveBeenCalledWith({
      where: { id: 'inst-1' },
      data: {
        paidAmount: new Prisma.Decimal(30000),
        status: 'PAID',
      },
    });

    expect(mockTx.paymentPlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: { status: 'completed' },
    });
  });
});
