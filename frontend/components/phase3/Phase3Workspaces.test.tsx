// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardWorkspace from "./DashboardWorkspace";
import TasksWorkspace from "./TasksWorkspace";

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  taskList: vi.fn(),
  userList: vi.fn(),
}));

vi.mock("@/components/Topbar", () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    currentUser: { id: "user-1" },
    hasPermission: () => false,
  }),
}));
vi.mock("@/lib/admin-api", () => ({ adminApi: { listUsers: mocks.userList } }));
vi.mock("@/lib/phase3-api", () => ({
  phase3Api: {
    dashboard: mocks.dashboard,
    tasks: {
      list: mocks.taskList,
      create: vi.fn(),
      complete: vi.fn(),
      cancel: vi.fn(),
    },
  },
}));

describe("Phase 3 workspaces", () => {
  beforeEach(() => {
    mocks.dashboard.mockReset();
    mocks.taskList.mockReset();
    mocks.userList.mockReset();
  });

  it("renders authoritative zero values instead of sample KPIs", async () => {
    mocks.dashboard.mockResolvedValue({
      period: {
        from: "2026-08-01T00:00:00Z",
        to: "2026-08-31T23:59:59Z",
        timezone: "Africa/Algiers",
        baseCurrency: "DZD",
      },
      dossiers: { total: 0, active: 0, byStatus: {}, byType: {} },
      vehicles: { byStatus: {}, bySource: {} },
      finance: {
        issued: "0.00",
        collected: "0.00",
        outstanding: "0.00",
        overdueInvoices: 0,
        costs: "0.00",
        grossMargin: "0.00",
        conversionIssues: [],
      },
      offers: { byStatus: {} },
      crm: {
        activeLeads: 0,
        qualifiedLeads: 0,
        appointments: 0,
        conversions: 0,
      },
      callCenter: { calls: 0, missedCalls: 0, durationSeconds: 0 },
      logistics: { lateShipments: 0, activeCustomsFiles: 0 },
      alerts: { overdueTasks: 0, overdueInvoices: 0, lateShipments: 0 },
      recent: { dossiers: [], events: [] },
    });

    render(<DashboardWorkspace />);
    expect(
      await screen.findByText("Aucun dossier sur la période."),
    ).toBeTruthy();
    expect(
      screen.getByText("Dossiers actifs").nextElementSibling?.textContent,
    ).toBe("0");
  });

  it("shows an API error and a retry action", async () => {
    mocks.dashboard.mockRejectedValue(new Error("Accès interdit"));
    render(<DashboardWorkspace />);
    expect(await screen.findByText("Accès interdit")).toBeTruthy();
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeTruthy();
  });

  it("renders the real empty personal task state", async () => {
    mocks.taskList.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 100,
      totalPages: 0,
      timezone: "Africa/Algiers",
    });
    render(<TasksWorkspace />);
    await waitFor(() =>
      expect(mocks.taskList).toHaveBeenCalledWith({
        view: "mine",
        status: "",
        limit: 100,
      }),
    );
    expect(
      await screen.findByText("Aucune tâche pour ces filtres."),
    ).toBeTruthy();
    expect(screen.queryByText("Nouvelle tâche")).toBeNull();
  });
});
