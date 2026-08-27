import { describe, expect, it } from "vitest";
import { Permission } from "@/lib/api-contract";
import { DASHBOARD_ROUTE_PERMISSIONS } from "@/components/AuthProvider";

describe("dashboard route permissions", () => {
  it("requires dossier write permission for the creation wizard", () => {
    const pathname = "/dossiers/creer";
    const required = DASHBOARD_ROUTE_PERMISSIONS.find(
      ({ prefix }) => prefix === "/" || pathname.startsWith(prefix),
    );

    expect(required?.permission).toBe(Permission.DOSSIERS_WRITE);
  });
});
