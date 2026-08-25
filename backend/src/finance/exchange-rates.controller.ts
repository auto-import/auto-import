import {
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  CreateExchangeRateDto,
  FilterExchangeRatesDto,
} from './dto/finance.dto';
import { ExchangeRatesService } from './exchange-rates.service';

@Controller('finance/exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly exchangeRates: ExchangeRatesService) {}

  @Get()
  @RequirePermission(Permission.EXCHANGE_RATES_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FilterExchangeRatesDto,
  ) {
    return this.exchangeRates.findAll(user.organizationId, query);
  }

  @Get('effective')
  @RequirePermission(Permission.EXCHANGE_RATES_READ)
  async getEffectiveRate(
    @CurrentUser() user: AuthenticatedUser,
    @Query('baseCurrency') baseCurrency: string,
    @Query('quoteCurrency') quoteCurrency: string,
    @Query('date') date?: string,
  ) {
    const rate = await this.exchangeRates.findEffectiveRate(
      user.organizationId,
      baseCurrency || 'DZD',
      quoteCurrency || 'USD',
      date ? new Date(date) : undefined,
    );
    return { baseCurrency, quoteCurrency, rate: rate.toString() };
  }

  @Post()
  @RequirePermission(Permission.EXCHANGE_RATES_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExchangeRateDto,
  ) {
    return this.exchangeRates.create(user.organizationId, user.id, dto);
  }
}
