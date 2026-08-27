// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";
import VehicleStockPolished from "./commerce/VehicleStockPolished";
import { I18nProvider } from "./I18nProvider";

const mocks = vi.hoisted(() => ({ listVehicles: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/vehicules" }));
vi.mock("@/components/Topbar", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    currentUser: {
      firstName: "Amina",
      lastName: "Admin",
      locale: "fr",
      roles: [{ name: "Admin" }],
    },
    hasPermission: () => true,
    refreshCurrentUser: vi.fn(),
  }),
}));
vi.mock("@/lib/commerce-api", () => ({
  commerceApi: {
    vehicles: {
      list: mocks.listVehicles,
      createWithPhotos: vi.fn(),
      update: vi.fn(),
      replacePhotos: vi.fn(),
      saveSpecs: vi.fn(),
      photoBlob: vi.fn(),
    },
  },
}));

describe("UI polish navigation and vehicle photos", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listVehicles.mockResolvedValue({
      items: [],
      pagination: {
        page: 1,
        pageSize: 12,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  });

  it("keeps Audit out of normal navigation", () => {
    render(
      <I18nProvider>
        <Sidebar />
      </I18nProvider>,
    );
    expect(screen.queryByRole("link", { name: /audit/i })).toBeNull();
  });

  it("renders three ordered upload slots and blocks submission when they are incomplete", async () => {
    render(<VehicleStockPolished />);
    await screen.findByText("Aucun véhicule pour ces filtres.");
    fireEvent.click(
      screen.getByRole("button", { name: /ajouter un véhicule/i }),
    );
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Marque *"), {
      target: { value: "BYD" },
    });
    fireEvent.change(screen.getByLabelText("Modèle *"), {
      target: { value: "Seal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(
        screen.getByText("Les trois photos distinctes sont obligatoires."),
      ).toBeTruthy(),
    );
  });
});
