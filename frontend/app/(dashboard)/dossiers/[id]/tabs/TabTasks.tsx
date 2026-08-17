import { DataTable, StatusBadge } from '@/components';
import {
  PRIORITE_TACHE_LABELS,
  PRIORITE_TACHE_VARIANTS,
  STATUT_TACHE_LABELS,
  STATUT_TACHE_VARIANTS,
  formatDate,
} from '@/lib/constants';
import type { Column, Dossier, Tache } from '@/types';

interface TabTasksProps {
  dossier: Dossier;
}

const TACHE_COLUMNS: Column<Tache>[] = [
  {
    key: 'titre',
    header: 'Tâche',
    render: (row) => <span className="font-medium">{row.titre}</span>,
  },
  {
    key: 'assigne_a',
    header: 'Assignée à',
  },
  {
    key: 'departement',
    header: 'Département',
  },
  {
    key: 'date_echeance',
    header: 'Échéance',
    render: (row) => formatDate(row.date_echeance),
  },
  {
    key: 'priorite',
    header: 'Priorité',
    render: (row) => (
      <StatusBadge
        variant={PRIORITE_TACHE_VARIANTS[row.priorite]}
        label={PRIORITE_TACHE_LABELS[row.priorite]}
        size="sm"
      />
    ),
  },
  {
    key: 'statut',
    header: 'Statut',
    render: (row) => (
      <StatusBadge
        variant={STATUT_TACHE_VARIANTS[row.statut]}
        label={STATUT_TACHE_LABELS[row.statut]}
        size="sm"
      />
    ),
  },
];

export default function DossierTabTasks({ dossier }: TabTasksProps) {
  const taches = dossier.taches;

  if (taches.length === 0) {
    return (
      <div className="card">
        <h3 className="section-title">Tâches du dossier</h3>
        <p className="text-sm text-muted">Aucune tâche associée à ce dossier.</p>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-6 pt-5 pb-3">
        <h3 className="section-title mb-0">Tâches du dossier ({taches.length})</h3>
      </div>
      <DataTable
        columns={TACHE_COLUMNS}
        data={taches}
        emptyMessage="Aucune tâche"
      />
    </div>
  );
}