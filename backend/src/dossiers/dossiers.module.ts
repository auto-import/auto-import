import { ShipmentsModule } from '../shipments/shipments.module';
import { DossierStatusPropagationService } from './workflows/dossier-status-propagation.service';
import { Module } from '@nestjs/common';
import { DossiersService } from './dossiers.service';
import { DossiersController } from './dossiers.controller';
import { DossierWorkflowService } from './workflows/dossier-workflow.service';
import { VehicleStatusSyncService } from './workflows/vehicle-status-sync.service';
import { DocumentsModule } from '../documents/documents.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [ShipmentsModule, DocumentsModule, ConfigurationModule, FinanceModule],
  controllers: [DossiersController],
  providers: [
    DossierStatusPropagationService,
    DossiersService,
    DossierWorkflowService,
    VehicleStatusSyncService,
  ],
  exports: [DossiersService, DossierWorkflowService, VehicleStatusSyncService],
})
export class DossiersModule {}
