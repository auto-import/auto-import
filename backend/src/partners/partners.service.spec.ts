import { ConflictException } from '@nestjs/common';
import { PartnersService } from './partners.service';

describe('PartnersService ERP V2 suppliers', () => {
  let prisma: any;
  let service: PartnersService;

  beforeEach(() => {
    prisma = {
      partner: { findFirst: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: any) => unknown) =>
        callback(prisma),
      ),
    };
    service = new PartnersService(prisma);
  });

  it('centralizes valid supplier status changes and audits the actor', async () => {
    prisma.partner.findFirst.mockResolvedValue({
      id: 'supplier-1',
      type: 'supplier',
      supplierStatus: 'TO_VERIFY',
      status: 'inactive',
    });
    prisma.partner.update.mockResolvedValue({
      id: 'supplier-1',
      supplierStatus: 'VERIFIED',
    });

    await expect(
      service.transitionSupplier('supplier-1', 'org-1', 'user-1', {
        status: 'VERIFIED',
        reason: 'Company documents checked',
      }),
    ).resolves.toMatchObject({ supplierStatus: 'VERIFIED' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        action: 'SUPPLIER_STATUS_CHANGED',
      }),
    });
  });

  it('rejects supplier status jumps', async () => {
    prisma.partner.findFirst.mockResolvedValue({
      id: 'supplier-1',
      type: 'supplier',
      supplierStatus: 'TO_VERIFY',
      status: 'inactive',
    });
    await expect(
      service.transitionSupplier('supplier-1', 'org-1', 'user-1', {
        status: 'ACTIVE',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
