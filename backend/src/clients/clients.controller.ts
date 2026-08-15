import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { UpdateClientDto } from './dto/update-client.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @RequirePermission('clients:read')
  findAll(
    @Query() pagination: PaginationDto,
    @Query() filters?: any,
  ) {
    return this.clientsService.findAll(
      pagination.page,
      pagination.limit,
      filters,
    );
  }

  @Get(':id')
  @RequirePermission('clients:read')
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @Get(':id/dossiers')
  @RequirePermission('clients:read')
  getDossiers(@Param('id') id: string) {
    return this.clientsService.getDossiers(id);
  }

  @Get(':id/orders')
  @RequirePermission('clients:read')
  getOrders(@Param('id') id: string) {
    return this.clientsService.getOrders(id);
  }

  @Patch(':id')
  @RequirePermission('clients:write')
  update(
    @Param('id') id: string,
    @Body() updateClientDto: UpdateClientDto,
  ) {
    return this.clientsService.update(id, updateClientDto);
  }

  @Delete(':id')
  @RequirePermission('clients:write')
  remove(@Param('id') id: string) {
    return this.clientsService.remove(id);
  }
}
