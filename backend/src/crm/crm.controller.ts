import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Permission } from '@auto-import/contracts';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CrmTimelineService } from './crm-timeline.service';
import { CrmKpiService } from './crm-kpi.service';
import { CrmReferenceService } from './crm-reference.service';
import { UpdateCrmReferenceDto } from './dto/crm-reference.dto';

class TimelineQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;
}

class CreateNoteDto {
  @IsIn(['prospect', 'client'])
  ownerType: 'prospect' | 'client';

  @IsUUID()
  ownerId: string;

  @IsString()
  content: string;
}

class KpiQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsUUID()
  agentId?: string;
}

@Controller('crm')
export class CrmController {
  constructor(
    private readonly timeline: CrmTimelineService,
    private readonly kpis: CrmKpiService,
    private readonly references: CrmReferenceService,
  ) {}

  @Get('reference-data')
  @RequirePermission(Permission.CRM_REFERENCE_READ)
  getReferenceData(@CurrentUser() user: AuthenticatedUser) {
    return this.references.list(user.organizationId);
  }

  @Patch('reference-data/:id')
  @RequirePermission(Permission.CRM_REFERENCE_MANAGE)
  updateReferenceData(
    @Param('id') id: string,
    @Body() dto: UpdateCrmReferenceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.references.update(user.organizationId, id, dto, user.id);
  }

  @Get('timeline/:ownerType/:id')
  @RequirePermission(Permission.CRM_TIMELINE_READ)
  getTimeline(
    @Param('ownerType') ownerType: 'prospect' | 'client',
    @Param('id') id: string,
    @Query() query: TimelineQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timeline.getTimeline(
      user.organizationId,
      ownerType,
      id,
      query.cursor,
      query.limit,
    );
  }

  @Post('notes')
  @RequirePermission(Permission.CRM_TIMELINE_WRITE)
  addNote(@Body() dto: CreateNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.timeline.addNote(
      user.organizationId,
      user.id,
      dto.ownerType,
      dto.ownerId,
      dto.content,
    );
  }

  @Get('kpis')
  @RequirePermission(Permission.CRM_KPI_OWN)
  getKpis(@Query() query: KpiQueryDto, @CurrentUser() user: AuthenticatedUser) {
    const canViewOrganization = user.permissions.includes(
      Permission.CRM_KPI_ORGANIZATION,
    );
    const agentId = canViewOrganization ? query.agentId : user.id;
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return this.kpis.calculate(user.organizationId, from, to, agentId);
  }
}
