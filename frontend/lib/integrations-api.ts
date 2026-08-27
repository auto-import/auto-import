import { apiRequest } from "@/lib/api";

export interface ApiIntegrationConfig {
  id?: string;
  kind: "telephony" | "whatsapp";
  providerName: string;
  displayName?: string | null;
  baseUrl?: string | null;
  publicIdentifiers?: Record<string, string> | null;
  configured: boolean;
  credentialsMasked?: string | null;
  enabled: boolean;
  liveStatus: "NOT_CONFIGURED" | "SIMULATOR" | "ADAPTER_REQUIRED";
  webhookUrl: string;
  webhookLastEventAt?: string | null;
  webhookLastStatus?: string | null;
  updatedAt?: string;
}

export const integrationsApi = {
  list: () => apiRequest<ApiIntegrationConfig[]>("/settings/integrations"),
  save: (data: {
    kind: ApiIntegrationConfig["kind"];
    providerName: string;
    displayName?: string;
    baseUrl?: string;
    publicIdentifiers?: Record<string, string>;
    credentials?: Record<string, string>;
    enabled: boolean;
  }) =>
    apiRequest<ApiIntegrationConfig>("/settings/integrations", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  revoke: (kind: ApiIntegrationConfig["kind"]) =>
    apiRequest<ApiIntegrationConfig>(
      `/settings/integrations/${kind}/credentials`,
      { method: "DELETE" },
    ),
  test: (kind: ApiIntegrationConfig["kind"]) =>
    apiRequest<{
      status: string;
      live: boolean;
      simulated?: boolean;
      reason?: string;
    }>(`/settings/integrations/${kind}/test`, { method: "POST" }),
};
