// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CatalogueWorkspace from "./CatalogueWorkspace";
const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/components/Topbar", () => ({ default: () => null }));
vi.mock("@/lib/commerce-api", () => ({
  commerceApi: {
    catalogue: {
      list: vi.fn().mockResolvedValue({
        items: [],
        pagination: { page: 1, totalItems: 0, totalPages: 0 },
      }),
    },
    vehicles: { list: mocks.list },
  },
}));
afterEach(cleanup);
it("loads the canonical inventory and displays its reserved status in Catalogue", async () => {
  mocks.list.mockResolvedValue({
    items: [
      {
        id: "canonical-uuid",
        brand: "Geely",
        model: "Monjaro",
        vin: "REAL-VIN",
        status: "reserved",
      },
    ],
    pagination: { page: 1, totalItems: 1, totalPages: 1 },
  });
  render(<CatalogueWorkspace />);
  fireEvent.click(screen.getByRole("button", { name: "Véhicules en stock" }));
  expect(await screen.findByText("Geely Monjaro")).toBeTruthy();
  expect(screen.getByText("Réservé", { selector: "p" })).toBeTruthy();
  expect(mocks.list).toHaveBeenCalledWith(
    expect.objectContaining({ inventoryOnly: "true" }),
  );
  expect(
    screen
      .getByRole("link", { name: "Voir le véhicule et ses dossiers" })
      .getAttribute("href"),
  ).toBe("/vehicules?vehicleId=canonical-uuid");
});
