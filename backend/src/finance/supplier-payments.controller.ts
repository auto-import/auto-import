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
  CreateSupplierPaymentDto,
  FilterSupplierPaymentsDto,
  ReverseSupplierPaymentDto,
} from './dto/finance.dto';
import { SupplierPaymentsService } from './supplier-payments.service';

@Controller('finance/supplier-payments')
export class SupplierPaymentsController {
  constructor(private readonly supplierPayments: SupplierPaymentsService) {}

  @Get()
  @RequirePermission(Permission.SUPPLIER_PAYMENTS_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FilterSupplierPaymentsDto,
  ) {
    return this.supplierPayments.findAll(user.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.SUPPLIER_PAYMENTS_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.supplierPayments.findOne(id, user.organizationId);
  }

  @Post()
  @RequirePermission(Permission.SUPPLIER_PAYMENTS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSupplierPaymentDto,
  ) {
    return this.supplierPayments.create(user.organizationId, user.id, dto);
  }

  @Post(':id/confirm')
  @RequirePermission(Permission.SUPPLIER_PAYMENTS_CONFIRM)
  confirm(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.supplierPayments.confirm(id, user.organizationId, user.id);
  }

  @Post(':id/reverse')
  @RequirePermission(Permission.SUPPLIER_PAYMENTS_REVERSE)
  reverse(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReverseSupplierPaymentDto,
  ) {
    return this.supplierPayments.reverse(id, user.organizationId, user.id, dto);
  }
}
