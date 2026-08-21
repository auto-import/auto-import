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
import { DossiersService } from './dossiers.service';
import { CreateDossierDto } from './dto/create-dossier.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { AdvanceStatusDto } from './dto/advance-status.dto';
import { FilterDossierDto } from './dto/filter-dossier.dto';
import { AddDossierVehicleDto } from './dto/add-dossier-vehicle.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('dossiers')
export class DossiersController {
  constructor(private readonly dossiersService: DossiersService) {}

  @Post()
  @RequirePermission('dossiers:write')
  create(@Body() createDossierDto: CreateDossierDto, @CurrentUser() user: any) {
    return this.dossiersService.create(
      createDossierDto,
      user.id,
      user.organizationId,
    );
  }

  @Get()
  @RequirePermission('dossiers:read')
  findAll(@Query() filters: FilterDossierDto, @CurrentUser() user: any) {
    return this.dossiersService.findAll(
      user.organizationId,
      filters.page,
      filters.limit,
      filters,
    );
  }

  @Get('statistics')
  @RequirePermission('dossiers:read')
  getStatistics(@CurrentUser() user: any) {
    return this.dossiersService.getStatistics(user.organizationId);
  }

  @Get(':id')
  @RequirePermission('dossiers:read')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.dossiersService.findOne(id, user.organizationId);
  }

  @Get(':id/history')
  @RequirePermission('dossiers:read')
  getHistory(@Param('id') id: string, @CurrentUser() user: any) {
    return this.dossiersService.getHistory(id, user.organizationId);
  }

  @Get(':id/vehicles')
  @RequirePermission('dossiers:read')
  getVehicles(@Param('id') id: string, @CurrentUser() user: any) {
    return this.dossiersService.getVehicles(id, user.organizationId);
  }

  @Get(':id/allowed-transitions')
  @RequirePermission('dossiers:read')
  getAllowedTransitions(@Param('id') id: string, @CurrentUser() user: any) {
    return this.dossiersService.getAllowedTransitions(id, user.organizationId);
  }

  @Post(':id/advance-status')
  @RequirePermission('dossiers:write')
  advanceStatus(
    @Param('id') id: string,
    @Body() advanceStatusDto: AdvanceStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.dossiersService.advanceStatus(
      id,
      advanceStatusDto.comment,
      user.id,
      user.organizationId,
    );
  }

  @Post(':id/vehicles')
  @RequirePermission('dossiers:write')
  addVehicle(
    @Param('id') id: string,
    @Body() addVehicleDto: AddDossierVehicleDto,
    @CurrentUser() user: any,
  ) {
    return this.dossiersService.addVehicle(
      id,
      addVehicleDto.vehicleId,
      user.organizationId,
      user.id,
    );
  }

  @Delete(':id/vehicles/:vehicleId')
  @RequirePermission('dossiers:write')
  removeVehicle(
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: any,
  ) {
    return this.dossiersService.removeVehicle(
      id,
      vehicleId,
      user.organizationId,
      user.id,
    );
  }

  @Patch(':id/status')
  @RequirePermission('dossiers:write')
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.dossiersService.updateStatus(
      id,
      updateStatusDto,
      user.id,
      user.organizationId,
    );
  }
}
