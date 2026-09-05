// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeadsWorkspace from "./LeadsWorkspace";

const mocks = vi.hoisted(() => ({
  listProspects: vi.fn(),
  referenceData: vi.fn(),
  assignees: vi.fn(),
}));

vi.mock("@/components/Topbar", () => ({ default: () => <div>Topbar</div> }));
vi.mock("@/components/crm/LeadDetailDialog", () => ({ default: () => null }));
vi.mock("@/components/crm/LeadFormDialog", () => ({ default: () => null }));
vi.mock("@/lib/crm-api", () => ({
  crmApi: {
    listProspects: mocks.listProspects,
    referenceData: mocks.referenceData,
    assignees: mocks.assignees,
  },
}));

describe("LeadsWorkspace", () => {
  beforeEach(() => {
    mocks.listProspects.mockReset();
    mocks.referenceData.mockResolvedValue([]);
    mocks.assignees.mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it("renders the API empty state without falling back to mocks", async () => {
    mocks.listProspects.mockResolvedValue({ items: [], pagination: {} });
    render(<LeadsWorkspace />);
    expect(screen.getByText("Chargement du pipeline…")).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByText("Aucun lead ne correspond aux filtres."),
      ).toBeTruthy(),
    );
    expect(mocks.listProspects).toHaveBeenCalled();
  });

  it("loads archived leads through the backend archive filter", async () => {
    mocks.listProspects.mockResolvedValue({ items: [], pagination: {} });
    render(<LeadsWorkspace />);
    await waitFor(() => expect(mocks.listProspects).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Archives" }));

    await waitFor(() =>
      expect(mocks.listProspects).toHaveBeenLastCalledWith(
        expect.objectContaining({ archivedOnly: "true" }),
      ),
    );
    expect(screen.queryByRole("button", { name: /Nouveau lead/i })).toBeNull();
  });
});
