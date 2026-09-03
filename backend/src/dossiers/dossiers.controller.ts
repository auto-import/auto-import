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
import { UpdateStatusDto, UpgradeDossierDto } from './dto/update-status.dto';
import { AdvanceStatusDto } from './dto/advance-status.dto';
import { FilterDossierDto } from './dto/filter-dossier.dto';
import { AddDossierVehicleDto } from './dto/add-dossier-vehicle.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Permission } from '@auto-import/contracts';
import { UpdateDossierDto } from './dto/update-dossier.dto';

@Controller('dossiers')
export class DossiersController {
  constructor(private readonly dossiersService: DossiersService) {}

  @Post()
  @RequirePermission(Permission.DOSSIERS_WRITE)
  create(
    @Body() createDossierDto: CreateDossierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dossiersService.create(
      createDossierDto,
      user.id,
      user.organizationId,
    );
  }

  @Get()
  @RequirePermission(Permission.DOSSIERS_READ)
  findAll(
    @Query() filters: FilterDossierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dossiersService.findAll(
      user.organizationId,
      filters.page,
      filters.limit,
      filters,
    );
  }

  @Get('statistics')
  @RequirePermission(Permission.DOSSIERS_READ)
  getStatistics(@CurrentUser() user: AuthenticatedUser) {
    return this.dossiersService.getStatistics(user.organizationId);
  }

  @Get(':id')
  @RequirePermission(Permission.DOSSIERS_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.dossiersService.findOne(id, user.organizationId);
  }

  @Get(':id/history')
  @RequirePermission(Permission.DOSSIERS_READ)
  getHistory(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.dossiersService.getHistory(id, user.organizationId);
  }

  @Get(':id/vehicles')
  @RequirePermission(Permission.DOSSIERS_READ)
  getVehicles(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.dossiersService.getVehicles(id, user.organizationId);
  }

  @Get(':id/allowed-transitions')
  @RequirePermission(Permission.DOSSIERS_READ)
  getAllowedTransitions(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dossiersService.getAllowedTransitions(id, user.organizationId);
  }

  @Post(':id/advance-status')
  @RequirePermission(Permission.DOSSIERS_WRITE)
  advanceStatus(
    @Param('id') id: string,
    @Body() advanceStatusDto: AdvanceStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dossiersService.advanceStatus(
      id,
      advanceStatusDto.comment,
      user.id,
      user.organizationId,
    );
  }

  @Post(':id/vehicles')
  @RequirePermission(Permission.DOSSIERS_WRITE)
  addVehicle(
    @Param('id') id: string,
    @Body() addVehicleDto: AddDossierVehicleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dossiersService.addVehicle(
      id,
      addVehicleDto.vehicleId,
      user.organizationId,
      user.id,
    );
  }

  @Delete(':id/vehicles/:vehicleId')
  @RequirePermission(Permission.DOSSIERS_WRITE)
  removeVehicle(
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dossiersService.removeVehicle(
      id,
      vehicleId,
      user.organizationId,
      user.id,
    );
  }

  @Patch(':id/status')
  @RequirePermission(Permission.DOSSIERS_WRITE)
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dossiersService.updateStatus(
      id,
      updateStatusDto,
      user.id,
      user.organizationId,
    );
  }

  @Patch(':id')
  @RequirePermission(Permission.DOSSIERS_WRITE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDossierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dossiersService.update(id, dto, user.id, user.organizationId);
  }

  @Post(':id/upgrade-to-ddp')
  @RequirePermission(Permission.DOSSIERS_WRITE)
  upgradeToDdp(
    @Param('id') id: string,
    @Body() dto: UpgradeDossierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dossiersService.upgradeToDdp(
      id,
      dto.reason,
      user.id,
      user.organizationId,
    );
  }
}
