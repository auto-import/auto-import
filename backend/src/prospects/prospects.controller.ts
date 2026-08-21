import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProspectsService } from './prospects.service';
import { CreateProspectDto } from './dto/create-prospect.dto';
import { UpdateProspectDto } from './dto/update-prospect.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ConvertProspectDto } from './dto/convert-prospect.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('prospects')
export class ProspectsController {
  constructor(private readonly prospectsService: ProspectsService) {}

  @Post()
  @RequirePermission('clients:write')
  create(
    @Body() createProspectDto: CreateProspectDto,
    @CurrentUser() user: any,
  ) {
    return this.prospectsService.create(
      createProspectDto,
      user.id,
      user.organizationId,
    );
  }

  @Get()
  @RequirePermission('clients:read')
  findAll(
    @Query() pagination: PaginationDto,
    @CurrentUser() user: any,
    @Query() filters?: any,
  ) {
    return this.prospectsService.findAll(
      user.organizationId,
      pagination.page,
      pagination.limit,
      filters,
    );
  }

  @Get(':id')
  @RequirePermission('clients:read')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.prospectsService.findOne(id, user.organizationId);
  }

  @Get(':id/activities')
  @RequirePermission('clients:read')
  getActivities(@Param('id') id: string, @CurrentUser() user: any) {
    return this.prospectsService.getActivities(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission('clients:write')
  update(
    @Param('id') id: string,
    @Body() updateProspectDto: UpdateProspectDto,
    @CurrentUser() user: any,
  ) {
    return this.prospectsService.update(
      id,
      user.organizationId,
      updateProspectDto,
    );
  }

  @Post(':id/activities')
  @RequirePermission('clients:write')
  addActivity(
    @Param('id') prospectId: string,
    @Body() createActivityDto: CreateActivityDto,
    @CurrentUser() user: any,
  ) {
    return this.prospectsService.addActivity(
      { ...createActivityDto, prospectId },
      user.id,
      user.organizationId,
    );
  }

  @Post(':id/convert')
  @RequirePermission('clients:write')
  convertToClient(
    @Param('id') id: string,
    @Body() convertProspectDto: ConvertProspectDto,
    @CurrentUser() user: any,
  ) {
    return this.prospectsService.convertToClient(
      id,
      convertProspectDto,
      user.id,
      user.organizationId,
    );
  }

  @Delete(':id')
  @RequirePermission('clients:write')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.prospectsService.remove(id, user.organizationId);
  }
}
