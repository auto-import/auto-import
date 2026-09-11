// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ExpeditionsPage from "./page";
import { commerceApi } from "@/lib/commerce-api";
import { createShipment } from "@/lib/logistics-api";
const mocks = vi.hoisted(() => ({ partners: vi.fn() }));
vi.mock("@/components", () => ({ Topbar: () => null, StatusBadge: () => null, DataTable: () => null }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock("@/lib/commerce-api", () => ({ commerceApi: { partners: { list: mocks.partners } } }));
vi.mock("@/lib/logistics-api", () => ({
  fetchShipments: vi.fn().mockResolvedValue({ items: [], pagination: { total: 0 } }),
  fetchCustomsFiles: vi.fn().mockResolvedValue({ items: [], pagination: { total: 0 } }),
  fetchContainerTypes: vi.fn().mockResolvedValue([{ code: "THREE_VEHICLES", label: "3 vehicules" }]),
  fetchPorts: vi.fn().mockResolvedValue([]),
  createShipment: vi.fn().mockResolvedValue({ id: "shipment" }),
}));
vi.mock("@/lib/dossier-money", async (original) => ({ ...(await original<object>()), fetchShipmentDzdRates: vi.fn().mockResolvedValue({ rates: [] }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("loads all pages using the backend logistics filter and submits the selected supplier ID", async () => {
  mocks.partners.mockResolvedValueOnce({ items: [{ id: "supplier-1", name: "Logistics one", supplierType: "LOGISTICS_PROVIDER" }], pagination: { totalPages: 2 } })
    .mockResolvedValueOnce({ items: [{ id: "supplier-2", name: "Logistics two", supplierType: "LOGISTICS_PROVIDER" }], pagination: { totalPages: 2 } });
  render(<ExpeditionsPage />);
  fireEvent.click(screen.getByRole("button", { name: /Nouvelle exp/ }));
  await screen.findByRole("option", { name: "Logistics two" });
  expect(commerceApi.partners.list).toHaveBeenCalledWith({ type: "supplier", supplierType: "LOGISTICS_PROVIDER", status: "active", limit: 100, page: 1 });
  expect(commerceApi.partners.list).toHaveBeenCalledWith(expect.objectContaining({ supplierType: "LOGISTICS_PROVIDER", page: 2 }));
  fireEvent.change(screen.getByLabelText("Fournisseur"), { target: { value: "supplier-2" } });
  fireEvent.change(screen.getByLabelText("Type conteneur"), { target: { value: "THREE_VEHICLES" } });
  const form = screen.getByLabelText("Fournisseur").closest("form")!;
  fireEvent.submit(form);
  await waitFor(() => expect(createShipment).toHaveBeenCalledWith(expect.objectContaining({ carrierPartnerId: "supplier-2" })));
});
