export type QuotationPriceBasis = "CIF" | "DDP";

export interface QuotationFormAmounts {
  vehicleAmount: string;
  containerPrice: string;
  containerAllocation: string;
  insuranceAmount: string;
  customsAmount: string;
  transitAmount: string;
  marginAmount: string;
}

export interface QuotationOtherCostInput {
  amount: string;
  description: string;
}

export interface QuotationCalculation {
  vehicleAmount: number;
  containerPrice: number;
  containerAllocation: 3 | 4;
  freightAmount: number;
  insuranceAmount: number;
  customsAmount: number;
  transitAmount: number;
  otherCostsAmount: number;
  marginAmount: number;
  cifAmount: number;
  ddpAmount: number;
  finalCustomerPrice: number;
  cifAmountDzd: number | null;
  ddpAmountDzd: number | null;
  finalCustomerPriceDzd: number | null;
}

export interface QuotationDraft {
  amounts: {
    vehicleAmount: number;
    containerPrice: number;
    containerAllocation: 3 | 4;
    insuranceAmount: number;
    customsAmount: number;
    transitAmount: number;
    marginAmount: number;
    otherCosts: Array<{ amount: number; description: string }>;
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
  usdToDzdRate?: string | number | null,
): QuotationDraft {
  const fields = {
    vehicleAmount: parseAmount(form.vehicleAmount, "Le prix fournisseur", {
      required: true,
      strictlyPositive: true,
    }),
    containerPrice: parseAmount(form.containerPrice, "Le prix du conteneur", {
      required: true,
      strictlyPositive: true,
    }),
    insuranceAmount: parseAmount(form.insuranceAmount, "L’assurance"),
    customsAmount: parseAmount(form.customsAmount, "La douane"),
    transitAmount: parseAmount(form.transitAmount, "Le transit"),
    marginAmount: parseAmount(form.marginAmount, "La marge"),
  };
  const allocation = Number(form.containerAllocation);
  const errors = Object.values(fields)
    .map((field) => field.error)
    .filter((error): error is string => Boolean(error));
  if (allocation !== 3 && allocation !== 4) {
    errors.push("La part du conteneur doit être 1/3 ou 1/4.");
  }

  const otherCosts: Array<{ amount: number; description: string }> = [];
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
    otherCosts.push({ amount: parsed.value!, description });
  });

  if (errors.length > 0) {
    return { amounts: null, calculation: null, errors };
  }

  const vehicleAmount = fields.vehicleAmount.value!;
  const containerPrice = fields.containerPrice.value!;
  const containerAllocation = allocation as 3 | 4;
  const insuranceAmount = fields.insuranceAmount.value!;
  const customsAmount = fields.customsAmount.value!;
  const transitAmount = fields.transitAmount.value!;
  const marginAmount = fields.marginAmount.value!;
  const freightAmount = roundMoney(containerPrice / containerAllocation);
  const otherCostsAmount = otherCosts.reduce(
    (total, cost) => total + cost.amount,
    0,
  );
  const cifAmount = roundMoney(
    vehicleAmount +
      freightAmount +
      insuranceAmount +
      transitAmount +
      otherCostsAmount,
  );
  const ddpAmount = roundMoney(cifAmount + customsAmount);
  const rate =
    usdToDzdRate === null || usdToDzdRate === undefined
      ? null
      : Number(usdToDzdRate);
  const validRate =
    rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null;
  const finalCustomerPrice = priceBasis === "CIF" ? cifAmount : ddpAmount;

  return {
    amounts: {
      vehicleAmount,
      containerPrice,
      containerAllocation,
      insuranceAmount,
      customsAmount,
      transitAmount,
      marginAmount,
      otherCosts,
    },
    calculation: {
      vehicleAmount,
      containerPrice,
      containerAllocation,
      freightAmount,
      insuranceAmount,
      customsAmount,
      transitAmount,
      otherCostsAmount,
      marginAmount,
      cifAmount,
      ddpAmount,
      finalCustomerPrice,
      cifAmountDzd:
        validRate === null ? null : roundMoney(cifAmount * validRate),
      ddpAmountDzd:
        validRate === null ? null : roundMoney(ddpAmount * validRate),
      finalCustomerPriceDzd:
        validRate === null ? null : roundMoney(finalCustomerPrice * validRate),
    },
    errors: [],
  };
}
