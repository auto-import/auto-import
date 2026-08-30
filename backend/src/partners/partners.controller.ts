import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PartnersService } from './partners.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { FilterPartnerDto } from './dto/filter-partner.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateSupplierBankDto,
  UpdateSupplierBankDto,
  ArchiveSupplierBankDto,
  CreateSupplierContactDto,
  CreateSupplierIncidentDto,
  LinkSupplierDossierDto,
  ResolveSupplierIncidentDto,
  TransitionSupplierDto,
  UpdateSupplierScoreDto,
} from './dto/supplier-v2.dto';

@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Post()
  @RequirePermission(Permission.PARTNERS_WRITE)
  create(
    @Body() dto: CreatePartnerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.create(dto, user.organizationId, user.id);
  }

  @Get()
  @RequirePermission(Permission.PARTNERS_READ)
  findAll(
    @Query() query: FilterPartnerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.findAll(user.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.PARTNERS_READ)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission(Permission.PARTNERS_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartnerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.update(id, user.organizationId, dto);
  }

  @Delete(':id')
  @RequirePermission(Permission.PARTNERS_WRITE)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.remove(id, user.organizationId);
  }

  @Post(':id/status')
  @RequirePermission(Permission.SUPPLIERS_VERIFY)
  transitionSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionSupplierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.transitionSupplier(
      id,
      user.organizationId,
      user.id,
      dto,
    );
  }

  @Post(':id/contacts')
  @RequirePermission(Permission.PARTNERS_WRITE)
  addContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSupplierContactDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.addContact(
      id,
      user.organizationId,
      user.id,
      dto,
    );
  }

  @Get(':id/bank-accounts')
  @RequirePermission(Permission.SUPPLIERS_BANK_METADATA)
  bankAccounts(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.listBankAccounts(id, user.organizationId);
  }

  @Post(':id/bank-accounts')
  @RequirePermission(Permission.SUPPLIERS_BANK_WRITE)
  createBankAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSupplierBankDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.createBankAccount(
      id,
      user.organizationId,
      user.id,
      dto,
    );
  }

  @Patch(':id/bank-accounts/:bankId')
  @RequirePermission(Permission.SUPPLIERS_BANK_WRITE)
  updateBankAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bankId', ParseUUIDPipe) bankId: string,
    @Body() dto: UpdateSupplierBankDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.updateBankAccount(
      id,
      bankId,
      user.organizationId,
      user.id,
      dto,
    );
  }

  @Delete(':id/bank-accounts/:bankId')
  @RequirePermission(Permission.SUPPLIERS_BANK_WRITE)
  archiveBankAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bankId', ParseUUIDPipe) bankId: string,
    @Body() dto: ArchiveSupplierBankDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.archiveBankAccount(
      id,
      bankId,
      user.organizationId,
      user.id,
      dto.reason,
    );
  }

  @Get(':id/bank-accounts/:bankId/reveal')
  @RequirePermission(Permission.SUPPLIERS_BANK_REVEAL)
  revealBankAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bankId', ParseUUIDPipe) bankId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.revealBankAccount(
      id,
      bankId,
      user.organizationId,
      user.id,
    );
  }

  @Post(':id/incidents')
  @RequirePermission(Permission.SUPPLIERS_INCIDENTS_MANAGE)
  addIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSupplierIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.addIncident(
      id,
      user.organizationId,
      user.id,
      dto,
    );
  }

  @Post(':id/incidents/:incidentId/resolve')
  @RequirePermission(Permission.SUPPLIERS_INCIDENTS_MANAGE)
  resolveIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: ResolveSupplierIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.resolveIncident(
      id,
      incidentId,
      user.organizationId,
      user.id,
      dto,
    );
  }

  @Patch(':id/score')
  @RequirePermission(Permission.SUPPLIERS_SCORE_MANAGE)
  updateScore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierScoreDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.updateScore(
      id,
      user.organizationId,
      user.id,
      dto,
    );
  }

  @Post(':id/dossiers')
  @RequirePermission(Permission.PARTNERS_WRITE)
  linkDossier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkSupplierDossierDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.linkDossier(
      id,
      user.organizationId,
      user.id,
      dto,
    );
  }
}
