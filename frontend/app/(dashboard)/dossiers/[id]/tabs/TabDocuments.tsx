import { DataTable, StatusBadge } from '@/components';
import {
  DOCUMENT_STATUT_LABELS,
  DOCUMENT_STATUT_VARIANTS,
  DOCUMENT_TYPE_LABELS,
  formatDate,
} from '@/lib/constants';
import type { Column, Dossier, DossierDocument } from '@/types';
import { FileText, Download, Plus } from 'lucide-react';

interface TabDocumentsProps {
  dossier: Dossier;
}

const DOCUMENT_COLUMNS: Column<DossierDocument>[] = [
  {
    key: 'nom',
    header: 'Fichier',
    render: (row) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-muted" />
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{row.nom}</p>
          <p className="text-xs text-muted">
            {row.upload_par} · {row.date ? formatDate(row.date) : '—'} · v{row.version}
          </p>
        </div>
      </div>
    ),
  },
  {
    key: 'type',
    header: 'Type',
    render: (row) => DOCUMENT_TYPE_LABELS[row.type],
  },
  {
    key: 'taille',
    header: 'Taille',
  },
  {
    key: 'statut',
    header: 'Statut',
    render: (row) => (
      <StatusBadge
        variant={DOCUMENT_STATUT_VARIANTS[row.statut]}
        label={DOCUMENT_STATUT_LABELS[row.statut]}
        size="sm"
      />
    ),
  },
  {
    key: 'url',
    header: '',
    render: () => (
      <button className="flex items-center gap-1.5 text-sm font-medium text-status-blue-text hover:underline">
        <Download className="w-3.5 h-3.5" />
        Télécharger
      </button>
    ),
  },
];

export default function DossierTabDocuments({ dossier }: TabDocumentsProps) {
  const documents = dossier.documents;
  const manquants = documents.filter((d) => d.statut === 'manquant').length;
  const recus = documents.filter((d) => d.statut !== 'manquant').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          {recus} document(s) reçu(s) ·{' '}
          {manquants > 0 ? (
            <span className="font-semibold text-status-red-text">{manquants} manquant(s)</span>
          ) : (
            'aucun document manquant'
          )}
        </p>
        <button className="flex items-center gap-1.5 text-sm font-medium text-status-blue-text hover:underline shrink-0">
          <Plus className="w-4 h-4" />
          Ajouter un document
        </button>
      </div>
      <div className="card p-0 overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <h3 className="section-title mb-0">Documents du dossier ({documents.length})</h3>
        </div>
        <DataTable
          columns={DOCUMENT_COLUMNS}
          data={documents}
          emptyMessage="Aucun document uploadé"
        />
      </div>
    </div>
  );
}