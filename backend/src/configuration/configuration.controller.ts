import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  CreateLookupValueDto,
  LookupQueryDto,
  UpdateInsuranceRateDto,
  UpdateLookupValueDto,
  UpsertDeliveryRateDto,
  UpsertDutyRateDto,
} from './configuration.dto';
import { ConfigurationService } from './configuration.service';

@Controller()
export class ConfigurationController {
  constructor(private readonly configuration: ConfigurationService) {}

  @Get('vehicle-lookups')
  @RequirePermission(Permission.VEHICLES_READ)
  lookups(@CurrentUser() user: AuthenticatedUser, @Query() query: LookupQueryDto) {
    return this.configuration.listLookups(user.organizationId, query);
  }

  @Post('vehicle-lookups')
  @RequirePermission(Permission.VEHICLES_WRITE)
  createLookup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLookupValueDto,
  ) {
    return this.configuration.createLookup(user.organizationId, user.id, dto);
  }

  @Patch('vehicle-lookups/:id')
  @RequirePermission(Permission.VEHICLES_WRITE)
  updateLookup(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateLookupValueDto,
  ) {
    return this.configuration.updateLookup(id, user.organizationId, dto);
  }

  @Get('container-presets')
  @RequirePermission(Permission.SHIPMENTS_READ)
  presets(@CurrentUser() user: AuthenticatedUser) {
    return this.configuration.containerPresets(user.organizationId);
  }

  @Get('pricing-settings')
  @RequirePermission(Permission.SETTINGS_READ)
  pricing(@CurrentUser() user: AuthenticatedUser) {
    return this.configuration.pricingSettings(user.organizationId);
  }

  @Put('pricing-settings/insurance')
  @RequirePermission(Permission.SETTINGS_WRITE)
  insurance(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateInsuranceRateDto,
  ) {
    return this.configuration.updateInsurance(user.organizationId, dto);
  }

  @Put('pricing-settings/duties')
  @RequirePermission(Permission.SETTINGS_WRITE)
  duty(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertDutyRateDto) {
    return this.configuration.upsertDuty(user.organizationId, dto);
  }

  @Put('pricing-settings/delivery')
  @RequirePermission(Permission.SETTINGS_WRITE)
  delivery(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertDeliveryRateDto,
  ) {
    return this.configuration.upsertDelivery(user.organizationId, dto);
  }
}
