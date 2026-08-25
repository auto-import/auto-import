'use client';

import { useState, useMemo } from 'react';
import { Topbar, StatusBadge } from '@/components';
import { vehicules } from '@/lib/mockData';
import {
  VEHICULE_STATUT_LABELS,
  VEHICULE_STATUT_VARIANTS,
  VEHICLE_SOURCE_LABELS,
  VEHICLE_SOURCE_VARIANTS,
  VEHICULE_ETAT_LABELS,
  CARBURANT_LABELS,
  BOITE_LABELS,
  formatMontant,
  formatOffrePrix,
} from '@/lib/constants';
import VehiculeDetailModal from '@/components/VehiculeDetailModal';
import VehiculeFormModal from '@/components/VehiculeFormModal';
import type { Vehicule, StatutVehicule, SourceVehicule } from '@/types';
import { Search, Fuel, Cog, Gauge, Camera, Plus } from 'lucide-react';

const ALL_STATUTS: StatutVehicule[] = ['disponible', 'reserve', 'en_mer', 'en_douane', 'livre', 'vendu'];
const ALL_SOURCES: SourceVehicule[] = ['offre', 'corapide', 'external'];

export default function VehiculesPage() {
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState<StatutVehicule | 'tous'>('tous');
  const [sourceFilter, setSourceFilter] = useState<SourceVehicule | 'tous'>('tous');
  const [selected, setSelected] = useState<Vehicule | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [, setRefresh] = useState(0);

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
          <button
            onClick={() => setShowAdd(true)}
            className="ms-auto flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Ajouter un véhicule
          </button>
        </div>

        <p className="text-sm text-muted">
          {filtered.length} véhicule{filtered.length !== 1 ? 's' : ''}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((v) => {
            const photo = v.photos[0];
            return (
              <button
                key={v.id}
                onClick={() => setSelected(v)}
                className="card p-0 overflow-hidden text-start group hover:shadow-md transition-shadow"
              >
                <div className="relative aspect-[16/10] bg-surface overflow-hidden">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo}
                      alt={`${v.marque} ${v.modele}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted">
                      Aucune photo
                    </div>
                  )}
                  <div className="absolute top-3 start-3">
                    <StatusBadge
                      variant={VEHICULE_STATUT_VARIANTS[v.statut]}
                      label={VEHICULE_STATUT_LABELS[v.statut]}
                      size="sm"
                    />
                  </div>
                  <div className="absolute top-3 end-3 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 text-white text-[11px]">
                    <Camera className="w-3 h-3" />
                    {v.photos.length}
                  </div>
                  {v.etat && (
                    <div className="absolute bottom-3 start-3">
                      <span className="px-2 py-1 rounded-full bg-black/60 text-white text-[11px] font-medium">
                        {VEHICULE_ETAT_LABELS[v.etat]}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">
                        {v.marque} {v.modele}
                      </h3>
                      <p className="text-xs text-muted mt-0.5">{v.annee} · {v.couleur}</p>
                    </div>
                    <StatusBadge
                      variant={VEHICLE_SOURCE_VARIANTS[v.source]}
                      label={VEHICLE_SOURCE_LABELS[v.source]}
                      size="sm"
                    />
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-muted">
                    {v.carburant && (
                      <span className="inline-flex items-center gap-1">
                        <Fuel className="w-3 h-3" />
                        {CARBURANT_LABELS[v.carburant]}
                      </span>
                    )}
                    {v.boite && (
                      <span className="inline-flex items-center gap-1">
                        <Cog className="w-3 h-3" />
                        {BOITE_LABELS[v.boite]}
                      </span>
                    )}
                    {v.kilometrage != null && (
                      <span className="inline-flex items-center gap-1">
                        <Gauge className="w-3 h-3" />
                        {v.kilometrage.toLocaleString('fr-FR')} km
                      </span>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                    <p className="text-sm font-bold">
                      {v.prix_achat_dzd > 0
                        ? formatMontant(v.prix_achat_dzd)
                        : formatOffrePrix(v.prix_achat_cny || 0, 'CNY')}
                    </p>
                    <span className="text-xs text-status-blue-text font-medium">Voir détails</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="card p-10 text-center text-sm text-muted">Aucun véhicule trouvé</div>
        )}
      </div>

      {selected && (
        <VehiculeDetailModal vehicule={selected} onClose={() => setSelected(null)} />
      )}

      {showAdd && (
        <VehiculeFormModal
          onClose={() => setShowAdd(false)}
          onCreated={() => setRefresh((v) => v + 1)}
        />
      )}
    </>
  );
}