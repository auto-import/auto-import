import { Module } from '@nestjs/common';
import { VehicleRequestsService } from './vehicle-requests.service';
import { VehicleRequestsController } from './vehicle-requests.controller';

@Module({
  controllers: [VehicleRequestsController],
  providers: [VehicleRequestsService],
  exports: [VehicleRequestsService],
})
export class VehicleRequestsModule {}
