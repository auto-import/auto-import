import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomsService } from './customs.service';
import { CustomsController } from './customs.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CustomsController],
  providers: [CustomsService],
  exports: [CustomsService],
})
export class CustomsModule {}
