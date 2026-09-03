import {
  ALL_PERMISSIONS,
  CustomsStatus,
  DOSSIER_WORKFLOWS,
  DossierStatus,
  DossierType,
  OfferStatus,
  OrderStatus,
  PaymentStatus,
  Permission,
  ProspectStatus,
  RecordStatus,
  ShipmentStatus,
  VehicleStatus,
  AgentPresenceStatus,
  CallState,
  LeadQualification,
  VehicleSource,
  PartnerType,
  CommerceRecordStatus,
  OfferReservationStatus,
  VehicleRequestStatus,
  CandidateStatus,
  ReservationStatus,
  PurchaseStatus,
  Currency,
  InvoiceStatus,
  PaymentPlanStrategy,
  InstallmentStatus,
  DueTrigger,
  CostType,
  DocumentKind,
  CrmLeadStatus,
  CrmLeadOutcome,
  CrmReferenceKind,
} from "@auto-import/contracts";
import type {
  CustomsStatus as CustomsStatusValue,
  DossierStatus as DossierStatusValue,
  DossierType as DossierTypeValue,
  OfferStatus as OfferStatusValue,
  OrderStatus as OrderStatusValue,
  PaymentStatus as PaymentStatusValue,
  Permission as PermissionValue,
  ProspectStatus as ProspectStatusValue,
  RecordStatus as RecordStatusValue,
  ShipmentStatus as ShipmentStatusValue,
  VehicleStatus as VehicleStatusValue,
  AgentPresenceStatus as AgentPresenceStatusValue,
  CallState as CallStateValue,
  LeadQualification as LeadQualificationValue,
  VehicleSource as VehicleSourceValue,
  InvoiceStatus as InvoiceStatusValue,
  PaymentPlanStrategy as PaymentPlanStrategyValue,
  InstallmentStatus as InstallmentStatusValue,
  DueTrigger as DueTriggerValue,
  CostType as CostTypeValue,
  DocumentKind as DocumentKindValue,
  CrmLeadStatus as CrmLeadStatusValue,
} from "@auto-import/contracts";

export {
  ALL_PERMISSIONS,
  CustomsStatus,
  DOSSIER_WORKFLOWS,
  DossierStatus,
  DossierType,
  OfferStatus,
  OrderStatus,
  PaymentStatus,
  Permission,
  ProspectStatus,
  RecordStatus,
  ShipmentStatus,
  VehicleStatus,
  AgentPresenceStatus,
  CallState,
  LeadQualification,
  VehicleSource,
  PartnerType,
  CommerceRecordStatus,
  OfferReservationStatus,
  VehicleRequestStatus,
  CandidateStatus,
  ReservationStatus,
  PurchaseStatus,
  Currency,
  InvoiceStatus,
  PaymentPlanStrategy,
  InstallmentStatus,
  DueTrigger,
  CostType,
  DocumentKind,
  CrmLeadStatus,
  CrmLeadOutcome,
  CrmReferenceKind,
};

export type ApiDossierType = DossierTypeValue;
export type ApiDossierStatus = DossierStatusValue;
export type ApiVehicleStatus = VehicleStatusValue;
export type ApiOrderStatus = OrderStatusValue;
export type ApiProspectStatus = ProspectStatusValue;
export type ApiRecordStatus = RecordStatusValue;
export type ApiOfferStatus = OfferStatusValue;
export type ApiPaymentStatus = PaymentStatusValue;
export type ApiShipmentStatus = ShipmentStatusValue;
export type ApiCustomsStatus = CustomsStatusValue;
export type ApiPermission = PermissionValue;
export type ApiAgentPresenceStatus = AgentPresenceStatusValue;
export type ApiCallState = CallStateValue;
export type ApiLeadQualification = LeadQualificationValue;
export type ApiVehicleSource = VehicleSourceValue;
export type ApiInvoiceStatus = InvoiceStatusValue;
export type ApiPaymentPlanStrategy = PaymentPlanStrategyValue;
export type ApiInstallmentStatus = InstallmentStatusValue;
export type ApiDueTrigger = DueTriggerValue;
export type ApiCostType = CostTypeValue;
export type ApiDocumentKind = DocumentKindValue;
export type ApiCrmLeadStatus = CrmLeadStatusValue;

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
  path: string;
  statusCode: number;
}

export interface ApiErrorResponse {
  success: false;
  error: { code: string; message: string; details?: string[] };
  timestamp: string;
  path: string;
  statusCode: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedData<T> {
  items: T[];
  pagination: PaginationMeta;
}

export const DOSSIER_TYPE_LABELS_API: Record<ApiDossierType, string> = {
  [DossierType.VEHICLE_SALE_CIF]: "Vente véhicule — CIF",
  [DossierType.VEHICLE_SALE_DDP]: "Vente véhicule — DDP",
  [DossierType.SHIPPING_ONLY]: "Shipping uniquement",
};

export const DOSSIER_STATUS_LABELS_API: Record<ApiDossierStatus, string> = {
  [DossierStatus.OFFER_SELECTED]: "Offre sélectionnée",
  [DossierStatus.CLIENT_CONFIRMED]: "Client confirmé",
  [DossierStatus.CONTRACT_SIGNED]: "Contrat signé",
  [DossierStatus.DEPOSIT_RECEIVED]: "Acompte reçu",
  [DossierStatus.VEHICLE_BOOKING]: "Vehicle Booking",
  [DossierStatus.PURCHASE_CONFIRMED]: "Achat confirmé",
  [DossierStatus.SUPPLIER_PAID]: "Fournisseur payé",
  [DossierStatus.INSPECTION]: "Inspection",
  [DossierStatus.SHIPMENT_BOOKING]: "Shipment Booking",
  [DossierStatus.BOOKING]: "Booking",
  [DossierStatus.LOADING]: "Chargement",
  [DossierStatus.BILL_OF_LADING_ISSUED]: "BL émis",
  [DossierStatus.IN_TRANSIT]: "En transit",
  [DossierStatus.ARRIVED_AT_PORT]: "Arrivée au port",
  [DossierStatus.DOCUMENTS_DELIVERED]: "Documents remis",
  [DossierStatus.CUSTOMS_CLEARANCE]: "Dédouanement",
  [DossierStatus.CUSTOMS_RELEASED]: "Mainlevée",
  [DossierStatus.PORT_EXIT]: "Sortie du port",
  [DossierStatus.LOCAL_TRANSPORT]: "Transport local",
  [DossierStatus.DELIVERED_TO_CLIENT]: "Livré au client",
  [DossierStatus.CLIENT_REGISTERED]: "Client renseigné",
  [DossierStatus.EXTERNAL_VEHICLE_RECORDED]: "Véhicule externe renseigné",
  [DossierStatus.EXTERNAL_SUPPLIER_RECORDED]: "Fournisseur externe renseigné",
  [DossierStatus.PICKUP_RECEIVED]: "Réception / pickup",
  [DossierStatus.SHIPPING_QUOTED]: "Devis shipping",
  [DossierStatus.PAYMENT_RECEIVED]: "Paiement reçu",
  [DossierStatus.CONTAINER_BILL_OF_LADING]: "BL / conteneur",
  [DossierStatus.ARRIVED]: "Arrivé",
  [DossierStatus.CLOSED]: "Clôturé",
  [DossierStatus.SERVICE_COMPLETED]: "Service terminé",
  [DossierStatus.CANCELLED]: "Annulé",
};

export const VEHICLE_STATUS_LABELS_API: Record<ApiVehicleStatus, string> = {
  [VehicleStatus.PRE_PURCHASE]: "Pré-achat",
  [VehicleStatus.REJECTED]: "Rejeté",
  [VehicleStatus.AVAILABLE]: "Disponible",
  [VehicleStatus.RESERVED]: "Réservé",
  [VehicleStatus.IN_TRANSIT]: "En transit",
  [VehicleStatus.IN_CUSTOMS]: "En douane",
  [VehicleStatus.DELIVERED]: "Livré",
  [VehicleStatus.SOLD]: "Vendu",
};

export const ORDER_STATUS_LABELS_API: Record<ApiOrderStatus, string> = {
  [OrderStatus.DRAFT]: "Brouillon",
  [OrderStatus.CONFIRMED]: "Confirmée",
  [OrderStatus.PROCESSING]: "En traitement",
  [OrderStatus.COMPLETED]: "Terminée",
  [OrderStatus.CANCELLED]: "Annulée",
};

export const PROSPECT_STATUS_LABELS_API: Record<ApiProspectStatus, string> = {
  [ProspectStatus.NEW]: "Nouveau",
  [ProspectStatus.CONTACTED]: "Contacté",
  [ProspectStatus.INTERESTED]: "Intéressé",
  [ProspectStatus.QUALIFIED]: "Qualifié",
  [ProspectStatus.OFFER_SENT]: "Offre envoyée",
  [ProspectStatus.NEGOTIATING]: "Négociation",
  [ProspectStatus.WON]: "Gagné",
  [ProspectStatus.LOST]: "Perdu",
  [ProspectStatus.CONVERTED]: "Converti",
};

export const CRM_LEAD_STATUS_LABELS: Record<ApiCrmLeadStatus, string> = {
  [CrmLeadStatus.NEW]: "Nouveau",
  [CrmLeadStatus.CONTACTED]: "Contacté",
  [CrmLeadStatus.QUALIFIED]: "Qualifié",
  [CrmLeadStatus.APPOINTMENT]: "Rendez-vous",
  [CrmLeadStatus.CONVERTED]: "Converti",
};

export const OFFER_STATUS_LABELS_API: Record<ApiOfferStatus, string> = {
  [OfferStatus.RECEIVED]: "Reçue",
  [OfferStatus.UNDER_VERIFICATION]: "En vérification",
  [OfferStatus.VALIDATED]: "Validée",
  [OfferStatus.RESERVED]: "Réservée",
  [OfferStatus.PURCHASED]: "Achetée",
  [OfferStatus.EXPIRED]: "Expirée",
  [OfferStatus.LOST_DEAL]: "Deal perdu",
};

export const PAYMENT_STATUS_LABELS_API: Record<ApiPaymentStatus, string> = {
  [PaymentStatus.PENDING]: "En attente",
  [PaymentStatus.PARTIAL]: "Partiel",
  [PaymentStatus.PAID]: "Payé",
  [PaymentStatus.FAILED]: "Échoué",
  [PaymentStatus.REFUNDED]: "Remboursé",
  [PaymentStatus.CANCELLED]: "Annulé",
};

export const SHIPMENT_STATUS_LABELS_API: Record<ApiShipmentStatus, string> = {
  [ShipmentStatus.PENDING]: "En attente",
  [ShipmentStatus.BOOKED]: "Réservée",
  [ShipmentStatus.LOADING]: "Chargement",
  [ShipmentStatus.IN_TRANSIT]: "En transit",
  [ShipmentStatus.ARRIVED]: "Arrivée",
  [ShipmentStatus.DELIVERED]: "Livrée",
  [ShipmentStatus.CANCELLED]: "Annulée",
};

export const CUSTOMS_STATUS_LABELS_API: Record<ApiCustomsStatus, string> = {
  [CustomsStatus.OPEN]: "Ouvert",
  [CustomsStatus.DOCUMENTS_PENDING]: "Documents en attente",
  [CustomsStatus.SUBMITTED]: "Soumis",
  [CustomsStatus.UNDER_REVIEW]: "En cours de traitement",
  [CustomsStatus.CLEARED]: "Dédouané",
  [CustomsStatus.RELEASED]: "Mainlevée obtenue",
  [CustomsStatus.REJECTED]: "Rejeté",
};
