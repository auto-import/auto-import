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
  currentRate: vi.fn(),
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
      currentUsdDzdRate: mocks.currentRate,
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
  supplierPrice: 8000,
  totalOfferPrice: 8500,
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
      supplierPrice: 8000,
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
  await waitFor(() => expect(mocks.currentRate).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("Prix du conteneur (USD)"), {
    target: { value: "6000" },
  });
  fireEvent.change(screen.getByLabelText("Assurance"), {
    target: { value: "300" },
  });
  fireEvent.change(screen.getByLabelText("Douane estimée (non incluse)"), {
    target: { value: "1000" },
  });
  fireEvent.change(screen.getByLabelText("Transit"), {
    target: { value: "200" },
  });
  fireEvent.change(screen.getByLabelText("Montant autre coût 1"), {
    target: { value: "500" },
  });
  fireEvent.change(screen.getByLabelText("Description autre coût 1"), {
    target: { value: "Frais de manutention" },
  });
}

describe("OfferDetailWorkspace quotation workflow", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOffer.mockResolvedValue(offer);
    mocks.listQuotations.mockResolvedValue({ items: [], pagination });
    mocks.currentRate.mockResolvedValue({
      exchangeRateId: "rate-1",
      exchangeRateSnapshot: "250",
      baseCurrency: "USD",
      quoteCurrency: "DZD",
    });
    mocks.preview.mockResolvedValue({ exchangeRateSnapshot: "250" });
    mocks.create.mockResolvedValue({ id: "quotation-1" });
  });

  it("updates CIF/DDP immediately and submits the exact API payload", async () => {
    await openAndFillQuotation();

    const cif = screen.getByText("Prix CIF").parentElement!;
    const ddp = screen.getByText("Prix DDP").parentElement!;
    expect(within(cif).getByText(/11[^\d]*000 USD/)).toBeTruthy();
    expect(within(cif).getByText(/2[^\d]*750[^\d]*000 DZD/)).toBeTruthy();
    expect(within(ddp).getByText(/12[^\d]*000 USD/)).toBeTruthy();
    expect(within(ddp).getByText(/3[^\d]*000[^\d]*000 DZD/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Créer le devis" }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          vehicleAmount: 8000,
          containerPrice: 6000,
          containerAllocation: 3,
          insuranceAmount: 300,
          customsAmount: 1000,
          transitAmount: 200,
          otherCosts: [{ amount: 500, description: "Frais de manutention" }],
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
