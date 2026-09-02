import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientsService } from './clients.service';
import { UpdateClientDto } from './dto/update-client.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateClientDto } from './dto/create-client.dto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Permission } from '@auto-import/contracts';
import type { UploadedBufferFile } from '../documents/documents.service';
import { ArchiveClientDto } from './dto/archive-client.dto';
import { FilterClientDto } from './dto/filter-client.dto';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @RequirePermission(Permission.CLIENTS_WRITE)
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.create(
      dto,
      user.organizationId,
      user.id,
      user.permissions.includes(Permission.CLIENTS_IDENTITY_WRITE),
    );
  }

  @Post('with-passport')
  @RequirePermission(Permission.CLIENTS_IDENTITY_WRITE)
  @UseInterceptors(
    FileInterceptor('passportScan', { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  createWithPassport(
    @Body() dto: CreateClientDto,
    @UploadedFile() passportScan: UploadedBufferFile,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.createWithPassport(
      dto,
      user.organizationId,
      user.id,
      passportScan,
    );
  }

  @Post('with-identity-document')
  @RequirePermission(Permission.CLIENTS_IDENTITY_WRITE)
  @UseInterceptors(
    FileInterceptor('identityDocument', {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  createWithIdentityDocument(
    @Body() dto: CreateClientDto,
    @UploadedFile() identityDocument: UploadedBufferFile,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.createWithIdentityDocument(
      dto,
      user.organizationId,
      user.id,
      identityDocument,
    );
  }

  @Get()
  @RequirePermission('clients:read')
  findAll(
    @Query() pagination: FilterClientDto,
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
    return this.clientsService.findOne(
      id,
      user.organizationId,
      user.permissions,
    );
  }

  @Post(':id/identity-document')
  @RequirePermission(Permission.CLIENTS_IDENTITY_WRITE)
  @UseInterceptors(
    FileInterceptor('identityDocument', {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  attachIdentityDocument(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @UploadedFile() identityDocument: UploadedBufferFile,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.attachIdentityDocument(
      id,
      dto,
      user.organizationId,
      user.id,
      identityDocument,
    );
  }

  @Get(':id/identity')
  @RequirePermission(Permission.CLIENTS_IDENTITY_REVEAL)
  revealIdentity(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.revealIdentity(id, user.organizationId, user.id);
  }

  @Get(':id/dossiers')
  @RequirePermission(Permission.DOSSIERS_READ)
  getDossiers(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.getDossiers(id, user.organizationId);
  }

  @Get(':id/orders')
  @RequirePermission(Permission.ORDERS_READ)
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
    return this.clientsService.update(
      id,
      user.organizationId,
      updateClientDto,
      user.id,
      user.permissions.includes(Permission.CLIENTS_IDENTITY_WRITE),
    );
  }

  @Post(':id/archive')
  @RequirePermission(Permission.CLIENTS_ARCHIVE)
  archive(
    @Param('id') id: string,
    @Body() dto: ArchiveClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.remove(
      id,
      user.organizationId,
      user.id,
      dto.reason ?? 'Archived through CRM action',
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.CLIENTS_ARCHIVE)
  remove(
    @Param('id') id: string,
    @Body() dto: ArchiveClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.remove(
      id,
      user.organizationId,
      user.id,
      dto.reason ?? 'Archived through legacy DELETE endpoint',
    );
  }
}
