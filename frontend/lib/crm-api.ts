import { apiRequest, apiUpload } from "@/lib/api";
import type {
  ApiAgentPresenceStatus,
  ApiCallState,
  ApiLeadQualification,
  ApiCrmLeadStatus,
  PaginatedData,
} from "@/lib/api-contract";

export interface AgentSummary {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ApiTask {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate?: string | null;
  assignee?: AgentSummary;
  prospect?: ApiProspect | null;
  client?: ApiClient | null;
  callbackForCall?: { id: string; externalNumber: string } | null;
}

export interface ApiProspect {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  wilaya?: string | null;
  city?: string | null;
  countryId?: string | null;
  entryChannelId?: string | null;
  marketingSourceId?: string | null;
  entryChannel?: ApiCrmReference | null;
  marketingSource?: ApiCrmReference | null;
  country?: ApiCrmReference | null;
  status: string;
  crmStatus?: ApiCrmLeadStatus | null;
  crmOutcome?: string | null;
  qualification: ApiLeadQualification;
  assignedTo?: string | null;
  assignee?: AgentSummary | null;
  notes?: string | null;
  lastInteractionAt?: string | null;
  nextActionAt?: string | null;
  nextAction?: string | null;
  createdAt: string;
  tasks?: ApiTask[];
  client?: { id: string } | null;
  vehicleRequests?: LeadVehicleRequirement[];
  archivedAt?: string | null;
}

export interface ApiCrmReference {
  id: string;
  kind: "ENTRY_CHANNEL" | "MARKETING_SOURCE" | "COUNTRY";
  code: string;
  labelFr: string;
  active: boolean;
  sortOrder: number;
  metadata?: Record<string, unknown> | null;
}

export interface LeadVehicleRequirement {
  id?: string;
  brand?: string | null;
  model?: string | null;
  minYear?: number | null;
  maxYear?: number | null;
  budgetMin?: string | number | null;
  budgetMax?: string | number | null;
  currency?: string | null;
  preferredColor?: string | null;
  requirements?: string | null;
}

export interface CreateLeadInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  wilaya?: string;
  city?: string;
  countryId?: string;
  entryChannelId: string;
  marketingSourceId: string;
  qualification?: ApiLeadQualification;
  assignedTo?: string;
  notes?: string;
  nextAction?: string;
  nextActionAt?: string;
  requirement?: Omit<LeadVehicleRequirement, "id">;
}

export interface ApiClient {
  id: string;
  prospectId?: string | null;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  nationality?: string | null;
  ninMasked?: string | null;
  passportNumberMasked?: string | null;
  identityIssueDate?: string | null;
  passportExpiry?: string | null;
  countryId?: string | null;
  nationalityCountryId?: string | null;
  country?: ApiCrmReference | null;
  nationalityCountry?: ApiCrmReference | null;
  identityConfigured?: { nin: boolean; passport: boolean };
  address?: string | null;
  status: string;
  assignedTo?: string | null;
  assignee?: AgentSummary | null;
  lastInteractionAt?: string | null;
  nextActionAt?: string | null;
  createdAt: string;
  tasks?: ApiTask[];
  stats?: {
    totalDossiers: number;
    totalOrders: number;
    activeDossiers: number;
  };
  access?: Record<string, boolean>;
  dossiers?: Array<Record<string, unknown>>;
  documents?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
  history?: Array<Record<string, unknown>>;
  conversions?: Array<Record<string, unknown>>;
}

export interface TimelineItem {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

export interface ApiCall {
  id: string;
  providerKey: string;
  providerCallId: string;
  direction: "INBOUND" | "OUTBOUND";
  externalNumber: string;
  companyNumber: string;
  state: ApiCallState;
  receivedAt: string;
  queuedAt?: string | null;
  answeredAt?: string | null;
  completedAt?: string | null;
  durationSeconds?: number | null;
  waitingSeconds?: number | null;
  outcome?: string | null;
  notes?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
  subject?: string | null;
  dispositionedAt?: string | null;
  prospect?: ApiProspect | null;
  client?: ApiClient | null;
  dispatcher?: AgentSummary | null;
  handlingEmployee?: AgentSummary | null;
  recordedBy?: AgentSummary | null;
  dossier?: { id: string; reference: string; clientId: string } | null;
  channel: { id: string; displayName: string; providerKey: string };
}

export interface ManualCallInput {
  phone: string;
  callAt: string;
  direction: "INBOUND" | "OUTBOUND";
  agentId: string;
  durationSeconds: number;
  state: "COMPLETED" | "MISSED" | "FAILED";
  subject: string;
  outcome: string;
  notes?: string;
  nextAction?: string;
  followUpAt?: string;
  prospectId?: string;
  clientId?: string;
  dossierId?: string;
}

export interface ApiPresence {
  id: string;
  status: ApiAgentPresenceStatus;
  lastHeartbeatAt: string;
  user: AgentSummary & { officeId?: string | null };
  currentCall?: {
    id: string;
    externalNumber: string;
    state: ApiCallState;
  } | null;
}

export interface ApiMessage {
  id: string;
  providerMessageId: string;
  direction: "INBOUND" | "OUTBOUND";
  text?: string | null;
  status: string;
  occurredAt: string;
}

export interface ApiConversation {
  id: string;
  externalNumber: string;
  lastMessageAt?: string | null;
  prospect?: ApiProspect | null;
  client?: ApiClient | null;
  assignee?: AgentSummary | null;
  messages: ApiMessage[];
}

export interface ApiAppointment {
  id: string;
  title: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  notes?: string | null;
  assignee: AgentSummary;
  prospect?: ApiProspect | null;
  client?: ApiClient | null;
}

export interface ApiKpis {
  period: { from: string; toExclusive: string; timezone: string };
  dispatcher: {
    callsReceived: number;
    callsDispatched: number;
    averageDispatchDelaySeconds: number;
    missedOrUnassigned: number;
    successfulTransfers: number;
    failedTransfers: number;
  };
  agent: {
    answeredCalls: number;
    missedAssignedCalls: number;
    answerRate: number;
    totalTalkSeconds: number;
    averageTalkSeconds: number;
    averageWaitSeconds: number;
    whatsappMessagesHandled: number;
    callbacksCompleted: number;
    callbacksOverdue: number;
    qualifiedLeads: number;
    appointmentsCreated: number;
    appointmentsCompleted: number;
    conversions: number;
    conversionRate: number;
  };
}

function query(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const result = params.toString();
  return result ? `?${result}` : "";
}

export const crmApi = {
  listProspects(filters: Record<string, string | number | undefined> = {}) {
    return apiRequest<PaginatedData<ApiProspect>>(
      `/prospects${query(filters)}`,
    );
  },
  getProspect(id: string) {
    return apiRequest<ApiProspect>(`/prospects/${id}`);
  },
  createProspect(input: CreateLeadInput) {
    return apiRequest<ApiProspect & { created: boolean; matchState: string }>(
      "/prospects",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  },
  updateProspect(id: string, input: Partial<ApiProspect>) {
    return apiRequest<ApiProspect>(`/prospects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  addActivity(
    id: string,
    input: { type: string; title: string; description?: string },
  ) {
    return apiRequest(`/prospects/${id}/activities`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  convertProspect(id: string) {
    return apiRequest<ApiClient>(`/prospects/${id}/convert`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  transitionProspect(id: string, status: ApiCrmLeadStatus, reason?: string) {
    return apiRequest<ApiProspect>(`/prospects/${id}/transition`, {
      method: "POST",
      body: JSON.stringify({ status, reason }),
    });
  },
  archiveProspect(id: string, reason: string) {
    return apiRequest(`/prospects/${id}/archive`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
  referenceData() {
    return apiRequest<ApiCrmReference[]>("/crm/reference-data");
  },
  assignees() {
    return apiRequest<AgentSummary[]>("/prospects/assignees");
  },
  listClients(filters: Record<string, string | number | undefined> = {}) {
    return apiRequest<PaginatedData<ApiClient>>(`/clients${query(filters)}`);
  },
  getClient(id: string) {
    return apiRequest<ApiClient>(`/clients/${id}`);
  },
  createClient(input: Partial<ApiClient>) {
    return apiRequest<ApiClient>("/clients", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  archiveClient(id: string, reason: string) {
    return apiRequest(`/clients/${id}/archive`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
  createClientWithPassport(
    input: Record<string, string | undefined>,
    passportScan: File,
  ) {
    const body = new FormData();
    for (const [key, value] of Object.entries(input))
      if (value) body.append(key, value);
    body.append("passportScan", passportScan);
    return apiUpload<{ client: ApiClient }>("/clients/with-passport", body);
  },
  timeline(ownerType: "prospect" | "client", id: string, cursor?: string) {
    return apiRequest<{ items: TimelineItem[]; nextCursor: string | null }>(
      `/crm/timeline/${ownerType}/${id}${query({ cursor })}`,
    );
  },
  addNote(ownerType: "prospect" | "client", ownerId: string, content: string) {
    return apiRequest("/crm/notes", {
      method: "POST",
      body: JSON.stringify({ ownerType, ownerId, content }),
    });
  },
};

export const callCenterApi = {
  calls(view?: string) {
    return apiRequest<ApiCall[]>(`/call-center/calls${query({ view })}`);
  },
  call(id: string) {
    return apiRequest<ApiCall>(`/call-center/calls/${id}`);
  },
  history(filters: Record<string, string | number | undefined> = {}) {
    return apiRequest<PaginatedData<ApiCall>>(
      `/call-center/history${query(filters)}`,
    );
  },
  createManualCall(input: ManualCallInput) {
    return apiRequest<ApiCall>("/call-center/calls/manual", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateManualCall(id: string, input: Partial<ManualCallInput>) {
    return apiRequest<ApiCall>(`/call-center/calls/${id}/manual`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  assign(id: string, toUserId: string, reason?: string) {
    return apiRequest<ApiCall>(`/call-center/calls/${id}/assign`, {
      method: "POST",
      body: JSON.stringify({ toUserId, reason }),
    });
  },
  transition(id: string, state: ApiCallState, reason?: string) {
    return apiRequest<ApiCall>(`/call-center/calls/${id}/state`, {
      method: "POST",
      body: JSON.stringify({ state, reason }),
    });
  },
  disposition(id: string, input: Record<string, unknown>) {
    return apiRequest<ApiCall>(`/call-center/calls/${id}/disposition`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  presence() {
    return apiRequest<ApiPresence[]>("/call-center/presence");
  },
  agents() {
    return apiRequest<AgentSummary[]>("/call-center/agents");
  },
  setPresence(status: ApiAgentPresenceStatus) {
    return apiRequest<ApiPresence>("/call-center/presence/me", {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },
  heartbeat() {
    return apiRequest("/call-center/presence/heartbeat", { method: "POST" });
  },
  conversations() {
    return apiRequest<ApiConversation[]>("/call-center/whatsapp/conversations");
  },
  conversation(id: string) {
    return apiRequest<ApiConversation>(
      `/call-center/whatsapp/conversations/${id}`,
    );
  },
  reply(id: string, text: string, idempotencyKey: string) {
    return apiRequest<ApiMessage>(
      `/call-center/whatsapp/conversations/${id}/replies`,
      {
        method: "POST",
        body: JSON.stringify({ text, idempotencyKey }),
      },
    );
  },
  followUps(queue?: string) {
    return apiRequest<ApiTask[]>(`/call-center/follow-ups${query({ queue })}`);
  },
  setTaskStatus(id: string, status: string) {
    return apiRequest<ApiTask>(`/call-center/tasks/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },
  appointments() {
    return apiRequest<ApiAppointment[]>("/call-center/appointments");
  },
  kpis() {
    return apiRequest<ApiKpis>("/call-center/kpis");
  },
  channels() {
    return apiRequest<
      Array<{ id: string; channel: string; normalizedNumber: string }>
    >("/call-center/channels");
  },
  simulateCall(input: Record<string, unknown>) {
    return apiRequest("/call-center/simulator/calls/inbound", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  simulateWhatsapp(input: Record<string, unknown>) {
    return apiRequest("/call-center/simulator/whatsapp/inbound", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};
