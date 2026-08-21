'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar, StatusBadge, DataTable } from '@/components';
import { offres } from '@/lib/mockData';
import { useAuth } from '@/components/AuthProvider';
import { OFFRE_STATUT_LABELS, OFFRE_STATUT_VARIANTS } from '@/lib/constants';
import type { Offre, Column } from '@/types';
import { Search, Plus, Eye, FolderOpen, Package } from 'lucide-react';
import OffreFormModal from '@/components/OffreFormModal';

export default function OffresChinePage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState<string>('tous');
  const [conditionFilter, setConditionFilter] = useState<string>('tous');
  const [showFormModal, setShowFormModal] = useState(false);

  const canViewPrixAchat = hasPermission('offres_prix_achat');

  const kpis = useMemo(() => {
    const total = offres.length;
    const disponibles = offres.filter(o => o.statut === 'disponible').length;
    const reservees = offres.filter(o => o.statut === 'reservee').length;
    const vendues = offres.filter(o => o.statut === 'vendue').length;
    const expirees = offres.filter(o => o.statut === 'expiree').length;
    return { total, disponibles, reservees, vendues, expirees };
  }, []);

  const filtered = useMemo(() => {
    return offres.filter(o => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        o.marque.toLowerCase().includes(q) ||
        o.modele.toLowerCase().includes(q) ||
        o.reference.toLowerCase().includes(q) ||
        o.fournisseur_nom.toLowerCase().includes(q);
      const matchesStatut = statutFilter === 'tous' || o.statut === statutFilter;
      const matchesCondition = conditionFilter === 'tous' || o.type === conditionFilter;
      return matchesSearch && matchesStatut && matchesCondition;
    });
  }, [search, statutFilter, conditionFilter]);

  const columns: Column<Offre>[] = useMemo(() => {
    const cols: Column<Offre>[] = [
      {
        key: 'photo',
        header: 'Photo',
        render: (o) => (
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
            {o.photos && o.photos.length > 0 ? (
              <img src={o.photos[0]} alt={`${o.marque} ${o.modele}`} className="w-full h-full object-cover" />
            ) : (
              <Package className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        ),
      },
      {
        key: 'vehicule',
        header: 'Véhicule',
        render: (o) => (
          <div>
            <p className="font-medium text-foreground">{o.marque} {o.modele}{o.version ? ` ${o.version}` : ''}</p>
            <p className="text-xs text-muted-foreground">{o.reference}</p>
          </div>
        ),
      },
      {
        key: 'fournisseur',
        header: 'Fournisseur',
        render: (o) => (
          <div>
            <p className="text-sm text-foreground">{o.fournisseur_nom}</p>
            {o.ville_fournisseur && <p className="text-xs text-muted-foreground">{o.ville_fournisseur}</p>}
          </div>
        ),
      },
      { key: 'annee', header: 'Année', render: (o) => <span className="text-sm">{o.annee}</span> },
      {
        key: 'type',
        header: 'État',
        render: (o) => (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${o.type === 'neuf' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {o.type === 'neuf' ? 'Neuf' : 'Occasion'}
          </span>
        ),
      },
      {
        key: 'prix_cif',
        header: 'Prix CIF',
        render: (o) => <span className="text-sm font-medium">{o.prix_cif.toLocaleString('fr-FR')} {o.devise}</span>,
      },
      {
        key: 'prix_ddp',
        header: 'Prix DDP',
        render: (o) => <span className="text-sm font-medium">{o.prix_ddp.toLocaleString('fr-FR')} {o.devise}</span>,
      },
    ];

    if (canViewPrixAchat) {
      cols.push({
        key: 'prix_achat',
        header: 'Prix achat',
        render: (o) => (
          <span className="text-sm font-medium">
            {o.prix_achat_interne ? `${o.prix_achat_interne.toLocaleString('fr-FR')} ${o.devise}` : '—'}
          </span>
        ),
      });
    }

    cols.push(
      {
        key: 'quantite',
        header: 'Disponibilité',
        render: (o) => <span className="text-sm">{o.quantite_disponible}</span>,
      },
      {
        key: 'statut',
        header: 'Statut',
        render: (o) => <StatusBadge label={OFFRE_STATUT_LABELS[o.statut]} variant={OFFRE_STATUT_VARIANTS[o.statut]} />,
      },
      {
        key: 'validite',
        header: 'Validité',
        render: (o) => (
          <span className="text-sm">
            {o.date_validite ? new Date(o.date_validite).toLocaleDateString('fr-FR') : '—'}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (o) => (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); router.push(`/offres/${o.id}`); }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Voir"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); router.push(`/dossiers/new?offre_id=${o.id}`); }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Créer dossier"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
          </div>
        ),
      }
    );

    return cols;
  }, [canViewPrixAchat, router]);

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Offres Chine" subtitle="Catalogue véhicules fournisseurs chinois" />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[
            { label: 'Total offres', value: kpis.total, color: 'text-foreground' },
            { label: 'Disponibles', value: kpis.disponibles, color: 'text-emerald-600' },
            { label: 'Réservées', value: kpis.reservees, color: 'text-amber-600' },
            { label: 'Vendues', value: kpis.vendues, color: 'text-blue-600' },
            { label: 'Expirées', value: kpis.expirees, color: 'text-red-600' },
          ].map((kpi) => (
            <div key={kpi.label} className="card p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
              <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        <div className="card p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="inputCls pl-9 w-full"
              />
            </div>
            <select
              value={statutFilter}
              onChange={(e) => setStatutFilter(e.target.value)}
              className="inputCls"
            >
              <option value="tous">Tous les statuts</option>
              <option value="disponible">Disponible</option>
              <option value="reservee">Réservée</option>
              <option value="vendue">Vendue</option>
              <option value="expiree">Expirée</option>
            </select>
            <select
              value={conditionFilter}
              onChange={(e) => setConditionFilter(e.target.value)}
              className="inputCls"
            >
              <option value="tous">Toutes conditions</option>
              <option value="neuf">Neuf</option>
              <option value="occasion">Occasion</option>
            </select>
            <button onClick={() => setShowFormModal(true)} className="btn-primary ml-auto">
              <Plus className="w-4 h-4 mr-1.5" />
              Nouvelle offre
            </button>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={filtered}
          onRowClick={(o) => router.push(`/offres/${o.id}`)}
          emptyMessage="Aucune offre trouvée"
        />
      </div>

      {showFormModal && (
        <OffreFormModal
          onClose={() => setShowFormModal(false)}
          onSaved={() => setShowFormModal(false)}
        />
      )}
    </div>
  );
}
