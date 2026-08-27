import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { CrmModule } from '../crm/crm.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [CrmModule, DocumentsModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
