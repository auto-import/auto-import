// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import ShipmentDetailDialog from "./ShipmentDetailDialog";
const mocks = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock("@/lib/logistics-api", () => ({
  fetchShipment: vi
    .fn()
    .mockResolvedValue({
      id: "shipment-uuid",
      shipmentNumber: "SHP-1",
      containerType: "THREE_VEHICLES",
      capacity: { maxVehicles: 3, vehicleCount: 2 },
      vehicles: [],
    }),
  addShipmentVehicle: mocks.add,
}));
vi.mock("@/lib/commerce-api", () => ({
  commerceApi: {
    vehicles: {
      list: vi
        .fn()
        .mockResolvedValue({
          items: [{ id: "vehicle-uuid", brand: "Geely", model: "Monjaro" }],
          pagination: { totalPages: 1 },
        }),
    },
  },
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("surfaces a concurrent count-capacity rejection without offering a forbidden override", async () => {
  const confirm = vi.spyOn(window, "confirm");
  mocks.add.mockRejectedValue(
    new ApiError(
      "Ce conteneur est limité à 3 véhicules.",
      409,
      "SHIPMENT_MAX_VEHICLES_EXCEEDED",
    ),
  );
  render(
    <ShipmentDetailDialog
      id="shipment-uuid"
      close={vi.fn()}
      changed={vi.fn()}
    />,
  );
  fireEvent.change(
    await screen.findByRole("combobox", { name: "Ajouter un véhicule" }),
    { target: { value: "vehicle-uuid" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Affecter" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("limité à 3 véhicules"),
  );
  expect(confirm).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
});
