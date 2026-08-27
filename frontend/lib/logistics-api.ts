import { apiRequest } from "@/lib/api";
import type { PaginatedData } from "@/lib/api-contract";

export interface ApiLogisticsCost {
  id: string;
  type: string;
  amount: string | number;
  currency: string;
  status: string;
}

export interface ApiCustomsDocument {
  id: string;
  documentType?: string | null;
  status: string;
  uploadedAt?: string;
}

export interface ApiLogisticsStatusHistory {
  id: string;
  fromStatus?: string | null;
  toStatus: string;
  comment?: string | null;
  createdAt: string;
  user?: { id: string; firstName: string; lastName: string };
}

export interface ApiShipment {
  id: string;
  organizationId: string;
  shipmentNumber: string;
  carrierPartnerId?: string | null;
  blNumber?: string | null;
  vesselName?: string | null;
  containerNumber?: string | null;
  departurePort?: string | null;
  arrivalPort?: string | null;
  etd?: string | null;
  eta?: string | null;
  actualDepartureDate?: string | null;
  actualArrivalDate?: string | null;
  status: 'pending' | 'booked' | 'loading' | 'inTransit' | 'arrived' | 'delivered' | 'cancelled';
  notes?: string | null;
  createdAt: string;
  updatedAt?: string;
  carrierPartner?: { id: string; name: string } | null;
  vehicles?: Array<{
    id: string;
    vehicleId: string;
    vehicle?: { id: string; brand: string; model: string; vin?: string | null };
  }>;
  customsFiles?: ApiCustomsFile[];
  costs?: ApiLogisticsCost[];
  statusHistory?: Array<{
    id: string;
    fromStatus?: string | null;
    toStatus: string;
    comment?: string | null;
    createdAt: string;
    user?: { id: string; firstName: string; lastName: string };
  }>;
}

export interface ApiCustomsFile {
  id: string;
  organizationId: string;
  reference: string;
  shipmentId?: string | null;
  vehicleId?: string | null;
  dossierId?: string | null;
  brokerPartnerId?: string | null;
  declarationNumber?: string | null;
  customsValue?: string | number | null;
  customsAmount?: string | number | null;
  dutyAmount?: string | number | null;
  taxAmount?: string | number | null;
  feesAmount?: string | number | null;
  currency?: string | null;
  status: 'open' | 'inInspection' | 'documentsRequired' | 'cleared' | 'released' | 'rejected' | 'closed';
  openedAt: string;
  clearedAt?: string | null;
  releasedAt?: string | null;
  notes?: string | null;
  brokerPartner?: { id: string; name: string } | null;
  dossier?: { id: string; reference: string; status: string } | null;
  vehicle?: { id: string; brand: string; model: string; vin?: string | null } | null;
  shipment?: { id: string; shipmentNumber: string; status: string } | null;
  documents?: ApiCustomsDocument[];
  statusHistory?: ApiLogisticsStatusHistory[];
}

export async function fetchShipments(params: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}): Promise<PaginatedData<ApiShipment>> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.status && params.status !== 'tous') query.set('status', params.status);
  if (params.search) query.set('search', params.search);

  return apiRequest<PaginatedData<ApiShipment>>(`/shipments?${query.toString()}`);
}

export async function fetchShipment(id: string): Promise<ApiShipment> {
  return apiRequest<ApiShipment>(`/shipments/${id}`);
}

export async function createShipment(data: {
  carrierPartnerId?: string;
  blNumber?: string;
  vesselName?: string;
  containerNumber?: string;
  departurePort?: string;
  arrivalPort?: string;
  etd?: string;
  eta?: string;
  notes?: string;
  vehicleIds?: string[];
}): Promise<ApiShipment> {
  return apiRequest<ApiShipment>('/shipments', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function transitionShipment(id: string, status: string, comment?: string): Promise<ApiShipment> {
  return apiRequest<ApiShipment>(`/shipments/${id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ status, comment }),
  });
}

export async function fetchCustomsFiles(params: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  dossierId?: string;
}): Promise<PaginatedData<ApiCustomsFile>> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.status && params.status !== 'tous') query.set('status', params.status);
  if (params.search) query.set('search', params.search);
  if (params.dossierId) query.set('dossierId', params.dossierId);

  return apiRequest<PaginatedData<ApiCustomsFile>>(`/customs?${query.toString()}`);
}

export async function createCustomsFile(data: {
  shipmentId?: string;
  vehicleId?: string;
  dossierId?: string;
  brokerPartnerId?: string;
  declarationNumber?: string;
  customsValue?: number;
  dutyAmount?: number;
  taxAmount?: number;
  feesAmount?: number;
  currency?: string;
  notes?: string;
}): Promise<ApiCustomsFile> {
  return apiRequest<ApiCustomsFile>('/customs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function transitionCustomsFile(id: string, status: string, comment?: string): Promise<ApiCustomsFile> {
  return apiRequest<ApiCustomsFile>(`/customs/${id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ status, comment }),
  });
}
