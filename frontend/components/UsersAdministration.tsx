"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit, Plus, RefreshCw, Search, Shield, Trash2, X } from "lucide-react";
import { Topbar } from "@/components";
import { useAuth } from "@/components/AuthProvider";
import { ApiError } from "@/lib/api";
import {
  adminApi,
  type Office,
  type PermissionDefinition,
  type Role,
  type User,
} from "@/lib/admin-api";
import { Permission, RecordStatus } from "@/lib/api-contract";
import type { ApiRecordStatus, PaginatedData } from "@/lib/api-contract";

type Tab = "users" | "roles" | "permissions" | "offices";

const inputClass =
  "w-full rounded-card border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-status-blue-text";
const emptyUsers: PaginatedData<User> = {
  items: [],
  pagination: {
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  },
};

function messageFrom(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403)
      return "Vous n’avez pas l’autorisation nécessaire.";
    if (error.status === 409)
      return error.message || "Cette valeur existe déjà.";
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : "Une erreur inattendue est survenue.";
}

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto p-0">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-button p-2 hover:bg-surface"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function UserDialog({
  user,
  roles,
  offices,
  canManageRoles,
  onClose,
  onSave,
}: {
  user: User | null;
  roles: Role[];
  offices: Office[];
  canManageRoles: boolean;
  onClose: () => void;
  onSave: (values: {
    firstName: string;
    lastName: string;
    email: string;
    officeId: string | null;
    status: ApiRecordStatus;
    roleIds: string[];
    password?: string;
    resetPassword?: string;
  }) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [officeId, setOfficeId] = useState(user?.officeId ?? "");
  const [status, setStatus] = useState<ApiRecordStatus>(
    user?.status ?? RecordStatus.ACTIVE,
  );
  const [roleIds, setRoleIds] = useState(
    user?.userRoles.map(({ role }) => role.id) ?? [],
  );
  const [password, setPassword] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("Le prénom, le nom et l’email sont obligatoires.");
      return;
    }
    if (!user && password.length < 12) {
      setError("Le mot de passe initial doit contenir au moins 12 caractères.");
      return;
    }
    if (resetPassword && resetPassword.length < 12) {
      setError("Le nouveau mot de passe doit contenir au moins 12 caractères.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        officeId: officeId || null,
        status,
        roleIds,
        ...(!user ? { password } : {}),
        ...(resetPassword ? { resetPassword } : {}),
      });
      onClose();
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={user ? "Modifier l’utilisateur" : "Nouvel utilisateur"}
      onClose={onClose}
    >
      <div className="space-y-4 p-6">
        {error && (
          <div className="rounded-card bg-status-red-bg p-3 text-sm text-status-red-text">
            {error}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            Prénom
            <input
              className={inputClass}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Nom
            <input
              className={inputClass}
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </label>
        </div>
        <label className="block space-y-1 text-sm font-medium">
          Email
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            Bureau
            <select
              className={inputClass}
              value={officeId}
              onChange={(event) => setOfficeId(event.target.value)}
            >
              <option value="">Aucun bureau</option>
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            Statut
            <select
              className={inputClass}
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as ApiRecordStatus)
              }
            >
              <option value={RecordStatus.ACTIVE}>Actif</option>
              <option value={RecordStatus.INACTIVE}>Inactif</option>
              <option value={RecordStatus.SUSPENDED}>Suspendu</option>
            </select>
          </label>
        </div>
        {canManageRoles && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Rôles (plusieurs choix possibles)
            </legend>
            <div className="grid gap-2 rounded-card border border-border p-3 sm:grid-cols-2">
              {roles.length === 0 && (
                <span className="text-sm text-muted">
                  Aucun rôle disponible.
                </span>
              )}
              {roles.map((role) => (
                <label
                  key={role.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={roleIds.includes(role.id)}
                    onChange={() =>
                      setRoleIds((current) =>
                        current.includes(role.id)
                          ? current.filter((id) => id !== role.id)
                          : [...current, role.id],
                      )
                    }
                  />
                  {role.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {!user ? (
          <label className="block space-y-1 text-sm font-medium">
            Mot de passe initial
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <span className="block text-xs font-normal text-muted">
              Saisi volontairement par l’administrateur, jamais généré ni
              réaffiché.
            </span>
          </label>
        ) : (
          <label className="block space-y-1 text-sm font-medium">
            Définir un nouveau mot de passe (facultatif)
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
            />
          </label>
        )}
      </div>
      <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
        <button
          className="rounded-button border border-border px-4 py-2 text-sm"
          onClick={onClose}
        >
          Annuler
        </button>
        <button
          className="rounded-button bg-foreground px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </Dialog>
  );
}

function RoleDialog({
  role,
  permissions,
  onClose,
  onSave,
}: {
  role: Role | null;
  permissions: PermissionDefinition[];
  onClose: () => void;
  onSave: (values: {
    name: string;
    description: string;
    permissionIds: string[];
  }) => Promise<void>;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissionIds, setPermissionIds] = useState(
    role?.rolePermissions.map(({ permission }) => permission.id) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!name.trim()) return setError("Le nom est obligatoire.");
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        permissionIds,
      });
      onClose();
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      title={role ? "Modifier le rôle" : "Nouveau rôle"}
      onClose={onClose}
    >
      <div className="space-y-4 p-6">
        {error && (
          <div className="rounded-card bg-status-red-bg p-3 text-sm text-status-red-text">
            {error}
          </div>
        )}
        <label className="block space-y-1 text-sm font-medium">
          Nom
          <input
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Description
          <textarea
            className={inputClass}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Permissions</legend>
          <div className="grid max-h-72 gap-2 overflow-y-auto rounded-card border border-border p-3 sm:grid-cols-2">
            {permissions.map((permission) => (
              <label
                key={permission.id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={permissionIds.includes(permission.id)}
                  onChange={() =>
                    setPermissionIds((current) =>
                      current.includes(permission.id)
                        ? current.filter((id) => id !== permission.id)
                        : [...current, permission.id],
                    )
                  }
                />
                <span>
                  {permission.resource}:{permission.action}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
        <button
          className="rounded-button border border-border px-4 py-2 text-sm"
          onClick={onClose}
        >
          Annuler
        </button>
        <button
          className="rounded-button bg-foreground px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </Dialog>
  );
}

function OfficeDialog({
  office,
  onClose,
  onSave,
}: {
  office: Office | null;
  onClose: () => void;
  onSave: (values: {
    name: string;
    city: string;
    country: string;
    status: ApiRecordStatus;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(office?.name ?? "");
  const [city, setCity] = useState(office?.city ?? "");
  const [country, setCountry] = useState(office?.country ?? "Algérie");
  const [status, setStatus] = useState<ApiRecordStatus>(
    office?.status ?? RecordStatus.ACTIVE,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!name.trim()) return setError("Le nom est obligatoire.");
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        city: city.trim(),
        country: country.trim(),
        status,
      });
      onClose();
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      title={office ? "Modifier le bureau" : "Nouveau bureau"}
      onClose={onClose}
    >
      <div className="grid gap-4 p-6 sm:grid-cols-2">
        {error && (
          <div className="sm:col-span-2 rounded-card bg-status-red-bg p-3 text-sm text-status-red-text">
            {error}
          </div>
        )}
        <label className="space-y-1 text-sm font-medium sm:col-span-2">
          Nom
          <input
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Ville
          <input
            className={inputClass}
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Pays
          <input
            className={inputClass}
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Statut
          <select
            className={inputClass}
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as ApiRecordStatus)
            }
          >
            <option value={RecordStatus.ACTIVE}>Actif</option>
            <option value={RecordStatus.INACTIVE}>Inactif</option>
            <option value={RecordStatus.SUSPENDED}>Suspendu</option>
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
        <button
          className="rounded-button border border-border px-4 py-2 text-sm"
          onClick={onClose}
        >
          Annuler
        </button>
        <button
          className="rounded-button bg-foreground px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </Dialog>
  );
}

export default function UsersAdministration() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState(emptyUsers);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ApiRecordStatus | "">("");
  const [roleId, setRoleId] = useState("");
  const [officeId, setOfficeId] = useState("");
  const [editingUser, setEditingUser] = useState<User | null | undefined>();
  const [editingRole, setEditingRole] = useState<Role | null | undefined>();
  const [editingOffice, setEditingOffice] = useState<
    Office | null | undefined
  >();

  const canWriteUsers = hasPermission(Permission.USERS_WRITE);
  const canManageUsers = hasPermission(Permission.USERS_MANAGE);
  const canReadRoles = hasPermission(Permission.ROLES_READ);
  const canManageRoles = hasPermission(Permission.ROLES_MANAGE);
  const canReadOffices = hasPermission(Permission.OFFICES_READ);
  const canWriteOffices = hasPermission(Permission.OFFICES_WRITE);

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const [userData, roleData, permissionData, officeData] =
          await Promise.all([
            adminApi.listUsers({
              page,
              limit: 20,
              search,
              status,
              roleId,
              officeId,
            }),
            canReadRoles ? adminApi.listRoles() : Promise.resolve([]),
            canReadRoles ? adminApi.listPermissions() : Promise.resolve([]),
            canReadOffices
              ? adminApi.listOffices()
              : Promise.resolve(emptyUsers as unknown as PaginatedData<Office>),
          ]);
        setUsers(userData);
        setRoles(roleData);
        setPermissions(permissionData);
        setOffices(officeData.items);
      } catch (cause) {
        setError(messageFrom(cause));
      } finally {
        setLoading(false);
      }
    },
    [canReadOffices, canReadRoles, officeId, roleId, search, status],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const tabs = useMemo(
    () =>
      [
        { id: "users" as const, label: "Utilisateurs", visible: true },
        { id: "roles" as const, label: "Rôles", visible: canReadRoles },
        {
          id: "permissions" as const,
          label: "Permissions",
          visible: canReadRoles,
        },
        { id: "offices" as const, label: "Bureaux", visible: canReadOffices },
      ].filter(({ visible }) => visible),
    [canReadOffices, canReadRoles],
  );

  const run = async (operation: () => Promise<unknown>) => {
    setError(null);
    try {
      await operation();
      await load(users.pagination.page);
    } catch (cause) {
      setError(messageFrom(cause));
      throw cause;
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <Topbar
        title="Utilisateurs et accès"
        subtitle="Gérez les comptes, rôles, permissions et bureaux"
      />
      <main className="space-y-5 p-6">
        <div className="flex flex-wrap gap-2 border-b border-border">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-3 text-sm font-medium ${tab === id ? "border-b-2 border-foreground text-foreground" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center justify-between rounded-card border border-status-red-text/20 bg-status-red-bg p-4 text-sm text-status-red-text">
            <span>{error}</span>
            <button
              onClick={() => void load()}
              className="flex items-center gap-2 font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </button>
          </div>
        )}

        {tab === "users" && (
          <>
            <div className="card space-y-3 p-4">
              <div className="grid gap-3 md:grid-cols-5">
                <label className="relative md:col-span-2">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
                  <input
                    className={`${inputClass} pl-9`}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Nom ou email"
                  />
                </label>
                <select
                  className={inputClass}
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as ApiRecordStatus | "")
                  }
                >
                  <option value="">Tous les statuts</option>
                  <option value={RecordStatus.ACTIVE}>Actifs</option>
                  <option value={RecordStatus.INACTIVE}>Inactifs</option>
                  <option value={RecordStatus.SUSPENDED}>Suspendus</option>
                </select>
                <select
                  className={inputClass}
                  value={roleId}
                  onChange={(event) => setRoleId(event.target.value)}
                  disabled={!canReadRoles}
                >
                  <option value="">Tous les rôles</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <select
                  className={inputClass}
                  value={officeId}
                  onChange={(event) => setOfficeId(event.target.value)}
                  disabled={!canReadOffices}
                >
                  <option value="">Tous les bureaux</option>
                  {offices.map((office) => (
                    <option key={office.id} value={office.id}>
                      {office.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted">
                  {users.pagination.totalItems} compte(s)
                </span>
                {canWriteUsers && (
                  <button
                    className="flex items-center gap-2 rounded-button bg-foreground px-4 py-2 text-sm text-white"
                    onClick={() => setEditingUser(null)}
                  >
                    <Plus className="h-4 w-4" />
                    Nouvel utilisateur
                  </button>
                )}
              </div>
            </div>
            <div className="card overflow-x-auto p-0">
              {loading ? (
                <div className="p-10 text-center text-muted">
                  Chargement des utilisateurs…
                </div>
              ) : users.items.length === 0 ? (
                <div className="p-10 text-center text-muted">
                  Aucun utilisateur ne correspond aux filtres.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted">
                      <th className="p-4">Utilisateur</th>
                      <th className="p-4">Bureau</th>
                      <th className="p-4">Rôles</th>
                      <th className="p-4">Statut</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.items.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="p-4">
                          <div className="font-medium">
                            {user.firstName} {user.lastName}
                          </div>
                          <div className="text-muted">{user.email}</div>
                        </td>
                        <td className="p-4">{user.office?.name ?? "—"}</td>
                        <td className="p-4">
                          {user.userRoles
                            .map(({ role }) => role.name)
                            .join(", ") || "—"}
                        </td>
                        <td className="p-4">
                          <span
                            className={`rounded-full px-2 py-1 text-xs ${user.status === RecordStatus.ACTIVE ? "bg-status-green-bg text-status-green-text" : "bg-status-red-bg text-status-red-text"}`}
                          >
                            {user.status === RecordStatus.ACTIVE
                              ? "Actif"
                              : user.status === RecordStatus.SUSPENDED
                                ? "Suspendu"
                                : "Inactif"}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            {canWriteUsers && (
                              <button
                                className="rounded-button border border-border p-2"
                                title="Modifier"
                                onClick={() => setEditingUser(user)}
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                            )}
                            {canWriteUsers && (
                              <button
                                className="rounded-button border border-border px-3 py-2 text-xs"
                                onClick={() =>
                                  void run(() =>
                                    adminApi.setUserStatus(
                                      user.id,
                                      user.status === RecordStatus.ACTIVE
                                        ? RecordStatus.INACTIVE
                                        : RecordStatus.ACTIVE,
                                    ),
                                  )
                                }
                              >
                                {user.status === RecordStatus.ACTIVE
                                  ? "Désactiver"
                                  : "Activer"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-button border border-border px-3 py-2 text-sm disabled:opacity-40"
                disabled={!users.pagination.hasPreviousPage || loading}
                onClick={() => void load(users.pagination.page - 1)}
              >
                Précédent
              </button>
              <button
                className="rounded-button border border-border px-3 py-2 text-sm disabled:opacity-40"
                disabled={!users.pagination.hasNextPage || loading}
                onClick={() => void load(users.pagination.page + 1)}
              >
                Suivant
              </button>
            </div>
          </>
        )}

        {tab === "roles" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              {canManageRoles && (
                <button
                  className="flex items-center gap-2 rounded-button bg-foreground px-4 py-2 text-sm text-white"
                  onClick={() => setEditingRole(null)}
                >
                  <Plus className="h-4 w-4" />
                  Nouveau rôle
                </button>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {roles.length === 0 && (
                <div className="card p-8 text-center text-muted">
                  Aucun rôle d’organisation.
                </div>
              )}
              {roles.map((role) => (
                <article className="card p-5" key={role.id}>
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{role.name}</h3>
                      <p className="text-sm text-muted">
                        {role.description || "Sans description"}
                      </p>
                    </div>
                    <Shield className="h-5 w-5" />
                  </div>
                  <p className="text-sm">
                    {role.rolePermissions.length} permission(s)
                  </p>
                  {canManageRoles && (
                    <div className="mt-4 flex gap-2">
                      <button
                        className="rounded-button border border-border p-2"
                        onClick={() => setEditingRole(role)}
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded-button border border-border p-2 text-status-red-text"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Supprimer le rôle « ${role.name} » ?`,
                            )
                          )
                            void run(() => adminApi.deleteRole(role.id));
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}

        {tab === "permissions" && (
          <div className="card overflow-x-auto p-0">
            {permissions.length === 0 ? (
              <div className="p-10 text-center text-muted">
                Aucune permission disponible.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th className="p-4">Ressource</th>
                    <th className="p-4">Action</th>
                    <th className="p-4">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {permissions.map((permission) => (
                    <tr
                      className="border-b border-border last:border-0"
                      key={permission.id}
                    >
                      <td className="p-4 font-medium">{permission.resource}</td>
                      <td className="p-4">{permission.action}</td>
                      <td className="p-4 text-muted">
                        {permission.description || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "offices" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              {canWriteOffices && (
                <button
                  className="flex items-center gap-2 rounded-button bg-foreground px-4 py-2 text-sm text-white"
                  onClick={() => setEditingOffice(null)}
                >
                  <Plus className="h-4 w-4" />
                  Nouveau bureau
                </button>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {offices.length === 0 && (
                <div className="card p-8 text-center text-muted">
                  Aucun bureau.
                </div>
              )}
              {offices.map((office) => (
                <article className="card p-5" key={office.id}>
                  <h3 className="font-semibold">{office.name}</h3>
                  <p className="text-sm text-muted">
                    {[office.city, office.country].filter(Boolean).join(", ") ||
                      "Localisation non renseignée"}
                  </p>
                  <p className="mt-3 text-sm">
                    {office._count?.users ?? 0} utilisateur(s) · {office.status}
                  </p>
                  {canWriteOffices && (
                    <div className="mt-4 flex gap-2">
                      <button
                        className="rounded-button border border-border p-2"
                        onClick={() => setEditingOffice(office)}
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded-button border border-border p-2 text-status-red-text"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Supprimer le bureau « ${office.name} » ?`,
                            )
                          )
                            void run(() => adminApi.deleteOffice(office.id));
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </main>

      {editingUser !== undefined && (
        <UserDialog
          user={editingUser}
          roles={roles}
          offices={offices}
          canManageRoles={canManageUsers}
          onClose={() => setEditingUser(undefined)}
          onSave={async (values) => {
            const { resetPassword, password, ...input } = values;
            if (editingUser) {
              await run(() => adminApi.updateUser(editingUser.id, input));
              if (resetPassword)
                await run(() =>
                  adminApi.setUserPassword(editingUser.id, resetPassword),
                );
            } else {
              await run(() =>
                adminApi.createUser({ ...input, password: password! }),
              );
            }
          }}
        />
      )}
      {editingRole !== undefined && (
        <RoleDialog
          role={editingRole}
          permissions={permissions}
          onClose={() => setEditingRole(undefined)}
          onSave={(values) =>
            run(() =>
              editingRole
                ? adminApi.updateRole(editingRole.id, values)
                : adminApi.createRole(values),
            ).then(() => undefined)
          }
        />
      )}
      {editingOffice !== undefined && (
        <OfficeDialog
          office={editingOffice}
          onClose={() => setEditingOffice(undefined)}
          onSave={(values) =>
            run(() =>
              editingOffice
                ? adminApi.updateOffice(editingOffice.id, values)
                : adminApi.createOffice(values),
            ).then(() => undefined)
          }
        />
      )}
    </div>
  );
}
