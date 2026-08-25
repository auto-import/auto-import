import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DossierStatus } from '@auto-import/contracts';
import { DossiersService } from './dossiers.service';
import { DossierWorkflowService } from './workflows/dossier-workflow.service';
import { DossierType } from './dto/dossier-type.enum';

describe('Phase 2 Dossier Gates Comprehensive Tests', () => {
  let dossiersService: DossiersService;
  let workflowService: DossierWorkflowService;

  const mockPrisma: any = {
    dossier: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    paymentPlan: {
      findFirst: jest.fn(),
    },
    payment: {
      findMany: jest.fn(),
    },
    dossierStatusHistory: {
      create: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    workflowService = new DossierWorkflowService();
    dossiersService = new DossiersService(mockPrisma, workflowService);
  });

  describe('Gate 1: Upfront 30% Deposit Enforcement', () => {
    it('should block transition to purchaseConfirmed if 30% upfront deposit is not confirmed', async () => {
      mockPrisma.dossier.findFirst.mockResolvedValue({
        id: 'dos-1',
        organizationId: 'org-1',
        type: DossierType.VEHICLE_SALE_CIF,
        status: DossierStatus.DEPOSIT_RECEIVED,
        dossierVehicles: [],
        payments: [],
        invoices: [],
      });

      // Active plan requiring 300,000 upfront
      mockPrisma.paymentPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        totalAmount: new Prisma.Decimal(1000000),
        currency: 'DZD',
        status: 'active',
        installments: [
          {
            installmentNumber: 1,
            amount: new Prisma.Decimal(300000),
            paidAmount: new Prisma.Decimal(0),
          },
        ],
      });

      // No confirmed payments
      mockPrisma.payment.findMany.mockResolvedValue([]);

      await expect(
        dossiersService.updateStatus(
          'dos-1',
          { status: DossierStatus.PURCHASE_CONFIRMED },
          'user-1',
          'org-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow transition to purchaseConfirmed once 30% upfront deposit is confirmed', async () => {
      mockPrisma.dossier.findFirst
        .mockResolvedValueOnce({
          id: 'dos-1',
          organizationId: 'org-1',
          type: DossierType.VEHICLE_SALE_CIF,
          status: DossierStatus.DEPOSIT_RECEIVED,
          dossierVehicles: [],
          payments: [{ amount: new Prisma.Decimal(300000) }],
          invoices: [],
        })
        .mockResolvedValueOnce({
          id: 'dos-1',
          organizationId: 'org-1',
          type: DossierType.VEHICLE_SALE_CIF,
          status: DossierStatus.PURCHASE_CONFIRMED,
          dossierVehicles: [],
          payments: [{ amount: new Prisma.Decimal(300000) }],
          invoices: [],
        });

      mockPrisma.paymentPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        totalAmount: new Prisma.Decimal(1000000),
        currency: 'DZD',
        status: 'active',
        installments: [
          {
            installmentNumber: 1,
            amount: new Prisma.Decimal(300000),
            paidAmount: new Prisma.Decimal(300000),
          },
        ],
      });

      mockPrisma.payment.findMany.mockResolvedValue([
        { amount: new Prisma.Decimal(300000), status: 'CONFIRMED' },
      ]);

      mockPrisma.dossier.update.mockResolvedValue({
        id: 'dos-1',
        status: DossierStatus.PURCHASE_CONFIRMED,
        dossierVehicles: [],
      });

      const result = await dossiersService.updateStatus(
        'dos-1',
        { status: DossierStatus.PURCHASE_CONFIRMED },
        'user-1',
        'org-1',
      );

      expect(result.status).toBe(DossierStatus.PURCHASE_CONFIRMED);
      expect(mockPrisma.paymentPlan.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            installments: { orderBy: { installmentNumber: 'asc' } },
          },
        }),
      );
    });
  });

  describe('Gate 2: Final 100% Balance Enforcement', () => {
    it('should block transition to documentsDelivered in CIF workflow if full balance is unpaid', async () => {
      mockPrisma.dossier.findFirst.mockResolvedValue({
        id: 'dos-1',
        organizationId: 'org-1',
        type: DossierType.VEHICLE_SALE_CIF,
        status: DossierStatus.ARRIVED_AT_PORT,
        dossierVehicles: [],
        payments: [{ amount: new Prisma.Decimal(300000) }],
        invoices: [],
      });

      mockPrisma.paymentPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        totalAmount: new Prisma.Decimal(1000000),
        currency: 'DZD',
        status: 'active',
      });

      // Only 300,000 confirmed, 700,000 remaining
      mockPrisma.payment.findMany.mockResolvedValue([
        { amount: new Prisma.Decimal(300000), status: 'CONFIRMED' },
      ]);

      await expect(
        dossiersService.updateStatus(
          'dos-1',
          { status: DossierStatus.DOCUMENTS_DELIVERED },
          'user-1',
          'org-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow transition to documentsDelivered once full 100% balance is confirmed', async () => {
      mockPrisma.dossier.findFirst
        .mockResolvedValueOnce({
          id: 'dos-1',
          organizationId: 'org-1',
          type: DossierType.VEHICLE_SALE_CIF,
          status: DossierStatus.ARRIVED_AT_PORT,
          dossierVehicles: [],
          payments: [
            { amount: new Prisma.Decimal(300000) },
            { amount: new Prisma.Decimal(700000) },
          ],
          invoices: [],
        })
        .mockResolvedValueOnce({
          id: 'dos-1',
          organizationId: 'org-1',
          type: DossierType.VEHICLE_SALE_CIF,
          status: DossierStatus.DOCUMENTS_DELIVERED,
          dossierVehicles: [],
          payments: [
            { amount: new Prisma.Decimal(300000) },
            { amount: new Prisma.Decimal(700000) },
          ],
          invoices: [],
        });

      mockPrisma.paymentPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        totalAmount: new Prisma.Decimal(1000000),
        currency: 'DZD',
        status: 'active',
      });

      mockPrisma.payment.findMany.mockResolvedValue([
        { amount: new Prisma.Decimal(300000), status: 'CONFIRMED' },
        { amount: new Prisma.Decimal(700000), status: 'CONFIRMED' },
      ]);

      mockPrisma.dossier.update.mockResolvedValue({
        id: 'dos-1',
        status: DossierStatus.DOCUMENTS_DELIVERED,
        dossierVehicles: [],
      });

      const result = await dossiersService.updateStatus(
        'dos-1',
        { status: DossierStatus.DOCUMENTS_DELIVERED },
        'user-1',
        'org-1',
      );

      expect(result.status).toBe(DossierStatus.DOCUMENTS_DELIVERED);
    });
  });
});
