'use client';

import { useState, useMemo } from 'react';
import { Topbar, StatusBadge, DataTable } from '@/components';
import { expeditions } from '@/lib/mockData';
import {
  EXPEDITION_STATUT_LABELS,
  EXPEDITION_STATUT_VARIANTS,
  formatDate,
} from '@/lib/constants';
import type { Expedition, Column, StatutExpedition } from '@/types';
import { Search, Ship } from 'lucide-react';

const EXPEDITION_COLUMNS: Column<Expedition>[] = [
  {
    key: 'numero_conteneur',
    header: 'Conteneur',
    render: (row) => (
      <div className="flex items-center gap-2">
        <Ship className="w-4 h-4 text-muted" />
        <span className="font-mono font-medium">{row.numero_conteneur}</span>
      </div>
    ),
  },
  {
    key: 'navire',
    header: 'Navire',
  },
  {
    key: 'port_depart',
    header: 'Départ',
    render: (row) => (
      <div>
        <span className="text-sm">{row.port_depart}</span>
        <p className="text-xs text-muted">{formatDate(row.etd)}</p>
      </div>
    ),
  },
  {
    key: 'port_arrivee',
    header: 'Arrivée',
    render: (row) => (
      <div>
        <span className="text-sm">{row.port_arrivee}</span>
        <p className="text-xs text-muted">ETA {formatDate(row.eta)}</p>
      </div>
    ),
  },
  {
    key: 'nombre_vehicules',
    header: 'Véhicules',
    render: (row) => (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-surface text-sm font-medium">
        {row.nombre_vehicules}
      </span>
    ),
  },
  {
    key: 'statut',
    header: 'Statut',
    render: (row) => (
      <StatusBadge
        variant={EXPEDITION_STATUT_VARIANTS[row.statut]}
        label={EXPEDITION_STATUT_LABELS[row.statut]}
        size="sm"
      />
    ),
  },
];

const ALL_STATUTS: StatutExpedition[] = ['planifiee', 'en_mer', 'arrivee', 'dedouanee'];

export default function ExpeditionsPage() {
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState<StatutExpedition | 'tous'>('tous');

  const filtered = useMemo(() => {
    return expeditions.filter((e) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          e.numero_conteneur.toLowerCase().includes(q) ||
          e.navire.toLowerCase().includes(q) ||
          e.numero_bl.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (statutFilter !== 'tous' && e.statut !== statutFilter) return false;
      return true;
    });
  }, [search, statutFilter]);

  return (
    <>
      <Topbar title="Expéditions maritimes" subtitle="Suivi des conteneurs en transit" />
      <div className="p-8 space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par conteneur, navire, B/L..."
              className="w-full ps-10 pe-4 py-2.5 text-sm border border-border rounded-input bg-background placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </div>
          <select
            value={statutFilter}
            onChange={(e) => setStatutFilter(e.target.value as StatutExpedition | 'tous')}
            className="px-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
          >
            <option value="tous">Tous les statuts</option>
            {ALL_STATUTS.map((s) => (
              <option key={s} value={s}>{EXPEDITION_STATUT_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <p className="text-sm text-muted">
          {filtered.length} expédition{filtered.length !== 1 ? 's' : ''}
        </p>

        <div className="card p-0 overflow-hidden">
          <DataTable columns={EXPEDITION_COLUMNS} data={filtered} />
        </div>
      </div>
    </>
  );
}
