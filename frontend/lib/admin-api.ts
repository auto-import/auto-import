import { apiRequest } from "@/lib/api";
import type {
  ApiPermission,
  ApiRecordStatus,
  PaginatedData,
} from "@/lib/api-contract";

export interface OfficeSummary {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
}

export interface Office extends OfficeSummary {
  organizationId: string;
  status: ApiRecordStatus;
  createdAt: string;
  _count?: { users: number };
}

export interface PermissionDefinition {
  id: string;
  resource: string;
  action: string;
  description: string | null;
}

export interface Role {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  scope: "tenant";
  rolePermissions: Array<{ permission: PermissionDefinition }>;
}

export interface User {
  id: string;
  organizationId: string;
  officeId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  status: ApiRecordStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  office: OfficeSummary | null;
  userRoles: Array<{ role: Role }>;
}

export interface UserFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: ApiRecordStatus | "";
  roleId?: string;
  officeId?: string;
}

export interface UserInput {
  firstName: string;
  lastName: string;
  email: string;
  officeId?: string | null;
  status?: ApiRecordStatus;
  roleIds?: string[];
  password?: string;
}

export interface RoleInput {
  name: string;
  description?: string;
  permissionIds?: string[];
}

export interface OfficeInput {
  name: string;
  city?: string;
  country?: string;
  status?: ApiRecordStatus;
}

function queryString(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export const adminApi = {
  listUsers(filters: UserFilters = {}) {
    return apiRequest<PaginatedData<User>>(
      `/users${queryString({ ...filters, status: filters.status || undefined })}`,
    );
  },

  createUser(input: UserInput & { password: string }) {
    return apiRequest<User>("/users", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateUser(id: string, input: Omit<UserInput, "password">) {
    return apiRequest<User>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  setUserStatus(id: string, status: ApiRecordStatus) {
    return apiRequest<User>(`/users/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  setUserPassword(id: string, password: string) {
    return apiRequest<{ message: string }>(`/users/${id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password }),
    });
  },

  listRoles() {
    return apiRequest<Role[]>("/roles");
  },

  createRole(input: RoleInput) {
    return apiRequest<Role>("/roles", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateRole(id: string, input: RoleInput) {
    return apiRequest<Role>(`/roles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  deleteRole(id: string) {
    return apiRequest<{ message: string }>(`/roles/${id}`, {
      method: "DELETE",
    });
  },

  listPermissions() {
    return apiRequest<PermissionDefinition[]>("/roles/permissions");
  },

  listOffices(filters: { search?: string; status?: ApiRecordStatus } = {}) {
    return apiRequest<PaginatedData<Office>>(
      `/offices${queryString({ ...filters, limit: 100 })}`,
    );
  },

  createOffice(input: OfficeInput) {
    return apiRequest<Office>("/offices", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateOffice(id: string, input: OfficeInput) {
    return apiRequest<Office>(`/offices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  deleteOffice(id: string) {
    return apiRequest<{ message: string }>(`/offices/${id}`, {
      method: "DELETE",
    });
  },
};

export function rolePermissionKeys(role: Role): ApiPermission[] {
  return role.rolePermissions.map(
    ({ permission }) =>
      `${permission.resource}:${permission.action}` as ApiPermission,
  );
}
