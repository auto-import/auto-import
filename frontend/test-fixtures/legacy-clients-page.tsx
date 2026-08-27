'use client';

import { useState, useMemo } from 'react';
import { Topbar, DataTable } from '@/components';
import { clients } from '@/lib/mockData';
import { formatDate } from '@/lib/constants';
import type { Client, Column } from '@/types';
import { Search } from 'lucide-react';

const CLIENT_COLUMNS: Column<Client>[] = [
  {
    key: 'nom',
    header: 'Nom',
    render: (row) => <span className="font-semibold">{row.prenom} {row.nom}</span>,
  },
  {
    key: 'telephone',
    header: 'Téléphone',
  },
  {
    key: 'email',
    header: 'Email',
    render: (row) => <span className="text-status-blue-text">{row.email}</span>,
  },
  {
    key: 'nombre_dossiers',
    header: 'Nb dossiers',
    render: (row) => (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-surface text-sm font-medium">
        {row.nombre_dossiers}
      </span>
    ),
  },
  {
    key: 'date_inscription',
    header: 'Date inscription',
    render: (row) => formatDate(row.date_inscription),
  },
];

export default function ClientsPage() {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        c.nom.toLowerCase().includes(q) ||
        c.prenom.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.telephone.includes(q)
    );
  }, [search]);

  return (
    <>
      <Topbar title="Clients" subtitle="Gestion des clients" />
      <div className="p-8 space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, email, téléphone..."
              className="w-full ps-10 pe-4 py-2.5 text-sm border border-border rounded-input bg-background placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </div>
        </div>

        <p className="text-sm text-muted">
          {filtered.length} client{filtered.length !== 1 ? 's' : ''}
        </p>

        <div className="card p-0 overflow-hidden">
          <DataTable columns={CLIENT_COLUMNS} data={filtered} />
        </div>
      </div>
    </>
  );
}
