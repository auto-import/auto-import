'use client';

import { useState, useMemo } from 'react';
import { Topbar, StatusBadge, DataTable } from '@/components';
import { vehicules } from '@/lib/mockData';
import {
  VEHICULE_STATUT_LABELS,
  VEHICULE_STATUT_VARIANTS,
  VEHICLE_SOURCE_LABELS,
  VEHICLE_SOURCE_VARIANTS,
  formatMontant,
} from '@/lib/constants';
import type { Vehicule, Column, StatutVehicule, SourceVehicule } from '@/types';
import { Search } from 'lucide-react';

const VEHICULE_COLUMNS: Column<Vehicule>[] = [
  {
    key: 'vin',
    header: 'VIN',
    render: (row) => <span className="font-mono text-xs">{row.vin}</span>,
  },
  {
    key: 'marque',
    header: 'Marque / Modèle',
    render: (row) => <span className="font-medium">{row.marque} {row.modele}</span>,
  },
  {
    key: 'annee',
    header: 'Année',
  },
  {
    key: 'source',
    header: 'Source',
    render: (row) => (
      <StatusBadge
        variant={VEHICLE_SOURCE_VARIANTS[row.source]}
        label={VEHICLE_SOURCE_LABELS[row.source]}
        size="sm"
      />
    ),
  },
  {
    key: 'fournisseur_nom',
    header: 'Fournisseur',
  },
  {
    key: 'statut',
    header: 'Statut',
    render: (row) => (
      <StatusBadge
        variant={VEHICULE_STATUT_VARIANTS[row.statut]}
        label={VEHICULE_STATUT_LABELS[row.statut]}
        size="sm"
      />
    ),
  },
  {
    key: 'prix_achat_dzd',
    header: 'Prix achat',
    render: (row) => formatMontant(row.prix_achat_dzd),
  },
];

const ALL_STATUTS: StatutVehicule[] = ['disponible', 'reserve', 'en_mer', 'en_douane', 'livre', 'vendu'];
const ALL_SOURCES: SourceVehicule[] = ['offre', 'corapide', 'external'];

export default function VehiculesPage() {
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState<StatutVehicule | 'tous'>('tous');
  const [sourceFilter, setSourceFilter] = useState<SourceVehicule | 'tous'>('tous');

  const filtered = useMemo(() => {
    return vehicules.filter((v) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          v.vin.toLowerCase().includes(q) ||
          v.marque.toLowerCase().includes(q) ||
          v.modele.toLowerCase().includes(q) ||
          v.fournisseur_nom.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (statutFilter !== 'tous' && v.statut !== statutFilter) return false;
      if (sourceFilter !== 'tous' && v.source !== sourceFilter) return false;
      return true;
    });
  }, [search, statutFilter, sourceFilter]);

  return (
    <>
      <Topbar title="Véhicules / Stock" subtitle="Gestion du parc automobile" />
      <div className="p-8 space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par VIN, marque, modèle..."
              className="w-full ps-10 pe-4 py-2.5 text-sm border border-border rounded-input bg-background placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </div>
          <select
            value={statutFilter}
            onChange={(e) => setStatutFilter(e.target.value as StatutVehicule | 'tous')}
            className="px-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
          >
            <option value="tous">Tous les statuts</option>
            {ALL_STATUTS.map((s) => (
              <option key={s} value={s}>{VEHICULE_STATUT_LABELS[s]}</option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as SourceVehicule | 'tous')}
            className="px-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
          >
            <option value="tous">Toutes les sources</option>
            {ALL_SOURCES.map((s) => (
              <option key={s} value={s}>{VEHICLE_SOURCE_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <p className="text-sm text-muted">
          {filtered.length} véhicule{filtered.length !== 1 ? 's' : ''}
        </p>

        <div className="card p-0 overflow-hidden">
          <DataTable columns={VEHICULE_COLUMNS} data={filtered} />
        </div>
      </div>
    </>
  );
}
