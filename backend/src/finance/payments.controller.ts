import {
  Body,
  Controller,
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
  FilterPaymentsDto,
  RecordPaymentDto,
  ReversePaymentDto,
} from './dto/finance.dto';
import { PaymentsService } from './payments.service';

@Controller('finance/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermission(Permission.PAYMENTS_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FilterPaymentsDto,
  ) {
    return this.payments.findAll(user.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.PAYMENTS_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payments.findOne(id, user.organizationId);
  }

  @Post()
  @RequirePermission(Permission.PAYMENTS_WRITE)
  record(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.payments.record(user.organizationId, user.id, dto);
  }

  @Post(':id/confirm')
  @RequirePermission(Permission.PAYMENTS_CONFIRM)
  confirm(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payments.confirm(id, user.organizationId, user.id);
  }

  @Post(':id/reverse')
  @RequirePermission(Permission.PAYMENTS_REVERSE)
  reverse(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReversePaymentDto,
  ) {
    return this.payments.reverse(id, user.organizationId, dto);
  }
}
