// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClientsWorkspace from "./ClientsWorkspace";

const mocks = vi.hoisted(() => ({
  listClients: vi.fn().mockResolvedValue({ items: [], pagination: {} }),
  referenceData: vi.fn().mockResolvedValue([]),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/Topbar", () => ({ default: () => <div>Topbar</div> }));
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));
vi.mock("@/lib/crm-api", () => ({
  crmApi: {
    listClients: mocks.listClients,
    referenceData: mocks.referenceData,
    createClient: vi.fn(),
    createClientWithIdentityDocument: vi.fn(),
  },
}));

describe("ClientsWorkspace identity form", () => {
  afterEach(() => cleanup());

  it("shows separate document number and NIN fields for passport and ID card", () => {
    render(<ClientsWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /Ajouter un client/i }));

    const identityType = screen
      .getByRole("option", { name: "Passeport" })
      .closest("select");
    expect(identityType).not.toBeNull();

    fireEvent.change(identityType!, { target: { value: "PASSPORT" } });
    expect(screen.getByPlaceholderText(/passeport/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/NIN.*18 chiffres/i)).toBeTruthy();

    fireEvent.change(identityType!, { target: { value: "NATIONAL_ID" } });
    expect(screen.getByPlaceholderText(/carte/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/NIN.*18 chiffres/i)).toBeTruthy();
  });
});
