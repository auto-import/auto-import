'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Users,
  Building2,
  MapPin,
  Phone,
  FolderOpen,
  Car,
  Clock,
} from 'lucide-react';
import Topbar from '@/components/Topbar';
import StatusBadge from '@/components/StatusBadge';
import DataTable from '@/components/DataTable';
import { clientsCRM, utilisateurs, getDossiersByClient, getVehiculesByClient } from '@/lib/mockData';
import { TYPE_CLIENT_LABELS } from '@/lib/constants';
import type { ClientCRM, Column } from '@/types';

const TYPE_CLIENT_FILTERS = ['tous', 'particulier', 'revendeur', 'importateur', 'societe'] as const;
const STATUS_FILTERS = ['tous', 'actif', 'inactif', 'suspendu'] as const;

export default function ClientsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('tous');
  const [statusFilter, setStatusFilter] = useState<string>('tous');

  const filteredClients = useMemo(() => {
    return clientsCRM.filter((client) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        !query ||
        client.nom.toLowerCase().includes(query) ||
        client.ville?.toLowerCase().includes(query) ||
        client.telephone.includes(query);

      const matchesType = typeFilter === 'tous' || client.type_client === typeFilter;
      const matchesStatus = statusFilter === 'tous' || client.statut === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [searchQuery, typeFilter, statusFilter]);

  const totalClients = filteredClients.length;
  const actifs = filteredClients.filter((c) => c.statut === 'actif').length;
  const revenuTotal = filteredClients.reduce((sum, c) => sum + (c.revenu_total || 0), 0);
  const soldeTotal = filteredClients.reduce((sum, c) => sum + (c.solde_du || 0), 0);

  const columns: Column<ClientCRM>[] = [
    {
      key: 'nom',
      header: 'Client',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-status-blue-bg flex items-center justify-center text-sm font-semibold text-status-blue-text">
            {row.prenom?.[0]}{row.nom[0]}
          </div>
          <div>
            <p className="font-medium">{row.prenom} {row.nom}</p>
            <p className="flex items-center gap-1 text-xs text-muted">
              <MapPin className="w-3 h-3" />
              {row.ville || '—'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'type_client',
      header: 'Type',
      render: (row) => (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface text-xs font-medium">
          {row.type_client === 'societe' ? <Building2 className="w-3 h-3" /> : <Users className="w-3 h-3" />}
          {TYPE_CLIENT_LABELS[row.type_client]}
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (row) => (
        <div className="text-sm">
          <p className="flex items-center gap-1">
            <Phone className="w-3 h-3 text-muted" />
            {row.telephone}
          </p>
          {row.whatsapp && (
            <p className="text-xs text-muted">WA: {row.whatsapp}</p>
          )}
        </div>
      ),
    },
    {
      key: 'dossiers',
      header: 'Dossiers',
      render: (row) => {
        const count = getDossiersByClient(row.id).length;
        return (
          <span className="inline-flex items-center gap-1 text-sm">
            <FolderOpen className="w-4 h-4 text-muted" />
            {count}
          </span>
        );
      },
    },
    {
      key: 'vehicules',
      header: 'Véhicules',
      render: (row) => {
        const count = getVehiculesByClient(row.id).length;
        return (
          <span className="inline-flex items-center gap-1 text-sm">
            <Car className="w-4 h-4 text-muted" />
            {count}
          </span>
        );
      },
    },
    {
      key: 'revenu_total',
      header: 'Revenu',
      render: (row) => (
        <span className="text-sm font-medium">
          ${(row.revenu_total || 0).toLocaleString('en-US')}
        </span>
      ),
    },
    {
      key: 'solde_du',
      header: 'Solde du',
      render: (row) => (
        <span className={`text-sm font-medium ${(row.solde_du || 0) > 0 ? 'text-status-red-text' : 'text-status-green-text'}`}>
          ${(row.solde_du || 0).toLocaleString('en-US')}
        </span>
      ),
    },
    {
      key: 'assigne_a',
      header: 'Assigné à',
      render: (row) => {
        const user = utilisateurs.find((u) => u.id === row.assigne_a);
        if (!user) return <span className="text-muted">—</span>;
        return (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-status-blue-bg flex items-center justify-center text-[10px] font-bold text-status-blue-text">
              {user.avatar_initials}
            </div>
            <span className="text-sm">{user.nom}</span>
          </div>
        );
      },
    },
    {
      key: 'statut',
      header: 'Statut',
      render: (row) => (
        <StatusBadge
          variant={row.statut === 'actif' ? 'green' : row.statut === 'inactif' ? 'gray' : 'amber'}
          label={row.statut === 'actif' ? 'Actif' : row.statut === 'inactif' ? 'Inactif' : 'Suspendu'}
          size="sm"
        />
      ),
    },
    {
      key: 'date_derniere_activite',
      header: 'Dernière activité',
      render: (row) => (
        <span className="flex items-center gap-1 text-sm text-muted">
          <Clock className="w-3 h-3" />
          {row.date_derniere_activite
            ? new Date(row.date_derniere_activite).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
            : '—'}
        </span>
      ),
    },
  ];

  return (
    <>
      <Topbar title="Clients" subtitle="Gestion de la relation client" />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="px-4 py-3 rounded-card border border-border text-center">
            <p className="text-2xl font-bold">{totalClients}</p>
            <p className="text-[11px] text-muted mt-1">Total clients</p>
          </div>
          <div className="px-4 py-3 rounded-card border border-border text-center">
            <p className="text-2xl font-bold text-status-green-text">{actifs}</p>
            <p className="text-[11px] text-muted mt-1">Actifs</p>
          </div>
          <div className="px-4 py-3 rounded-card border border-border text-center">
            <p className="text-2xl font-bold">${(revenuTotal / 1000).toFixed(0)}k</p>
            <p className="text-[11px] text-muted mt-1">Revenu total</p>
          </div>
          <div className="px-4 py-3 rounded-card border border-border text-center">
            <p className="text-2xl font-bold text-status-red-text">${(soldeTotal / 1000).toFixed(1)}k</p>
            <p className="text-[11px] text-muted mt-1">Solde du total</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder="Rechercher par nom, ville, téléphone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full ps-10 pe-4 py-2.5 text-sm border border-border rounded-input bg-background placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
          >
            {TYPE_CLIENT_FILTERS.map((t) => (
              <option key={t} value={t}>
                {t === 'tous' ? 'Tous les types' : TYPE_CLIENT_LABELS[t as keyof typeof TYPE_CLIENT_LABELS]}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === 'tous' ? 'Tous les statuts' : s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <button className="ms-auto flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" />
            Ajouter un client
          </button>
        </div>

        <div className="card p-0 overflow-hidden">
          <DataTable
            columns={columns}
            data={filteredClients}
            onRowClick={(row) => router.push(`/crm/clients/${row.id}`)}
            emptyMessage="Aucun client trouvé"
          />
        </div>
      </div>
    </>
  );
}