// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UsersAdministration from "./UsersAdministration";

const mocks = vi.hoisted(() => ({
  permissions: ["users:read"],
  listUsers: vi.fn(),
  listRoles: vi.fn(),
  listPermissions: vi.fn(),
  listOffices: vi.fn(),
}));

vi.mock("@/components", () => ({
  Topbar: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    hasPermission: (permission: string) =>
      mocks.permissions.includes(permission),
  }),
}));

vi.mock("@/lib/admin-api", () => ({
  adminApi: {
    listUsers: mocks.listUsers,
    listRoles: mocks.listRoles,
    listPermissions: mocks.listPermissions,
    listOffices: mocks.listOffices,
  },
}));

const pagination = {
  page: 1,
  pageSize: 20,
  totalItems: 1,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

describe("UsersAdministration", () => {
  beforeEach(() => {
    mocks.permissions = ["users:read"];
    mocks.listUsers.mockResolvedValue({
      items: [
        {
          id: "user-a",
          firstName: "Nadia",
          lastName: "Benali",
          email: "nadia@example.test",
          status: "active",
          office: null,
          userRoles: [],
        },
      ],
      pagination,
    });
    mocks.listRoles.mockResolvedValue([]);
    mocks.listPermissions.mockResolvedValue([]);
    mocks.listOffices.mockResolvedValue({ items: [], pagination });
  });

  it("renders database users and hides unauthorized administration controls", async () => {
    render(<UsersAdministration />);

    expect(await screen.findByText("Nadia Benali")).toBeTruthy();
    expect(screen.queryByText("Nouvel utilisateur")).toBeNull();
    expect(screen.queryByRole("button", { name: "Rôles" })).toBeNull();
    expect(mocks.listRoles).not.toHaveBeenCalled();
    expect(mocks.listOffices).not.toHaveBeenCalled();
  });

  it("shows the real empty state after a successful reload", async () => {
    mocks.listUsers.mockResolvedValue({
      items: [],
      pagination: { ...pagination, totalItems: 0, totalPages: 0 },
    });

    render(<UsersAdministration />);

    expect(
      await screen.findByText("Aucun utilisateur ne correspond aux filtres."),
    ).toBeTruthy();
  });

  it("exposes a retry action for backend failures", async () => {
    mocks.listUsers
      .mockRejectedValueOnce(new Error("Backend indisponible"))
      .mockResolvedValueOnce({ items: [], pagination });

    render(<UsersAdministration />);
    const retry = await screen.findByRole("button", { name: /Réessayer/ });
    fireEvent.click(retry);

    await waitFor(() => expect(mocks.listUsers).toHaveBeenCalledTimes(2));
  });
});
