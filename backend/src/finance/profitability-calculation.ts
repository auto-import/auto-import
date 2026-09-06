import { Prisma } from '@prisma/client';

export interface ActualCostInput {
  amount: Prisma.Decimal;
  currency: string;
  amountInBaseCurrency: Prisma.Decimal | null;
  status: string;
  costScope: string;
}

export interface ActualProfitabilityResult {
  available: boolean;
  finalized: boolean;
  totalCostDzd: string | null;
  profitDzd: string | null;
  marginPercent: string | null;
  error: string | null;
}

/**
 * Actual profitability is derived exclusively from posted direct Finance
 * costs. Their persisted DZD equivalents are immutable exchange-rate
 * snapshots; current exchange rates are intentionally never consulted here.
 */
export function calculateActualProfitability(
  sellingPriceDzdValue: Prisma.Decimal.Value,
  costs: ActualCostInput[],
  finalized: boolean,
): ActualProfitabilityResult {
  const posted = costs.filter(
    (cost) => cost.status === 'POSTED' && cost.costScope === 'DIRECT',
  );
  if (posted.length === 0) {
    return {
      available: false,
      finalized,
      totalCostDzd: null,
      profitDzd: null,
      marginPercent: null,
      error: null,
    };
  }

  const missingSnapshot = posted.find(
    (cost) =>
      cost.currency.toUpperCase() !== 'DZD' &&
      cost.amountInBaseCurrency === null,
  );
  if (missingSnapshot) {
    return {
      available: false,
      finalized,
      totalCostDzd: null,
      profitDzd: null,
      marginPercent: null,
      error: `Contre-valeur DZD historique manquante pour un coût ${missingSnapshot.currency}.`,
    };
  }

  const sellingPriceDzd = new Prisma.Decimal(sellingPriceDzdValue);
  if (!sellingPriceDzd.isPositive()) {
    return {
      available: false,
      finalized,
      totalCostDzd: null,
      profitDzd: null,
      marginPercent: null,
      error: 'Prix de vente DZD invalide pour le calcul de rentabilité.',
    };
  }

  const totalCostDzd = posted
    .reduce((sum, cost) => {
      const amountDzd =
        cost.amountInBaseCurrency ??
        (cost.currency.toUpperCase() === 'DZD' ? cost.amount : null);
      if (amountDzd === null) {
        throw new Error('DZD snapshot invariant violated');
      }
      return sum.add(amountDzd);
    }, new Prisma.Decimal(0))
    .toDecimalPlaces(2);
  const profitDzd = sellingPriceDzd.sub(totalCostDzd).toDecimalPlaces(2);
  const marginPercent = profitDzd
    .mul(100)
    .div(sellingPriceDzd)
    .toDecimalPlaces(4);
  return {
    available: true,
    finalized,
    totalCostDzd: totalCostDzd.toString(),
    profitDzd: profitDzd.toString(),
    marginPercent: marginPercent.toString(),
    error: null,
  };
}
