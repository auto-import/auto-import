import { apiDownload, apiRequest } from "@/lib/api";
import type { PaginatedData } from "@/lib/api-contract";

export interface ApiTask {
  id: string;
  title: string;
  description?: string | null;
  notes?: string | null;
  type: string;
  priority: string;
  status: string;
  dueDate?: string | null;
  completedAt?: string | null;
  overdue: boolean;
  assignedTo: string;
  assignee: { id: string; firstName: string; lastName: string };
  creator: { id: string; firstName: string; lastName: string };
  dossier?: { id: string; reference: string } | null;
  client?: { id: string; firstName: string; lastName: string } | null;
  prospect?: { id: string; firstName: string; lastName: string } | null;
}

export interface ApiNotification {
  id: string;
  type: string;
  category: string;
  severity: string;
  title: string;
  content?: string | null;
  entityUrl?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface ApiNotificationTemplate {
  id: string;
  name: string;
  eventType: string;
  subject?: string | null;
  content: string;
  channel: string;
  active: boolean;
}

export interface ApiDashboard {
  period: { from: string; to: string; timezone: string; baseCurrency: string };
  dossiers: {
    total: number;
    active: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  };
  vehicles: {
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
  };
  finance: {
    issued: string;
    collected: string;
    outstanding: string;
    overdueInvoices: number;
    costs: string;
    grossMargin: string;
    conversionIssues: string[];
    trend: Array<{
      month: string;
      revenue: string;
      collections: string;
      costs: string;
      grossMargin: string;
    }>;
  };
  offers: { byStatus: Record<string, number> };
  crm: {
    activeLeads: number;
    qualifiedLeads: number;
    appointments: number;
    conversions: number;
  };
  callCenter: { calls: number; missedCalls: number; durationSeconds: number };
  logistics: { lateShipments: number; activeCustomsFiles: number };
  alerts: {
    overdueTasks: number;
    overdueCallbacks: number;
    overdueInvoices: number;
    lateShipments: number;
    unmetDossierGates: number;
    items?: Array<{
      id: string;
      kind: string;
      severity: string;
      title: string;
      detail: string;
      href: string;
      dueAt: string | null;
    }>;
  };
  recent: {
    dossiers: Array<{
      id: string;
      reference: string;
      status: string;
      type: string;
      updatedAt: string;
      client: { firstName: string; lastName: string };
      dossierVehicles?: Array<{
        vehicle: { brand: string; model: string; year?: number | null };
      }>;
    }>;
    events: Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string;
      createdAt: string;
    }>;
  };
}

export interface ApiSettings {
  organizationId: string;
  displayName?: string | null;
  legalName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  locale: string;
  timezone: string;
  baseCurrency: string;
  dossierPrefix: string;
  invoicePrefix: string;
  notificationDefaults?: Record<string, boolean> | null;
}

function query(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return params.toString() ? `?${params}` : "";
}

export const phase3Api = {
  tasks: {
    list: (filters: Record<string, string | number | undefined> = {}) =>
      apiRequest<PaginatedData<ApiTask> & { timezone: string }>(
        `/tasks${query(filters)}`,
      ),
    create: (data: Record<string, unknown>) =>
      apiRequest<ApiTask>("/tasks", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Record<string, unknown>) =>
      apiRequest<ApiTask>(`/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    complete: (id: string) =>
      apiRequest<ApiTask>(`/tasks/${id}/complete`, { method: "PATCH" }),
    cancel: (id: string) =>
      apiRequest<ApiTask>(`/tasks/${id}/cancel`, { method: "PATCH" }),
    reassign: (id: string, assignedTo: string) =>
      apiRequest<ApiTask>(`/tasks/${id}/reassign`, {
        method: "PATCH",
        body: JSON.stringify({ assignedTo }),
      }),
  },
  notifications: {
    list: (filters: Record<string, string | number | undefined> = {}) =>
      apiRequest<PaginatedData<ApiNotification> & { unreadCount: number }>(
        `/notifications${query(filters)}`,
      ),
    unread: () => apiRequest<{ count: number }>("/notifications/unread-count"),
    read: (id: string) =>
      apiRequest<ApiNotification>(`/notifications/${id}/read`, {
        method: "PATCH",
      }),
    readAll: () =>
      apiRequest<{ updated: number }>("/notifications/read-all", {
        method: "POST",
      }),
    templates: () =>
      apiRequest<ApiNotificationTemplate[]>("/notifications/templates/manage"),
    createTemplate: (data: {
      name: string;
      eventType: string;
      subject?: string;
      content: string;
      channel?: string;
    }) =>
      apiRequest<ApiNotificationTemplate>("/notifications/templates/manage", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    audience: () =>
      apiRequest<{
        users: Array<{
          id: string;
          firstName: string;
          lastName: string;
          email: string;
        }>;
        roles: Array<{ id: string; name: string }>;
      }>("/notifications/audience"),
    resolveAudience: (data: ApiNotificationSend) =>
      apiRequest<{ recipientCount: number }>(
        "/notifications/audience/resolve",
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      ),
    send: (data: ApiNotificationSend) =>
      apiRequest<{ delivered: number; channel: "in_app"; sentAt: string }>(
        "/notifications/send",
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      ),
  },
  dashboard: (filters: Record<string, string | undefined> = {}) =>
    apiRequest<ApiDashboard>(`/dashboard${query(filters)}`),
  reports: {
    summary: (filters: Record<string, string | undefined> = {}) =>
      apiRequest<ApiDashboard & { generatedAt: string }>(
        `/reports/summary${query(filters)}`,
      ),
    downloadFinance: (filters: Record<string, string | undefined> = {}) =>
      apiDownload(`/reports/finance.pdf${query(filters)}`),
  },
  settings: {
    get: () => apiRequest<ApiSettings>("/settings"),
    update: (data: Partial<ApiSettings>) =>
      apiRequest<ApiSettings>("/settings", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },
  audit: (filters: Record<string, string | number | undefined> = {}) =>
    apiRequest<
      PaginatedData<{
        id: string;
        action: string;
        entityType: string;
        entityId: string;
        newValues?: { changedFields?: string[] };
        correlationId?: string | null;
        createdAt: string;
        user?: { firstName: string; lastName: string; email: string } | null;
      }>
    >(`/audit${query(filters)}`),
};

export interface ApiNotificationSend {
  userIds: string[];
  roleIds: string[];
  allActive: boolean;
  title: string;
  message: string;
  category: string;
  severity: string;
  entityUrl?: string;
}
