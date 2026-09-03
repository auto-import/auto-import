import { Module } from '@nestjs/common';
import { DossiersService } from './dossiers.service';
import { DossiersController } from './dossiers.controller';
import { DossierWorkflowService } from './workflows/dossier-workflow.service';
import { DocumentsModule } from '../documents/documents.module';
import { ConfigurationModule } from '../configuration/configuration.module';

@Module({
  imports: [DocumentsModule, ConfigurationModule],
  controllers: [DossiersController],
  providers: [DossiersService, DossierWorkflowService],
  exports: [DossiersService, DossierWorkflowService],
})
export class DossiersModule {}
