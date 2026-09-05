import { ConflictException } from '@nestjs/common';
import { PartnersService } from './partners.service';

describe('PartnersService ERP V2 suppliers', () => {
  let prisma: any;
  let service: PartnersService;

  beforeEach(() => {
    prisma = {
      partner: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      vehicle: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: any) => unknown) =>
        callback(prisma),
      ),
    };
    service = new PartnersService(prisma);
  });

  it('creates supplier as ACTIVE/active (CREATE -> ACTIVE)', async () => {
    prisma.partner.create.mockResolvedValue({
      id: 'supplier-new',
      name: 'New Supplier',
      type: 'supplier',
      status: 'active',
      supplierStatus: 'ACTIVE',
    });

    const result = await service.create(
      { name: 'New Supplier', type: 'supplier' } as any,
      'org-1',
      'user-1',
    );

    expect(prisma.partner.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        status: 'active',
        supplierStatus: 'ACTIVE',
      }),
    });
    expect(result).toMatchObject({
      supplierStatus: 'ACTIVE',
      status: 'active',
    });
  });

  it('allows legacy TO_VERIFY -> ACTIVE', async () => {
    prisma.partner.findFirst.mockResolvedValue({
      id: 'supplier-1',
      type: 'supplier',
      supplierStatus: 'TO_VERIFY',
      status: 'inactive',
    });
    prisma.partner.update.mockResolvedValue({
      id: 'supplier-1',
      supplierStatus: 'ACTIVE',
      status: 'active',
    });

    await expect(
      service.transitionSupplier('supplier-1', 'org-1', 'user-1', {
        status: 'ACTIVE',
      }),
    ).resolves.toMatchObject({ supplierStatus: 'ACTIVE' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        action: 'SUPPLIER_STATUS_CHANGED',
      }),
    });
  });

  it('centralizes valid supplier status changes and audits the actor (TO_VERIFY -> VERIFIED still allowed)', async () => {
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

  it('allows ACTIVE -> SUSPENDED', async () => {
    prisma.partner.findFirst.mockResolvedValue({
      id: 'supplier-1',
      type: 'supplier',
      supplierStatus: 'ACTIVE',
      status: 'active',
    });
    prisma.partner.update.mockResolvedValue({
      id: 'supplier-1',
      supplierStatus: 'SUSPENDED',
      status: 'inactive',
    });

    await expect(
      service.transitionSupplier('supplier-1', 'org-1', 'user-1', {
        status: 'SUSPENDED',
      }),
    ).resolves.toMatchObject({ supplierStatus: 'SUSPENDED' });
  });

  it('allows SUSPENDED -> ACTIVE', async () => {
    prisma.partner.findFirst.mockResolvedValue({
      id: 'supplier-1',
      type: 'supplier',
      supplierStatus: 'SUSPENDED',
      status: 'inactive',
    });
    prisma.partner.update.mockResolvedValue({
      id: 'supplier-1',
      supplierStatus: 'ACTIVE',
      status: 'active',
    });

    await expect(
      service.transitionSupplier('supplier-1', 'org-1', 'user-1', {
        status: 'ACTIVE',
      }),
    ).resolves.toMatchObject({ supplierStatus: 'ACTIVE' });
  });

  it('rejects invalid supplier status jumps', async () => {
    prisma.partner.findFirst.mockResolvedValue({
      id: 'supplier-1',
      type: 'supplier',
      supplierStatus: 'ACTIVE',
      status: 'active',
    });
    await expect(
      service.transitionSupplier('supplier-1', 'org-1', 'user-1', {
        status: 'TO_VERIFY',
      }),
    ).rejects.toThrow(ConflictException);

    prisma.partner.findFirst.mockResolvedValue({
      id: 'supplier-1',
      type: 'supplier',
      supplierStatus: 'TO_VERIFY',
      status: 'inactive',
    });
    await expect(
      service.transitionSupplier('supplier-1', 'org-1', 'user-1', {
        status: 'SUSPENDED',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('links an unassigned vehicle to one primary supplier and audits it', async () => {
    prisma.partner.findFirst.mockResolvedValue({ id: 'supplier-1' });
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'vehicle-1',
      supplierId: null,
      purchases: [],
    });
    await expect(
      service.linkVehicle('supplier-1', 'org-1', 'user-1', {
        vehicleId: 'vehicle-1',
      }),
    ).resolves.toMatchObject({ supplierId: 'supplier-1' });
    expect(prisma.vehicle.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'vehicle-1',
        organizationId: 'org-1',
        archivedAt: null,
        supplierId: null,
      },
      data: { supplierId: 'supplier-1' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'SUPPLIER_VEHICLE_LINKED',
        entityId: 'vehicle-1',
      }),
    });
  });

  it('keeps supplier vehicle assignment idempotent', async () => {
    prisma.partner.findFirst.mockResolvedValue({ id: 'supplier-1' });
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'vehicle-1',
      supplierId: 'supplier-1',
      purchases: [],
    });

    await service.linkVehicle('supplier-1', 'org-1', 'user-1', {
      vehicleId: 'vehicle-1',
    });
    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('blocks reassignment from another primary supplier', async () => {
    prisma.partner.findFirst.mockResolvedValue({ id: 'supplier-1' });
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'vehicle-1',
      supplierId: 'supplier-2',
      purchases: [],
    });

    await expect(
      service.linkVehicle('supplier-1', 'org-1', 'user-1', {
        vehicleId: 'vehicle-1',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent supplier assignment instead of overwriting it', async () => {
    prisma.partner.findFirst.mockResolvedValue({ id: 'supplier-1' });
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'vehicle-1',
      supplierId: null,
      purchases: [],
    });
    prisma.vehicle.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.linkVehicle('supplier-1', 'org-1', 'user-1', {
        vehicleId: 'vehicle-1',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
