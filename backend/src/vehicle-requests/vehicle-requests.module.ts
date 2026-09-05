import { Module } from '@nestjs/common';
import { VehicleRequestsService } from './vehicle-requests.service';
import { VehicleRequestsController } from './vehicle-requests.controller';
import { FinanceModule } from '../finance/finance.module';
import { DossiersModule } from '../dossiers/dossiers.module';

@Module({
  imports: [FinanceModule, DossiersModule],
  controllers: [VehicleRequestsController],
  providers: [VehicleRequestsService],
  exports: [VehicleRequestsService],
})
export class VehicleRequestsModule {}
