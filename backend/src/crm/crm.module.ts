import { Module } from '@nestjs/common';
import { ContactResolutionService } from './contact-resolution.service';
import { CrmController } from './crm.controller';
import { CrmKpiService } from './crm-kpi.service';
import { CrmTimelineService } from './crm-timeline.service';
import { CrmReferenceService } from './crm-reference.service';

@Module({
  controllers: [CrmController],
  providers: [
    ContactResolutionService,
    CrmTimelineService,
    CrmKpiService,
    CrmReferenceService,
  ],
  exports: [
    ContactResolutionService,
    CrmTimelineService,
    CrmKpiService,
    CrmReferenceService,
  ],
})
export class CrmModule {}
