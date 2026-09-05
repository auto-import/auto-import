import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DossierStatus } from '@auto-import/contracts';
import { DossiersService } from './dossiers.service';
import { DossierWorkflowService } from './workflows/dossier-workflow.service';
import { VehicleStatusSyncService } from './workflows/vehicle-status-sync.service';
import { DossierType } from './dto/dossier-type.enum';
import { DocumentsService } from '../documents/documents.service';

describe('Phase 2 Dossier Gates Comprehensive Tests', () => {
  let dossiersService: DossiersService;
  let workflowService: DossierWorkflowService;
  let costsService: { recordPurchaseCommitment: jest.Mock };
  let financeProjection: { projectCustomerPayment: jest.Mock };

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
      create: jest.fn(),
    },
    customerDeposit: { create: jest.fn() },
    paymentInstallment: {
      findMany: jest.fn(),
    },
    partner: {
      findFirst: jest.fn(),
    },
    purchase: {
      create: jest.fn(),
    },
    vehicle: {
      update: jest.fn(),
    },
    dossierStatusHistory: {
      create: jest.fn(),
    },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    workflowService = new DossierWorkflowService();
    costsService = { recordPurchaseCommitment: jest.fn() };
    financeProjection = { projectCustomerPayment: jest.fn() };
    const documentsService = {
      verifySignedContract: jest.fn(),
      verifyCheckpoint: jest.fn(),
      markEvidenceRelied: jest.fn(),
    };
    dossiersService = new DossiersService(
      mockPrisma,
      workflowService,
      new VehicleStatusSyncService(),
      documentsService as unknown as DocumentsService,
      undefined,
      costsService as never,
      financeProjection as never,
    );
    mockPrisma.partner.findFirst.mockResolvedValue({
      id: 'supplier-1',
      type: 'supplier',
      status: 'active',
    });
    mockPrisma.purchase.create.mockResolvedValue({ id: 'purchase-1' });
    mockPrisma.vehicle.update.mockResolvedValue({ id: 'vehicle-1' });
  });

  describe('Gate 1: Upfront 30% Deposit Enforcement', () => {
    it('should block transition to purchaseConfirmed if 30% upfront deposit is not confirmed', async () => {
      mockPrisma.dossier.findFirst.mockResolvedValue({
        id: 'dos-1',
        organizationId: 'org-1',
        type: DossierType.VEHICLE_SALE_CIF,
        status: DossierStatus.DEPOSIT_RECEIVED,
        dossierVehicles: [{ vehicleId: 'vehicle-1' }],
        vehicles: [{ id: 'vehicle-1' }],
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
          {
            status: DossierStatus.PURCHASE_CONFIRMED,
            purchase: {
              invoiceNumber: 'SUP-INV-001',
              amount: 1000000,
              currency: 'DZD',
              invoiceDate: '2026-09-02',
              supplierId: 'supplier-1',
            },
          },
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
          dossierVehicles: [{ vehicleId: 'vehicle-1' }],
          vehicles: [{ id: 'vehicle-1' }],
          payments: [{ amount: new Prisma.Decimal(300000) }],
          invoices: [],
        })
        .mockResolvedValueOnce({
          id: 'dos-1',
          organizationId: 'org-1',
          type: DossierType.VEHICLE_SALE_CIF,
          status: DossierStatus.PURCHASE_CONFIRMED,
          dossierVehicles: [{ vehicleId: 'vehicle-1' }],
          vehicles: [{ id: 'vehicle-1' }],
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
        {
          status: DossierStatus.PURCHASE_CONFIRMED,
          purchase: {
            invoiceNumber: 'SUP-INV-001',
            amount: 1000000,
            currency: 'DZD',
            invoiceDate: '2026-09-02',
            supplierId: 'supplier-1',
          },
        },
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
      expect(costsService.recordPurchaseCommitment).toHaveBeenCalledWith(
        mockPrisma,
        'org-1',
        'user-1',
        expect.objectContaining({ id: 'purchase-1' }),
      );
    });

    it('projects a transition-recorded client deposit to Finance atomically', async () => {
      const before = {
        id: 'dos-1',
        organizationId: 'org-1',
        clientId: 'client-1',
        reference: 'CA-2026-00001',
        type: DossierType.VEHICLE_SALE_CIF,
        status: DossierStatus.CONTRACT_SIGNED,
        workflowVersion: 2,
        dossierVehicles: [{ vehicleId: 'vehicle-1' }],
        vehicles: [{ id: 'vehicle-1', status: 'reserved' }],
        payments: [],
        invoices: [],
      };
      mockPrisma.dossier.findFirst
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce({
          ...before,
          status: DossierStatus.DEPOSIT_RECEIVED,
        });
      mockPrisma.payment.create.mockResolvedValue({
        id: 'payment-1',
        clientId: 'client-1',
        dossierId: 'dos-1',
        amount: new Prisma.Decimal(300_000),
        currency: 'DZD',
        paymentMethod: 'BANK_TRANSFER',
        paymentDate: new Date('2026-09-02'),
      });
      mockPrisma.dossier.update.mockResolvedValue({
        id: 'dos-1',
        status: DossierStatus.DEPOSIT_RECEIVED,
        dossierVehicles: [
          {
            vehicle: {
              id: 'vehicle-1',
              status: 'reserved',
              brand: 'Test',
              model: 'Vehicle',
              vin: 'VIN-1',
            },
          },
        ],
      });

      await dossiersService.updateStatus(
        'dos-1',
        {
          status: DossierStatus.DEPOSIT_RECEIVED,
          deposit: {
            amount: 300_000,
            currency: 'DZD',
            paymentMethod: 'BANK_TRANSFER',
            receivedAt: '2026-09-02',
          },
        },
        'user-1',
        'org-1',
      );

      expect(financeProjection.projectCustomerPayment).toHaveBeenCalledWith(
        mockPrisma,
        'org-1',
        'user-1',
        expect.objectContaining({ id: 'payment-1' }),
      );
      expect(mockPrisma.customerDeposit.create).toHaveBeenCalled();
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

      mockPrisma.paymentInstallment.findMany.mockResolvedValue([
        { paidAmount: new Prisma.Decimal(300000) },
      ]);

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

      mockPrisma.paymentInstallment.findMany.mockResolvedValue([
        { paidAmount: new Prisma.Decimal(300000) },
        { paidAmount: new Prisma.Decimal(700000) },
      ]);

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
