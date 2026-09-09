// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClientsWorkspace from "./ClientsWorkspace";

const mocks = vi.hoisted(() => ({
  referenceData: vi.fn(),
  createCountry: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/Topbar", () => ({ default: () => null }));
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));
vi.mock("@/lib/crm-api", () => ({
  crmApi: {
    listClients: vi.fn().mockResolvedValue({ items: [], pagination: {} }),
    referenceData: mocks.referenceData,
    createCountry: mocks.createCountry,
    createClient: mocks.createClient,
  },
}));

describe("Client persisted country references", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.referenceData.mockResolvedValue([]);
  });
  async function open() {
    render(<ClientsWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /Ajouter un client/i }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("combobox", {
            name: "Pays de résidence",
          }) as HTMLSelectElement
        ).disabled,
      ).toBe(false),
    );
  }
  it("identifies residence and nationality, creates one shared COUNTRY and reloads from API", async () => {
    const country = {
      id: "persisted-country-uuid",
      kind: "COUNTRY",
      active: true,
      labelFr: "Nouveau pays",
    };
    mocks.createCountry.mockResolvedValue(country);
    await open();
    expect(
      screen.getAllByRole("option", { name: "Aucun pays enregistré" }),
    ).toHaveLength(2);
    fireEvent.click(
      screen.getAllByRole("button", { name: "+ Ajouter un pays" })[0],
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Nom du pays" }), {
      target: { value: country.labelFr },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer le pays" }),
    );
    expect(await screen.findByRole("status")).toHaveProperty(
      "textContent",
      "Valeur enregistrée.",
    );
    expect(mocks.createCountry).toHaveBeenCalledWith({
      labelFr: country.labelFr,
      code: undefined,
    });
    expect(
      (
        screen.getByRole("combobox", {
          name: "Pays de résidence",
        }) as HTMLSelectElement
      ).value,
    ).toBe(country.id);
    expect(
      within(screen.getByRole("combobox", { name: "Nationalité" })).getByRole(
        "option",
        { name: country.labelFr },
      ),
    ).toBeTruthy();
    cleanup();
    mocks.referenceData.mockResolvedValue([country]);
    await open();
    expect(
      screen.getAllByRole("option", { name: country.labelFr }),
    ).toHaveLength(2);
    expect(mocks.referenceData).toHaveBeenCalledTimes(2);
  });
  it("shows API creation failure without reporting success", async () => {
    mocks.createCountry.mockRejectedValue(new Error("Ce pays existe déjà."));
    await open();
    fireEvent.click(
      screen.getAllByRole("button", { name: "+ Ajouter un pays" })[1],
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Nom du pays" }), {
      target: { value: "Duplicate" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer le pays" }),
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Ce pays existe déjà.",
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("distinguishes a failed reference request from an empty list", async () => {
    mocks.referenceData.mockRejectedValue(
      new Error("Référentiel indisponible"),
    );
    render(<ClientsWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /Ajouter un client/i }));
    expect(await screen.findAllByRole("alert")).toHaveLength(2);
    expect(
      screen.queryByRole("option", { name: "Aucun pays enregistré" }),
    ).toBeNull();
  });
});
