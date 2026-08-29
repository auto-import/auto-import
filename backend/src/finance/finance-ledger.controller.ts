import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  CreateTreasuryAccountDto,
  ReverseFinanceTransactionDto,
} from './dto/contracts-v2.dto';
import { FinanceLedgerService } from './finance-ledger.service';

@Controller('finance')
export class FinanceLedgerController {
  constructor(private readonly ledger: FinanceLedgerService) {}

  @Get('transactions')
  @RequirePermission(Permission.FINANCE_READ)
  transactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.ledger.transactions(user.organizationId, status);
  }

  @Post('transactions/:id/reverse')
  @RequirePermission(Permission.FINANCE_REVERSE)
  reverse(
    @Param('id') id: string,
    @Body() dto: ReverseFinanceTransactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ledger.reverse(id, user.organizationId, user.id, dto);
  }

  @Get('treasury/accounts')
  @RequirePermission(Permission.TREASURY_READ)
  accounts(@CurrentUser() user: AuthenticatedUser) {
    return this.ledger.accounts(user.organizationId);
  }

  @Post('treasury/accounts')
  @RequirePermission(Permission.TREASURY_WRITE)
  createAccount(
    @Body() dto: CreateTreasuryAccountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ledger.createAccount(user.organizationId, dto);
  }
}
