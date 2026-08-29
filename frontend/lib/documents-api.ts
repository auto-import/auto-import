import { apiDownload, apiRequest } from "@/lib/api";
import type { PaginatedData } from "@/lib/api-contract";

export interface ApiFileAsset {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  checksum: string;
  category: string;
  status: string;
  createdAt: string;
}

export interface ApiDossierDocument {
  id: string;
  dossierId?: string | null;
  clientId?: string | null;
  fileId: string;
  kind:
    | "DOSSIER_DOCUMENT"
    | "PROOF"
    | "CONTRACT"
    | "CUSTOMS_DOCUMENT"
    | "PAYMENT_RECEIPT"
    | "VEHICLE_PHOTO"
    | "BUSINESS_DOCUMENT"
    | string;
  documentType?: string | null;
  title: string;
  description?: string | null;
  status: "valid" | "expired" | "rejected" | string;
  uploadedBy?: string | null;
  createdAt: string;
  updatedAt?: string;
  file?: ApiFileAsset;
  uploadedByUser?: { id: string; firstName: string; lastName: string } | null;
  dossier?: { id: string; reference: string; status: string } | null;
  client?: { id: string; firstName: string; lastName: string } | null;
}

export async function fetchDocuments(params: {
  page?: number;
  limit?: number;
  dossierId?: string;
  clientId?: string;
  kind?: string;
  documentType?: string;
  status?: string;
}): Promise<PaginatedData<ApiDossierDocument>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.dossierId) query.set("dossierId", params.dossierId);
  if (params.clientId) query.set("clientId", params.clientId);
  if (params.kind && params.kind !== "tous") query.set("kind", params.kind);
  if (params.documentType) query.set("documentType", params.documentType);
  if (params.status) query.set("status", params.status);

  return apiRequest<PaginatedData<ApiDossierDocument>>(
    `/documents?${query.toString()}`,
  );
}

export async function uploadDocument(
  file: File,
  data: {
    dossierId?: string;
    clientId?: string;
    kind: string;
    documentType?: string;
    title?: string;
    description?: string;
  },
): Promise<ApiDossierDocument> {
  const formData = new FormData();
  formData.append("file", file);
  if (data.dossierId) formData.append("dossierId", data.dossierId);
  if (data.clientId) formData.append("clientId", data.clientId);
  formData.append("kind", data.kind);
  if (data.documentType) formData.append("documentType", data.documentType);
  if (data.title) formData.append("title", data.title);
  if (data.description) formData.append("description", data.description);

  return apiRequest<ApiDossierDocument>("/documents/upload", {
    method: "POST",
    body: formData,
  });
}

export async function downloadDocument(documentId: string) {
  const { blob, filename } = await apiDownload(
    `/documents/${documentId}/download`,
  );
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename.replace(/[\\/:*?"<>|]/g, "_");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

export interface ApiGedReference {
  id: string;
  code: string;
  labelFr: string;
  categoryId?: string;
  defaultSensitivity?: string;
}

export interface ApiGedDocument {
  id: string;
  title?: string;
  description?: string | null;
  validationStatus: "TO_VALIDATE" | "VALIDATED" | "REJECTED" | "EXPIRED";
  sensitivity: string;
  restricted: boolean;
  expiryDate?: string | null;
  createdAt: string;
  category?: ApiGedReference | null;
  documentType?: ApiGedReference | null;
  currentVersion?: {
    id: string;
    versionNumber: number;
    createdAt: string;
    file?: { mimeType: string; size: number; integrityStatus: string };
  } | null;
  versions?: Array<{ id: string; versionNumber: number; createdAt: string }>;
  links?: Array<Record<string, string | null>>;
}

export async function fetchGedReferences(): Promise<{
  categories: ApiGedReference[];
  types: ApiGedReference[];
}> {
  return apiRequest("/ged/references");
}

export async function fetchGedDocuments(params: {
  page?: number;
  limit?: number;
  categoryId?: string;
  documentTypeId?: string;
  validationStatus?: string;
  sensitivity?: string;
  search?: string;
  clientId?: string;
  dossierId?: string;
}): Promise<PaginatedData<ApiGedDocument>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  return apiRequest(`/ged/documents?${query.toString()}`);
}

export async function uploadGedDocument(
  file: File,
  data: {
    title: string;
    categoryId?: string;
    documentTypeId?: string;
    sensitivity?: string;
    clientId?: string;
    dossierId?: string;
    expiryDate?: string;
  },
): Promise<ApiGedDocument> {
  const body = new FormData();
  body.append("file", file);
  Object.entries(data).forEach(([key, value]) => {
    if (value) body.append(key, value);
  });
  return apiRequest("/ged/documents", { method: "POST", body });
}

export async function downloadGedDocument(documentId: string) {
  const { blob, filename } = await apiDownload(
    `/ged/documents/${documentId}/download`,
  );
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename.replace(/[\\/:*?"<>|]/g, "_");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

export async function previewGedDocument(documentId: string) {
  const { blob } = await apiDownload(`/ged/documents/${documentId}/preview`);
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
