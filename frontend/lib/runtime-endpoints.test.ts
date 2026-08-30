import { describe, expect, it } from "vitest";
import { resolveBrowserEndpoint } from "./runtime-endpoints";

describe("production-safe browser endpoints", () => {
  it("uses same-origin API when no public URL is configured", () => {
    expect(
      resolveBrowserEndpoint(undefined, "/api", "https://erp.example.com"),
    ).toBe("/api");
  });

  it("does not send a remote user's browser to the deployer's localhost", () => {
    expect(
      resolveBrowserEndpoint(
        "http://localhost:3001/api",
        "/api",
        "https://erp.example.com",
      ),
    ).toBe("/api");
  });

  it("preserves an explicit non-loopback API endpoint", () => {
    expect(
      resolveBrowserEndpoint(
        "https://api.erp.example.com/api/",
        "/api",
        "https://erp.example.com",
      ),
    ).toBe("https://api.erp.example.com/api");
  });
});
