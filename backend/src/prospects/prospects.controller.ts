import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ProspectsService } from './prospects.service';
import { CreateProspectDto } from './dto/create-prospect.dto';
import { UpdateProspectDto } from './dto/update-prospect.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ConvertProspectDto } from './dto/convert-prospect.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permission } from '@auto-import/contracts';
import { FilterProspectDto } from './dto/filter-prospect.dto';
import type { AuthenticatedUser } from '../auth/auth.types';

@Controller('prospects')
export class ProspectsController {
  constructor(private readonly prospectsService: ProspectsService) {}

  @Post()
  @RequirePermission(Permission.PROSPECTS_WRITE)
  create(
    @Body() createProspectDto: CreateProspectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prospectsService.create(
      createProspectDto,
      user.id,
      user.organizationId,
    );
  }

  @Get()
  @RequirePermission(Permission.PROSPECTS_READ)
  findAll(
    @Query() filters: FilterProspectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prospectsService.findAll(
      user.organizationId,
      filters.page,
      filters.limit,
      filters,
    );
  }

  @Get(':id')
  @RequirePermission(Permission.PROSPECTS_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.prospectsService.findOne(id, user.organizationId);
  }

  @Get(':id/activities')
  @RequirePermission(Permission.PROSPECTS_READ)
  getActivities(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prospectsService.getActivities(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission(Permission.PROSPECTS_WRITE)
  update(
    @Param('id') id: string,
    @Body() updateProspectDto: UpdateProspectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prospectsService.update(
      id,
      user.organizationId,
      updateProspectDto,
      user.id,
    );
  }

  @Post(':id/activities')
  @RequirePermission(Permission.PROSPECTS_WRITE)
  addActivity(
    @Param('id') prospectId: string,
    @Body() createActivityDto: CreateActivityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prospectsService.addActivity(
      { ...createActivityDto, prospectId },
      user.id,
      user.organizationId,
    );
  }

  @Post(':id/convert')
  @RequirePermission(Permission.PROSPECTS_WRITE)
  convertToClient(
    @Param('id') id: string,
    @Body() convertProspectDto: ConvertProspectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prospectsService.convertToClient(
      id,
      convertProspectDto,
      user.id,
      user.organizationId,
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.PROSPECTS_WRITE)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.prospectsService.remove(id, user.organizationId);
  }
}
