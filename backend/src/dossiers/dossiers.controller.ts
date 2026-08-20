import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { DossiersService } from './dossiers.service';
import { CreateDossierDto } from './dto/create-dossier.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { FilterDossierDto } from './dto/filter-dossier.dto';
import { AddDossierVehicleDto } from './dto/add-dossier-vehicle.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('dossiers')
export class DossiersController {
  constructor(private readonly dossiersService: DossiersService) {}

  @Post()
  @RequirePermission('dossiers:write')
  create(
    @Body() createDossierDto: CreateDossierDto,
    @CurrentUser() user: any,
  ) {
    return this.dossiersService.create(createDossierDto, user.id);
  }

  @Get()
  @RequirePermission('dossiers:read')
  findAll(
    @Query() filters: FilterDossierDto,
  ) {
    return this.dossiersService.findAll(
      filters.page,
      filters.limit,
      filters,
    );
  }

  @Get('statistics')
  @RequirePermission('dossiers:read')
  getStatistics() {
    return this.dossiersService.getStatistics();
  }

  @Get(':id')
  @RequirePermission('dossiers:read')
  findOne(@Param('id') id: string) {
    return this.dossiersService.findOne(id);
  }

  @Get(':id/history')
  @RequirePermission('dossiers:read')
  getHistory(@Param('id') id: string) {
    return this.dossiersService.getHistory(id);
  }

  @Get(':id/vehicles')
  @RequirePermission('dossiers:read')
  getVehicles(@Param('id') id: string) {
    return this.dossiersService.getVehicles(id);
  }

  @Post(':id/vehicles')
  @RequirePermission('dossiers:write')
  addVehicle(
    @Param('id') id: string,
    @Body() addVehicleDto: AddDossierVehicleDto,
    @CurrentUser() user: any,
  ) {
    return this.dossiersService.addVehicle(id, addVehicleDto.vehicleId, user.id);
  }

  @Delete(':id/vehicles/:vehicleId')
  @RequirePermission('dossiers:write')
  removeVehicle(
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: any,
  ) {
    return this.dossiersService.removeVehicle(id, vehicleId, user.id);
  }

  @Patch(':id/status')
  @RequirePermission('dossiers:write')
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.dossiersService.updateStatus(id, updateStatusDto, user.id);
  }
}
