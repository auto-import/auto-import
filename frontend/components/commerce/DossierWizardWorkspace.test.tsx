// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DossierWizardWorkspace from "./DossierWizardWorkspace";
const mocks = vi.hoisted(() => ({
  eligible: vi.fn(),
  create: vi.fn(),
  push: vi.fn(),
}));
const pagination = { page: 1, totalItems: 1, totalPages: 1 };
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/Topbar", () => ({ default: () => null }));
vi.mock("@/lib/admin-api", () => ({
  adminApi: { listUsers: vi.fn().mockResolvedValue({ items: [] }) },
}));
vi.mock("@/lib/crm-api", () => ({
  crmApi: {
    listClients: vi.fn().mockResolvedValue({
      items: [{ id: "client-uuid", firstName: "Client", lastName: "Test" }],
    }),
  },
}));
vi.mock("@/lib/commerce-api", () => ({
  commerceApi: {
    vehicles: { eligible: mocks.eligible },
    catalogue: {
      list: vi
        .fn()
        .mockResolvedValue({ items: [], pagination: { totalPages: 0 } }),
    },
    dossiers: { create: mocks.create },
  },
}));

describe("Dossier inventory selection", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eligible.mockResolvedValue({
      items: [
        {
          id: "real-vehicle-uuid",
          brand: "Geely",
          model: "Monjaro",
          vin: "REAL-VIN",
        },
      ],
      pagination,
    });
  });
  async function vehicleStep() {
    render(<DossierWizardWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: /Continuer/ }));
    fireEvent.change(
      screen.getByRole("combobox", { name: "Client existant" }),
      { target: { value: "client-uuid" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Continuer/ }));
  }
  it("uses the typed eligibility endpoint and sends the persisted vehicle UUID to the dossier API", async () => {
    mocks.create.mockResolvedValue({ id: "dossier-uuid" });
    await vehicleStep();
    expect(
      await screen.findByRole("option", { name: /Geely Monjaro.*REAL-VIN/ }),
    ).toBeTruthy();
    expect(mocks.eligible).toHaveBeenCalledWith(
      expect.objectContaining({ type: "VEHICLE_SALE_CIF", page: 1, limit: 50 }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Véhicule disponible" }),
      { target: { value: "real-vehicle-uuid" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Continuer/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continuer/ }));
    fireEvent.click(screen.getByRole("button", { name: /Créer le dossier/ }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: "client-uuid",
          vehicleIds: ["real-vehicle-uuid"],
        }),
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/dossiers/dossier-uuid");
  });
  it("renders a real empty result explicitly", async () => {
    mocks.eligible.mockResolvedValue({
      items: [],
      pagination: { ...pagination, totalPages: 0 },
    });
    await vehicleStep();
    expect(
      await screen.findByRole("option", { name: "Aucun véhicule disponible" }),
    ).toBeTruthy();
  });
  it("shows and retries backend errors instead of an empty dropdown", async () => {
    mocks.eligible.mockRejectedValueOnce(
      new Error("Impossible de charger les véhicules"),
    );
    await vehicleStep();
    expect(
      await screen.findByText("Impossible de charger les véhicules"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("option", { name: "Aucun véhicule disponible" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/ }));
    expect(
      await screen.findByRole("option", { name: /Geely Monjaro/ }),
    ).toBeTruthy();
  });
});
