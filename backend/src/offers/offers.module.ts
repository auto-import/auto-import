import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { DocumentsModule } from '../documents/documents.module';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { FinanceModule } from '../finance/finance.module';
import { QuotationPricingService } from './quotation-pricing.service';

@Module({
  imports: [PrismaModule, DocumentsModule, FinanceModule],
  controllers: [OffersController, QuotationsController],
  providers: [OffersService, QuotationsService, QuotationPricingService],
  exports: [OffersService, QuotationsService],
})
export class OffersModule {}
