import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  CreateOfferDto,
  FilterOfferDto,
  MaterializeOfferDto,
  ReleaseOfferDto,
  ReserveOfferDto,
  UpdateOfferDto,
} from './dto/offer.dto';
import { OffersService } from './offers.service';

@Controller('offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get('statistics')
  @RequirePermission(Permission.OFFERS_READ)
  statistics(@CurrentUser() user: AuthenticatedUser) {
    return this.offers.statistics(user.organizationId);
  }

  @Post()
  @RequirePermission(Permission.OFFERS_WRITE)
  create(@Body() dto: CreateOfferDto, @CurrentUser() user: AuthenticatedUser) {
    return this.offers.create(dto, user.organizationId);
  }

  @Get()
  @RequirePermission(Permission.OFFERS_READ)
  findAll(
    @Query() query: FilterOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offers.findAll(user.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.OFFERS_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.offers.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission(Permission.OFFERS_WRITE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offers.update(id, dto, user.organizationId);
  }

  @Delete(':id')
  @RequirePermission(Permission.OFFERS_WRITE)
  archive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.offers.archive(id, user.organizationId);
  }

  @Post(':id/reservations')
  @RequirePermission(Permission.OFFERS_WRITE)
  reserve(
    @Param('id') id: string,
    @Body() dto: ReserveOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offers.reserve(id, dto, user.id, user.organizationId);
  }

  @Post('reservations/:id/release')
  @RequirePermission(Permission.OFFERS_WRITE)
  release(
    @Param('id') id: string,
    @Body() dto: ReleaseOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offers.release(id, dto.reason, user.organizationId);
  }

  @Post('reservations/:id/materialize')
  @RequirePermission(Permission.PURCHASES_WRITE)
  materialize(
    @Param('id') id: string,
    @Body() dto: MaterializeOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offers.materialize(id, dto, user.id, user.organizationId);
  }
}
