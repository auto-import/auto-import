import { Module } from '@nestjs/common';
import { ProspectsService } from './prospects.service';
import { ProspectsController } from './prospects.controller';
import { CrmModule } from '../crm/crm.module';

@Module({
  imports: [CrmModule],
  controllers: [ProspectsController],
  providers: [ProspectsService],
  exports: [ProspectsService],
})
export class ProspectsModule {}
