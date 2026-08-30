import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function envelope<T>(data: T, status = 200): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      timestamp: new Date().toISOString(),
      path: "/api/test",
      statusCode: status,
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

const user = {
  id: "user-1",
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
  organizationId: "org-1",
  locale: "fr" as const,
  office: null,
  roles: [{ id: "role-1", name: "Admin", scope: "tenant" }],
  permissions: ["users:read"] as const,
};

describe("frontend API authentication foundation", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("logs in with credentials and keeps the refresh token out of JavaScript", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(envelope({ accessToken: "access-1", user }));
    vi.stubGlobal("fetch", fetchMock);
    const { authApi } = await import("./api");

    await expect(authApi.login(user.email, "secret")).resolves.toEqual(user);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("refreshToken");
  });

  it("restores a session through refresh and then loads GET /auth/me", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(envelope({ accessToken: "access-2", user }))
      .mockResolvedValueOnce(envelope(user));
    vi.stubGlobal("fetch", fetchMock);
    const { authApi } = await import("./api");

    await expect(authApi.restore()).resolves.toEqual(user);
    expect(fetchMock.mock.calls[0][0]).toContain("/auth/refresh");
    expect(fetchMock.mock.calls[1][0]).toContain("/auth/me");
    const meHeaders = fetchMock.mock.calls[1][1]?.headers as Headers;
    expect(meHeaders.get("Authorization")).toBe("Bearer access-2");
  });

  it("uses one refresh request for concurrent 401 responses and retries once", async () => {
    let resourceCalls = 0;
    let refreshCalls = 0;
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        void init;
        const url = input.toString();
        if (url.endsWith("/auth/refresh")) {
          refreshCalls += 1;
          return envelope({ accessToken: "renewed", user });
        }
        resourceCalls += 1;
        if (resourceCalls <= 2) {
          return new Response(
            JSON.stringify({
              success: false,
              error: { code: "UNAUTHORIZED", message: "Expired" },
              timestamp: new Date().toISOString(),
              path: "/api/resource",
              statusCode: 401,
            }),
            { status: 401 },
          );
        }
        return envelope({ ok: true });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const { apiRequest } = await import("./api");

    await expect(
      Promise.all([apiRequest("/resource"), apiRequest("/resource")]),
    ).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1);
    expect(resourceCalls).toBe(4);
  });

  it("calls logout with credentials and normalizes network failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(envelope({ message: "ok" }))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const { apiRequest, authApi } = await import("./api");

    await expect(authApi.logout()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    await expect(apiRequest("/offline")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      status: 0,
    });
  });

  it("downloads authenticated bytes, refreshes once and decodes a UTF-8 filename", async () => {
    let documentCalls = 0;
    let refreshCalls = 0;
    const expected = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        void init;
        const url = input.toString();
        if (url.endsWith("/auth/login")) {
          return envelope({ accessToken: "expired-access", user });
        }
        if (url.endsWith("/auth/refresh")) {
          refreshCalls += 1;
          return envelope({ accessToken: "renewed-access", user });
        }
        documentCalls += 1;
        if (documentCalls === 1) {
          return new Response(
            JSON.stringify({
              success: false,
              error: { code: "UNAUTHORIZED", message: "Expired" },
              statusCode: 401,
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(expected, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition":
              "attachment; filename=download; filename*=UTF-8''contrat-sign%C3%A9-%D8%B9%D9%82%D8%AF.pdf",
          },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const { apiDownload, authApi } = await import("./api");
    await authApi.login(user.email, "secret");

    const download = await apiDownload("/documents/document-a/download");

    expect(refreshCalls).toBe(1);
    expect(documentCalls).toBe(2);
    expect(download.filename).toBe("contrat-signé-عقد.pdf");
    expect(new Uint8Array(await download.blob.arrayBuffer())).toEqual(expected);
    const retryHeaders = fetchMock.mock.calls.at(-1)?.[1]?.headers as Headers;
    expect(retryHeaders.get("Authorization")).toBe("Bearer renewed-access");
  });
});
