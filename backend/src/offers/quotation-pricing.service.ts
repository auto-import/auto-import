import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExchangeRatesService } from '../finance/exchange-rates.service';
import type { QuotationAmountsDto } from './dto/quotation.dto';

export interface DzdRateSnapshot {
  currency: string;
  exchangeRateId: string | null;
  exchangeRateUsed: Prisma.Decimal;
}

export interface QuotationCostSnapshot extends DzdRateSnapshot {
  costType:
    'VEHICLE' | 'FREIGHT' | 'INSURANCE' | 'TRANSIT' | 'CUSTOMS' | 'OTHER';
  description: string;
  originalAmount: Prisma.Decimal;
  amountDzd: Prisma.Decimal;
}

@Injectable()
export class QuotationPricingService {
  constructor(private readonly exchangeRates: ExchangeRatesService) {}

  private money(value: Prisma.Decimal.Value) {
    return new Prisma.Decimal(value).toDecimalPlaces(2);
  }

  private currency(value: string) {
    return value.trim().toUpperCase();
  }

  async resolveDzdRateSnapshot(
    tx: Prisma.TransactionClient,
    organizationId: string,
    currencyValue: string,
    at: Date,
  ): Promise<DzdRateSnapshot> {
    const currency = this.currency(currencyValue);
    const snapshot = await this.exchangeRates.findActiveDzdRateSnapshot(
      tx,
      organizationId,
      currency,
      at,
    );
    return {
      currency,
      exchangeRateId: snapshot.exchangeRateId,
      exchangeRateUsed: snapshot.rate,
    };
  }

  async currentDzdRates(
    tx: Prisma.TransactionClient,
    organizationId: string,
    at: Date,
  ): Promise<DzdRateSnapshot[]> {
    return this.exchangeRates.currentActiveDzdRates(tx, organizationId, at);
  }

  async resolveRequiredRates(
    tx: Prisma.TransactionClient,
    organizationId: string,
    dto: QuotationAmountsDto,
    at: Date,
  ) {
    const requested = new Map<string, Prisma.Decimal>();
    const add = (currency: string, amount: Prisma.Decimal.Value) => {
      const normalized = this.currency(currency);
      requested.set(
        normalized,
        (requested.get(normalized) ?? new Prisma.Decimal(0)).add(amount),
      );
    };
    add(dto.vehicleCurrency, dto.vehicleAmount);
    add(dto.containerCurrency, dto.containerPrice);
    add(dto.insuranceCurrency, dto.insuranceAmount ?? 0);
    add(dto.transitCurrency, dto.transitAmount ?? 0);
    add('DZD', dto.customsAmount ?? 0);
    for (const item of dto.otherCosts ?? []) add(item.currency, item.amount);

    const rates = new Map<string, DzdRateSnapshot>();
    await Promise.all(
      [...requested.entries()].map(async ([currency, amount]) => {
        if (amount.isZero() && currency !== 'DZD') return;
        rates.set(
          currency,
          await this.resolveDzdRateSnapshot(tx, organizationId, currency, at),
        );
      }),
    );
    rates.set('DZD', {
      currency: 'DZD',
      exchangeRateId: null,
      exchangeRateUsed: new Prisma.Decimal(1),
    });
    return rates;
  }

  calculate(
    priceBasis: 'CIF' | 'DDP',
    dto: QuotationAmountsDto,
    rates: Map<string, DzdRateSnapshot>,
  ) {
    const cost = (
      costType: QuotationCostSnapshot['costType'],
      description: string,
      originalAmountValue: Prisma.Decimal.Value,
      currencyValue: string,
    ): QuotationCostSnapshot => {
      const currency = this.currency(currencyValue);
      const originalAmount = this.money(originalAmountValue);
      const rate = rates.get(currency);
      if (
        originalAmount.gt(0) &&
        (!rate ||
          !rate.exchangeRateUsed.isFinite() ||
          !rate.exchangeRateUsed.gt(0))
      ) {
        throw new ConflictException(`Taux ${currency}/DZD indisponible.`);
      }
      const exchangeRateUsed = rate?.exchangeRateUsed ?? new Prisma.Decimal(1);
      return {
        costType,
        description,
        originalAmount,
        currency,
        exchangeRateId: rate?.exchangeRateId ?? null,
        exchangeRateUsed,
        amountDzd: originalAmount.mul(exchangeRateUsed).toDecimalPlaces(2),
      };
    };

    const vehicle = cost(
      'VEHICLE',
      'Prix fournisseur véhicule',
      dto.vehicleAmount,
      dto.vehicleCurrency,
    );
    const containerPrice = this.money(dto.containerPrice);
    const containerAllocation = dto.containerAllocation;
    const freight = cost(
      'FREIGHT',
      `Fret véhicule (part 1/${containerAllocation})`,
      containerPrice.div(containerAllocation),
      dto.containerCurrency,
    );
    const insurance = cost(
      'INSURANCE',
      'Assurance',
      dto.insuranceAmount ?? 0,
      dto.insuranceCurrency,
    );
    const transit = cost(
      'TRANSIT',
      'Transit',
      dto.transitAmount ?? 0,
      dto.transitCurrency,
    );
    const customs = cost(
      'CUSTOMS',
      'Douane estimée (DZD)',
      dto.customsAmount ?? 0,
      'DZD',
    );
    const otherCosts = (dto.otherCosts ?? []).map((item) =>
      cost('OTHER', item.description.trim(), item.amount, item.currency),
    );
    const operationalCosts = [
      vehicle,
      freight,
      insurance,
      transit,
      ...otherCosts,
    ];
    const estimatedCifCostDzd = operationalCosts
      .reduce((sum, item) => sum.add(item.amountDzd), new Prisma.Decimal(0))
      .toDecimalPlaces(2);
    const estimatedLandedCostDzd = estimatedCifCostDzd
      .add(customs.amountDzd)
      .toDecimalPlaces(2);
    const estimatedDdpCostDzd = estimatedLandedCostDzd;
    const estimatedTotalCostDzd =
      priceBasis === 'DDP' ? estimatedLandedCostDzd : estimatedCifCostDzd;
    const sellingPriceDzd = this.money(dto.sellingPriceDzd);
    const estimatedProfitDzd = sellingPriceDzd
      .sub(estimatedTotalCostDzd)
      .toDecimalPlaces(2);
    const estimatedMarginPercent = sellingPriceDzd.gt(0)
      ? estimatedProfitDzd.mul(100).div(sellingPriceDzd).toDecimalPlaces(4)
      : new Prisma.Decimal(0);
    const costs = [...operationalCosts, customs].filter((item) =>
      item.originalAmount.gt(0),
    );

    return {
      vehicle,
      freight,
      insurance,
      transit,
      customs,
      otherCosts,
      costs,
      containerPrice,
      containerCurrency: this.currency(dto.containerCurrency),
      containerAllocation,
      estimatedCifCostDzd,
      estimatedDdpCostDzd,
      estimatedLandedCostDzd,
      estimatedTotalCostDzd,
      sellingPriceDzd,
      estimatedProfitDzd,
      estimatedMarginPercent,
    };
  }

  async usdToDzdSnapshot(
    tx: Prisma.TransactionClient,
    organizationId: string,
    at: Date,
  ) {
    const snapshot = await this.resolveDzdRateSnapshot(
      tx,
      organizationId,
      'USD',
      at,
    );
    return {
      exchangeRateId: snapshot.exchangeRateId,
      rate: snapshot.exchangeRateUsed,
    };
  }
}
