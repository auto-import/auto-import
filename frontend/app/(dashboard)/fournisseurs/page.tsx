'use client';

import { useState, useMemo } from 'react';
import { Topbar, DataTable } from '@/components';
import { fournisseurs } from '@/lib/mockData';
import type { Fournisseur, Column } from '@/types';
import { Search } from 'lucide-react';

const FOURNISSEUR_COLUMNS: Column<Fournisseur>[] = [
  {
    key: 'nom',
    header: 'Nom',
    render: (row) => <span className="font-semibold">{row.nom}</span>,
  },
  {
    key: 'pays',
    header: 'Pays',
    render: (row) => `${row.ville}, ${row.pays}`,
  },
  {
    key: 'contact',
    header: 'Contact',
  },
  {
    key: 'email',
    header: 'Email',
    render: (row) => <span className="text-status-blue-text">{row.email}</span>,
  },
  {
    key: 'nombre_vehicules',
    header: 'Nb véhicules',
    render: (row) => (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-surface text-sm font-medium">
        {row.nombre_vehicules}
      </span>
    ),
  },
];

export default function FournisseursPage() {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return fournisseurs;
    const q = search.toLowerCase();
    return fournisseurs.filter(
      (f) =>
        f.nom.toLowerCase().includes(q) ||
        f.contact.toLowerCase().includes(q) ||
        f.ville.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <>
      <Topbar title="Fournisseurs" subtitle="Gestion des fournisseurs" />
      <div className="p-8 space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, contact, ville..."
              className="w-full ps-10 pe-4 py-2.5 text-sm border border-border rounded-input bg-background placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </div>
        </div>

        <p className="text-sm text-muted">
          {filtered.length} fournisseur{filtered.length !== 1 ? 's' : ''}
        </p>

        <div className="card p-0 overflow-hidden">
          <DataTable columns={FOURNISSEUR_COLUMNS} data={filtered} />
        </div>
      </div>
    </>
  );
}
