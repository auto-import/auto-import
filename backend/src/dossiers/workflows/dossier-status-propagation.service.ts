import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ShipmentsService } from '../../shipments/shipments.service';
import { CustomsService } from '../../customs/customs.service';
import { DossierCommerceSyncService } from './dossier-commerce-sync.service';
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
    @Optional() private readonly commerce?: DossierCommerceSyncService,
    @Optional() private readonly customs?: CustomsService,
  ) {}

  async syncForTransition(
    tx: Prisma.TransactionClient,
    input: VehicleStatusSyncInput,
  ) {
    const changes = await this.vehicles.syncForTransition(tx, input);
    await this.commerce?.syncForTransition(tx, input);
    await this.shipments.syncFromDossier(tx, input);
    await this.customs?.syncFromDossier(tx, input);
    return changes;
  }
}
