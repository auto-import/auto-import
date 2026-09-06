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
  findAll(
    @Query() filters: FilterCatalogueDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogue.findAll(user.organizationId, filters);
  }

  @Get(':id')
  @RequirePermission(Permission.VEHICLES_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.catalogue.findOne(id, user.organizationId);
  }
}
