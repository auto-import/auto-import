import { Prisma } from '@prisma/client';
import { ExchangeRatesService } from '../finance/exchange-rates.service';
import { OffersService } from './offers.service';
import { QuotationPricingService } from './quotation-pricing.service';

describe('Offer and quotation pricing rules', () => {
  const pricing = new QuotationPricingService(
    new ExchangeRatesService({} as never),
  );
  const rates = new Map([
    [
      'USD',
      {
        currency: 'USD',
        exchangeRateId: 'rate-usd-145',
        exchangeRateUsed: new Prisma.Decimal(145),
      },
    ],
    [
      'DZD',
      {
        currency: 'DZD',
        exchangeRateId: null,
        exchangeRateUsed: new Prisma.Decimal(1),
      },
    ],
    [
      'CNY',
      {
        currency: 'CNY',
        exchangeRateId: 'rate-cny-20',
        exchangeRateUsed: new Prisma.Decimal(20),
      },
    ],
  ]);
  const amounts = {
    vehicleAmount: 10_000,
    vehicleCurrency: 'USD',
    containerPrice: 4_500,
    containerCurrency: 'USD',
    containerAllocation: 3,
    insuranceAmount: 0,
    insuranceCurrency: 'USD',
    customsAmount: 500_000,
    transitAmount: 80_000,
    transitCurrency: 'DZD',
    sellingPriceDzd: 2_600_000,
  };

  it('calculates FCA and FOB supplier totals without conversion', () => {
    const offers = new OffersService({} as never, {} as never);
    const pricingFacade = offers as unknown as {
      offerPricing: (
        incoterm: string,
        supplierPrice: number,
        localCost?: number,
      ) => { localCost: Prisma.Decimal; totalOfferPrice: Prisma.Decimal };
    };

    expect(
      pricingFacade.offerPricing('FCA', 8_000, 500).totalOfferPrice.toNumber(),
    ).toBe(8_500);
    expect(
      pricingFacade.offerPricing('FOB', 8_000, 500).totalOfferPrice.toNumber(),
    ).toBe(8_000);
    expect(
      pricingFacade.offerPricing('FOB', 8_000, 500).localCost.toNumber(),
    ).toBe(0);
  });

  it.each([
    [3, 1_500],
    [4, 1_125],
  ] as const)('calculates a 1/%i container share', (allocation, expected) => {
    const result = pricing.calculate(
      'CIF',
      { ...amounts, containerAllocation: allocation },
      rates,
    );
    expect(result.freight.originalAmount.toNumber()).toBe(expected);
  });

  it('keeps estimated customs outside CIF', () => {
    const result = pricing.calculate('CIF', amounts, rates);
    expect(result.estimatedCifCostDzd.toNumber()).toBe(1_747_500);
    expect(result.estimatedLandedCostDzd.toNumber()).toBe(2_247_500);
    expect(result.estimatedTotalCostDzd.toNumber()).toBe(1_747_500);
  });

  it('excludes zero-valued optional costs from persisted cost rows', () => {
    const result = pricing.calculate(
      'CIF',
      {
        ...amounts,
        containerPrice: 0,
        insuranceAmount: 0,
        transitAmount: 0,
        customsAmount: 0,
      },
      rates,
    );
    // Decimal.isPositive() includes +0; PostgreSQL requires amount > 0.
    expect(result.costs.map((cost) => cost.costType)).toEqual(['VEHICLE']);
    expect(result.customs.amountDzd.toString()).toBe('0');
    expect(result.estimatedTotalCostDzd.eq(result.vehicle.amountDzd)).toBe(
      true,
    );
  });

  it('implements DDP total, profit and margin in DZD', () => {
    const result = pricing.calculate('DDP', amounts, rates);
    expect(result.vehicle.amountDzd.toNumber()).toBe(1_450_000);
    expect(result.freight.amountDzd.toNumber()).toBe(217_500);
    expect(result.customs.amountDzd.toNumber()).toBe(500_000);
    expect(result.transit.amountDzd.toNumber()).toBe(80_000);
    expect(result.estimatedTotalCostDzd.toNumber()).toBe(2_247_500);
    expect(result.estimatedProfitDzd.toNumber()).toBe(352_500);
    expect(result.estimatedMarginPercent.toNumber()).toBe(13.5577);
  });

  it('calculates a CNY vehicle, freight and insurance with Decimal snapshots', () => {
    const result = pricing.calculate(
      'DDP',
      {
        ...amounts,
        vehicleCurrency: 'CNY',
        containerCurrency: 'CNY',
        insuranceCurrency: 'CNY',
      },
      rates,
    );
    expect(result.vehicle.amountDzd.toString()).toBe('200000');
    expect(result.freight.amountDzd.toString()).toBe('30000');
    expect(result.vehicle.exchangeRateId).toBe('rate-cny-20');
  });

  it('verifies the required 6000/3 DDP scenario exactly', () => {
    const result = pricing.calculate(
      'DDP',
      {
        ...amounts,
        containerPrice: 6_000,
        insuranceAmount: 1_500,
      },
      rates,
    );
    expect(result.vehicle.amountDzd.toString()).toBe('1450000');
    expect(result.freight.originalAmount.toString()).toBe('2000');
    expect(result.freight.amountDzd.toString()).toBe('290000');
    expect(result.insurance.amountDzd.toString()).toBe('217500');
    expect(result.transit.exchangeRateUsed.toString()).toBe('1');
    expect(result.estimatedCifCostDzd.toString()).toBe('2037500');
    expect(result.estimatedDdpCostDzd.toString()).toBe('2537500');
    expect(result.estimatedProfitDzd.toString()).toBe('62500');
    expect(result.estimatedMarginPercent.toString()).toBe('2.4038');
  });

  it('rejects a missing rate instead of returning zero', async () => {
    const tx = {
      exchangeRate: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never;
    await expect(
      pricing.resolveDzdRateSnapshot(tx, 'org-1', 'USD', new Date()),
    ).rejects.toThrow("aucun taux USD vers DZD actif n'est configuré");
  });

  it.each([0, -1])(
    'rejects an invalid active rate (%s) instead of falling back',
    async (invalidRate) => {
      const tx = {
        exchangeRate: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'invalid-rate',
            rate: new Prisma.Decimal(invalidRate),
          }),
        },
      } as never;
      await expect(
        pricing.resolveDzdRateSnapshot(tx, 'org-1', 'USD', new Date()),
      ).rejects.toThrow(
        'taux actif USD vers DZD configuré dans Finance est invalide',
      );
    },
  );

  it('diagnoses an inverse Finance row and never inverts it', async () => {
    const tx = {
      exchangeRate: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'dzd-usd-rate' }),
      },
    } as never;
    await expect(
      pricing.resolveDzdRateSnapshot(tx, 'org-1', 'USD', new Date()),
    ).rejects.toThrow('configuré dans le mauvais sens');
  });

  it('takes the effective USD/DZD Finance rate snapshot', async () => {
    const exchangeRate = {
      id: 'rate-1',
      rate: new Prisma.Decimal(140),
    };
    const tx = {
      exchangeRate: {
        findFirst: jest.fn().mockResolvedValueOnce(exchangeRate),
      },
    } as never;
    const snapshot = await pricing.usdToDzdSnapshot(tx, 'org-1', new Date());
    expect(snapshot.exchangeRateId).toBe('rate-1');
    expect(new Prisma.Decimal(20_000).mul(snapshot.rate).toNumber()).toBe(
      2_800_000,
    );
  });

  it('keeps an old rate snapshot frozen when Finance later publishes a new rate', async () => {
    const tx = {
      exchangeRate: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'rate-145',
            rate: new Prisma.Decimal(145),
          })
          .mockResolvedValueOnce({
            id: 'rate-160',
            rate: new Prisma.Decimal(160),
          }),
      },
    } as never;

    const oldSnapshot = await pricing.resolveDzdRateSnapshot(
      tx,
      'org-1',
      'USD',
      new Date('2026-09-01'),
    );
    const newSnapshot = await pricing.resolveDzdRateSnapshot(
      tx,
      'org-1',
      'USD',
      new Date('2026-09-06'),
    );

    expect(oldSnapshot.exchangeRateUsed.toString()).toBe('145');
    expect(newSnapshot.exchangeRateUsed.toString()).toBe('160');
    expect(oldSnapshot.exchangeRateUsed.toString()).toBe('145');
  });
});
