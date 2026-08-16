'use client';

import { useState, useMemo } from 'react';
import { Topbar, StatusBadge, DataTable } from '@/components';
import { factures } from '@/lib/mockData';
import {
  FACTURE_STATUT_LABELS,
  FACTURE_STATUT_VARIANTS,
  formatMontant,
  formatDate,
} from '@/lib/constants';
import type { Facture, Column, StatutFacture } from '@/types';
import { Search } from 'lucide-react';

const FACTURE_COLUMNS: Column<Facture>[] = [
  {
    key: 'reference',
    header: 'Référence',
    render: (row) => <span className="font-semibold">{row.reference}</span>,
  },
  {
    key: 'dossier_reference',
    header: 'Dossier',
    render: (row) => <span className="text-status-blue-text">{row.dossier_reference}</span>,
  },
  {
    key: 'libelle',
    header: 'Libellé',
  },
  {
    key: 'montant_dzd',
    header: 'Montant',
    render: (row) => <span className="font-medium">{formatMontant(row.montant_dzd)}</span>,
  },
  {
    key: 'date',
    header: 'Date',
    render: (row) => formatDate(row.date),
  },
  {
    key: 'statut',
    header: 'Statut',
    render: (row) => (
      <StatusBadge
        variant={FACTURE_STATUT_VARIANTS[row.statut]}
        label={FACTURE_STATUT_LABELS[row.statut]}
        size="sm"
      />
    ),
  },
];

const ALL_STATUTS: StatutFacture[] = ['payee', 'en_attente', 'en_retard', 'annulee'];

export default function FacturationPage() {
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState<StatutFacture | 'tous'>('tous');

  const filtered = useMemo(() => {
    return factures.filter((f) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          f.reference.toLowerCase().includes(q) ||
          f.dossier_reference.toLowerCase().includes(q) ||
          f.libelle.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (statutFilter !== 'tous' && f.statut !== statutFilter) return false;
      return true;
    });
  }, [search, statutFilter]);

  return (
    <>
      <Topbar title="Facturation & paiements" subtitle="Gestion des factures et paiements" />
      <div className="p-8 space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par référence, dossier, libellé..."
              className="w-full ps-10 pe-4 py-2.5 text-sm border border-border rounded-input bg-background placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </div>
          <select
            value={statutFilter}
            onChange={(e) => setStatutFilter(e.target.value as StatutFacture | 'tous')}
            className="px-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
          >
            <option value="tous">Tous les statuts</option>
            {ALL_STATUTS.map((s) => (
              <option key={s} value={s}>{FACTURE_STATUT_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <p className="text-sm text-muted">
          {filtered.length} facture{filtered.length !== 1 ? 's' : ''}
        </p>

        <div className="card p-0 overflow-hidden">
          <DataTable columns={FACTURE_COLUMNS} data={filtered} />
        </div>
      </div>
    </>
  );
}
