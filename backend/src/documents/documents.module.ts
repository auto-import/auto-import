import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageProvider } from './storage.provider';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { GedController } from './ged.controller';
import { GedService } from './ged.service';

@Module({
  imports: [PrismaModule],
  controllers: [DocumentsController, GedController],
  providers: [StorageProvider, DocumentsService, GedService],
  exports: [StorageProvider, DocumentsService, GedService],
})
export class DocumentsModule {}
