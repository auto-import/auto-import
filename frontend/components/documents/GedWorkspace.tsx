"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, RefreshCw, Shield, Upload } from "lucide-react";
import { DataTable, StatusBadge, Topbar } from "@/components";
import { crmApi, type ApiClient } from "@/lib/crm-api";
import {
  downloadGedDocument,
  fetchGedDocuments,
  fetchGedReferences,
  previewGedDocument,
  uploadGedDocument,
  type ApiGedDocument,
  type ApiGedReference,
} from "@/lib/documents-api";
import { formatDate } from "@/lib/constants";
import type { Column } from "@/types";

const statusLabels: Record<string, string> = {
  TO_VALIDATE: "À valider",
  VALIDATED: "Validé",
  REJECTED: "Rejeté",
  EXPIRED: "Expiré",
};

export function GedWorkspace({ onLegacy }: { onLegacy: () => void }) {
  const [documents, setDocuments] = useState<ApiGedDocument[]>([]);
  const [categories, setCategories] = useState<ApiGedReference[]>([]);
  const [types, setTypes] = useState<ApiGedReference[]>([]);
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploadCategoryId, setUploadCategoryId] = useState("");
  const [documentTypeId, setDocumentTypeId] = useState("");
  const [sensitivity, setSensitivity] = useState("INTERNAL");
  const [clientId, setClientId] = useState("");
  const [dossierId, setDossierId] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGedDocuments({
        limit: 100,
        categoryId: categoryId || undefined,
        validationStatus: status || undefined,
        search: search || undefined,
      });
      setDocuments(result.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, [categoryId, search, status]);

  useEffect(() => {
    void Promise.all([
      fetchGedReferences().then((references) => {
        setCategories(references.categories);
        setTypes(references.types);
      }),
      crmApi.listClients({ limit: 100 }).then((result) => setClients(result.items)),
    ]).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filteredTypes = useMemo(
    () => types.filter((type) => !uploadCategoryId || type.categoryId === uploadCategoryId),
    [types, uploadCategoryId],
  );

  const columns: Column<ApiGedDocument>[] = [
    {
      key: "title",
      header: "Document",
      render: (document) => (
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary" />
          <div>
            <p className="font-semibold">{document.restricted ? "Document restreint" : document.title}</p>
            <p className="text-xs text-muted">{document.restricted ? "Métadonnées protégées" : document.documentType?.labelFr ?? "Type non classé"}</p>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Validation",
      render: (document) => (
        <StatusBadge
          size="sm"
          variant={document.validationStatus === "VALIDATED" ? "green" : ["REJECTED", "EXPIRED"].includes(document.validationStatus) ? "red" : "yellow"}
          label={statusLabels[document.validationStatus] ?? document.validationStatus}
        />
      ),
    },
    { key: "sensitivity", header: "Sensibilité", render: (document) => document.sensitivity },
    { key: "version", header: "Version", render: (document) => document.currentVersion ? `v${document.currentVersion.versionNumber}` : "À réconcilier" },
    { key: "createdAt", header: "Créé le", render: (document) => formatDate(document.createdAt) },
    {
      key: "actions",
      header: "Accès",
      render: (document) => document.restricted ? (
        <Shield className="h-4 w-4 text-muted" aria-label="Accès restreint" />
      ) : (
        <div className="flex gap-2">
          <button type="button" className="btn-secondary p-2" title="Prévisualiser" onClick={() => void previewGedDocument(document.id).catch(reportError)}><Eye className="h-4 w-4" /></button>
          <button type="button" className="btn-secondary p-2" title="Télécharger" onClick={() => void downloadGedDocument(document.id).catch(reportError)}><Download className="h-4 w-4" /></button>
        </div>
      ),
    },
  ];

  function reportError(reason: unknown) {
    setError(reason instanceof Error ? reason.message : "Accès refusé");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || (!clientId && !dossierId)) return;
    setUploading(true);
    try {
      await uploadGedDocument(file, {
        title: title || file.name,
        categoryId: uploadCategoryId || undefined,
        documentTypeId: documentTypeId || undefined,
        sensitivity,
        clientId: dossierId ? undefined : clientId,
        dossierId: dossierId || undefined,
        expiryDate: expiryDate || undefined,
      });
      setShowUpload(false);
      setFile(null);
      await load();
    } catch (reason) {
      reportError(reason);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Topbar title="GED centrale" subtitle="Documents versionnés, liés, validés et protégés pour tout l’ERP" />
      <div className="space-y-6 p-8">
        <div className="flex flex-wrap gap-3">
          <input className="input min-w-64" placeholder="Rechercher titre ou autorité" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select className="input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Toutes les catégories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.labelFr}</option>)}</select>
          <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tous les statuts</option>{Object.entries(statusLabels).filter(([key]) => key !== "EXPIRED").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <button type="button" className="btn-secondary p-2" onClick={() => void load()} title="Actualiser"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          <button type="button" className="btn-secondary" onClick={onLegacy}>Vue historique</button>
          <button type="button" className="btn-primary ml-auto flex items-center gap-2" onClick={() => setShowUpload(true)}><Upload className="h-4 w-4" />Nouveau document</button>
        </div>
        {error && <div className="rounded-input border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div>}
        <div className="card overflow-hidden p-0"><DataTable columns={columns} data={documents} /></div>
      </div>

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form className="card w-full max-w-xl space-y-4 p-6" onSubmit={submit}>
            <h2 className="text-lg font-bold">Déposer dans la GED</h2>
            <input className="input w-full" placeholder="Titre" value={title} onChange={(event) => setTitle(event.target.value)} />
            <div className="grid gap-3 md:grid-cols-2">
              <select className="input" value={uploadCategoryId} onChange={(event) => { setUploadCategoryId(event.target.value); setDocumentTypeId(""); }}><option value="">Catégorie non classée</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.labelFr}</option>)}</select>
              <select className="input" value={documentTypeId} onChange={(event) => setDocumentTypeId(event.target.value)}><option value="">Type non classé</option>{filteredTypes.map((type) => <option key={type.id} value={type.id}>{type.labelFr}</option>)}</select>
              <select className="input" value={sensitivity} onChange={(event) => setSensitivity(event.target.value)}><option value="INTERNAL">Interne</option><option value="CONFIDENTIAL">Confidentiel</option><option value="RESTRICTED_IDENTITY">Identité restreinte</option><option value="RESTRICTED_BANK">Bancaire restreint</option><option value="RESTRICTED_PAYMENT">Paiement restreint</option><option value="RESTRICTED_CONTRACT">Contrat restreint</option><option value="RESTRICTED_CUSTOMS">Douane restreinte</option></select>
              <input className="input" type="date" aria-label="Date d’expiration" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
              <select className="input" value={clientId} disabled={Boolean(dossierId)} onChange={(event) => setClientId(event.target.value)}><option value="">Client autonome</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.firstName} {client.lastName}</option>)}</select>
              <input className="input" placeholder="ID dossier (prioritaire)" value={dossierId} onChange={(event) => setDossierId(event.target.value)} />
            </div>
            <input required type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted">Une nouvelle version conserve toujours l’historique précédent.</p>
            <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setShowUpload(false)}>Annuler</button><button className="btn-primary" disabled={uploading || !file || (!clientId && !dossierId)}>{uploading ? "Dépôt…" : "Déposer"}</button></div>
          </form>
        </div>
      )}
    </>
  );
}
