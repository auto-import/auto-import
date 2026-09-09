import { Prisma } from '@prisma/client';
import { calculateActualProfitability } from './profitability-calculation';

describe('estimated and actual profitability separation', () => {
  it('does not divide by a zero selling price', () => {
    const result = calculateActualProfitability(
      0,
      [
        {
          amount: new Prisma.Decimal(100),
          currency: 'DZD',
          amountInBaseCurrency: new Prisma.Decimal(100),
          status: 'POSTED',
          costScope: 'DIRECT',
        },
      ],
      false,
    );
    expect(result.available).toBe(false);
    expect(result.marginPercent).toBeNull();
    expect(result.error).toContain('Prix de vente DZD invalide');
  });
  it('calculates real profitability without modifying the estimated snapshot', () => {
    const estimated = Object.freeze({
      totalCostDzd: '2200000',
      profitDzd: '400000',
    });
    const actual = calculateActualProfitability(
      new Prisma.Decimal(2_600_000),
      [
        {
          amount: new Prisma.Decimal(2_280_000),
          currency: 'DZD',
          amountInBaseCurrency: new Prisma.Decimal(2_280_000),
          status: 'POSTED',
          costScope: 'DIRECT',
        },
      ],
      true,
    );

    expect(actual).toMatchObject({
      available: true,
      totalCostDzd: '2280000',
      profitDzd: '320000',
      marginPercent: '12.3077',
    });
    expect(estimated).toEqual({
      totalCostDzd: '2200000',
      profitDzd: '400000',
    });
  });

  it('does not hide a missing foreign-currency DZD snapshot as zero', () => {
    const result = calculateActualProfitability(
      2_600_000,
      [
        {
          amount: new Prisma.Decimal(10_000),
          currency: 'USD',
          amountInBaseCurrency: null,
          status: 'POSTED',
          costScope: 'DIRECT',
        },
      ],
      false,
    );
    expect(result.available).toBe(false);
    expect(result.error).toContain('DZD historique manquante');
  });
});
