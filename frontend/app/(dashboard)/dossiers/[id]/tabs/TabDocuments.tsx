import { DataTable } from '@/components';
import { formatDate } from '@/lib/constants';
import type { Dossier, DocumentDossier, Column } from '@/types';
import { FileText, Download, Plus } from 'lucide-react';

interface TabDocumentsProps {
  dossier: Dossier;
}

const DOCUMENT_COLUMNS: Column<DocumentDossier>[] = [
  {
    key: 'nom',
    header: 'Nom du fichier',
    render: (row) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-muted" />
        </div>
        <span className="font-medium">{row.nom}</span>
      </div>
    ),
  },
  {
    key: 'type',
    header: 'Type',
  },
  {
    key: 'date',
    header: 'Date',
    render: (row) => (row.date ? formatDate(row.date) : '—'),
  },
  {
    key: 'taille',
    header: 'Taille',
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
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title mb-0">Documents uploadés</h3>
        <button className="flex items-center gap-1.5 text-sm font-medium text-status-blue-text hover:underline">
          <Plus className="w-4 h-4" />
          Ajouter un document
        </button>
      </div>
      <DataTable
        columns={DOCUMENT_COLUMNS}
        data={dossier.documents ?? []}
        emptyMessage="Aucun document uploadé"
      />
    </div>
  );
}
