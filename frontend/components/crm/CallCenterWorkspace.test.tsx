// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CallCenterWorkspace from "./CallCenterWorkspace";

const mocks = vi.hoisted(() => ({
  calls: vi.fn(),
  presence: vi.fn(),
  agents: vi.fn(),
  conversations: vi.fn(),
  followUps: vi.fn(),
  appointments: vi.fn(),
  kpis: vi.fn(),
  channels: vi.fn(),
  heartbeat: vi.fn(),
  assign: vi.fn(),
  realtime: vi.fn(),
}));

vi.mock("@/components/Topbar", () => ({ default: () => <div>Topbar</div> }));
vi.mock("@/lib/call-center-realtime", () => ({
  connectCallCenterRealtime: mocks.realtime,
}));
vi.mock("@/lib/crm-api", () => ({
  callCenterApi: {
    calls: mocks.calls,
    presence: mocks.presence,
    agents: mocks.agents,
    conversations: mocks.conversations,
    followUps: mocks.followUps,
    appointments: mocks.appointments,
    kpis: mocks.kpis,
    channels: mocks.channels,
    heartbeat: mocks.heartbeat,
    assign: mocks.assign,
  },
}));

const call = {
  id: "call-1",
  providerCallId: "provider-1",
  externalNumber: "+213550000000",
  companyNumber: "+21321000000",
  state: "QUEUED",
  receivedAt: "2026-08-24T10:00:00Z",
  prospect: {
    id: "lead-1",
    firstName: "Appel",
    lastName: "0000",
    status: "new",
    qualification: "UNCLASSIFIED",
    createdAt: "2026-08-24T10:00:00Z",
  },
  client: null,
  dispatcher: null,
  handlingEmployee: null,
  channel: { id: "channel-1", displayName: "Simulation", providerKey: "mock" },
};

describe("CallCenterWorkspace", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.calls.mockResolvedValue([call]);
    mocks.presence.mockResolvedValue([]);
    mocks.agents.mockResolvedValue([
      { id: "agent-1", firstName: "Samir", lastName: "Agent" },
    ]);
    mocks.conversations.mockResolvedValue([]);
    mocks.followUps.mockResolvedValue([]);
    mocks.appointments.mockResolvedValue([]);
    mocks.channels.mockResolvedValue([]);
    mocks.kpis.mockResolvedValue({
      period: {},
      dispatcher: {
        callsReceived: 1,
        callsDispatched: 0,
        averageDispatchDelaySeconds: 0,
        missedOrUnassigned: 0,
        successfulTransfers: 0,
        failedTransfers: 0,
      },
      agent: {
        answeredCalls: 0,
        missedAssignedCalls: 0,
        answerRate: 0,
        totalTalkSeconds: 0,
        averageTalkSeconds: 0,
        averageWaitSeconds: 0,
        whatsappMessagesHandled: 0,
        callbacksCompleted: 0,
        callbacksOverdue: 0,
        qualifiedLeads: 0,
        appointmentsCreated: 0,
        appointmentsCompleted: 0,
        conversions: 0,
        conversionRate: 0,
      },
    });
    mocks.realtime.mockImplementation((_hint, connection) => {
      connection(true);
      return () => undefined;
    });
    mocks.heartbeat.mockResolvedValue({});
    mocks.assign.mockResolvedValue(call);
  });

  it("shows a queued screen pop and dispatches to a selected employee", async () => {
    render(<CallCenterWorkspace />);
    await waitFor(() =>
      expect(screen.getAllByText("Appel 0000").length).toBeGreaterThan(0),
    );
    fireEvent.click(screen.getAllByText("Appel 0000")[0]);
    fireEvent.change(screen.getByLabelText("EmployÃ© destinataire"), {
      target: { value: "agent-1" },
    });
    fireEvent.click(screen.getByText("Assigner"));
    await waitFor(() =>
      expect(mocks.assign).toHaveBeenCalledWith(
        "call-1",
        "agent-1",
        "Dispatch",
      ),
    );
  });
});
