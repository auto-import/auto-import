import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReconciliationService } from './reconciliation.service';
import { ExchangeRatesService } from './exchange-rates.service';
import { ExchangeRatesController } from './exchange-rates.controller';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { PaymentPlansService } from './payment-plans.service';
import { PaymentPlansController } from './payment-plans.controller';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { CustomerDepositsService } from './customer-deposits.service';
import { CustomerDepositsController } from './customer-deposits.controller';
import { SupplierPaymentsService } from './supplier-payments.service';
import { SupplierPaymentsController } from './supplier-payments.controller';
import { CostsService } from './costs.service';
import { CostsController } from './costs.controller';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { Phase3Module } from '../phase3/phase3.module';

@Module({
  imports: [PrismaModule, Phase3Module],
  controllers: [
    InvoicesController,
    PaymentPlansController,
    PaymentsController,
    CustomerDepositsController,
    SupplierPaymentsController,
    CostsController,
    ExchangeRatesController,
    FinanceController,
  ],
  providers: [
    ReconciliationService,
    ExchangeRatesService,
    InvoicesService,
    PaymentPlansService,
    PaymentsService,
    CustomerDepositsService,
    SupplierPaymentsService,
    CostsService,
    FinanceService,
  ],
  exports: [
    ReconciliationService,
    ExchangeRatesService,
    InvoicesService,
    PaymentPlansService,
    PaymentsService,
    CustomerDepositsService,
    SupplierPaymentsService,
    CostsService,
    FinanceService,
  ],
})
export class FinanceModule {}
