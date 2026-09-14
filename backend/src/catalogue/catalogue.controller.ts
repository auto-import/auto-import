import { Controller, Get, Param, Query } from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CatalogueService } from './catalogue.service';
import { FilterCatalogueDto } from './dto/filter-catalogue.dto';

@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get()
  @RequirePermission(Permission.VEHICLES_READ)
  async findAll(
    @Query() filters: FilterCatalogueDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.catalogue.findAll(user.organizationId, filters);
    return {
      ...result,
      items: result.items.map((item) => this.visible(item, user)),
    };
  }

  @Get('suppliers')
  @RequirePermission(Permission.VEHICLES_READ)
  suppliers(@CurrentUser() user: AuthenticatedUser) {
    return this.catalogue.suppliers(user.organizationId);
  }

  @Get(':id')
  @RequirePermission(Permission.VEHICLES_READ)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.visible(
      await this.catalogue.findOne(id, user.organizationId),
      user,
    );
  }

  private visible(
    item: Awaited<ReturnType<CatalogueService['findOne']>>,
    user: AuthenticatedUser,
  ) {
    if (user.permissions.includes(Permission.FINANCE_READ)) return item;
    const commercial = (price: typeof item.pricing.cif) =>
      price
        ? {
            quotationId: price.quotationId,
            quotationNumber: price.quotationNumber,
            priceBasis: price.priceBasis,
            sellingPriceDzd: price.sellingPriceDzd,
          }
        : null;
    return {
      ...item,
      pricing: {
        cif: commercial(item.pricing.cif),
        ddp: commercial(item.pricing.ddp),
      },
    };
  }
}
