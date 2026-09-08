/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Prisma } from '@prisma/client';
import { ErpKpiService } from './erp-kpi.service';

describe('ErpKpiService', () => {
  it('uses immutable DZD ledger amounts and applies the same active dossier scope', async () => {
    const prisma = {
      dossier: {
        count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      vehicle: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([
            { status: 'inTransit', _count: { _all: 1 } },
            { status: 'inCustoms', _count: { _all: 2 } },
          ])
          .mockResolvedValueOnce([]),
      },
      chinaOffer: { groupBy: jest.fn().mockResolvedValue([]) },
      contract: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'contract-1',
              totalAmount: new Prisma.Decimal(1_000),
              currency: 'DZD',
              signedAt: new Date('2026-09-05T00:00:00Z'),
            },
          ])
          .mockResolvedValueOnce([{ prospectId: 'lead-1' }]),
      },
      invoice: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'invoice-1',
              invoiceNumber: 'FAC-1',
              total: new Prisma.Decimal(1_000),
              paidAmount: new Prisma.Decimal(400),
              currency: 'DZD',
              dueDate: null,
              issueDate: new Date('2026-09-02T00:00:00Z'),
            },
          ])
          .mockResolvedValueOnce([
            {
              id: 'invoice-paid-but-stale-status',
              invoiceNumber: 'FAC-PAID',
              total: new Prisma.Decimal(500),
              paidAmount: new Prisma.Decimal(500),
              currency: 'DZD',
              dueDate: new Date('2026-08-01T00:00:00Z'),
            },
          ]),
      },
      financeTransaction: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'collection-1',
              sourceModule: 'CUSTOMER_PAYMENT',
              customerPaymentId: 'payment-1',
              costId: null,
              amountDzd: new Prisma.Decimal(200),
              occurredAt: new Date('2026-09-06T00:00:00Z'),
            },
            {
              id: 'cost-1',
              sourceModule: 'COST',
              customerPaymentId: null,
              costId: 'cost-1',
              amountDzd: new Prisma.Decimal(300),
              occurredAt: new Date('2026-09-06T00:00:00Z'),
            },
          ])
          .mockResolvedValueOnce([
            {
              sourceModule: 'PURCHASE_COMMITMENT',
              amountDzd: new Prisma.Decimal(800),
            },
            {
              sourceModule: 'SUPPLIER_PAYMENT',
              amountDzd: new Prisma.Decimal(300),
            },
          ]),
      },
      purchase: { count: jest.fn().mockResolvedValue(1) },
      dossierStatusHistory: { findMany: jest.fn().mockResolvedValue([]) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      supplierPayment: { findMany: jest.fn().mockResolvedValue([]) },
      prospect: {
        count: jest
          .fn()
          .mockResolvedValueOnce(3)
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(1),
      },
      appointment: { count: jest.fn().mockResolvedValue(0) },
      callSession: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { durationSeconds: null } }),
      },
      customsFile: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      paymentPlan: { count: jest.fn().mockResolvedValue(0) },
      shipment: { findMany: jest.fn().mockResolvedValue([]) },
      gedDocument: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ErpKpiService(prisma as never);

    const result = await service.build('org-1', {
      from: new Date('2026-09-01T00:00:00Z'),
      to: new Date('2026-09-08T23:59:59Z'),
      timezone: 'Africa/Algiers',
      baseCurrency: 'DZD',
    });

    expect(result.finance).toMatchObject({
      contractsSignedThisMonth: 1,
      collected: '200.00',
      outstanding: '600.00',
      costs: '300.00',
      grossMargin: '700.00',
      supplierOutstanding: '500.00',
      overdueInvoices: 0,
    });
    expect(result.alerts.items).toHaveLength(0);
    expect(result.crm.conversionRate).toBe(50);
    expect(result.vehicles).toMatchObject({ inTransit: 1, inCustoms: 2 });
    expect(prisma.dossier.count).toHaveBeenNthCalledWith(2, {
      where: {
        organizationId: 'org-1',
        archivedAt: null,
        status: { notIn: ['closed', 'serviceCompleted', 'cancelled'] },
      },
    });
    expect(prisma.financeTransaction.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          status: 'VALIDATED',
        }),
      }),
    );
  });
});
