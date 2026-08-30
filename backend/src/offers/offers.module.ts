import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { DocumentsModule } from '../documents/documents.module';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';

@Module({
  imports: [PrismaModule, DocumentsModule],
  controllers: [OffersController, QuotationsController],
  providers: [OffersService, QuotationsService],
  exports: [OffersService, QuotationsService],
})
export class OffersModule {}
