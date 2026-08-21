'use client';

import { useState, useMemo } from 'react';
import { Topbar, StatusBadge, DataTable } from '@/components';
import {
  utilisateurs, roles, createUser, updateUser,
  createRole, updateRole, deleteRole, getRoleById
} from '@/lib/mockData';
import {
  ROLE_LABELS, PERMISSION_LABELS, PERMISSION_GROUPS
} from '@/lib/constants';
import type { Utilisateur, Role, Permission, Column, TabItem } from '@/types';
import { Search, Plus, Edit, Trash2, Shield, Users, CheckSquare, Square, Lock, X } from 'lucide-react';

const inputCls = 'w-full px-3 py-2 text-sm border border-border rounded-card focus:outline-none focus:ring-1 focus:ring-status-blue-text';
const labelCls = 'field-label mb-1';

const ROLE_BADGE_VARIANTS: Record<string, string> = {
  'role-001': 'blue',
  'role-002': 'green',
  'role-003': 'amber',
  'role-004': 'green',
  'role-005': 'blue',
  'role-006': 'amber',
};

const PAGE_TABS: TabItem[] = [
  { key: 'utilisateurs', label: 'Utilisateurs' },
  { key: 'permissions', label: 'Matrice de permissions' },
  { key: 'roles', label: 'Rôles' },
];

interface UserFormState {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  departement: string;
  role_id: string;
  actif: boolean;
}

const EMPTY_USER_FORM: UserFormState = {
  nom: '',
  prenom: '',
  email: '',
  telephone: '',
  departement: '',
  role_id: 'role-002',
  actif: true,
};

interface RoleFormState {
  nom: string;
  description: string;
  permissions: Permission[];
}

const EMPTY_ROLE_FORM: RoleFormState = {
  nom: '',
  description: '',
  permissions: [],
};

function UserFormModal({
  open,
  onClose,
  onSave,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (form: UserFormState) => void;
  editing: Utilisateur | null;
}) {
  const [form, setForm] = useState<UserFormState>(
    editing
      ? {
          nom: editing.nom,
          prenom: editing.prenom,
          email: editing.email,
          telephone: editing.telephone ?? '',
          departement: editing.departement ?? '',
          role_id: editing.role_id ?? 'role-002',
          actif: editing.actif,
        }
      : EMPTY_USER_FORM
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold">{editing ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-button hover:bg-surface transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Nom</label>
              <input
                type="text"
                value={form.nom}
                onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                className={inputCls}
                placeholder="Djelloul"
              />
            </div>
            <div>
              <label className={labelCls}>Prénom</label>
              <input
                type="text"
                value={form.prenom}
                onChange={(e) => setForm((f) => ({ ...f, prenom: e.target.value }))}
                className={inputCls}
                placeholder="Ahmed"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className={inputCls}
              placeholder="a.djelloul@carimport.dz"
            />
          </div>
          <div>
            <label className={labelCls}>Téléphone</label>
            <input
              type="text"
              value={form.telephone}
              onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
              className={inputCls}
              placeholder="+213 555 000 000"
            />
          </div>
          <div>
            <label className={labelCls}>Département</label>
            <input
              type="text"
              value={form.departement}
              onChange={(e) => setForm((f) => ({ ...f, departement: e.target.value }))}
              className={inputCls}
              placeholder="Direction"
            />
          </div>
          <div>
            <label className={labelCls}>Rôle</label>
            <select
              value={form.role_id}
              onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}
              className={inputCls}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.nom}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.actif}
              onChange={(e) => setForm((f) => ({ ...f, actif: e.target.checked }))}
              className="w-4 h-4 rounded border-border text-foreground focus:ring-status-blue-text"
            />
            <span className="text-sm font-medium">Actif</span>
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-button border border-border hover:bg-surface transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.nom.trim() || !form.prenom.trim() || !form.email.trim()}
            className="px-4 py-2 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {editing ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleFormModal({
  open,
  onClose,
  onSave,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (form: RoleFormState) => void;
  editing: Role | null;
}) {
  const [form, setForm] = useState<RoleFormState>(
    editing
      ? {
          nom: editing.nom,
          description: editing.description,
          permissions: [...editing.permissions],
        }
      : EMPTY_ROLE_FORM
  );

  const togglePermission = (perm: Permission) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter((p) => p !== perm)
        : [...f.permissions, perm],
    }));
  };

  const toggleGroup = (groupPerms: Permission[]) => {
    setForm((f) => {
      const allIn = groupPerms.every((p) => f.permissions.includes(p));
      if (allIn) {
        return { ...f, permissions: f.permissions.filter((p) => !groupPerms.includes(p)) };
      }
      const newPerms = [...f.permissions];
      groupPerms.forEach((p) => {
        if (!newPerms.includes(p)) newPerms.push(p);
      });
      return { ...f, permissions: newPerms };
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold">{editing ? 'Modifier le rôle' : 'Nouveau rôle'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-button hover:bg-surface transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={labelCls}>Nom du rôle</label>
            <input
              type="text"
              value={form.nom}
              onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
              className={inputCls}
              placeholder="Ex: Manager"
            />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={inputCls}
              placeholder="Description du rôle"
            />
          </div>
          <div>
            <label className={labelCls}>Permissions</label>
            <div className="space-y-3 mt-2">
              {PERMISSION_GROUPS.map((group) => {
                const allIn = group.permissions.every((p) => form.permissions.includes(p));
                const someIn = group.permissions.some((p) => form.permissions.includes(p));
                return (
                  <div key={group.label} className="rounded-card border border-border p-3">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.permissions)}
                      className="flex items-center gap-2 w-full text-left text-sm font-semibold mb-2"
                    >
                      {allIn ? (
                        <CheckSquare className="w-4 h-4 text-status-green-text shrink-0" />
                      ) : someIn ? (
                        <div className="w-4 h-4 rounded border-2 border-foreground/40 bg-foreground/10 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-muted shrink-0" />
                      )}
                      {group.label}
                    </button>
                    <div className="flex flex-wrap gap-2 ms-6">
                      {group.permissions.map((perm) => (
                        <button
                          key={perm}
                          type="button"
                          onClick={() => togglePermission(perm)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                            form.permissions.includes(perm)
                              ? 'bg-status-green-bg text-status-green-text border-status-green-border'
                              : 'bg-background text-muted border-border hover:border-foreground/30'
                          }`}
                        >
                          {form.permissions.includes(perm) ? (
                            <CheckSquare className="w-3 h-3" />
                          ) : (
                            <Square className="w-3 h-3" />
                          )}
                          {PERMISSION_LABELS[perm]}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-button border border-border hover:bg-surface transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.nom.trim()}
            className="px-4 py-2 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {editing ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UtilisateursPage() {
  const [activeTab, setActiveTab] = useState('utilisateurs');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('tous');
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Utilisateur | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [, setRefresh] = useState(0);

  const filteredUsers = useMemo(() => {
    return utilisateurs.filter((u) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          `${u.prenom} ${u.nom}`.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.departement ?? '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (roleFilter !== 'tous' && u.role_id !== roleFilter) return false;
      return true;
    });
  }, [search, roleFilter]);

  const totalUsers = utilisateurs.length;
  const activeUsers = utilisateurs.filter((u) => u.actif).length;
  const inactiveUsers = utilisateurs.filter((u) => !u.actif).length;

  const handleSaveUser = (form: UserFormState) => {
    if (editingUser) {
      updateUser(editingUser.id, {
        nom: form.nom,
        prenom: form.prenom,
        email: form.email,
        telephone: form.telephone,
        departement: form.departement,
        role_id: form.role_id,
        actif: form.actif,
      });
    } else {
      createUser({
        nom: form.nom,
        prenom: form.prenom,
        email: form.email,
        telephone: form.telephone,
        departement: form.departement,
        role_id: form.role_id,
      });
    }
    setShowUserModal(false);
    setEditingUser(null);
    setRefresh((k) => k + 1);
  };

  const handleSaveRole = (form: RoleFormState) => {
    if (editingRole) {
      updateRole(editingRole.id, {
        nom: form.nom,
        description: form.description,
        permissions: form.permissions,
      });
    } else {
      createRole({
        nom: form.nom,
        description: form.description,
        permissions: form.permissions,
      });
    }
    setShowRoleModal(false);
    setEditingRole(null);
    setRefresh((k) => k + 1);
  };

  const handleDeleteRole = (roleId: string) => {
    const ok = deleteRole(roleId);
    if (!ok) return;
    setRefresh((k) => k + 1);
  };

  const handleTogglePermission = (roleId: string, perm: Permission) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role || role.est_defaut) return;
    const newPerms = role.permissions.includes(perm)
      ? role.permissions.filter((p) => p !== perm)
      : [...role.permissions, perm];
    updateRole(roleId, { permissions: newPerms });
    setRefresh((k) => k + 1);
  };

  const getUserCountForRole = (roleId: string) =>
    utilisateurs.filter((u) => u.role_id === roleId).length;

  const USER_COLUMNS: Column<Utilisateur>[] = [
    {
      key: 'nom',
      header: 'Utilisateur',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center text-xs font-bold text-white shrink-0">
            {row.avatar_initials}
          </div>
          <div>
            <span className="font-semibold">{row.prenom} {row.nom}</span>
            <p className="text-xs text-muted">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role_id',
      header: 'Rôle',
      render: (row) => {
        const role = getRoleById(row.role_id ?? '');
        return (
          <StatusBadge
            variant={ROLE_BADGE_VARIANTS[row.role_id ?? ''] ?? 'gray'}
            label={role?.nom ?? (ROLE_LABELS as Record<string, string>)[row.role] ?? row.role}
            size="sm"
          />
        );
      },
    },
    {
      key: 'departement',
      header: 'Département',
      render: (row) => row.departement ?? '—',
    },
    {
      key: 'actif',
      header: 'Statut',
      render: (row) => (
        <StatusBadge
          variant={row.actif ? 'green' : 'gray'}
          label={row.actif ? 'Actif' : 'Inactif'}
          size="sm"
        />
      ),
    },
    {
      key: 'date_creation',
      header: 'Créé le',
      render: (row) => (
        <span className="text-sm text-muted">
          {new Date(row.date_creation).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      key: 'id',
      header: '',
      render: (row) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setEditingUser(row);
            setShowUserModal(true);
          }}
          className="p-1.5 rounded-button hover:bg-surface transition-colors"
          title="Modifier"
        >
          <Edit className="w-4 h-4 text-muted" />
        </button>
      ),
    },
  ];

  return (
    <>
      <Topbar title="Utilisateurs & Rôles" subtitle="Gestion des accès et permissions" />
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-0">
          <div className="flex gap-0 overflow-x-auto">
            {PAGE_TABS.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive ? 'text-foreground' : 'text-muted hover:text-foreground'
                  }`}
                >
                  {tab.label}
                  {isActive && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground rounded-t-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === 'utilisateurs' && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-card border border-border p-4">
                <p className="text-xs text-muted font-medium uppercase tracking-wide">Total</p>
                <p className="text-2xl font-bold mt-1">{totalUsers}</p>
              </div>
              <div className="rounded-card border border-border p-4">
                <p className="text-xs text-status-green-text font-medium uppercase tracking-wide">Actifs</p>
                <p className="text-2xl font-bold mt-1 text-status-green-text">{activeUsers}</p>
              </div>
              <div className="rounded-card border border-border p-4">
                <p className="text-xs text-muted font-medium uppercase tracking-wide">Inactifs</p>
                <p className="text-2xl font-bold mt-1 text-muted">{inactiveUsers}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher par nom, email, département..."
                  className="w-full ps-10 pe-4 py-2.5 text-sm border border-border rounded-input bg-background placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2.5 text-sm border border-border rounded-input bg-background focus:outline-none focus:ring-2 focus:ring-foreground/10"
              >
                <option value="tous">Tous les rôles</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.nom}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  setEditingUser(null);
                  setShowUserModal(true);
                }}
                className="ms-auto flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                Nouvel utilisateur
              </button>
            </div>

            <div className="card p-0 overflow-hidden">
              <DataTable columns={USER_COLUMNS} data={filteredUsers} />
            </div>
          </div>
        )}

        {activeTab === 'permissions' && (
          <div className="space-y-6">
            <div className="card p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-start px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted sticky start-0 bg-background z-10 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Permission
                      </div>
                    </th>
                    {roles.map((role) => (
                      <th key={role.id} className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted whitespace-nowrap min-w-[120px]">
                        <div className="flex flex-col items-center gap-1">
                          <span className="flex items-center gap-1">
                            {role.est_defaut && <Lock className="w-3 h-3" />}
                            {role.nom}
                          </span>
                          <span className="text-[10px] font-normal normal-case tracking-normal text-muted/70 max-w-[140px] truncate" title={role.description}>
                            {role.description}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_GROUPS.map((group) => (
                    <>
                      <tr key={`group-${group.label}`} className="bg-surface/50">
                        <td
                          colSpan={roles.length + 1}
                          className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-foreground/70 sticky start-0 bg-surface/50 z-10"
                        >
                          {group.label}
                        </td>
                      </tr>
                      {group.permissions.map((perm) => (
                        <tr key={perm} className="border-b border-border last:border-b-0 hover:bg-surface/30 transition-colors">
                          <td className="px-4 py-3 font-medium sticky start-0 bg-background z-10">
                            <span className="text-sm">{PERMISSION_LABELS[perm]}</span>
                          </td>
                          {roles.map((role) => {
                            const hasPerm = role.permissions.includes(perm);
                            const isLocked = role.est_defaut;
                            return (
                              <td key={`${role.id}-${perm}`} className="text-center px-4 py-3">
                                <button
                                  onClick={() => handleTogglePermission(role.id, perm)}
                                  disabled={isLocked}
                                  className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
                                    isLocked
                                      ? 'cursor-not-allowed opacity-50'
                                      : 'cursor-pointer hover:bg-surface'
                                  }`}
                                  title={isLocked ? 'Super Admin — non modifiable' : undefined}
                                >
                                  {hasPerm ? (
                                    <CheckSquare className="w-5 h-5 text-status-green-text" />
                                  ) : (
                                    <Square className="w-5 h-5 text-muted/40" />
                                  )}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'roles' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">
                {roles.length} rôle{roles.length > 1 ? 's' : ''} configuré{roles.length > 1 ? 's' : ''}
              </p>
              <button
                onClick={() => {
                  setEditingRole(null);
                  setShowRoleModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                Nouveau rôle
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {roles.map((role) => {
                const userCount = getUserCountForRole(role.id);
                const isSuperAdmin = role.est_defaut;
                const canDelete = !isSuperAdmin && userCount === 0;
                const canEdit = !isSuperAdmin;
                return (
                  <div
                    key={role.id}
                    className="rounded-card border border-border p-5 flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-full bg-status-blue-bg flex items-center justify-center">
                          <Shield className="w-4 h-4 text-status-blue-text" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm flex items-center gap-1.5">
                            {role.nom}
                            {isSuperAdmin && <Lock className="w-3 h-3 text-muted" />}
                          </h3>
                          <p className="text-xs text-muted">{role.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <button
                            onClick={() => {
                              setEditingRole(role);
                              setShowRoleModal(true);
                            }}
                            className="p-1.5 rounded-button hover:bg-surface transition-colors"
                            title="Modifier"
                          >
                            <Edit className="w-4 h-4 text-muted" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDeleteRole(role.id)}
                            className="p-1.5 rounded-button hover:bg-status-red-bg transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4 text-status-red-text" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <CheckSquare className="w-3.5 h-3.5" />
                        {role.permissions.length} permission{role.permissions.length > 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {userCount} utilisateur{userCount > 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1 mt-auto pt-2 border-t border-border">
                      {role.permissions.slice(0, 6).map((perm) => (
                        <span
                          key={perm}
                          className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full bg-surface text-muted"
                        >
                          {PERMISSION_LABELS[perm]}
                        </span>
                      ))}
                      {role.permissions.length > 6 && (
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full bg-status-blue-bg text-status-blue-text">
                          +{role.permissions.length - 6}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <UserFormModal
        open={showUserModal}
        onClose={() => {
          setShowUserModal(false);
          setEditingUser(null);
        }}
        onSave={handleSaveUser}
        editing={editingUser}
      />

      <RoleFormModal
        open={showRoleModal}
        onClose={() => {
          setShowRoleModal(false);
          setEditingRole(null);
        }}
        onSave={handleSaveRole}
        editing={editingRole}
      />
    </>
  );
}
