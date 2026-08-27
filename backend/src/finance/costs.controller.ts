import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  CreateCostDto,
  FilterCostsDto,
  ReverseCostDto,
} from './dto/finance.dto';
import { CostsService } from './costs.service';

@Controller('finance/costs')
export class CostsController {
  constructor(private readonly costs: CostsService) {}

  @Get()
  @RequirePermission(Permission.COSTS_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FilterCostsDto,
  ) {
    return this.costs.findAll(user.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.COSTS_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.costs.findOne(id, user.organizationId);
  }

  @Post()
  @RequirePermission(Permission.COSTS_WRITE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCostDto) {
    return this.costs.create(user.organizationId, user.id, dto);
  }

  @Post(':id/reverse')
  @RequirePermission(Permission.COSTS_WRITE)
  reverse(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReverseCostDto,
  ) {
    return this.costs.reverse(id, user.organizationId, user.id, dto);
  }
}
