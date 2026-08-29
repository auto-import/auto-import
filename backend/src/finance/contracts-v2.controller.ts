import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ContractsV2Service } from './contracts-v2.service';
import {
  CreateContractCollectionDto,
  CreateContractDto,
  SignContractDto,
} from './dto/contracts-v2.dto';

@Controller('contracts')
export class ContractsV2Controller {
  constructor(private readonly contracts: ContractsV2Service) {}

  @Get()
  @RequirePermission(Permission.CONTRACTS_READ)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.contracts.findAll(user.organizationId);
  }

  @Get(':id')
  @RequirePermission(Permission.CONTRACTS_READ)
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.contracts.findOne(id, user.organizationId);
  }

  @Post()
  @RequirePermission(Permission.CONTRACTS_WRITE)
  create(
    @Body() dto: CreateContractDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contracts.create(user.organizationId, user.id, dto);
  }

  @Post(':id/sign')
  @RequirePermission(Permission.CONTRACTS_SIGN)
  sign(
    @Param('id') id: string,
    @Body() dto: SignContractDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contracts.sign(id, user.organizationId, user.id, dto);
  }

  @Post(':id/collections')
  @RequirePermission(Permission.PAYMENTS_WRITE)
  collect(
    @Param('id') id: string,
    @Body() dto: CreateContractCollectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.contracts.collect(id, user.organizationId, user.id, dto);
  }
}
