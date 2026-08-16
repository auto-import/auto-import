'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar, StatusBadge, DataTable } from '@/components';
import { dossiers } from '@/lib/mockData';
import {
  DOSSIER_STATUT_LABELS,
  DOSSIER_STATUT_VARIANTS,
  DOSSIER_STATUTS,
  formatDate,
} from '@/lib/constants';
import type { Dossier, Column, StatutDossier, OrigineDossier } from '@/types';
import { Search, Plus } from 'lucide-react';

const DOSSIER_COLUMNS: Column<Dossier>[] = [
  {
    key: 'reference',
    header: 'Référence',
    render: (row) => <span className="font-semibold">{row.reference}</span>,
  },
  {
    key: 'client_nom',
    header: 'Client',
  },
  {
    key: 'vehicule_desc',
    header: 'Véhicule',
    render: (row) => row.vehicule_desc ?? <span className="text-muted">—</span>,
  },
  {
    key: 'statut',
    header: 'Statut',
    render: (row) => (
      <StatusBadge
        variant={DOSSIER_STATUT_VARIANTS[row.statut]}
        label={DOSSIER_STATUT_LABELS[row.statut]}
        size="sm"
      />
    ),
  },
  {
    key: 'origine',
    header: 'Origine',
    render: (row) => (
      <span className="capitalize">{row.origine}</span>
    ),
  },
  {
    key: 'date_creation',
    header: 'Date création',
    render: (row) => formatDate(row.date_creation),
  },
];

export default function DossiersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState<StatutDossier | 'tous'>('tous');
  const [origineFilter, setOrigineFilter] = useState<OrigineDossier | 'tous'>('tous');

  const filteredDossiers = useMemo(() => {
    return dossiers.filter((d) => {
      // Search filter
      if (search) {
        const q = search.toLowerCase();
        const matchRef = d.reference.toLowerCase().includes(q);
        const matchClient = d.client_nom.toLowerCase().includes(q);
        const matchVehicule = d.vehicule_desc?.toLowerCase().includes(q);
        if (!matchRef && !matchClient && !matchVehicule) return false;
      }
      // Statut filter
      if (statutFilter !== 'tous' && d.statut !== statutFilter) return false;
      // Origine filter
      if (origineFilter !== 'tous' && d.origine !== origineFilter) return false;
      return true;
    });
  }, [search, statutFilter, origineFilter]);

  return (
    <>
      <Topbar title="Dossiers d'importation" subtitle="Suivi de tous les dossiers" />
      <div className="p-8 space-y-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par référence, client, véhicule..."
              className="w-full ps-10 pe-4 py-2.5 text-sm border border-border rounded-input bg-background placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </div>

          {/* Statut filter */}
          <select
            value={statutFilter}
            onChange={(e) => setStatutFilter(e.target.value as StatutDossier | 'tous')}
            className="px-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
          >
            <option value="tous">Tous les statuts</option>
            {DOSSIER_STATUTS.map((s) => (
              <option key={s} value={s}>
                {DOSSIER_STATUT_LABELS[s]}
              </option>
            ))}
          </select>

          {/* Origine filter */}
          <select
            value={origineFilter}
            onChange={(e) => setOrigineFilter(e.target.value as OrigineDossier | 'tous')}
            className="px-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
          >
            <option value="tous">Toutes origines</option>
            <option value="client">Client</option>
            <option value="stock">Stock</option>
          </select>

          {/* New dossier button */}
          <button className="ms-auto flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" />
            Nouveau dossier
          </button>
        </div>

        {/* Results count */}
        <p className="text-sm text-muted">
          {filteredDossiers.length} dossier{filteredDossiers.length !== 1 ? 's' : ''} trouvé{filteredDossiers.length !== 1 ? 's' : ''}
        </p>

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          <DataTable
            columns={DOSSIER_COLUMNS}
            data={filteredDossiers}
            onRowClick={(row) => router.push(`/dossiers/${row.id}`)}
            emptyMessage="Aucun dossier trouvé"
          />
        </div>
      </div>
    </>
  );
}
