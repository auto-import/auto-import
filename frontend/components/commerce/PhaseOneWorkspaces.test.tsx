// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SuppliersWorkspace from "./SuppliersWorkspace";
import OffersWorkspace from "./OffersWorkspace";

const mocks = vi.hoisted(() => ({
  listPartners: vi.fn(), createPartner: vi.fn(), updatePartner: vi.fn(), archivePartner: vi.fn(),
  listOffers: vi.fn(), offerStats: vi.fn(),
}));

vi.mock("@/lib/commerce-api", () => ({
  commerceApi: {
    partners: { list: mocks.listPartners, create: mocks.createPartner, update: mocks.updatePartner, archive: mocks.archivePartner },
    offers: { list: mocks.listOffers, statistics: mocks.offerStats, create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/components/Topbar", () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));

const pagination = { page: 1, pageSize: 100, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false };

describe("Phase 1 commerce workspaces", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listPartners.mockResolvedValue({ items: [], pagination });
    mocks.listOffers.mockResolvedValue({ items: [], pagination });
    mocks.offerStats.mockResolvedValue({ total: 0, byStatus: {}, availableQuantity: 0, reservedQuantity: 0 });
  });

  it("shows the persisted supplier empty state", async () => {
    render(<SuppliersWorkspace />);
    expect(await screen.findByText("Aucun fournisseur trouvé.")).toBeTruthy();
    expect(mocks.listPartners).toHaveBeenCalledWith(expect.objectContaining({ type: "supplier" }));
  });

  it("submits the supplier form through the API and reloads", async () => {
    mocks.createPartner.mockResolvedValue({ id: "supplier-1", name: "China Motors" });
    render(<SuppliersWorkspace />);
    await screen.findByText("Aucun fournisseur trouvé.");
    fireEvent.click(screen.getByRole("button", { name: /Ajouter/ }));
    fireEvent.change(screen.getByLabelText("Nom *"), { target: { value: "China Motors" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(mocks.createPartner).toHaveBeenCalledWith(expect.objectContaining({ name: "China Motors", type: "supplier" })));
    expect(mocks.listPartners).toHaveBeenCalledTimes(2);
  });

  it("uses the canonical offerId query parameter for dossier creation", async () => {
    mocks.listOffers.mockResolvedValue({ items: [{
      id: "offer-1", reference: "OFF-2026-00001", supplierId: "supplier-1", supplier: { id: "supplier-1", name: "China Motors", specialties: [], status: "active", type: "supplier" },
      brand: "Geely", model: "Coolray", condition: "new", specification: {}, cifPrice: 10000, ddpPrice: 12000,
      currency: "USD", validFrom: "2026-08-01T00:00:00.000Z", validUntil: "2026-09-01T00:00:00.000Z",
      availableQuantity: 2, reservedQuantity: 0, remainingQuantity: 2, status: "available",
    }], pagination: { ...pagination, totalItems: 1, totalPages: 1 } });
    render(<OffersWorkspace />);
    const link = await screen.findByRole("link", { name: "Créer un dossier" });
    expect(link.getAttribute("href")).toBe("/dossiers/creer?offerId=offer-1");
  });
});
