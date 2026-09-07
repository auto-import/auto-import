import { describe, expect, it } from "vitest";
import { buildQuotationDraft } from "./quotation-calculation";

const amounts = {
  vehicleAmount: "10000",
  vehicleCurrency: "USD",
  containerPrice: "4500",
  containerCurrency: "USD",
  containerAllocation: "3",
  insuranceAmount: "0",
  insuranceCurrency: "USD",
  customsAmount: "500000",
  transitAmount: "80000",
  transitCurrency: "DZD",
  sellingPriceDzd: "2600000",
};

const rates = { DZD: 1, USD: 145, CNY: 20 };

describe("quotation live calculation", () => {
  it("implements the required DZD profitability scenario exactly", () => {
    const draft = buildQuotationDraft("DDP", amounts, [], rates);

    expect(draft.errors).toEqual([]);
    expect(draft.calculation).toMatchObject({
      vehicle: { amountDzd: 1450000, exchangeRateUsed: 145 },
      freight: { amountOriginal: 1500, amountDzd: 217500 },
      transit: { amountDzd: 80000, exchangeRateUsed: 1 },
      customs: { amountDzd: 500000, exchangeRateUsed: 1 },
      estimatedTotalCostDzd: 2247500,
      sellingPriceDzd: 2600000,
      estimatedProfitDzd: 352500,
      estimatedMarginPercent: 13.56,
    });
  });

  it("keeps customs outside CIF profitability while showing landed cost", () => {
    const draft = buildQuotationDraft("CIF", amounts, [], rates);

    expect(draft.calculation).toMatchObject({
      estimatedCifCostDzd: 1747500,
      estimatedDdpCostDzd: 2247500,
      estimatedLandedCostDzd: 2247500,
      estimatedTotalCostDzd: 1747500,
    });
  });

  it("shows DZD costs before a selling price is entered", () => {
    const draft = buildQuotationDraft(
      "DDP",
      { ...amounts, sellingPriceDzd: "" },
      [],
      rates,
    );

    expect(draft.amounts).toBeNull();
    expect(draft.calculation).toMatchObject({
      estimatedCifCostDzd: 1747500,
      estimatedDdpCostDzd: 2247500,
      sellingPriceDzd: null,
      estimatedProfitDzd: null,
      estimatedMarginPercent: null,
    });
  });

  it("never converts a positive foreign amount with a missing rate", () => {
    const draft = buildQuotationDraft("CIF", amounts, [], { DZD: 1 });
    expect(draft.amounts).toBeNull();
    expect(draft.calculation).toBeNull();
    expect(draft.errors.join(" ")).toContain("taux USD/DZD est indisponible");
  });

  it("does not silently turn invalid values into zero", () => {
    const draft = buildQuotationDraft(
      "CIF",
      { ...amounts, insuranceAmount: "not-a-number" },
      [],
      rates,
    );

    expect(draft.amounts).toBeNull();
    expect(draft.calculation).toBeNull();
    expect(draft.errors).toContain("L’assurance doit être un nombre valide.");
  });

  it("converts multiple other costs independently", () => {
    const draft = buildQuotationDraft(
      "DDP",
      amounts,
      [
        { amount: "500", currency: "USD", description: "Manutention" },
        { amount: "10000", currency: "DZD", description: "Stationnement" },
      ],
      rates,
    );

    expect(draft.calculation?.otherCostsDzd).toBe(82500);
    expect(draft.calculation?.estimatedTotalCostDzd).toBe(2330000);
  });

  it("requires a description only when another cost has an amount", () => {
    const draft = buildQuotationDraft(
      "CIF",
      amounts,
      [{ amount: "500", currency: "USD", description: "" }],
      rates,
    );

    expect(draft.errors).toContain(
      "La description de l’autre coût 1 est requise.",
    );
  });
});
