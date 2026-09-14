import { apiRequest } from "./api";

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
}
export interface TwoFactorSetup {
  secret: string;
  provisioningUri: string;
  qrCodeDataUrl: string;
  expiresAt: string;
}
const post = <T>(path: string, data: unknown) =>
  apiRequest<T>(
    `/auth/two-factor/${path}`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    { retryAfterRefresh: false },
  );
export const twoFactorApi = {
  status: () => apiRequest<TwoFactorStatus>("/auth/two-factor/status"),
  setup: (currentPassword: string) =>
    post<TwoFactorSetup>("setup", { currentPassword }),
  enable: (code: string) =>
    post<{ enabled: boolean; recoveryCodes: string[] }>("enable", { code }),
  disable: (currentPassword: string, code: string) =>
    post("disable", { currentPassword, code }),
  reset: (
    id: string,
    currentPassword: string,
    code: string | undefined,
    reason: string,
  ) => post(`users/${id}/reset`, { currentPassword, code, reason }),
};
