import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VehicleStatus } from '@auto-import/contracts';
import { getTargetVehicleStatus } from './dossier-vehicle-status.map';

/** Minimal vehicle shape required to synchronize status. */
export interface SyncableVehicle {
  id: string;
  status: string;
  brand?: string | null;
  model?: string | null;
  vin?: string | null;
}

export interface VehicleStatusSyncInput {
  organizationId: string;
  dossierId: string;
  dossierReference: string;
  fromStatus: string;
  toStatus: string;
  vehicles: SyncableVehicle[];
  userId: string;
}

export interface VehicleStatusSyncChange {
  vehicleId: string;
  from: string;
  to: string;
}

/**
 * Applies the authoritative dossier → vehicle status mapping.
 *
 * This service is the only place that translates a dossier milestone into a
 * vehicle status. It is invoked from within the dossier transition transaction
 * so that the dossier status update and every vehicle status update commit (or
 * roll back) atomically.
 */
@Injectable()
export class VehicleStatusSyncService {
  /** The vehicle status a dossier milestone maps to, or null. */
  targetFor(dossierStatus: string): VehicleStatus | null {
    return getTargetVehicleStatus(dossierStatus);
  }

  /**
   * Fast pre-transaction guard: a rejected vehicle blocks any dossier
   * progression that would otherwise change its status.
   *
   * Accepts a looser shape than {@link SyncableVehicle} because the dossier's
   * mapped `vehicles` projection only guarantees `id` in its type (status is
   * present at runtime).
   */
  assertTransitionAllowed(
    vehicles: Array<{
      id: string;
      status?: string | null;
      brand?: string | null;
      model?: string | null;
      vin?: string | null;
    }>,
    toStatus: string,
  ): void {
    const target = this.targetFor(toStatus);
    if (!target) return;
    const rejected = vehicles.find(
      (vehicle) => vehicle.status === VehicleStatus.REJECTED,
    );
    if (rejected) {
      throw new ConflictException({
        code: 'VEHICLE_REJECTED_BLOCKS_DOSSIER',
        message: `Vehicle ${rejected.brand ?? ''} ${rejected.model ?? ''} (${
          rejected.vin || rejected.id
        }) is rejected; resolve it before advancing the dossier.`,
        vehicleId: rejected.id,
      });
    }
  }

  /**
   * Update every dossier vehicle to the mapped status inside the provided
   * transaction, recording an audit entry for each actual change. Throws
   * (and therefore rolls the transaction back) if a rejected vehicle would be
   * silently overwritten.
   */
  async syncForTransition(
    prisma: Prisma.TransactionClient,
    input: VehicleStatusSyncInput,
  ): Promise<VehicleStatusSyncChange[]> {
    const target = this.targetFor(input.toStatus);
    if (!target) return [];

    const changes: VehicleStatusSyncChange[] = [];
    for (const vehicle of input.vehicles) {
      if (vehicle.status === target) continue;

      if (vehicle.status === VehicleStatus.REJECTED) {
        throw new ConflictException({
          code: 'VEHICLE_REJECTED_BLOCKS_DOSSIER',
          message: `Vehicle ${vehicle.vin || vehicle.id} is rejected and cannot be advanced by the dossier workflow.`,
          vehicleId: vehicle.id,
        });
      }

      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { status: target },
      });
      await prisma.auditLog.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          action: 'vehicle.status.synced',
          entityType: 'vehicle',
          entityId: vehicle.id,
          oldValues: { status: vehicle.status },
          newValues: {
            status: target,
            reason: `Dossier transition: ${input.fromStatus} → ${input.toStatus}`,
            dossierId: input.dossierId,
            dossierReference: input.dossierReference,
          },
        },
      });
      changes.push({ vehicleId: vehicle.id, from: vehicle.status, to: target });
    }
    return changes;
  }
}
