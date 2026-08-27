import { Module } from '@nestjs/common';
import { ContactResolutionService } from './contact-resolution.service';
import { CrmController } from './crm.controller';
import { CrmKpiService } from './crm-kpi.service';
import { CrmTimelineService } from './crm-timeline.service';

@Module({
  controllers: [CrmController],
  providers: [ContactResolutionService, CrmTimelineService, CrmKpiService],
  exports: [ContactResolutionService, CrmTimelineService, CrmKpiService],
})
export class CrmModule {}
