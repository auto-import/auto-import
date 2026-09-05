import { ConflictException } from '@nestjs/common';
import { DossierStatus, VehicleStatus } from '@auto-import/contracts';
import { getTargetVehicleStatus } from './workflows/dossier-vehicle-status.map';
import {
  VehicleStatusSyncService,
  type VehicleStatusSyncInput,
} from './workflows/vehicle-status-sync.service';
import { DossiersService } from './dossiers.service';
import { DossierWorkflowService } from './workflows/dossier-workflow.service';
import { DossierType } from './dto/dossier-type.enum';

function syncInput(
  overrides: Partial<VehicleStatusSyncInput> = {},
): VehicleStatusSyncInput {
  return {
    organizationId: 'org-1',
    dossierId: 'd1',
    dossierReference: 'CA-2026-00001',
    fromStatus: 'shipmentBooking',
    toStatus: 'loading',
    vehicles: [{ id: 'v1', status: 'reserved', brand: 'Toyota', model: 'LC' }],
    userId: 'u1',
    ...overrides,
  };
}

describe('Dossier → Vehicle status mapping', () => {
  it.each([
    [DossierStatus.OFFER_SELECTED, VehicleStatus.RESERVED],
    [DossierStatus.CLIENT_CONFIRMED, VehicleStatus.RESERVED],
    [DossierStatus.CONTRACT_SIGNED, VehicleStatus.RESERVED],
    [DossierStatus.DEPOSIT_RECEIVED, VehicleStatus.RESERVED],
    [DossierStatus.VEHICLE_BOOKING, VehicleStatus.RESERVED],
    [DossierStatus.PURCHASE_CONFIRMED, VehicleStatus.RESERVED],
    [DossierStatus.SUPPLIER_PAID, VehicleStatus.RESERVED],
    [DossierStatus.INSPECTION, VehicleStatus.RESERVED],
    [DossierStatus.SHIPMENT_BOOKING, VehicleStatus.RESERVED],
    [DossierStatus.LOADING, VehicleStatus.IN_TRANSIT],
    [DossierStatus.BILL_OF_LADING_ISSUED, VehicleStatus.IN_TRANSIT],
    [DossierStatus.IN_TRANSIT, VehicleStatus.IN_TRANSIT],
    [DossierStatus.ARRIVED_AT_PORT, VehicleStatus.IN_TRANSIT],
    [DossierStatus.DOCUMENTS_DELIVERED, VehicleStatus.DELIVERED],
    [DossierStatus.CUSTOMS_CLEARANCE, VehicleStatus.IN_CUSTOMS],
    [DossierStatus.CUSTOMS_RELEASED, VehicleStatus.IN_CUSTOMS],
    [DossierStatus.PORT_EXIT, VehicleStatus.DELIVERED],
    [DossierStatus.LOCAL_TRANSPORT, VehicleStatus.DELIVERED],
    [DossierStatus.DELIVERED_TO_CLIENT, VehicleStatus.DELIVERED],
    [DossierStatus.CLOSED, VehicleStatus.SOLD],
    [DossierStatus.SERVICE_COMPLETED, VehicleStatus.DELIVERED],
    // Shipping-only workflow
    [DossierStatus.BOOKING, VehicleStatus.RESERVED],
    [DossierStatus.CONTAINER_BILL_OF_LADING, VehicleStatus.IN_TRANSIT],
    [DossierStatus.ARRIVED, VehicleStatus.DELIVERED],
  ] as const)(
    'maps dossier %s → vehicle %s',
    (dossierStatus, vehicleStatus) => {
      expect(getTargetVehicleStatus(dossierStatus)).toBe(vehicleStatus);
    },
  );

  it('keeps vehicles reserved at shipment booking (not in-transit yet)', () => {
    expect(getTargetVehicleStatus(DossierStatus.SHIPMENT_BOOKING)).toBe(
      VehicleStatus.RESERVED,
    );
  });

  it('returns null for milestones with no vehicle consequence', () => {
    // Cancellation is handled separately (only releases reserved vehicles).
    expect(getTargetVehicleStatus(DossierStatus.CANCELLED)).toBeNull();
    expect(getTargetVehicleStatus('doesNotExist')).toBeNull();
  });
});

describe('VehicleStatusSyncService.assertTransitionAllowed', () => {
  let service: VehicleStatusSyncService;
  beforeEach(() => {
    service = new VehicleStatusSyncService();
  });

  it('blocks a progression when any vehicle is rejected', () => {
    expect(() =>
      service.assertTransitionAllowed(
        [{ id: 'v1', status: VehicleStatus.REJECTED, vin: 'VIN1' }],
        DossierStatus.LOADING,
      ),
    ).toThrow(ConflictException);
  });

  it('allows progression when no vehicle is rejected', () => {
    expect(() =>
      service.assertTransitionAllowed(
        [{ id: 'v1', status: VehicleStatus.RESERVED }],
        DossierStatus.LOADING,
      ),
    ).not.toThrow();
  });

  it('does not block milestones with no vehicle consequence', () => {
    expect(() =>
      service.assertTransitionAllowed(
        [{ id: 'v1', status: VehicleStatus.REJECTED }],
        DossierStatus.CANCELLED,
      ),
    ).not.toThrow();
  });
});

describe('VehicleStatusSyncService.syncForTransition', () => {
  let service: VehicleStatusSyncService;
  let prisma: {
    vehicle: { update: jest.Mock };
    auditLog: { create: jest.Mock };
  };

  beforeEach(() => {
    service = new VehicleStatusSyncService();
    prisma = {
      vehicle: { update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
  });

  it('updates every vehicle to the mapped status and audits each change', async () => {
    const changes = await service.syncForTransition(
      prisma as never,
      syncInput(),
    );
    expect(changes).toEqual([
      { vehicleId: 'v1', from: 'reserved', to: 'inTransit' },
    ]);
    expect(prisma.vehicle.update).toHaveBeenCalledTimes(1);
    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { status: 'inTransit' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'vehicle.status.synced',
      entityType: 'vehicle',
      entityId: 'v1',
      oldValues: { status: 'reserved' },
      newValues: { status: 'inTransit' },
    });
  });

  it('updates multiple vehicles individually', async () => {
    await service.syncForTransition(
      prisma as never,
      syncInput({
        vehicles: [
          { id: 'v1', status: 'reserved' },
          { id: 'v2', status: 'reserved' },
          { id: 'v3', status: 'inTransit' },
        ],
      }),
    );
    // v3 already at target → not updated, but the synchronization is audited.
    expect(prisma.vehicle.update).toHaveBeenCalledTimes(2);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(3);
  });

  it('is idempotent — no update, with an audit confirmation when already at target', async () => {
    const changes = await service.syncForTransition(
      prisma as never,
      syncInput({
        vehicles: [{ id: 'v1', status: 'inTransit' }],
      }),
    );
    expect(changes).toEqual([]);
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'vehicle.status.sync.confirmed',
        oldValues: { status: 'inTransit' },
        newValues: expect.objectContaining({ status: 'inTransit' }),
      }),
    });
  });

  it('throws (rollback) when a rejected vehicle would be overwritten', async () => {
    await expect(
      service.syncForTransition(
        prisma as never,
        syncInput({
          vehicles: [{ id: 'v1', status: 'rejected' }],
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'VEHICLE_REJECTED_BLOCKS_DOSSIER' },
    });
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it('no-ops for milestones without a target', async () => {
    const changes = await service.syncForTransition(
      prisma as never,
      syncInput({
        toStatus: DossierStatus.CANCELLED,
      }),
    );
    expect(changes).toEqual([]);
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });
});

describe('DossiersService.updateStatus vehicle synchronization (integration)', () => {
  let service: DossiersService;
  let prisma: any;

  const baseDossier = {
    id: 'd1',
    organizationId: 'org-1',
    reference: 'CA-2026-00001',
    type: DossierType.VEHICLE_SALE_CIF,
    status: DossierStatus.SHIPMENT_BOOKING,
    workflowVersion: 2,
    salesUserId: 'sales-1',
    opsUserId: null,
    orderId: null,
    vehicleBookingVehicleId: null,
  };

  beforeEach(() => {
    prisma = {
      dossier: { update: jest.fn() },
      dossierStatusHistory: {
        create: jest.fn().mockResolvedValue({ id: 'h1' }),
      },
      notification: { createMany: jest.fn() },
      vehicle: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn(),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      offerReservation: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((cb: (tx: any) => unknown) => cb(prisma)),
    };
    const documentsGate = {
      verifySignedContract: jest.fn().mockResolvedValue({ id: 'c1' }),
      verifyCheckpoint: jest.fn().mockResolvedValue({
        complete: true,
        missingVehicleIds: [],
        evidenceIds: [],
      }),
      markEvidenceRelied: jest.fn(),
    };
    service = new DossiersService(
      prisma,
      new DossierWorkflowService(),
      new VehicleStatusSyncService(),
      documentsGate as never,
    );
  });

  it('marks all vehicles in-transit when the dossier advances to loading', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      ...baseDossier,
      vehicles: [
        {
          id: 'v1',
          status: 'reserved',
          brand: 'Toyota',
          model: 'LC',
          vin: 'VIN1',
        },
        {
          id: 'v2',
          status: 'reserved',
          brand: 'Nissan',
          model: 'Patrol',
          vin: 'VIN2',
        },
      ],
    } as any);

    prisma.dossier.update.mockResolvedValue({
      ...baseDossier,
      dossierVehicles: [
        {
          vehicle: {
            id: 'v1',
            status: 'reserved',
            brand: 'Toyota',
            model: 'LC',
            vin: 'VIN1',
          },
        },
        {
          vehicle: {
            id: 'v2',
            status: 'reserved',
            brand: 'Nissan',
            model: 'Patrol',
            vin: 'VIN2',
          },
        },
      ],
    });

    await service.updateStatus(
      'd1',
      { status: DossierStatus.LOADING },
      'user-1',
      'org-1',
    );

    expect(prisma.vehicle.update).toHaveBeenCalledTimes(2);
    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { status: VehicleStatus.IN_TRANSIT },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'vehicle.status.synced',
      entityId: 'v1',
      newValues: { status: VehicleStatus.IN_TRANSIT },
    });
  });

  it('blocks the dossier transition when a vehicle is rejected', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      ...baseDossier,
      vehicles: [
        {
          id: 'v1',
          status: 'rejected',
          brand: 'Toyota',
          model: 'LC',
          vin: 'VIN1',
        },
      ],
    } as any);

    await expect(
      service.updateStatus(
        'd1',
        { status: DossierStatus.LOADING },
        'user-1',
        'org-1',
      ),
    ).rejects.toMatchObject({
      response: { code: 'VEHICLE_REJECTED_BLOCKS_DOSSIER' },
    });
    expect(prisma.dossier.update).not.toHaveBeenCalled();
  });

  it('releases reserved vehicles (and audits) on cancellation', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      ...baseDossier,
      vehicles: [
        {
          id: 'v1',
          status: 'reserved',
          brand: 'Toyota',
          model: 'LC',
          vin: 'VIN1',
        },
        {
          id: 'v2',
          status: 'inTransit',
          brand: 'Nissan',
          model: 'Patrol',
          vin: 'VIN2',
        },
      ],
    } as any);

    prisma.dossier.update.mockResolvedValue({
      ...baseDossier,
      dossierVehicles: [
        {
          vehicle: {
            id: 'v1',
            status: 'reserved',
            brand: 'Toyota',
            model: 'LC',
            vin: 'VIN1',
          },
        },
        {
          vehicle: {
            id: 'v2',
            status: 'inTransit',
            brand: 'Nissan',
            model: 'Patrol',
            vin: 'VIN2',
          },
        },
      ],
    });

    await service.updateStatus(
      'd1',
      { status: DossierStatus.CANCELLED },
      'user-1',
      'org-1',
    );

    // Only the reserved vehicle is released; the in-transit one is untouched.
    expect(prisma.vehicle.update).toHaveBeenCalledTimes(1);
    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { status: VehicleStatus.AVAILABLE },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('marks vehicles sold when a sale dossier is closed', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      ...baseDossier,
      status: DossierStatus.DOCUMENTS_DELIVERED,
      vehicles: [
        {
          id: 'v1',
          status: 'delivered',
          brand: 'Toyota',
          model: 'LC',
          vin: 'VIN1',
        },
      ],
    } as any);

    prisma.dossier.update.mockResolvedValue({
      ...baseDossier,
      dossierVehicles: [
        {
          vehicle: {
            id: 'v1',
            status: 'delivered',
            brand: 'Toyota',
            model: 'LC',
            vin: 'VIN1',
          },
        },
      ],
    });

    await service.updateStatus(
      'd1',
      { status: DossierStatus.CLOSED },
      'user-1',
      'org-1',
    );

    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { status: VehicleStatus.SOLD },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
