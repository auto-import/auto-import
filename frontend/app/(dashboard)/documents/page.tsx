'use client';

import { useState, useEffect, useCallback } from 'react';
import { Topbar, StatusBadge, DataTable } from '@/components';
import {
  fetchDocuments,
  uploadDocument,
  type ApiDossierDocument,
} from '@/lib/documents-api';
import { formatDate } from '@/lib/constants';
import type { Column } from '@/types';
import {
  FileText,
  Upload,
  Download,
  Search,
  Filter,
  CheckCircle,
  FileCheck,
  Image as ImageIcon,
  Shield,
  RefreshCw,
  Plus,
} from 'lucide-react';

export default function DocumentsHubPage() {
  const [documents, setDocuments] = useState<ApiDossierDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('tous');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadDossierId, setUploadDossierId] = useState('');
  const [uploadKind, setUploadKind] = useState('DOSSIER_DOCUMENT');
  const [uploadDocType, setUploadDocType] = useState('id_client');
  const [uploadTitle, setUploadTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchDocuments({
        page,
        limit: 15,
        kind: kindFilter !== 'tous' ? kindFilter : undefined,
      });
      setDocuments(res.items || []);
      setTotal(res.pagination?.totalItems || 0);
    } catch (err) {
      setErrorMsg((err instanceof Error ? err.message : '') || 'Erreur lors du chargement des documents');
    } finally {
      setLoading(false);
    }
  }, [page, kindFilter]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !uploadDossierId.trim()) return;

    setUploading(true);
    setErrorMsg(null);
    try {
      await uploadDocument(selectedFile, {
        dossierId: uploadDossierId.trim(),
        kind: uploadKind,
        documentType: uploadDocType,
        title: uploadTitle || selectedFile.name,
      });
      setShowUploadModal(false);
      setSelectedFile(null);
      setUploadTitle('');
      setUploadDossierId('');
      await loadDocuments();
    } catch (err) {
      setErrorMsg((err instanceof Error ? err.message : '') || 'Erreur lors de l’envoi du document');
    } finally {
      setUploading(false);
    }
  };

  const getKindBadge = (kind: string) => {
    switch (kind) {
      case 'CONTRACT':
        return <StatusBadge variant="blue" label="Contrat" size="sm" />;
      case 'PAYMENT_RECEIPT':
      case 'PROOF':
        return <StatusBadge variant="green" label="Preuve Paiement" size="sm" />;
      case 'CUSTOMS_DOCUMENT':
        return <StatusBadge variant="yellow" label="Douane" size="sm" />;
      case 'VEHICLE_PHOTO':
        return <StatusBadge variant="purple" label="Photo Véhicule" size="sm" />;
      case 'BUSINESS_DOCUMENT':
        return <StatusBadge variant="blue" label="Document Commercial" size="sm" />;
      default:
        return <StatusBadge variant="gray" label="Dossier" size="sm" />;
    }
  };

  const DOCUMENT_COLUMNS: Column<ApiDossierDocument>[] = [
    {
      key: 'title',
      header: 'Titre & Fichier',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-foreground">{row.title}</span>
            <p className="text-xs text-muted truncate max-w-[200px]">{row.file?.originalName || 'Fichier'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Nature / Catégorie',
      render: (row) => getKindBadge(row.kind),
    },
    {
      key: 'documentType',
      header: 'Type de pièce',
      render: (row) => (
        <span className="text-xs font-mono bg-muted/20 px-2 py-1 rounded text-foreground">
          {row.documentType || 'standard'}
        </span>
      ),
    },
    {
      key: 'size',
      header: 'Taille & Format',
      render: (row) => (
        <div className="text-xs text-muted">
          <p>{row.file ? `${(row.file.size / 1024).toFixed(1)} KB` : '—'}</p>
          <p className="text-[10px] uppercase font-mono">{row.file?.mimeType?.split('/')[1] || ''}</p>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date de dépôt',
      render: (row) => (
        <div className="text-xs">
          <p className="text-foreground">{formatDate(row.createdAt)}</p>
          {row.uploadedByUser && (
            <p className="text-muted text-[10px]">
              par {row.uploadedByUser.firstName} {row.uploadedByUser.lastName}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Téléchargement',
      render: (row) => (
        <a
          href={`/api/documents/${row.id}/download`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-button bg-surface border border-border text-foreground hover:bg-muted/10 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Télécharger
        </a>
      ),
    },
  ];

  return (
    <>
      <Topbar
        title="Gestion Documentaire Sécurisée"
        subtitle="Stockage privé, contrats, pièces d'identité, justificatifs de paiement et mainlevées"
      />

      <div className="p-8 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-5 border-l-4 border-l-primary flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted uppercase">Total Pièces Déposées</p>
              <p className="text-2xl font-bold text-foreground mt-1">{total}</p>
              <p className="text-xs text-muted mt-1">Stockage chiffré SHA-256</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Shield className="w-5 h-5" />
            </div>
          </div>

          <div className="card p-5 border-l-4 border-l-status-green-text flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted uppercase">Contrats & Mandats</p>
              <p className="text-2xl font-bold text-status-green-text mt-1">
                {documents.filter((d) => d.kind === 'CONTRACT').length}
              </p>
              <p className="text-xs text-muted mt-1">Actes authentifiés</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-status-green-bg flex items-center justify-center text-status-green-text">
              <FileCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="card p-5 border-l-4 border-l-status-yellow-text flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted uppercase">Justificatifs de Paiement</p>
              <p className="text-2xl font-bold text-status-yellow-text mt-1">
                {documents.filter((d) => d.kind === 'PAYMENT_RECEIPT' || d.kind === 'PROOF').length}
              </p>
              <p className="text-xs text-muted mt-1">Bordereaux de virement</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-status-yellow-bg flex items-center justify-center text-status-yellow-text">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>

          <div className="card p-5 border-l-4 border-l-purple-500 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted uppercase">Dossiers Douane & B/L</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {documents.filter((d) => d.kind === 'CUSTOMS_DOCUMENT').length}
              </p>
              <p className="text-xs text-muted mt-1">Titres de transport & DUM</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600">
              <FileText className="w-5 h-5" />
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-input bg-danger/10 text-danger border border-danger/20 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 flex-1">
            <select
              value={kindFilter}
              onChange={(e) => {
                setKindFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
            >
              <option value="tous">Toutes les catégories</option>
              <option value="CONTRACT">Contrats & Mandats</option>
              <option value="PAYMENT_RECEIPT">Preuves & Reçus de paiement</option>
              <option value="CUSTOMS_DOCUMENT">Documents Douaniers & B/L</option>
              <option value="DOSSIER_DOCUMENT">Pièces Client & Dossier</option>
              <option value="VEHICLE_PHOTO">Photos Véhicule</option>
              <option value="BUSINESS_DOCUMENT">Documents Commerciaux</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-button bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Upload className="w-4 h-4" />
              Déposer un document
            </button>
            <button
              onClick={() => loadDocuments()}
              className="p-2.5 border border-border rounded-button hover:bg-accent text-muted hover:text-foreground"
              title="Actualiser"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          <DataTable columns={DOCUMENT_COLUMNS} data={documents} />
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg text-foreground">Déposer un document privé</h3>
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">ID Dossier lié *</label>
                <input
                  type="text"
                  required
                  value={uploadDossierId}
                  onChange={(e) => setUploadDossierId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background font-mono"
                  placeholder="ID du dossier (ex: UUID)"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">Catégorie</label>
                  <select
                    value={uploadKind}
                    onChange={(e) => setUploadKind(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                  >
                    <option value="CONTRACT">Contrat</option>
                    <option value="PAYMENT_RECEIPT">Preuve Paiement</option>
                    <option value="CUSTOMS_DOCUMENT">Douane & B/L</option>
                    <option value="DOSSIER_DOCUMENT">Pièce Dossier</option>
                    <option value="VEHICLE_PHOTO">Photo Véhicule</option>
                    <option value="BUSINESS_DOCUMENT">Document Commercial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">Type Spécifique</label>
                  <select
                    value={uploadDocType}
                    onChange={(e) => setUploadDocType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                  >
                    <option value="id_client">CNI / Passeport</option>
                    <option value="contrat">Contrat signé</option>
                    <option value="pi_fournisseur">Facture Proforma (PI)</option>
                    <option value="preuve_paiement">Preuve virement</option>
                    <option value="rapport_inspection">Inspection</option>
                    <option value="bl_draft">Draft B/L</option>
                    <option value="bl_final">B/L Définitif</option>
                    <option value="documents_douane">Dédouanement / DUM</option>
                    <option value="document_livraison">Bon de livraison</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">Titre descriptif</label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                  placeholder="Ex: Reçu de virement 30% acompte"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">Fichier (Max 25MB) *</label>
                <input
                  type="file"
                  required
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-xs file:mr-4 file:py-2 file:px-4 file:rounded-button file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-sm font-medium border border-border rounded-button text-muted hover:text-foreground"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={uploading || !selectedFile || !uploadDossierId.trim()}
                  className="px-4 py-2 text-sm font-medium rounded-button bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {uploading ? 'Téléversement...' : 'Déposer le fichier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
