'use client';

import { useRef, useState } from 'react';
import { DataTable, StatusBadge } from '@/components';
import {
  DOCUMENT_STATUT_LABELS,
  DOCUMENT_STATUT_VARIANTS,
  DOCUMENT_TYPE_LABELS,
  formatDate,
} from '@/lib/constants';
import { uploadDocumentDossier } from '@/lib/mockData';
import type { Column, Dossier, DossierDocument, TypeDocumentDossier } from '@/types';
import { FileText, Download, Plus, Upload, FileWarning } from 'lucide-react';

interface TabDocumentsProps {
  dossier: Dossier;
  onChange?: () => void;
}

function formatTaille(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(size / 1024))} Ko`;
}

export default function DossierTabDocuments({ dossier, onChange }: TabDocumentsProps) {
  const [, setRefresh] = useState(0);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [newType, setNewType] = useState<TypeDocumentDossier>('contrat');
  const [showAdd, setShowAdd] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const documents = dossier.documents;
  const manquants = documents.filter((d) => d.statut === 'manquant').length;
  const recus = documents.filter((d) => d.statut !== 'manquant').length;

  const contrat = documents.find((d) => d.type === 'contrat');
  const contratManquant =
    contrat && (contrat.statut === 'manquant' || contrat.statut === 'en_attente');

  const triggerUpload = (targetId: string | 'new') => {
    setUploadTarget(targetId);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChosen = (file: File) => {
    const target = uploadTarget;
    if (!target || !file) return;
    if (target === 'new') {
      setPendingFile(file);
      return;
    }
    const doc = documents.find((d) => d.id === target);
    if (!doc) return;
    uploadDocumentDossier(
      dossier.id,
      { type: doc.type, nom: file.name, taille: formatTaille(file.size) },
      doc.id,
    );
    setUploadTarget(null);
    setRefresh((v) => v + 1);
    onChange?.();
  };

  const handleAddDocument = () => {
    if (!pendingFile) return;
    uploadDocumentDossier(dossier.id, {
      type: newType,
      nom: pendingFile.name,
      taille: formatTaille(pendingFile.size),
    });
    setPendingFile(null);
    setShowAdd(false);
    setUploadTarget(null);
    setRefresh((v) => v + 1);
    onChange?.();
  };

  const columns: Column<DossierDocument>[] = [
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
      render: (row) =>
        row.statut === 'manquant' || row.statut === 'en_attente' ? (
          <button
            onClick={() => triggerUpload(row.id)}
            className="flex items-center gap-1.5 text-sm font-medium text-status-blue-text hover:underline"
          >
            <Upload className="w-3.5 h-3.5" />
            Uploadez
          </button>
        ) : (
          <button className="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground hover:underline">
            <Download className="w-3.5 h-3.5" />
            Télécharger
          </button>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Contrat requis */}
      {contratManquant && (
        <div className="px-4 py-3 rounded-card bg-status-amber-bg border border-status-amber-text/30 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <FileWarning className="w-5 h-5 text-status-amber-text shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Contrat signé requis</p>
              <p className="text-sm text-muted">
                Le dossier est au statut « Contrat signé » : uploadez le PDF signé et scanné par le
                client pour débloquer l&apos;étape suivante.
              </p>
            </div>
          </div>
          <button
            onClick={() => contrat && triggerUpload(contrat.id)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity shrink-0"
          >
            <Upload className="w-4 h-4" />
            Choisir le PDF du contrat
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          {recus} document(s) reçu(s) ·{' '}
          {manquants > 0 ? (
            <span className="font-semibold text-status-red-text">{manquants} manquant(s)</span>
          ) : (
            'aucun document manquant'
          )}
        </p>
        <button
          onClick={() => setShowAdd((s) => !s)}
          className="flex items-center gap-1.5 text-sm font-medium text-status-blue-text hover:underline shrink-0"
        >
          <Plus className="w-4 h-4" />
          Ajouter un document
        </button>
      </div>

      {/* Add document form */}
      {showAdd && (
        <div className="p-5 rounded-card border border-border bg-surface space-y-4">
          <h3 className="section-title">Ajouter un document</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <p className="field-label mb-1">Type de document</p>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as TypeDocumentDossier)}
                className="w-full px-3 py-2 text-sm border border-border rounded-card bg-white focus:outline-none focus:ring-1 focus:ring-status-blue-text"
              >
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="field-label mb-1">Fichier (PDF)</p>
              {pendingFile ? (
                <div className="flex items-center justify-between px-3 py-2 text-sm border border-border rounded-card bg-white">
                  <span className="truncate">{pendingFile.name}</span>
                  <span className="text-muted text-xs ms-2 shrink-0">
                    {formatTaille(pendingFile.size)}
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => triggerUpload('new')}
                  className="w-full px-3 py-2 text-sm border border-dashed border-border rounded-card text-muted hover:bg-background transition-colors"
                >
                  Choisir un fichier…
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddDocument}
              disabled={!pendingFile}
              className="px-5 py-2 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Ajouter
            </button>
            <button
              onClick={() => {
                setShowAdd(false);
                setPendingFile(null);
              }}
              className="px-5 py-2 text-sm font-medium border border-border rounded-button hover:bg-background transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <h3 className="section-title mb-0">Documents du dossier ({documents.length})</h3>
        </div>
        <DataTable
          columns={columns}
          data={documents}
          emptyMessage="Aucun document uploadé"
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileChosen(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
