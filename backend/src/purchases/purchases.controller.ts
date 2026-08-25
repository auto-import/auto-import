import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import { IsOptional, IsString } from 'class-validator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PurchasesService } from './purchases.service';

class FilterPurchasesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  status?: string;
}

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  @RequirePermission(Permission.PURCHASES_READ)
  findAll(
    @Query() query: FilterPurchasesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchases.findAll(
      user.organizationId,
      query.page,
      query.limit,
      query.status,
    );
  }

  @Get(':id')
  @RequirePermission(Permission.PURCHASES_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.purchases.findOne(id, user.organizationId);
  }

  @Patch(':id/cancel')
  @RequirePermission(Permission.PURCHASES_WRITE)
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.purchases.cancel(id, user.organizationId);
  }
}
