import { Prisma } from '@prisma/client';
import { OffersService } from './offers.service';
import { QuotationPricingService } from './quotation-pricing.service';

describe('Offer and quotation pricing rules', () => {
  const pricing = new QuotationPricingService();

  it('calculates FCA and FOB supplier totals without conversion', () => {
    const offers = new OffersService({} as never, {} as never);
    const calculate = (
      offers as unknown as {
        offerPricing: (
          incoterm: string,
          supplierPrice: number,
          localCost?: number,
        ) => { localCost: Prisma.Decimal; totalOfferPrice: Prisma.Decimal };
      }
    ).offerPricing.bind(offers);

    expect(calculate('FCA', 8_000, 500).totalOfferPrice.toNumber()).toBe(8_500);
    expect(calculate('FOB', 8_000, 500).totalOfferPrice.toNumber()).toBe(8_000);
    expect(calculate('FOB', 8_000, 500).localCost.toNumber()).toBe(0);
  });

  it.each([
    [3, 2_000],
    [4, 1_500],
  ] as const)('calculates a 1/%i container share', (allocation, expected) => {
    const result = pricing.calculate('CIF', {
      vehicleAmount: 8_000,
      containerPrice: 6_000,
      containerAllocation: allocation,
    });
    expect(result.freightAmount.toNumber()).toBe(expected);
  });

  it('keeps estimated customs outside CIF', () => {
    const result = pricing.calculate('CIF', {
      vehicleAmount: 8_000,
      containerPrice: 6_000,
      containerAllocation: 3,
      insuranceAmount: 300,
      transitAmount: 200,
      customsAmount: 1_500,
      otherCosts: [{ amount: 500, description: 'Manutention' }],
    });
    expect(result.finalCustomerPrice.toNumber()).toBe(11_000);
    expect(result.customsAmount.toNumber()).toBe(1_500);
  });

  it('includes customs in DDP', () => {
    const result = pricing.calculate('DDP', {
      vehicleAmount: 8_000,
      containerPrice: 6_000,
      containerAllocation: 3,
      insuranceAmount: 300,
      transitAmount: 200,
      customsAmount: 1_500,
      otherCosts: [{ amount: 500, description: 'Manutention' }],
    });
    expect(result.finalCustomerPrice.toNumber()).toBe(12_500);
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
});
