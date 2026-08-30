import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  ApiPermission,
} from "@/lib/api-contract";
import { publicApiBaseUrl } from "@/lib/runtime-endpoints";

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  locale: "fr" | "en";
  office: { id: string; name: string } | null;
  roles: Array<{ id: string; name: string; scope: string }>;
  permissions: ApiPermission[];
  avatarUrl?: string | null;
}

interface AuthResult {
  accessToken: string;
  user: AuthenticatedUser;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE_URL = publicApiBaseUrl();

let accessToken: string | null = null;
let refreshPromise: Promise<AuthResult> | null = null;

async function parseResponse<T>(response: Response): Promise<T> {
  let payload: ApiSuccessResponse<T> | ApiErrorResponse | null = null;
  try {
    payload = (await response.json()) as
      ApiSuccessResponse<T> | ApiErrorResponse;
  } catch {
    throw new ApiError(
      response.ok ? "Réponse serveur invalide" : "Erreur serveur",
      response.status,
      "INVALID_RESPONSE",
    );
  }

  if (!response.ok || !payload.success) {
    const error = !payload.success ? payload.error : undefined;
    throw new ApiError(
      error?.message ?? "La requête a échoué",
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.details ?? [],
    );
  }
  return payload.data;
}

async function refreshAccessToken(): Promise<AuthResult> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then((response) => parseResponse<AuthResult>(response))
      .then((result) => {
        accessToken = result.accessToken;
        return result;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

interface RequestOptions {
  authenticated?: boolean;
  retryAfterRefresh?: boolean;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const authenticated = options.authenticated ?? true;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (authenticated && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError("Impossible de joindre le serveur", 0, "NETWORK_ERROR");
  }

  if (
    response.status === 401 &&
    authenticated &&
    (options.retryAfterRefresh ?? true)
  ) {
    await refreshAccessToken();
    return apiRequest<T>(path, init, {
      authenticated: true,
      retryAfterRefresh: false,
    });
  }
  return parseResponse<T>(response);
}

export async function apiDownload(
  path: string,
): Promise<{ blob: Blob; filename: string }> {
  const request = async (retry: boolean): Promise<Response> => {
    const headers = new Headers();
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers,
      credentials: "include",
    });
    if (response.status === 401 && retry) {
      await refreshAccessToken();
      return request(false);
    }
    return response;
  };
  const response = await request(true);
  if (!response.ok) {
    await parseResponse(response);
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedFilename = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const filename = encodedFilename
    ? decodeURIComponent(encodedFilename)
    : (/filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? "download");
  return { blob: await response.blob(), filename };
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  method = "POST",
): Promise<T> {
  return apiRequest<T>(path, { method, body: formData });
}

export const authApi = {
  async login(email: string, password: string): Promise<AuthenticatedUser> {
    const result = await apiRequest<AuthResult>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
      { authenticated: false, retryAfterRefresh: false },
    );
    accessToken = result.accessToken;
    return result.user;
  },

  async restore(): Promise<AuthenticatedUser> {
    await refreshAccessToken();
    return apiRequest<AuthenticatedUser>("/auth/me", undefined, {
      retryAfterRefresh: false,
    });
  },

  async me(): Promise<AuthenticatedUser> {
    return apiRequest<AuthenticatedUser>("/auth/me");
  },

  async changePassword(data: {
    currentPassword: string;
    newPassword: string;
    confirmation: string;
  }): Promise<{ user: AuthenticatedUser; sessionBehavior: string }> {
    const result = await apiRequest<AuthResult & { sessionBehavior: string }>(
      "/auth/change-password",
      { method: "POST", body: JSON.stringify(data) },
    );
    accessToken = result.accessToken;
    return { user: result.user, sessionBehavior: result.sessionBehavior };
  },

  async changeEmail(data: {
    currentPassword: string;
    newEmail: string;
    confirmation: string;
  }): Promise<{ user: AuthenticatedUser; sessionBehavior: string }> {
    const result = await apiRequest<AuthResult & { sessionBehavior: string }>(
      "/auth/change-email",
      { method: "POST", body: JSON.stringify(data) },
    );
    accessToken = result.accessToken;
    return { user: result.user, sessionBehavior: result.sessionBehavior };
  },

  async logout(): Promise<void> {
    try {
      await apiRequest<{ message: string }>(
        "/auth/logout",
        { method: "POST" },
        { authenticated: false, retryAfterRefresh: false },
      );
    } finally {
      accessToken = null;
    }
  },

  clearAccessToken(): void {
    accessToken = null;
  },

  accessToken(): string | null {
    return accessToken;
  },
};

export interface ApiProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  office: { id: string; name: string; city?: string | null } | null;
  organization: { id: string; name: string };
  roles: Array<{ id: string; name: string; scope: string }>;
  avatarUrl: string | null;
  locale: "fr" | "en";
  branding: { companyName: string; logoUrl: string | null };
}

export const profileApi = {
  get: () => apiRequest<ApiProfile>("/profile"),
  uploadAvatar: (file: File) => {
    const body = new FormData();
    body.append("avatar", file);
    return apiUpload<ApiProfile>("/profile/avatar", body);
  },
  removeAvatar: () =>
    apiRequest<ApiProfile>("/profile/avatar", { method: "DELETE" }),
  avatarBlob: () => apiDownload("/profile/avatar").then(({ blob }) => blob),
  updateLocale: (locale: "fr" | "en") =>
    apiRequest<ApiProfile>("/profile/locale", {
      method: "PATCH",
      body: JSON.stringify({ locale }),
    }),
  updateBranding: (companyName: string) =>
    apiRequest<ApiProfile>("/profile/branding", {
      method: "PATCH",
      body: JSON.stringify({ companyName }),
    }),
  uploadBrandingLogo: (file: File) => {
    const body = new FormData();
    body.append("logo", file);
    return apiUpload<ApiProfile>("/profile/branding/logo", body);
  },
  removeBrandingLogo: () =>
    apiRequest<ApiProfile>("/profile/branding/logo", { method: "DELETE" }),
  brandingLogoBlob: () =>
    apiDownload("/profile/branding/logo").then(({ blob }) => blob),
};
