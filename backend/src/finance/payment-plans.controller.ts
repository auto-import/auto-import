import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CreatePaymentPlanDto, FilterPaymentPlansDto } from './dto/finance.dto';
import { PaymentPlansService } from './payment-plans.service';

@Controller('finance/payment-plans')
export class PaymentPlansController {
  constructor(private readonly paymentPlans: PaymentPlansService) {}

  @Get()
  @RequirePermission(Permission.PAYMENT_PLANS_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FilterPaymentPlansDto,
  ) {
    return this.paymentPlans.findAll(user.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.PAYMENT_PLANS_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentPlans.findOne(id, user.organizationId);
  }

  @Post()
  @RequirePermission(Permission.PAYMENT_PLANS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentPlanDto,
  ) {
    return this.paymentPlans.create(user.organizationId, dto);
  }
}
