import { Module } from '@nestjs/common';
import { DossiersService } from './dossiers.service';
import { DossiersController } from './dossiers.controller';
import { DossierWorkflowService } from './workflows/dossier-workflow.service';
import { VehicleStatusSyncService } from './workflows/vehicle-status-sync.service';
import { DocumentsModule } from '../documents/documents.module';
import { ConfigurationModule } from '../configuration/configuration.module';

@Module({
  imports: [DocumentsModule, ConfigurationModule],
  controllers: [DossiersController],
  providers: [DossiersService, DossierWorkflowService, VehicleStatusSyncService],
  exports: [DossiersService, DossierWorkflowService, VehicleStatusSyncService],
})
export class DossiersModule {}
