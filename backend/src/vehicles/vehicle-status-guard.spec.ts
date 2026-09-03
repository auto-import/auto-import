import { ConflictException } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';

describe('VehiclesService.update — independent status guard', () => {
  let service: VehiclesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((cb: (tx: any) => unknown) => cb(prisma)),
      vehicle: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      dossierVehicle: {
        findFirst: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    service = new VehiclesService(prisma, {} as never);
  });

  it('blocks a manual status change on a vehicle attached to an active dossier', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'v1',
      organizationId: 'org-1',
      status: 'reserved',
      vin: 'VIN1',
    });
    prisma.dossierVehicle.findFirst.mockResolvedValue({
      dossier: { id: 'd1', reference: 'CA-2026-00001', status: 'vehicleBooking' },
    });

    await expect(
      service.update('v1', 'org-1', { status: 'available' }, 'user-1'),
    ).rejects.toMatchObject({
      response: { code: 'VEHICLE_STATUS_MANAGED_BY_DOSSIER' },
    });
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it('allows rejection even when the vehicle is attached to an active dossier', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'v1',
      organizationId: 'org-1',
      status: 'reserved',
      vin: 'VIN1',
    });
    prisma.dossierVehicle.findFirst.mockResolvedValue({
      dossier: { id: 'd1', reference: 'CA-2026-00001', status: 'vehicleBooking' },
    });
    prisma.vehicle.update.mockResolvedValue({ id: 'v1', status: 'rejected' });

    await service.update(
      'v1',
      'org-1',
      { status: 'rejected', rejectionReason: 'Damaged during inspection' },
      'user-1',
    );

    expect(prisma.vehicle.update).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'vehicle.rejected',
          oldValues: { status: 'reserved' },
        }),
      }),
    );
  });

  it('allows a no-op update that does not change the status', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'v1',
      organizationId: 'org-1',
      status: 'reserved',
      vin: 'VIN1',
    });
    prisma.vehicle.update.mockResolvedValue({ id: 'v1', status: 'reserved' });

    await expect(
      service.update('v1', 'org-1', { status: 'reserved' }, 'user-1'),
    ).resolves.toBeDefined();
    // Guard was not triggered because the status did not change.
    expect(prisma.dossierVehicle.findFirst).not.toHaveBeenCalled();
  });
});
