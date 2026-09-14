import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("Frontend authentication proxy", () => {
  it("allows protected navigation when the session cookie is present", () => {
    const request = new NextRequest("http://localhost:3001/dossiers", {
      headers: { cookie: "auto_import_refresh=opaque-session" },
    });
    expect(proxy(request).headers.get("x-middleware-next")).toBe("1");
  });
  it.each([
    "/api/auth/login",
    "/api/auth/refresh",
    "/api/auth/two-factor/verify",
    "/api/dossiers",
  ])("lets %s reach backend authorization without a cookie", (path) => {
    const result = proxy(new NextRequest(`http://localhost:3001${path}`));
    expect(result.headers.get("location")).toBeNull();
    expect(result.headers.get("x-middleware-next")).toBe("1");
  });
  it("continues redirecting protected pages without a session cookie", () => {
    const result = proxy(new NextRequest("http://localhost:3001/dossiers"));
    expect(result.status).toBe(307);
    expect(result.headers.get("location")).toContain(
      "/connexion?retour=%2Fdossiers",
    );
  });
});
