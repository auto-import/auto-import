export type QuotationPriceBasis = "CIF" | "DDP";

export interface QuotationFormAmounts {
  vehicleAmount: string;
  vehicleCurrency: string;
  containerPrice: string;
  containerCurrency: string;
  containerAllocation: string;
  insuranceAmount: string;
  insuranceCurrency: string;
  customsAmount: string;
  transitAmount: string;
  transitCurrency: string;
  sellingPriceDzd: string;
}

export interface QuotationOtherCostInput {
  amount: string;
  currency: string;
  description: string;
}

export interface QuotationCostCalculation {
  amountOriginal: number;
  currency: string;
  exchangeRateUsed: number;
  amountDzd: number;
}

export interface QuotationCalculation {
  vehicle: QuotationCostCalculation;
  containerPrice: number;
  containerCurrency: string;
  containerAllocation: 3 | 4;
  freight: QuotationCostCalculation;
  insurance: QuotationCostCalculation;
  customs: QuotationCostCalculation;
  transit: QuotationCostCalculation;
  otherCosts: QuotationCostCalculation[];
  otherCostsDzd: number;
  estimatedCifCostDzd: number;
  estimatedDdpCostDzd: number;
  estimatedLandedCostDzd: number;
  estimatedTotalCostDzd: number;
  sellingPriceDzd: number | null;
  estimatedProfitDzd: number | null;
  estimatedMarginPercent: number | null;
}

export interface QuotationDraft {
  amounts: {
    vehicleAmount: number;
    vehicleCurrency: string;
    containerPrice: number;
    containerCurrency: string;
    containerAllocation: 3 | 4;
    insuranceAmount: number;
    insuranceCurrency: string;
    customsAmount: number;
    transitAmount: number;
    transitCurrency: string;
    sellingPriceDzd: number;
    otherCosts: Array<{
      amount: number;
      currency: string;
      description: string;
    }>;
  } | null;
  calculation: QuotationCalculation | null;
  errors: string[];
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseAmount(
  rawValue: string,
  label: string,
  options: { required?: boolean; strictlyPositive?: boolean } = {},
): { value: number | null; error?: string } {
  const normalized = rawValue.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) {
    return options.required
      ? { value: null, error: `${label} est requis.` }
      : { value: 0 };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return { value: null, error: `${label} doit être un nombre valide.` };
  }
  if (value < 0 || (options.strictlyPositive && value <= 0)) {
    return {
      value: null,
      error: options.strictlyPositive
        ? `${label} doit être supérieur à zéro.`
        : `${label} ne peut pas être négatif.`,
    };
  }
  return { value };
}

export function buildQuotationDraft(
  priceBasis: QuotationPriceBasis,
  form: QuotationFormAmounts,
  otherCostInputs: QuotationOtherCostInput[],
  dzdRates: Record<string, string | number | undefined>,
): QuotationDraft {
  const fields = {
    vehicleAmount: parseAmount(form.vehicleAmount, "Le prix fournisseur", {
      required: true,
      strictlyPositive: true,
    }),
    containerPrice: parseAmount(form.containerPrice, "Le prix du conteneur", {
      required: true,
    }),
    insuranceAmount: parseAmount(form.insuranceAmount, "L’assurance"),
    customsAmount: parseAmount(form.customsAmount, "La douane"),
    transitAmount: parseAmount(form.transitAmount, "Le transit"),
    sellingPriceDzd: parseAmount(form.sellingPriceDzd, "Le prix de vente", {
      strictlyPositive: true,
    }),
  };
  const allocation = Number(form.containerAllocation);
  const errors = Object.values(fields)
    .map((field) => field.error)
    .filter((error): error is string => Boolean(error));
  if (allocation !== 3 && allocation !== 4) {
    errors.push("La part du conteneur doit être 1/3 ou 1/4.");
  }

  const otherCosts: Array<{
    amount: number;
    currency: string;
    description: string;
  }> = [];
  otherCostInputs.forEach((cost, index) => {
    const parsed = parseAmount(cost.amount, `L’autre coût ${index + 1}`);
    if (parsed.error) {
      errors.push(parsed.error);
      return;
    }
    if ((parsed.value ?? 0) === 0) return;
    const description = cost.description.trim();
    if (!description) {
      errors.push(`La description de l’autre coût ${index + 1} est requise.`);
      return;
    }
    otherCosts.push({
      amount: parsed.value!,
      currency: cost.currency.toUpperCase(),
      description,
    });
  });

  const rateFor = (currencyValue: string, amount: number, label: string) => {
    const currency = currencyValue.trim().toUpperCase();
    if (currency === "DZD") return 1;
    const rate = Number(dzdRates[currency]);
    if (amount > 0 && (!Number.isFinite(rate) || rate <= 0)) {
      errors.push(`Le taux ${currency}/DZD est indisponible pour ${label}.`);
      return null;
    }
    return Number.isFinite(rate) && rate > 0 ? rate : 1;
  };

  if (errors.length > 0) {
    return { amounts: null, calculation: null, errors };
  }

  const vehicleAmount = fields.vehicleAmount.value!;
  const containerPrice = fields.containerPrice.value!;
  const containerAllocation = allocation as 3 | 4;
  const insuranceAmount = fields.insuranceAmount.value!;
  const customsAmount = fields.customsAmount.value!;
  const transitAmount = fields.transitAmount.value!;
  const sellingPriceDzd = form.sellingPriceDzd.trim()
    ? fields.sellingPriceDzd.value!
    : null;
  const freightAmount = roundMoney(containerPrice / containerAllocation);
  const vehicleRate = rateFor(
    form.vehicleCurrency,
    vehicleAmount,
    "le véhicule",
  );
  const freightRate = rateFor(form.containerCurrency, freightAmount, "le fret");
  const insuranceRate = rateFor(
    form.insuranceCurrency,
    insuranceAmount,
    "l’assurance",
  );
  const transitRate = rateFor(
    form.transitCurrency,
    transitAmount,
    "le transit",
  );
  const otherRates = otherCosts.map((cost, index) =>
    rateFor(cost.currency, cost.amount, `l’autre coût ${index + 1}`),
  );
  if (errors.length > 0) return { amounts: null, calculation: null, errors };

  const convert = (
    amountOriginal: number,
    currency: string,
    exchangeRateUsed: number,
  ): QuotationCostCalculation => ({
    amountOriginal,
    currency: currency.toUpperCase(),
    exchangeRateUsed,
    amountDzd: roundMoney(amountOriginal * exchangeRateUsed),
  });
  const vehicle = convert(vehicleAmount, form.vehicleCurrency, vehicleRate!);
  const freight = convert(freightAmount, form.containerCurrency, freightRate!);
  const insurance = convert(
    insuranceAmount,
    form.insuranceCurrency,
    insuranceRate!,
  );
  const transit = convert(transitAmount, form.transitCurrency, transitRate!);
  const customs = convert(customsAmount, "DZD", 1);
  const calculatedOtherCosts = otherCosts.map((cost, index) =>
    convert(cost.amount, cost.currency, otherRates[index]!),
  );
  const otherCostsDzd = roundMoney(
    calculatedOtherCosts.reduce((total, cost) => total + cost.amountDzd, 0),
  );
  const estimatedCifCostDzd = roundMoney(
    vehicle.amountDzd +
      freight.amountDzd +
      insurance.amountDzd +
      transit.amountDzd +
      otherCostsDzd,
  );
  const estimatedLandedCostDzd = roundMoney(
    estimatedCifCostDzd + customs.amountDzd,
  );
  const estimatedDdpCostDzd = estimatedLandedCostDzd;
  const estimatedTotalCostDzd =
    priceBasis === "DDP" ? estimatedLandedCostDzd : estimatedCifCostDzd;
  const estimatedProfitDzd =
    sellingPriceDzd === null
      ? null
      : roundMoney(sellingPriceDzd - estimatedTotalCostDzd);
  const estimatedMarginPercent =
    sellingPriceDzd === null || estimatedProfitDzd === null
      ? null
      : roundMoney((estimatedProfitDzd / sellingPriceDzd) * 100);

  return {
    amounts:
      sellingPriceDzd === null
        ? null
        : {
            vehicleAmount,
            vehicleCurrency: form.vehicleCurrency.toUpperCase(),
            containerPrice,
            containerCurrency: form.containerCurrency.toUpperCase(),
            containerAllocation,
            insuranceAmount,
            insuranceCurrency: form.insuranceCurrency.toUpperCase(),
            customsAmount,
            transitAmount,
            transitCurrency: form.transitCurrency.toUpperCase(),
            sellingPriceDzd,
            otherCosts,
          },
    calculation: {
      vehicle,
      containerPrice,
      containerCurrency: form.containerCurrency.toUpperCase(),
      containerAllocation,
      freight,
      insurance,
      customs,
      transit,
      otherCosts: calculatedOtherCosts,
      otherCostsDzd,
      estimatedCifCostDzd,
      estimatedDdpCostDzd,
      estimatedLandedCostDzd,
      estimatedTotalCostDzd,
      sellingPriceDzd,
      estimatedProfitDzd,
      estimatedMarginPercent,
    },
    errors: [],
  };
}
