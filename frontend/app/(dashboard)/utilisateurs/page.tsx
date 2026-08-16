'use client';

import { useState } from 'react';
import { Topbar, StatusBadge, DataTable, Tabs } from '@/components';
import { utilisateurs } from '@/lib/mockData';
import { formatDate } from '@/lib/constants';
import type { Utilisateur, Column, RoleUtilisateur, TabItem } from '@/types';
import { Search, Plus, Shield } from 'lucide-react';

const ROLE_LABELS: Record<RoleUtilisateur, string> = {
  super_admin: 'Super Admin',
  sales_algerie: 'Sales Algérie',
  operations_chine: 'Opérations Chine',
  finance: 'Finance',
  shipping: 'Shipping',
  dedouanement: 'Dédouanement',
  client: 'Client',
  fournisseur: 'Fournisseur',
};

const ROLE_VARIANTS: Record<RoleUtilisateur, string> = {
  super_admin: 'blue',
  sales_algerie: 'green',
  operations_chine: 'amber',
  finance: 'green',
  shipping: 'blue',
  dedouanement: 'amber',
  client: 'gray',
  fournisseur: 'gray',
};

const USER_COLUMNS: Column<Utilisateur>[] = [
  {
    key: 'nom',
    header: 'Utilisateur',
    render: (row) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center text-xs font-bold text-white">
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
    key: 'role',
    header: 'Rôle',
    render: (row) => (
      <StatusBadge
        variant={ROLE_VARIANTS[row.role]}
        label={ROLE_LABELS[row.role]}
        size="sm"
      />
    ),
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
    header: 'Date création',
    render: (row) => formatDate(row.date_creation),
  },
];

// ─── Permission Matrix ───────────────────────────────────────────────

const PERMISSIONS = [
  'Dashboard',
  'Dossiers (lecture)',
  'Dossiers (écriture)',
  'Véhicules',
  'Fournisseurs',
  'Expéditions',
  'Facturation',
  'Clients',
  'Utilisateurs',
  'Rapports',
  'Paramètres',
];

const ROLES_FOR_MATRIX: RoleUtilisateur[] = [
  'super_admin',
  'sales_algerie',
  'operations_chine',
  'finance',
  'shipping',
  'dedouanement',
];

const PERMISSION_MATRIX: Record<RoleUtilisateur, boolean[]> = {
  super_admin:      [true, true, true, true, true, true, true, true, true, true, true],
  sales_algerie:    [true, true, true, false, false, false, true, true, false, false, false],
  operations_chine: [true, true, true, true, true, false, false, false, false, false, false],
  finance:          [true, true, false, false, false, false, true, true, false, true, false],
  shipping:         [true, true, false, false, false, true, false, false, false, false, false],
  dedouanement:     [true, true, true, false, false, false, false, false, false, false, false],
  client:           [false, false, false, false, false, false, false, false, false, false, false],
  fournisseur:      [false, false, false, false, false, false, false, false, false, false, false],
};

const UTILISATEURS_TABS: TabItem[] = [
  { key: 'utilisateurs', label: 'Utilisateurs' },
  { key: 'permissions', label: 'Matrice de permissions' },
];

export default function UtilisateursPage() {
  const [activeTab, setActiveTab] = useState('utilisateurs');
  const [search, setSearch] = useState('');

  const filtered = search
    ? utilisateurs.filter(
        (u) =>
          `${u.prenom} ${u.nom}`.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase())
      )
    : utilisateurs;

  return (
    <>
      <Topbar title="Utilisateurs & rôles" subtitle="Gestion des accès et permissions" />
      <div className="p-8 space-y-6">
        <Tabs tabs={UTILISATEURS_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === 'utilisateurs' && (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher par nom, email..."
                  className="w-full ps-10 pe-4 py-2.5 text-sm border border-border rounded-input bg-background placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
                />
              </div>
              <button className="ms-auto flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity">
                <Plus className="w-4 h-4" />
                Nouvel utilisateur
              </button>
            </div>
            <div className="card p-0 overflow-hidden">
              <DataTable columns={USER_COLUMNS} data={filtered} />
            </div>
          </>
        )}

        {activeTab === 'permissions' && (
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted sticky start-0 bg-background z-10">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Permission
                    </div>
                  </th>
                  {ROLES_FOR_MATRIX.map((role) => (
                    <th key={role} className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted whitespace-nowrap">
                      {ROLE_LABELS[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((perm, permIdx) => (
                  <tr key={perm} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-medium sticky start-0 bg-background z-10">{perm}</td>
                    {ROLES_FOR_MATRIX.map((role) => (
                      <td key={role} className="text-center px-3 py-3">
                        {PERMISSION_MATRIX[role][permIdx] ? (
                          <span className="inline-flex w-5 h-5 rounded-full bg-status-green-bg text-status-green-text items-center justify-center text-xs font-bold">✓</span>
                        ) : (
                          <span className="inline-flex w-5 h-5 rounded-full bg-status-gray-bg text-status-gray-text items-center justify-center text-xs">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
