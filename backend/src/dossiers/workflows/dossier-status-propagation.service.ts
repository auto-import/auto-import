import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ShipmentsService } from '../../shipments/shipments.service';
import {
  VehicleStatusSyncService,
  VehicleStatusSyncInput,
} from './vehicle-status-sync.service';

/** All projections of a validated dossier transition share its transaction. */
@Injectable()
export class DossierStatusPropagationService {
  constructor(
    private readonly vehicles: VehicleStatusSyncService,
    private readonly shipments: ShipmentsService,
  ) {}

  async syncForTransition(
    tx: Prisma.TransactionClient,
    input: VehicleStatusSyncInput,
  ) {
    const changes = await this.vehicles.syncForTransition(tx, input);
    await this.shipments.syncFromDossier(tx, input);
    return changes;
  }
}
