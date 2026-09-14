// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VehicleStockPolished from "./VehicleStockPolished";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  specs: vi.fn(),
}));
vi.mock("@/components/Topbar", () => ({ default: () => null }));
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));
vi.mock("@/lib/commerce-api", () => ({
  commerceApi: {
    vehicles: {
      list: mocks.list,
      createWithPhotos: mocks.create,
      saveSpecs: mocks.specs,
    },
    configuration: {
      lookups: vi.fn().mockResolvedValue([
        { id: "brand", kind: "BRAND", value: "BYD", active: true },
        {
          id: "model",
          kind: "MODEL",
          value: "Seal",
          parentId: "brand",
          active: true,
        },
      ]),
    },
  },
}));

describe("Vehicle exterior color and paint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({
      items: [],
      pagination: { page: 1, totalPages: 0, totalItems: 0 },
    });
    mocks.create.mockResolvedValue({ id: "vehicle" });
    mocks.specs.mockResolvedValue({});
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:fixture"),
        revokeObjectURL: vi.fn(),
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  it("offers independent selectors and sends their distinct enum values on creation", async () => {
    render(<VehicleStockPolished />);
    await screen.findByText("Aucun véhicule pour ces filtres.");
    fireEvent.click(
      screen.getByRole("button", { name: /Ajouter un véhicule/i }),
    );
    const color = screen.getByRole("combobox", { name: "Couleur extérieure" });
    const paint = screen.getByRole("combobox", { name: "État de la peinture" });
    expect(color.querySelectorAll("option")).toHaveLength(15);
    expect(paint.querySelectorAll("option")).toHaveLength(9);
    fireEvent.change(color, { target: { value: "BLUE" } });
    fireEvent.change(paint, { target: { value: "PARTIALLY_REPAINTED" } });
    fireEvent.change(screen.getByLabelText("Marque *"), {
      target: { value: "BYD" },
    });
    fireEvent.change(screen.getByLabelText("Modèle *"), {
      target: { value: "Seal" },
    });
    document.querySelectorAll('input[type="file"]').forEach((input, i) => {
      fireEvent.change(input, {
        target: {
          files: [
            new File([String(i)], `photo-${i}.png`, { type: "image/png" }),
          ],
        },
      });
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Enregistrer" }).closest("form")!,
    );
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          color: "BLUE",
          paintCondition: "PARTIALLY_REPAINTED",
        }),
        expect.any(Array),
      ),
    );
    await waitFor(() => expect(mocks.specs).toHaveBeenCalled());
    expect(mocks.specs.mock.calls[0][1]).not.toHaveProperty("color");
  });
});
