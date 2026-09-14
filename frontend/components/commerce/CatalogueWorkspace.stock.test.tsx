// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CatalogueWorkspace from "./CatalogueWorkspace";
const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/components/Topbar", () => ({ default: () => null }));
vi.mock("@/lib/commerce-api", () => ({
  commerceApi: {
    catalogue: {
      list: mocks.list,
      suppliers: vi
        .fn()
        .mockResolvedValue([{ id: "supplier-b", name: "Supplier B" }]),
    },
  },
}));
afterEach(cleanup);
it("displays stock through the single catalogue endpoint and filters by supplier and source", async () => {
  mocks.list.mockResolvedValue({
    items: [
      {
        id: "catalogue-uuid",
        sourceId: "vehicle-uuid",
        sourceType: "VEHICLE",
        brand: "Geely",
        model: "Monjaro",
        status: "available",
        remainingQuantity: 1,
        cifPrice: 3000000,
        supplier: { id: "supplier-b", name: "Supplier B" },
      },
    ],
    pagination: { page: 1, totalItems: 1, totalPages: 1 },
  });
  render(<CatalogueWorkspace />);
  expect(await screen.findByText("Geely Monjaro")).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "Fournisseur" }), {
    target: { value: "supplier-b" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Source" }), {
    target: { value: "VEHICLE" },
  });
  await waitFor(() =>
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        supplierId: "supplier-b",
        sourceType: "VEHICLE",
      }),
    ),
  );
  expect(screen.getByRole("link").getAttribute("href")).toBe(
    "/catalogue/catalogue-uuid",
  );
});
