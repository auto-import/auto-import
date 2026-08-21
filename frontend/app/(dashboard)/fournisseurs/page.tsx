'use client';

import { useState, useMemo } from 'react';
import { Topbar, StatusBadge, DataTable } from '@/components';
import { fournisseurs } from '@/lib/mockData';
import type { Fournisseur, Column } from '@/types';
import { Search, Plus, Building2, MapPin, Users, Clock } from 'lucide-react';
import FournisseurDetailModal from '@/components/FournisseurDetailModal';
import FournisseurFormModal from '@/components/FournisseurFormModal';

const FOURNISSEUR_COLUMNS: Column<Fournisseur>[] = [
  {
    key: 'nom',
    header: 'Nom',
    render: (row) => (
      <span className="font-semibold truncate max-w-xs">{row.nom}</span>
    ),
  },
  {
    key: 'pays',
    header: 'Pays / Ville',
    render: (row) => (
      <span className="flex items-center gap-1 text-sm">
        <MapPin className="w-3.5 h-3.5 text-muted" />
        {row.pays} · {row.ville}
      </span>
    ),
  },
  {
    key: 'contact',
    header: 'Contact',
    render: (row) => (
      <span className="flex items-center gap-1 text-sm">
        <Users className="w-3.5 h-3.5 text-muted" />
        {row.contact}
      </span>
    ),
  },
  {
    key: 'nombre_vehicules',
    header: 'Véhicules',
    render: (row) => (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-blue-bg text-status-blue-text text-xs font-medium">
        <Building2 className="w-3 h-3" />
        {row.nombre_vehicules}
      </span>
    ),
  },
  {
    key: 'delai_livraison_jours',
    header: 'Délai livraison',
    render: (row) => row.delai_livraison_jours ? (
      <span className="flex items-center gap-1 text-sm">
        <Clock className="w-3.5 h-3.5 text-muted" />
        {row.delai_livraison_jours} j
      </span>
    ) : (
      <span className="text-muted">—</span>
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
];

export default function FournisseursPage() {
  const [search, setSearch] = useState('');
  const [actifFilter, setActifFilter] = useState<string>('tous');
  const [selected, setSelected] = useState<Fournisseur | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Fournisseur | null>(null);
  const [, setRefresh] = useState(0);

  const filtered = useMemo(() => {
    return fournisseurs.filter((f) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          f.nom.toLowerCase().includes(q) ||
          f.ville.toLowerCase().includes(q) ||
          f.pays.toLowerCase().includes(q) ||
          f.contact.toLowerCase().includes(q) ||
          f.email.toLowerCase().includes(q) ||
          f.specialites?.some((s) => s.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (actifFilter !== 'tous' && f.actif !== (actifFilter === 'true')) return false;
      return true;
    });
  }, [search, actifFilter]);

  const handleCreate = () => {
    setEditing(null);
    setShowForm(true);
  };

  const handleEdit = (f: Fournisseur) => {
    setEditing(f);
    setShowForm(true);
  };

  return (
    <>
      <Topbar title="Fournisseurs" subtitle="Gestion des fournisseurs véhicules" />
      <div className="p-8 space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, ville, contact, spécialité..."
              className="w-full ps-10 pe-4 py-2.5 text-sm border border-border rounded-input bg-background placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </div>
          <select
            value={actifFilter}
            onChange={(e) => setActifFilter(e.target.value)}
            className="px-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
          >
            <option value="tous">Tous les statuts</option>
            <option value="true">Actifs</option>
            <option value="false">Inactifs</option>
          </select>
          <button
            onClick={handleCreate}
            className="ms-auto flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Ajouter un fournisseur
          </button>
        </div>

        <p className="text-sm text-muted">
          {filtered.length} fournisseur{filtered.length !== 1 ? 's' : ''} trouvé{filtered.length !== 1 ? 's' : ''}
        </p>

        <div className="card p-0 overflow-hidden">
          <DataTable
            columns={FOURNISSEUR_COLUMNS}
            data={filtered}
            onRowClick={(row) => setSelected(row)}
            emptyMessage="Aucun fournisseur trouvé"
          />
        </div>
      </div>

      {selected && (
        <FournisseurDetailModal
          fournisseur={selected}
          onClose={() => setSelected(null)}
          onEdit={handleEdit}
        />
      )}

      {showForm && (
        <FournisseurFormModal
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => setRefresh((v) => v + 1)}
          initialData={editing}
        />
      )}
    </>
  );
}