import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  CreateInvoiceDto,
  FilterInvoicesDto,
  UpdateInvoiceDto,
  VoidInvoiceDto,
} from './dto/invoices.dto';
import { InvoicesService } from './invoices.service';

@Controller('finance/invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequirePermission(Permission.INVOICES_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FilterInvoicesDto,
  ) {
    return this.invoices.findAll(user.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.INVOICES_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.findOne(id, user.organizationId);
  }

  @Post()
  @RequirePermission(Permission.INVOICES_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoices.create(user.organizationId, dto);
  }

  @Put(':id')
  @RequirePermission(Permission.INVOICES_WRITE)
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoices.update(id, user.organizationId, dto);
  }

  @Post(':id/issue')
  @RequirePermission(Permission.INVOICES_ISSUE)
  issue(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.issue(id, user.organizationId);
  }

  @Post(':id/void')
  @RequirePermission(Permission.INVOICES_VOID)
  void(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VoidInvoiceDto,
  ) {
    return this.invoices.void(id, user.organizationId, dto);
  }
}
