import { StatusBadge } from '@/components';
import { VEHICULE_STATUT_LABELS, VEHICULE_STATUT_VARIANTS } from '@/lib/constants';
import type { Dossier } from '@/types';
import { Car, Plus } from 'lucide-react';

interface TabVehiculeProps {
  dossier: Dossier;
}

export default function DossierTabVehicule({ dossier }: TabVehiculeProps) {
  const vehicule = dossier.vehicule;

  if (!vehicule) {
    return (
      <div className="card">
        <h3 className="section-title">Informations véhicule</h3>
        <p className="text-sm text-muted">Aucun véhicule associé à ce dossier.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Vehicle information */}
      <div className="card">
        <h3 className="section-title">Informations véhicule</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="field-label">VIN</p>
            <p className="field-value font-mono text-sm">{vehicule.vin}</p>
          </div>
          <div>
            <p className="field-label">Marque / Modèle</p>
            <p className="field-value">{vehicule.marque} {vehicule.modele}</p>
          </div>
          <div>
            <p className="field-label">Année</p>
            <p className="field-value">{vehicule.annee}</p>
          </div>
          <div>
            <p className="field-label">Fournisseur</p>
            <p className="field-value">{vehicule.fournisseur_nom}</p>
          </div>
          <div>
            <p className="field-label">Statut du véhicule</p>
            <div className="mt-1">
              <StatusBadge
                variant={VEHICULE_STATUT_VARIANTS[vehicule.statut]}
                label={VEHICULE_STATUT_LABELS[vehicule.statut]}
                size="sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Photos */}
      <div className="card">
        <h3 className="section-title">Photos du véhicule</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Placeholder photo slots */}
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="aspect-[4/3] rounded-card bg-surface border border-border flex items-center justify-center"
            >
              <Car className="w-8 h-8 text-border" />
            </div>
          ))}
          {/* Add photo button */}
          <button className="aspect-[4/3] rounded-card border border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted hover:bg-surface transition-colors">
            <Plus className="w-5 h-5" />
            <span className="text-xs">Ajouter</span>
          </button>
        </div>
      </div>
    </div>
  );
}
