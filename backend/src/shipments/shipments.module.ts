import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ShipmentsService } from './shipments.service';
import { ShipmentsController } from './shipments.controller';
import { PortsController } from './ports.controller';
import { PortsService } from './ports.service';

@Module({
  imports: [PrismaModule],
  controllers: [ShipmentsController, PortsController],
  providers: [ShipmentsService, PortsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
