import { Module } from '@nestjs/common';
import { OfficesController } from './offices.controller';
import { OfficesService } from './offices.service';

@Module({
  controllers: [OfficesController],
  providers: [OfficesService],
  exports: [OfficesService],
})
export class OfficesModule {}
