// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import DossierTransitionDialog from "./DossierTransitionDialog";
import type { ApiDossier } from "@/lib/commerce-api";
import { commerceApi } from "@/lib/commerce-api";
import { fetchDossierDzdRates } from "@/lib/dossier-money";

vi.mock("@/lib/commerce-api", () => ({
  commerceApi: { dossiers: { transition: vi.fn().mockResolvedValue({}) } },
}));
vi.mock("@/lib/dossier-money", async (original) => ({
  ...(await original<object>()),
  fetchDossierDzdRates: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const dossier = {
  id: "d1",
  vehicles: [
    { id: "v1", brand: "Geely", model: "Coolray", trim: "GF", currency: "USD" },
  ],
} as ApiDossier;
function show(status: "vehicleBooking" | "depositReceived", data = dossier) {
  return render(
    <DossierTransitionDialog
      dossier={data}
      status={status}
      partners={[]}
      onClose={vi.fn()}
      onComplete={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}
describe("Dossier transition fields", () => {
  it("preselects only the persisted dossier vehicle and submits it", async () => {
    show("vehicleBooking");
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("v1");
    expect(select.options).toHaveLength(2);
    expect(select.options[1].text).toContain("Geely Coolray GF");
    fireEvent.click(screen.getByText("Valider l’étape"));
    await waitFor(() =>
      expect(commerceApi.dossiers.transition).toHaveBeenCalledWith(
        "d1",
        "vehicleBooking",
        expect.objectContaining({
          vehicleBooking: expect.objectContaining({ vehicleId: "v1" }),
        }),
      ),
    );
  });
  it("explains a missing relationship and prevents submission", () => {
    show("vehicleBooking", { ...dossier, vehicles: [] });
    expect(screen.getByRole("alert").textContent).toContain("Aucun véhicule");
    expect(
      (screen.getByText("Valider l’étape") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it("loads Finance rates and recalculates USD/CNY and amount edits", async () => {
    vi.mocked(fetchDossierDzdRates).mockResolvedValue({
      rates: [
        { currency: "USD", exchangeRateId: "r1", exchangeRateUsed: "250" },
        { currency: "CNY", exchangeRateId: "r2", exchangeRateUsed: "35" },
      ],
    });
    show("depositReceived");
    fireEvent.change(screen.getByLabelText("Montant reçu"), {
      target: { value: "10000" },
    });
    await screen.findByText("Équivalent : 2500000.00 DZD");
    fireEvent.change(screen.getByLabelText("Devise *"), {
      target: { value: "CNY" },
    });
    expect(screen.getByText("Équivalent : 350000.00 DZD")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Montant reçu"), {
      target: { value: "0" },
    });
    expect(screen.getByText("Équivalent : 0.00 DZD")).toBeTruthy();
  });
  it("keeps USD/CNY selectable when Finance has no active rate and blocks save", async () => {
    vi.mocked(fetchDossierDzdRates).mockResolvedValue({ rates: [] });
    show("depositReceived");
    await screen.findByText(/Aucun taux USD/);
    expect(
      (screen.getByLabelText("Devise *") as HTMLSelectElement).options,
    ).toHaveLength(2);
    expect(
      (screen.getByText("Valider l’étape") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
