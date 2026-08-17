import { StatusBadge, DataTable } from '@/components';
import {
  VEHICULE_STATUT_LABELS,
  VEHICULE_STATUT_VARIANTS,
  VEHICLE_SOURCE_LABELS,
  VEHICLE_SOURCE_VARIANTS,
} from '@/lib/constants';
import type { Dossier, Vehicule, Column } from '@/types';

interface TabVehiculesProps {
  dossier: Dossier;
}

const VEHICULE_COLUMNS: Column<Vehicule>[] = [
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
    key: 'vin',
    header: 'VIN',
    render: (row) => <span className="font-mono text-xs">{row.vin}</span>,
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
];

export default function DossierTabVehicules({ dossier }: TabVehiculesProps) {
  if (dossier.vehicles.length === 0) {
    return (
      <div className="card">
        <h3 className="section-title">Véhicules du dossier</h3>
        <p className="text-sm text-muted">Aucun véhicule associé à ce dossier.</p>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-6 pt-5 pb-3">
        <h3 className="section-title mb-0">
          Véhicules du dossier ({dossier.vehicles.length})
        </h3>
      </div>
      <DataTable
        columns={VEHICULE_COLUMNS}
        data={dossier.vehicles}
        emptyMessage="Aucun véhicule"
      />
    </div>
  );
}