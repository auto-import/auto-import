import { apiRequest } from "./api";

export type FinanceDzdRate = {
  currency: string;
  exchangeRateId: string | null;
  exchangeRateUsed: string;
};
export function fetchDossierDzdRates() {
  return apiRequest<{ rates: FinanceDzdRate[] }>("/dossiers/finance/dzd-rates");
}
export function fetchShipmentDzdRates() {
  return apiRequest<{ rates: FinanceDzdRate[] }>(
    "/shipments/finance/dzd-rates",
  );
}

/** Exact nonnegative decimal multiplication, rounded half up to DZD cents. */
export function amountDzd(
  amount: string,
  rate: string | undefined,
): string | null {
  if (
    !rate ||
    !/^\d{1,10}(\.\d{1,2})?$/.test(amount) ||
    !/^\d{1,10}(\.\d{1,8})?$/.test(rate)
  )
    return null;
  const [whole, fraction = ""] = amount.split(".");
  const [rateWhole, rateFraction = ""] = rate.split(".");
  const cents = BigInt(whole + fraction.padEnd(2, "0"));
  const scaledRate = BigInt(rateWhole + rateFraction.padEnd(8, "0"));
  if (scaledRate <= BigInt(0)) return null;
  const result =
    (cents * scaledRate + BigInt(50_000_000)) / BigInt(100_000_000);
  if (result >= BigInt("1000000000000")) return null;
  const digits = result.toString().padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
