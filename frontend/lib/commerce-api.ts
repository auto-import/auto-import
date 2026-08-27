import { apiDownload, apiRequest, apiUpload } from "@/lib/api";
import type {
  ApiDossierStatus,
  ApiDossierType,
  ApiVehicleStatus,
  PaginatedData,
} from "@/lib/api-contract";
import type { ApiInvoice, ApiPayment, ApiPaymentPlan } from "@/lib/finance-api";
import type { ApiCustomsFile, ApiShipment } from "@/lib/logistics-api";
import type { ApiDossierDocument } from "@/lib/documents-api";

export interface ApiPartner {
  id: string;
  name: string;
  type: string;
  country?: string | null;
  city?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  specialties: string[];
  notes?: string | null;
  status: string;
  _count?: { suppliedVehicles: number; chinaOffers: number; purchases: number };
}

export interface ApiVehicleSpec {
  engine?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  color?: string | null;
  seats?: number | null;
  doors?: number | null;
  power?: string | null;
  description?: string | null;
}

export interface ApiVehicle {
  id: string;
  vin?: string | null;
  brand: string;
  model: string;
  year?: number | null;
  mileage?: number | null;
  condition?: string | null;
  purchasePrice?: string | number | null;
  sellingPrice?: string | number | null;
  currency?: string | null;
  status: ApiVehicleStatus;
  acquisitionType: string;
  trim?: string | null;
  bodyType?: string | null;
  drivetrain?: string | null;
  displacement?: string | null;
  steeringSide?: string | null;
  interiorColor?: string | null;
  warranty?: string | null;
  equipment?: Record<string, unknown> | null;
  eligibility?: { eligible: boolean; reason: string | null };
  supplierId?: string | null;
  supplier?: ApiPartner | null;
  currentLocationId?: string | null;
  currentLocation?: {
    id: string;
    code: string;
    name?: string | null;
    warehouse?: { id: string; name: string };
  } | null;
  specs?: ApiVehicleSpec | null;
  photos?: Array<{
    id: string;
    sortOrder: number;
    isPrimary: boolean;
    file: {
      id: string;
      mimeType: string;
      originalName: string;
      checksum: string;
    };
  }>;
}

export interface ApiOfferReservation {
  id: string;
  offerId: string;
  clientId: string;
  dossierId?: string | null;
  quantity: number;
  status: string;
  expiresAt?: string | null;
  client?: { id: string; firstName: string; lastName: string };
  dossier?: { id: string; reference: string; status: string } | null;
}

export interface ApiOffer {
  id: string;
  reference: string;
  supplierId: string;
  supplier: ApiPartner;
  brand: string;
  model: string;
  version?: string | null;
  year?: number | null;
  condition: string;
  mileage?: number | null;
  specification: Record<string, unknown>;
  purchasePrice?: string | number | null;
  cifPrice: string | number;
  ddpPrice: string | number;
  currency: string;
  validFrom: string;
  validUntil: string;
  availableQuantity: number;
  reservedQuantity: number;
  remainingQuantity: number;
  estimatedDelayDays?: number | null;
  status: string;
  notes?: string | null;
  reservations?: ApiOfferReservation[];
  photos?: ApiVehicle["photos"];
}

export interface ApiDossierEvidence {
  id: string;
  vehicleId: string;
  checkpoint: "ARRIVAL_AT_PORT" | "CUSTOMS" | "PORT_EXIT" | "LOCAL_TRANSPORT";
  note?: string | null;
  location?: string | null;
  reliedAt?: string | null;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    checksum: string;
  };
}

export interface ApiDossier {
  id: string;
  reference: string;
  type: ApiDossierType;
  status: ApiDossierStatus;
  clientId: string;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    email?: string | null;
  };
  salesUserId: string;
  opsUserId?: string | null;
  openedAt: string;
  closedAt?: string | null;
  vehicles: ApiVehicle[];
  offerReservation?: ApiOfferReservation & { offer: ApiOffer };
  vehicleRequest?: unknown;
  order?: unknown;
  purchases?: unknown[];
  history?: Array<{
    id: string;
    fromStatus?: string | null;
    toStatus: string;
    comment?: string | null;
    createdAt: string;
    user?: { firstName: string; lastName: string };
  }>;
  stats?: {
    totalVehicles: number;
    totalPayments: number;
    totalInvoiceAmount: number;
    isFullyPaid: boolean;
  };
  sections?: {
    finance?: {
      invoices: ApiInvoice[];
      paymentPlan?: ApiPaymentPlan | null;
      payments: ApiPayment[];
    };
    shipping?: ApiShipment | null;
    customs?: ApiCustomsFile[];
    documents?: ApiDossierDocument[];
    proofs?: ApiDossierDocument[];
  };
}

export interface ApiVehicleRequest {
  id: string;
  clientId?: string | null;
  prospectId?: string | null;
  brand?: string | null;
  model?: string | null;
  status: string;
}

function queryString(
  values: Record<string, string | number | boolean | undefined>,
) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(
    ([key, value]) =>
      value !== undefined && value !== "" && params.set(key, String(value)),
  );
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const commerceApi = {
  partners: {
    list: (filters: Record<string, string | number | undefined> = {}) =>
      apiRequest<PaginatedData<ApiPartner>>(`/partners${queryString(filters)}`),
    get: (id: string) => apiRequest<ApiPartner>(`/partners/${id}`),
    create: (data: Record<string, unknown>) =>
      apiRequest<ApiPartner>("/partners", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Record<string, unknown>) =>
      apiRequest<ApiPartner>(`/partners/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    archive: (id: string) =>
      apiRequest<ApiPartner>(`/partners/${id}`, { method: "DELETE" }),
  },
  vehicles: {
    list: (filters: Record<string, string | number | undefined> = {}) =>
      apiRequest<PaginatedData<ApiVehicle>>(`/vehicles${queryString(filters)}`),
    get: (id: string) => apiRequest<ApiVehicle>(`/vehicles/${id}`),
    create: (data: Record<string, unknown>) =>
      apiRequest<ApiVehicle>("/vehicles", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    createWithPhotos: (data: Record<string, unknown>, photos: File[]) => {
      const body = new FormData();
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && value !== null && value !== "")
          body.append(key, String(value));
      }
      photos.forEach((photo) => body.append("photos", photo));
      return apiUpload<ApiVehicle>("/vehicles/with-photos", body);
    },
    replacePhotos: (id: string, photos: File[]) => {
      const body = new FormData();
      photos.forEach((photo) => body.append("photos", photo));
      return apiUpload<ApiVehicle>(`/vehicles/${id}/photos`, body, "PUT");
    },
    photoBlob: (photoId: string) =>
      apiDownload(`/vehicles/photos/${photoId}`).then(({ blob }) => blob),
    eligible: (
      filters: Record<string, string | number | boolean | undefined>,
    ) =>
      apiRequest<PaginatedData<ApiVehicle>>(
        `/vehicles/eligible-for-dossier${queryString(filters)}`,
      ),
    update: (id: string, data: Record<string, unknown>) =>
      apiRequest<ApiVehicle>(`/vehicles/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    archive: (id: string) =>
      apiRequest<ApiVehicle>(`/vehicles/${id}`, { method: "DELETE" }),
    saveSpecs: (id: string, data: ApiVehicleSpec) =>
      apiRequest<ApiVehicleSpec>(`/vehicles/${id}/specs`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    summary: () =>
      apiRequest<Record<string, unknown>>("/vehicles/stock-summary"),
  },
  offers: {
    list: (filters: Record<string, string | number | undefined> = {}) =>
      apiRequest<PaginatedData<ApiOffer>>(`/offers${queryString(filters)}`),
    get: (id: string) => apiRequest<ApiOffer>(`/offers/${id}`),
    createWithPhotos: (data: Record<string, unknown>, photos: File[]) => {
      const body = new FormData();
      for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null || value === "") continue;
        body.append(
          key,
          typeof value === "object" ? JSON.stringify(value) : String(value),
        );
      }
      photos.forEach((photo) => body.append("photos", photo));
      return apiUpload<ApiOffer>("/offers/with-photos", body);
    },
    photoBlob: (photoId: string) =>
      apiDownload(`/offers/photos/${photoId}`).then(({ blob }) => blob),
    replacePhotos: (id: string, photos: File[]) => {
      const body = new FormData();
      photos.forEach((photo) => body.append("photos", photo));
      return apiUpload<ApiOffer>(`/offers/${id}/photos`, body, "PATCH");
    },
    update: (id: string, data: Record<string, unknown>) =>
      apiRequest<ApiOffer>(`/offers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    archive: (id: string) =>
      apiRequest<ApiOffer>(`/offers/${id}`, { method: "DELETE" }),
    reserve: (
      id: string,
      data: { clientId: string; quantity?: number; expiresAt?: string },
    ) =>
      apiRequest<ApiOfferReservation>(`/offers/${id}/reservations`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    release: (id: string, reason?: string) =>
      apiRequest<ApiOfferReservation>(`/offers/reservations/${id}/release`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    materialize: (
      id: string,
      data: {
        vin: string;
        purchasePrice?: number;
        sellingPrice?: number;
        currentLocationId?: string;
      },
    ) =>
      apiRequest(`/offers/reservations/${id}/materialize`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    statistics: () =>
      apiRequest<{
        total: number;
        byStatus: Record<string, number>;
        availableQuantity: number;
        reservedQuantity: number;
      }>("/offers/statistics"),
  },
  dossiers: {
    list: (filters: Record<string, string | number | undefined> = {}) =>
      apiRequest<PaginatedData<ApiDossier>>(`/dossiers${queryString(filters)}`),
    get: (id: string) => apiRequest<ApiDossier>(`/dossiers/${id}`),
    create: (data: Record<string, unknown>) =>
      apiRequest<ApiDossier>("/dossiers", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Record<string, unknown>) =>
      apiRequest<ApiDossier>(`/dossiers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    transition: (id: string, status: string, comment?: string) =>
      apiRequest<ApiDossier>(`/dossiers/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, comment }),
      }),
    allowed: (id: string) =>
      apiRequest<{ allowedTransitions: ApiDossierStatus[] }>(
        `/dossiers/${id}/allowed-transitions`,
      ),
    statistics: () =>
      apiRequest<{
        total: number;
        byStatus: Record<string, number>;
        byType: Record<string, number>;
        completionRate: number;
      }>("/dossiers/statistics"),
    evidence: (id: string) =>
      apiRequest<{
        vehicles: Array<{
          vehicleId: string;
          vehicle: Pick<ApiVehicle, "brand" | "model" | "vin">;
        }>;
        evidence: ApiDossierEvidence[];
      }>(`/documents/dossiers/${id}/evidence`),
    uploadEvidence: (
      id: string,
      data: {
        vehicleId: string;
        checkpoint: ApiDossierEvidence["checkpoint"];
        note?: string;
        location?: string;
      },
      file: File,
    ) => {
      const body = new FormData();
      body.append("file", file);
      body.append("vehicleId", data.vehicleId);
      body.append("checkpoint", data.checkpoint);
      if (data.note) body.append("note", data.note);
      if (data.location) body.append("location", data.location);
      return apiUpload<ApiDossierEvidence>(
        `/documents/dossiers/${id}/evidence`,
        body,
      );
    },
  },
  vehicleRequests: {
    list: (filters: Record<string, string | number | undefined> = {}) =>
      apiRequest<PaginatedData<ApiVehicleRequest>>(
        `/vehicle-requests${queryString(filters)}`,
      ),
  },
};
