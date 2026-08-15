import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { DossiersService } from './dossiers.service';
import { CreateDossierDto } from './dto/create-dossier.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { FilterDossierDto } from './dto/filter-dossier.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

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
    @Query() pagination: PaginationDto,
    @Query() filters: FilterDossierDto,
  ) {
    return this.dossiersService.findAll(
      pagination.page,
      pagination.limit,
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
