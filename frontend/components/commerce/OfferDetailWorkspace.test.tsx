// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OfferDetailWorkspace from "./OfferDetailWorkspace";

const mocks = vi.hoisted(() => ({
  getOffer: vi.fn(),
  listQuotations: vi.fn(),
  currentRates: vi.fn(),
  preview: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));
vi.mock("@/components/Topbar", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("./PrivateOfferGallery", () => ({ default: () => null }));
vi.mock("@/lib/commerce-api", () => ({
  commerceApi: {
    offers: {
      get: mocks.getOffer,
      update: vi.fn(),
      transition: vi.fn(),
      purchaseVehicle: vi.fn(),
      loseVehicle: vi.fn(),
    },
    quotations: {
      list: mocks.listQuotations,
      currentDzdRates: mocks.currentRates,
      preview: mocks.preview,
      create: mocks.create,
    },
  },
}));

const pagination = {
  page: 1,
  pageSize: 100,
  totalItems: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};
const offer = {
  id: "00000000-0000-4000-8000-000000000001",
  reference: "OFF-001",
  supplierId: "supplier-1",
  supplier: {
    id: "supplier-1",
    name: "China Motors",
    type: "supplier",
    status: "active",
    specialties: [],
  },
  brand: "Geely",
  model: "Coolray",
  condition: "new",
  specification: {},
  supplierPrice: 10000,
  totalOfferPrice: 10000,
  currency: "USD",
  validFrom: "2026-09-01T00:00:00.000Z",
  validUntil: "2026-12-01T00:00:00.000Z",
  availableQuantity: 1,
  reservedQuantity: 0,
  remainingQuantity: 1,
  status: "available",
  vehicles: [
    {
      id: "00000000-0000-4000-8000-000000000002",
      lineNumber: 1,
      brand: "Geely",
      model: "Coolray",
      condition: "new",
      specification: {},
      supplierPrice: 10000,
      currency: "USD",
      quantity: 1,
      reservedQuantity: 0,
      purchasedQuantity: 0,
      status: "VALIDATED",
    },
  ],
};

async function renderWorkspace() {
  await act(async () => {
    render(
      <OfferDetailWorkspace
        params={Promise.resolve({
          id: "00000000-0000-4000-8000-000000000001",
        })}
      />,
    );
  });
}

async function openAndFillQuotation() {
  await renderWorkspace();
  await screen.findByText("OFF-001 · China Motors");
  fireEvent.click(screen.getByRole("button", { name: "Créer un devis" }));
  await waitFor(() => expect(mocks.currentRates).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("Prix du conteneur"), {
    target: { value: "4500" },
  });
  fireEvent.change(screen.getByLabelText("Assurance"), {
    target: { value: "0" },
  });
  fireEvent.change(screen.getByLabelText("Douane estimée (DZD)"), {
    target: { value: "500000" },
  });
  fireEvent.change(screen.getByLabelText("Transit"), {
    target: { value: "80000" },
  });
  fireEvent.change(screen.getByLabelText("Prix de vente client (DZD)"), {
    target: { value: "2600000" },
  });
  fireEvent.change(screen.getByLabelText("Base tarifaire *"), {
    target: { value: "DDP" },
  });
}

describe("OfferDetailWorkspace quotation workflow", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOffer.mockResolvedValue(offer);
    mocks.listQuotations.mockResolvedValue({ items: [], pagination });
    mocks.currentRates.mockResolvedValue({
      referenceCurrency: "DZD",
      rates: [
        {
          currency: "DZD",
          baseCurrency: "DZD",
          quoteCurrency: "DZD",
          exchangeRateId: null,
          exchangeRateUsed: "1",
        },
        {
          currency: "USD",
          baseCurrency: "USD",
          quoteCurrency: "DZD",
          exchangeRateId: "rate-1",
          exchangeRateUsed: "145",
        },
      ],
    });
    mocks.preview.mockResolvedValue({ estimatedTotalCostDzd: "2247500" });
    mocks.create.mockResolvedValue({ id: "quotation-1" });
  });

  it("renders structured real offer fields instead of an empty JSON object", async () => {
    await renderWorkspace();
    await screen.findByText("OFF-001 · China Motors");
    expect(screen.getByText("Marque").parentElement?.textContent).toContain(
      "Geely",
    );
    expect(screen.getByText("Modèle").parentElement?.textContent).toContain(
      "Coolray",
    );
    expect(screen.queryByText("{}")).toBeNull();
  });

  it("limits foreign cost selectors to USD and CNY and keeps transit in DZD", async () => {
    await renderWorkspace();
    await screen.findByText("OFF-001 · China Motors");
    fireEvent.click(screen.getByRole("button", { name: "Créer un devis" }));
    const vehicleCurrency = screen.getByLabelText("Devise du véhicule");
    expect(
      within(vehicleCurrency)
        .getAllByRole("option")
        .map((item) => item.textContent),
    ).toEqual(["USD", "CNY"]);
    expect(
      screen.getByText("Devise Transit").parentElement?.textContent,
    ).toContain("DZD");
  });

  it("updates CIF/DDP immediately and submits the exact API payload", async () => {
    await openAndFillQuotation();

    const total = screen.getByText("Total estimé DDP").parentElement!;
    const profit = screen.getByText("Bénéfice estimé").parentElement!;
    const margin = screen.getByText("Marge estimée").parentElement!;
    expect(within(total).getByText(/2[^\d]*247[^\d]*500 DZD/)).toBeTruthy();
    expect(within(profit).getByText(/352[^\d]*500 DZD/)).toBeTruthy();
    expect(within(margin).getByText("13.56 %")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Créer le devis" }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          vehicleAmount: 10000,
          vehicleCurrency: "USD",
          containerPrice: 4500,
          containerCurrency: "USD",
          containerAllocation: 3,
          insuranceAmount: 0,
          insuranceCurrency: "USD",
          customsAmount: 500000,
          transitAmount: 80000,
          transitCurrency: "DZD",
          sellingPriceDzd: 2600000,
          otherCosts: [],
        }),
      ),
    );
  });

  it("shows the real create error inside the open form", async () => {
    mocks.create.mockRejectedValueOnce(
      new Error("Catalogue synchronization failed and was rolled back"),
    );
    await openAndFillQuotation();
    fireEvent.click(screen.getByRole("button", { name: "Créer le devis" }));

    await screen.findByText(
      "Catalogue synchronization failed and was rolled back",
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Catalogue synchronization failed and was rolled back",
    );
  });
});
