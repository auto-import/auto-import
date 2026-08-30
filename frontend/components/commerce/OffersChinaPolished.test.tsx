// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OffersChinaPolished from "./OffersChinaPolished";

const mocks = vi.hoisted(() => ({
  listOffers: vi.fn(),
  statistics: vi.fn(),
  listPartners: vi.fn(),
  create: vi.fn(),
  createWithPhotos: vi.fn(),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));
vi.mock("@/components/Topbar", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/lib/commerce-api", () => ({
  commerceApi: {
    offers: {
      list: mocks.listOffers,
      statistics: mocks.statistics,
      create: mocks.create,
      createWithPhotos: mocks.createWithPhotos,
    },
    partners: { list: mocks.listPartners },
  },
}));

const pagination = {
  page: 1,
  pageSize: 12,
  totalItems: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

describe("OffersChinaPolished creation", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listOffers.mockResolvedValue({ items: [], pagination });
    mocks.statistics.mockResolvedValue({ total: 0, byStatus: {} });
    mocks.listPartners.mockResolvedValue({
      items: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          name: "China Motors",
          type: "supplier",
          status: "active",
          specialties: [],
        },
      ],
      pagination,
    });
    mocks.create.mockResolvedValue({ id: "offer-1" });
  });

  it("creates a valid supplier offer without requiring photos", async () => {
    render(<OffersChinaPolished />);
    await screen.findByText("Aucune offre pour ces filtres.");
    fireEvent.click(screen.getByRole("button", { name: "Nouvelle offre" }));

    fireEvent.change(screen.getByLabelText("Fournisseur *"), {
      target: { value: "00000000-0000-4000-8000-000000000001" },
    });
    fireEvent.change(screen.getByLabelText("Marque *"), {
      target: { value: "Geely" },
    });
    fireEvent.change(screen.getByLabelText("Modèle *"), {
      target: { value: "Coolray" },
    });
    fireEvent.change(screen.getByLabelText("Prix fournisseur *"), {
      target: { value: "12000" },
    });
    fireEvent.change(screen.getByLabelText("Valide jusqu’au *"), {
      target: { value: "2026-09-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Créer l’offre" }));

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: "Geely",
          model: "Coolray",
          supplierPrice: 12000,
          availableQuantity: 1,
          condition: "new",
          currency: "USD",
        }),
      ),
    );
    expect(mocks.createWithPhotos).not.toHaveBeenCalled();
  });
});
