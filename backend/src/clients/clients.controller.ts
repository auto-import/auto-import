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
import { ClientsService } from './clients.service';
import { UpdateClientDto } from './dto/update-client.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateClientDto } from './dto/create-client.dto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Permission } from '@auto-import/contracts';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @RequirePermission(Permission.CLIENTS_WRITE)
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.create(dto, user.organizationId, user.id);
  }

  @Get()
  @RequirePermission('clients:read')
  findAll(
    @Query() pagination: PaginationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.findAll(
      user.organizationId,
      pagination.page,
      pagination.limit,
      pagination,
    );
  }

  @Get(':id')
  @RequirePermission('clients:read')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.findOne(id, user.organizationId);
  }

  @Get(':id/dossiers')
  @RequirePermission('clients:read')
  getDossiers(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.getDossiers(id, user.organizationId);
  }

  @Get(':id/orders')
  @RequirePermission('clients:read')
  getOrders(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.getOrders(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission('clients:write')
  update(
    @Param('id') id: string,
    @Body() updateClientDto: UpdateClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.update(id, user.organizationId, updateClientDto);
  }

  @Delete(':id')
  @RequirePermission('clients:write')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.remove(id, user.organizationId);
  }
}
