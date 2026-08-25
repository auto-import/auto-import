import { apiRequest } from "@/lib/api";
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
  dossierId: string;
  fileId: string;
  kind: 'DOSSIER_DOCUMENT' | 'PROOF' | 'CONTRACT' | 'CUSTOMS_DOCUMENT' | 'PAYMENT_RECEIPT' | 'VEHICLE_PHOTO' | 'BUSINESS_DOCUMENT' | string;
  documentType?: string | null;
  title: string;
  description?: string | null;
  status: 'valid' | 'expired' | 'rejected' | string;
  uploadedBy?: string | null;
  createdAt: string;
  updatedAt?: string;
  file?: ApiFileAsset;
  uploadedByUser?: { id: string; firstName: string; lastName: string } | null;
  dossier?: { id: string; reference: string; status: string } | null;
}

export async function fetchDocuments(params: {
  page?: number;
  limit?: number;
  dossierId?: string;
  kind?: string;
  documentType?: string;
  status?: string;
}): Promise<PaginatedData<ApiDossierDocument>> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.dossierId) query.set('dossierId', params.dossierId);
  if (params.kind && params.kind !== 'tous') query.set('kind', params.kind);
  if (params.documentType) query.set('documentType', params.documentType);
  if (params.status) query.set('status', params.status);

  return apiRequest<PaginatedData<ApiDossierDocument>>(`/documents?${query.toString()}`);
}

export async function uploadDocument(
  file: File,
  data: {
    dossierId: string;
    kind: string;
    documentType?: string;
    title?: string;
    description?: string;
  },
): Promise<ApiDossierDocument> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('dossierId', data.dossierId);
  formData.append('kind', data.kind);
  if (data.documentType) formData.append('documentType', data.documentType);
  if (data.title) formData.append('title', data.title);
  if (data.description) formData.append('description', data.description);

  return apiRequest<ApiDossierDocument>('/documents/upload', {
    method: 'POST',
    body: formData,
  });
}
