import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  ApplyCustomerDepositDto,
  CreateCustomerDepositDto,
} from './dto/finance.dto';
import { CustomerDepositsService } from './customer-deposits.service';

@Controller('finance/customer-deposits')
export class CustomerDepositsController {
  constructor(private readonly deposits: CustomerDepositsService) {}

  @Get()
  @RequirePermission(Permission.PAYMENTS_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('clientId') clientId?: string,
    @Query('dossierId') dossierId?: string,
  ) {
    return this.deposits.findAll(
      user.organizationId,
      Number(page),
      Number(limit),
      clientId,
      dossierId,
    );
  }

  @Get(':id')
  @RequirePermission(Permission.PAYMENTS_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.deposits.findOne(id, user.organizationId);
  }

  @Post()
  @RequirePermission(Permission.PAYMENTS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDepositDto,
  ) {
    if (!user.permissions.includes(Permission.PAYMENTS_CONFIRM))
      throw new ForbiddenException(
        'La validation de cet encaissement requiert le droit de confirmation des paiements.',
      );
    return this.deposits.create(user.organizationId, dto, user.id);
  }

  @Post(':id/apply')
  @RequirePermission(Permission.PAYMENTS_WRITE)
  apply(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApplyCustomerDepositDto,
  ) {
    if (
      dto.treasuryAccountId &&
      !user.permissions.includes(Permission.PAYMENTS_CONFIRM)
    )
      throw new ForbiddenException(
        'Le rapprochement historique requiert le droit de confirmation des paiements.',
      );
    return this.deposits.apply(id, user.organizationId, dto, user.id);
  }
}
