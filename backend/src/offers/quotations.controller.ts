import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  CreateQuotationDto,
  FilterQuotationDto,
  ReviseQuotationDto,
  TransitionQuotationDto,
} from './dto/quotation.dto';
import { QuotationsService } from './quotations.service';

@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Get()
  @RequirePermission(Permission.OFFERS_READ)
  findAll(
    @Query() query: FilterQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotations.findAll(user.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.OFFERS_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.quotations.findOne(id, user.organizationId);
  }

  @Post()
  @RequirePermission(Permission.OFFERS_WRITE)
  create(
    @Body() dto: CreateQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotations.create(user.organizationId, user.id, dto);
  }

  @Post(':id/revisions')
  @RequirePermission(Permission.OFFERS_WRITE)
  revise(
    @Param('id') id: string,
    @Body() dto: ReviseQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotations.revise(id, user.organizationId, user.id, dto);
  }

  @Post(':id/status')
  @RequirePermission(Permission.OFFERS_WRITE)
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotations.transition(
      id,
      user.organizationId,
      user.id,
      dto,
    );
  }
}
