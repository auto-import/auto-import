import { describe, expect, it } from "vitest";
import { amountDzd } from "./dossier-money";

describe("Finance DZD previews", () => {
  it.each([
    ["10000", "250", "2500000.00"],
    ["10000", "35.25", "352500.00"],
    ["0", "250", "0.00"],
    ["0", "35.25", "0.00"],
    ["0.01", "35.25", "0.35"],
    ["1234.56", "35.12345678", "43362.01"],
    ["39999999.99", "250", "9999999997.50"],
    ["0.10", "0.15", "0.02"],
  ])("converts %s × %s exactly", (amount, rate, expected) => {
    expect(amountDzd(amount, rate)).toBe(expected);
  });
  it.each(["", "NaN", "Infinity", "-1", "1.234", "1e99"])(
    "rejects invalid amount %s",
    (value) => {
      expect(amountDzd(value, "250")).toBeNull();
    },
  );
  it("blocks missing, invalid and overflowing rates instead of faking zero", () => {
    for (const rate of [undefined, "0", "-1", "NaN", "Infinity"])
      expect(amountDzd("0", rate)).toBeNull();
    expect(amountDzd("40000000", "250")).toBeNull();
  });
  it("recalculates when amount or currency rate changes", () => {
    expect(amountDzd("10000", "250")).toBe("2500000.00");
    expect(amountDzd("10000", "35")).toBe("350000.00");
    expect(amountDzd("20000", "35")).toBe("700000.00");
    expect(amountDzd("20000", "36")).toBe("720000.00");
  });
});
