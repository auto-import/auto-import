// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import TreasuryAccountSelect from "./TreasuryAccountSelect";
vi.mock("@/lib/finance-api", () => ({
  fetchPaymentAccounts: vi.fn().mockResolvedValue([
    {
      id: "dzd",
      code: "DZ",
      name: "Banque Algérie",
      currency: "DZD",
      officeId: "algerie",
    },
    {
      id: "usd",
      code: "US",
      name: "WorldFirst",
      currency: "USD",
      officeId: "chine",
    },
  ]),
}));
afterEach(cleanup);
it("requires an explicit account in the currency and resets the displayed selection when currency changes", async () => {
  const change = vi.fn();
  const { rerender } = render(
    <TreasuryAccountSelect currency="DZD" value="" onChange={change} />,
  );
  expect(
    await screen.findByRole("option", { name: /Banque Algérie/ }),
  ).toBeTruthy();
  expect(screen.queryByRole("option", { name: /WorldFirst/ })).toBeNull();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "dzd" } });
  expect(change).toHaveBeenCalledWith("dzd");
  rerender(
    <TreasuryAccountSelect currency="USD" value="dzd" onChange={change} />,
  );
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("");
  expect((screen.getByRole("combobox") as HTMLSelectElement).required).toBe(
    true,
  );
});
