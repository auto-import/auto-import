import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "./admin-api";

const success = (data: unknown) =>
  new Response(
    JSON.stringify({
      success: true,
      data,
      timestamp: new Date(0).toISOString(),
      path: "/api/test",
      statusCode: 200,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

describe("adminApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("serializes user search, status, role, office, and pagination filters", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(success({ items: [], pagination: {} }));

    await adminApi.listUsers({
      search: "Nadia",
      status: "active",
      roleId: "role-a",
      officeId: "office-a",
      page: 2,
      limit: 10,
    });

    const url = new URL(
      String(fetchMock.mock.calls[0][0]),
      "https://erp.test",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: "Nadia",
      status: "active",
      roleId: "role-a",
      officeId: "office-a",
      page: "2",
      limit: "10",
    });
  });

  it("sends multi-role assignment and a deliberate initial password", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(success({ id: "user-a" }));

    await adminApi.createUser({
      firstName: "Nadia",
      lastName: "Benali",
      email: "nadia@example.test",
      password: "LongInitialPassword!1",
      roleIds: ["role-a", "role-b"],
      officeId: "office-a",
    });

    const init = fetchMock.mock.calls[0][1];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      password: "LongInitialPassword!1",
      roleIds: ["role-a", "role-b"],
    });
  });

  it("uses explicit status and password administration endpoints", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(success({ message: "ok" })));

    await adminApi.setUserStatus("user-a", "inactive");
    await adminApi.setUserPassword("user-a", "AnotherLongPassword!2");

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/users/user-a/status",
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "/users/user-a/password",
    );
  });
});
