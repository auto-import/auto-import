'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar, StatusBadge, DataTable } from '@/components';
import { offres } from '@/lib/mockData';
import { OFFRE_STATUT_LABELS, OFFRE_STATUT_VARIANTS, formatOffrePrix } from '@/lib/constants';
import type { Offre, Column, StatutOffre } from '@/types';
import { Search, FilePlus2 } from 'lucide-react';

const ALL_STATUTS: StatutOffre[] = ['disponible', 'reservee', 'vendue', 'expiree'];

const OFFRE_COLUMNS: Column<Offre>[] = [
  {
    key: 'marque',
    header: 'Marque / Modèle',
    render: (row) => (
      <span className="font-medium">
        {row.marque} {row.modele}
      </span>
    ),
  },
  {
    key: 'annee',
    header: 'Année',
  },
  {
    key: 'fournisseur_nom',
    header: 'Fournisseur',
  },
  {
    key: 'prix_cif',
    header: 'Prix CIF',
    render: (row) => <span className="font-medium">{formatOffrePrix(row.prix_cif, row.devise)}</span>,
  },
  {
    key: 'prix_ddp',
    header: 'Prix DDP',
    render: (row) => <span className="font-medium">{formatOffrePrix(row.prix_ddp, row.devise)}</span>,
  },
  {
    key: 'disponibilite',
    header: 'Disponibilité',
  },
  {
    key: 'statut',
    header: 'Statut',
    render: (row) => (
      <StatusBadge
        variant={OFFRE_STATUT_VARIANTS[row.statut]}
        label={OFFRE_STATUT_LABELS[row.statut]}
        size="sm"
      />
    ),
  },
];

export default function OffresChinePage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState<StatutOffre | 'tous'>('tous');

  const filtered = useMemo(() => {
    return offres.filter((o) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          o.marque.toLowerCase().includes(q) ||
          o.modele.toLowerCase().includes(q) ||
          o.fournisseur_nom.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (statutFilter !== 'tous' && o.statut !== statutFilter) return false;
      return true;
    });
  }, [search, statutFilter]);

  return (
    <>
      <Topbar title="Offres Chine" subtitle="Offres des fournisseurs chinois" />
      <div className="p-8 space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par marque, modèle, fournisseur..."
              className="w-full ps-10 pe-4 py-2.5 text-sm border border-border rounded-input bg-background placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </div>
          <select
            value={statutFilter}
            onChange={(e) => setStatutFilter(e.target.value as StatutOffre | 'tous')}
            className="px-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
          >
            <option value="tous">Tous les statuts</option>
            {ALL_STATUTS.map((s) => (
              <option key={s} value={s}>{OFFRE_STATUT_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <p className="text-sm text-muted">
          {filtered.length} offre{filtered.length !== 1 ? 's' : ''}
        </p>

        <div className="card p-0 overflow-hidden">
          <DataTable
            columns={[
              ...OFFRE_COLUMNS,
              {
                key: 'actions',
                header: '',
                render: (row) => (
                  <button
                    onClick={() => router.push(`/dossiers/creer?offre=${row.id}`)}
                    className="flex items-center gap-1.5 text-sm font-medium text-status-blue-text hover:underline whitespace-nowrap"
                  >
                    <FilePlus2 className="w-4 h-4" />
                    Créer dossier
                  </button>
                ),
              },
            ]}
            data={filtered}
            emptyMessage="Aucune offre trouvée"
          />
        </div>
      </div>
    </>
  );
}