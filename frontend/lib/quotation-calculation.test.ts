import { describe, expect, it } from "vitest";
import { buildQuotationDraft } from "./quotation-calculation";

const amounts = {
  vehicleAmount: "8000",
  containerPrice: "6000",
  containerAllocation: "3",
  insuranceAmount: "300",
  customsAmount: "1000",
  transitAmount: "200",
  marginAmount: "0",
};

describe("quotation live calculation", () => {
  it("calculates CIF without estimated customs and converts with the Finance rate", () => {
    const draft = buildQuotationDraft(
      "CIF",
      amounts,
      [{ amount: "500", description: "Frais de manutention" }],
      250,
    );

    expect(draft.errors).toEqual([]);
    expect(draft.calculation).toMatchObject({
      freightAmount: 2000,
      cifAmount: 11000,
      ddpAmount: 12000,
      finalCustomerPrice: 11000,
      cifAmountDzd: 2750000,
      ddpAmountDzd: 3000000,
    });
  });

  it("calculates DDP with customs and supports a 1/4 container share", () => {
    const draft = buildQuotationDraft(
      "DDP",
      { ...amounts, containerAllocation: "4" },
      [{ amount: "500", description: "Frais de manutention" }],
      250,
    );

    expect(draft.calculation).toMatchObject({
      freightAmount: 1500,
      cifAmount: 10500,
      ddpAmount: 11500,
      finalCustomerPrice: 11500,
      finalCustomerPriceDzd: 2875000,
    });
  });

  it("does not silently turn invalid values into zero", () => {
    const draft = buildQuotationDraft(
      "CIF",
      { ...amounts, insuranceAmount: "not-a-number" },
      [],
      250,
    );

    expect(draft.amounts).toBeNull();
    expect(draft.calculation).toBeNull();
    expect(draft.errors).toContain("L’assurance doit être un nombre valide.");
  });

  it("does not add the legacy margin field to CIF or DDP", () => {
    const draft = buildQuotationDraft(
      "DDP",
      { ...amounts, marginAmount: "900" },
      [{ amount: "500", description: "Manutention" }],
      250,
    );

    expect(draft.calculation?.cifAmount).toBe(11000);
    expect(draft.calculation?.ddpAmount).toBe(12000);
  });

  it("requires a description only when another cost has an amount", () => {
    const draft = buildQuotationDraft(
      "CIF",
      amounts,
      [{ amount: "500", description: "" }],
      250,
    );

    expect(draft.errors).toContain(
      "La description de l’autre coût 1 est requise.",
    );
  });
});
