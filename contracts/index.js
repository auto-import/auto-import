"use strict";

const DossierType = Object.freeze({
  VEHICLE_SALE_CIF: "VEHICLE_SALE_CIF",
  VEHICLE_SALE_DDP: "VEHICLE_SALE_DDP",
  SHIPPING_ONLY: "SHIPPING_ONLY",
});

const DossierStatus = Object.freeze({
  OFFER_SELECTED: "offerSelected",
  CLIENT_CONFIRMED: "clientConfirmed",
  CONTRACT_SIGNED: "contractSigned",
  DEPOSIT_RECEIVED: "depositReceived",
  VEHICLE_BOOKING: "vehicleBooking",
  PURCHASE_CONFIRMED: "purchaseConfirmed",
  SUPPLIER_PAID: "supplierPaid",
  INSPECTION: "inspection",
  SHIPMENT_BOOKING: "shipmentBooking",
  BOOKING: "booking",
  LOADING: "loading",
  BILL_OF_LADING_ISSUED: "billOfLadingIssued",
  IN_TRANSIT: "inTransit",
  ARRIVED_AT_PORT: "arrivedAtPort",
  DOCUMENTS_DELIVERED: "documentsDelivered",
  CUSTOMS_CLEARANCE: "customsClearance",
  CUSTOMS_RELEASED: "customsReleased",
  PORT_EXIT: "portExit",
  LOCAL_TRANSPORT: "localTransport",
  DELIVERED_TO_CLIENT: "deliveredToClient",
  CLIENT_REGISTERED: "clientRegistered",
  EXTERNAL_VEHICLE_RECORDED: "externalVehicleRecorded",
  EXTERNAL_SUPPLIER_RECORDED: "externalSupplierRecorded",
  PICKUP_RECEIVED: "pickupReceived",
  SHIPPING_QUOTED: "shippingQuoted",
  PAYMENT_RECEIVED: "paymentReceived",
  CONTAINER_BILL_OF_LADING: "containerBillOfLading",
  ARRIVED: "arrived",
  CLOSED: "closed",
  SERVICE_COMPLETED: "serviceCompleted",
  CANCELLED: "cancelled",
});

const VehicleStatus = Object.freeze({
  PRE_PURCHASE: "prePurchase",
  REJECTED: "rejected",
  AVAILABLE: "available",
  RESERVED: "reserved",
  IN_TRANSIT: "inTransit",
  IN_CUSTOMS: "inCustoms",
  DELIVERED: "delivered",
  SOLD: "sold",
});

const VehicleSource = Object.freeze({
  STOCK: "stock",
  CLIENT_REQUEST: "clientRequest",
  CHINA_OFFER: "chinaOffer",
  EXTERNAL: "external",
});

const PartnerType = Object.freeze({
  SUPPLIER: "supplier",
  CARRIER: "carrier",
  CUSTOMS_BROKER: "customsBroker",
  LOGISTICS: "logistics",
  OTHER: "other",
});

const CommerceRecordStatus = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
  ARCHIVED: "archived",
});

const OfferReservationStatus = Object.freeze({
  ACTIVE: "active",
  CONSUMED: "consumed",
  RELEASED: "released",
  EXPIRED: "expired",
});

const VehicleRequestStatus = Object.freeze({
  OPEN: "open",
  SOURCING: "sourcing",
  CANDIDATE_SELECTED: "candidateSelected",
  PURCHASED: "purchased",
  CANCELLED: "cancelled",
});

const CandidateStatus = Object.freeze({
  PROPOSED: "proposed",
  VALIDATED: "validated",
  REJECTED: "rejected",
});

const ReservationStatus = Object.freeze({
  ACTIVE: "active",
  RELEASED: "released",
  EXPIRED: "expired",
  CONSUMED: "consumed",
});

const PurchaseStatus = Object.freeze({
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
});

const Currency = Object.freeze({
  DZD: "DZD",
  USD: "USD",
  CNY: "CNY",
  EUR: "EUR",
});

const OrderStatus = Object.freeze({
  DRAFT: "draft",
  CONFIRMED: "confirmed",
  PROCESSING: "processing",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

const ProspectStatus = Object.freeze({
  NEW: "new",
  CONTACTED: "contacted",
  INTERESTED: "interested",
  QUALIFIED: "qualified",
  OFFER_SENT: "offerSent",
  NEGOTIATING: "negotiating",
  WON: "won",
  LOST: "lost",
  CONVERTED: "converted",
});

const CrmLeadStatus = Object.freeze({
  NEW: "NEW",
  CONTACTED: "CONTACTED",
  QUALIFIED: "QUALIFIED",
  APPOINTMENT: "APPOINTMENT",
  CONVERTED: "CONVERTED",
});

const CrmLeadOutcome = Object.freeze({ LOST: "LOST" });

const CrmReferenceKind = Object.freeze({
  ENTRY_CHANNEL: "ENTRY_CHANNEL",
  MARKETING_SOURCE: "MARKETING_SOURCE",
  COUNTRY: "COUNTRY",
});

const LeadQualification = Object.freeze({
  HOT: "HOT",
  WARM: "WARM",
  COLD: "COLD",
  UNCLASSIFIED: "UNCLASSIFIED",
});

const CallState = Object.freeze({
  RINGING: "RINGING",
  QUEUED: "QUEUED",
  ASSIGNED: "ASSIGNED",
  FORWARDED: "FORWARDED",
  ANSWERED: "ANSWERED",
  COMPLETED: "COMPLETED",
  MISSED: "MISSED",
  FAILED: "FAILED",
});

const AgentPresenceStatus = Object.freeze({
  AVAILABLE: "AVAILABLE",
  BUSY: "BUSY",
  AWAY: "AWAY",
  OFFLINE: "OFFLINE",
});

const OfferStatus = Object.freeze({
  RECEIVED: "RECEIVED",
  UNDER_VERIFICATION: "UNDER_VERIFICATION",
  VALIDATED: "VALIDATED",
  RESERVED: "RESERVED",
  PURCHASED: "PURCHASED",
  EXPIRED: "EXPIRED",
  LOST_DEAL: "LOST_DEAL",
});

const PaymentStatus = Object.freeze({
  PENDING: "pending",
  PARTIAL: "partial",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
  CANCELLED: "cancelled",
});

const ShipmentStatus = Object.freeze({
  PENDING: "pending",
  BOOKED: "booked",
  LOADING: "loading",
  IN_TRANSIT: "inTransit",
  ARRIVED: "arrived",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
});

const CustomsStatus = Object.freeze({
  OPEN: "open",
  DOCUMENTS_PENDING: "documentsPending",
  SUBMITTED: "submitted",
  UNDER_REVIEW: "underReview",
  CLEARED: "cleared",
  RELEASED: "released",
  REJECTED: "rejected",
});

const RecordStatus = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
  SUSPENDED: "suspended",
});

const InvoiceStatus = Object.freeze({
  DRAFT: "DRAFT",
  ISSUED: "ISSUED",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
  VOIDED: "VOIDED",
});

const PaymentPlanStrategy = Object.freeze({
  THIRTY_SEVENTY: "THIRTY_SEVENTY",
  FULL_UPFRONT: "FULL_UPFRONT",
});

const InstallmentStatus = Object.freeze({
  PENDING: "PENDING",
  DUE: "DUE",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
  CANCELLED: "CANCELLED",
});

const DueTrigger = Object.freeze({
  ON_PLAN_CREATION: "ON_PLAN_CREATION",
  BEFORE_PURCHASE: "BEFORE_PURCHASE",
  ON_VEHICLE_RECOVERY: "ON_VEHICLE_RECOVERY",
  FIXED_DATE: "FIXED_DATE",
});

const CostType = Object.freeze({
  PURCHASE: "PURCHASE",
  SUPPLIER: "SUPPLIER",
  SHIPPING: "SHIPPING",
  CUSTOMS: "CUSTOMS",
  DUTY: "DUTY",
  TAX: "TAX",
  INSURANCE: "INSURANCE",
  STORAGE: "STORAGE",
  OTHER: "OTHER",
});

const DocumentKind = Object.freeze({
  VEHICLE_PHOTO: "VEHICLE_PHOTO",
  DOSSIER_DOCUMENT: "DOSSIER_DOCUMENT",
  PROOF: "PROOF",
  CONTRACT: "CONTRACT",
  CUSTOMS_DOCUMENT: "CUSTOMS_DOCUMENT",
  PAYMENT_RECEIPT: "PAYMENT_RECEIPT",
  BUSINESS_DOCUMENT: "BUSINESS_DOCUMENT",
});

const DossierEvidenceCheckpoint = Object.freeze({
  ARRIVAL_AT_PORT: "ARRIVAL_AT_PORT",
  CUSTOMS: "CUSTOMS",
  PORT_EXIT: "PORT_EXIT",
  LOCAL_TRANSPORT: "LOCAL_TRANSPORT",
});

const IntegrationKind = Object.freeze({
  TELEPHONY: "telephony",
  WHATSAPP: "whatsapp",
});

const Permission = Object.freeze({
  DASHBOARD_READ: "dashboard:read",
  USERS_READ: "users:read",
  USERS_WRITE: "users:write",
  USERS_MANAGE: "users:manage",
  OFFICES_READ: "offices:read",
  OFFICES_WRITE: "offices:write",
  ROLES_READ: "roles:read",
  ROLES_WRITE: "roles:write",
  ROLES_MANAGE: "roles:manage",
  PROSPECTS_READ: "prospects:read",
  PROSPECTS_WRITE: "prospects:write",
  CLIENTS_READ: "clients:read",
  CLIENTS_WRITE: "clients:write",
  DOSSIERS_READ: "dossiers:read",
  DOSSIERS_WRITE: "dossiers:write",
  VEHICLES_READ: "vehicles:read",
  VEHICLES_WRITE: "vehicles:write",
  WAREHOUSES_READ: "warehouses:read",
  WAREHOUSES_WRITE: "warehouses:write",
  VEHICLE_REQUESTS_READ: "vehicleRequests:read",
  VEHICLE_REQUESTS_WRITE: "vehicleRequests:write",
  ORDERS_READ: "orders:read",
  ORDERS_WRITE: "orders:write",
  PURCHASES_READ: "purchases:read",
  PURCHASES_WRITE: "purchases:write",
  PARTNERS_READ: "partners:read",
  PARTNERS_WRITE: "partners:write",
  SUPPLIERS_VERIFY: "suppliers:verify",
  SUPPLIERS_BANK_METADATA: "suppliersBank:metadata",
  SUPPLIERS_BANK_REVEAL: "suppliersBank:reveal",
  SUPPLIERS_BANK_WRITE: "suppliersBank:write",
  SUPPLIERS_INCIDENTS_MANAGE: "suppliersIncidents:manage",
  SUPPLIERS_SCORE_MANAGE: "suppliersScore:manage",
  OFFERS_READ: "offers:read",
  OFFERS_WRITE: "offers:write",
  OFFERS_TRANSITION: "offers:transition",
  OFFERS_READ_PURCHASE_PRICE: "offers:readPurchasePrice",
  OFFERS_READ_MARGIN: "offers:readMargin",
  PAYMENTS_READ: "payments:read",
  PAYMENTS_WRITE: "payments:write",
  PAYMENTS_CONFIRM: "payments:confirm",
  PAYMENTS_REVERSE: "payments:reverse",
  INVOICES_READ: "invoices:read",
  INVOICES_WRITE: "invoices:write",
  INVOICES_ISSUE: "invoices:issue",
  INVOICES_VOID: "invoices:void",
  PAYMENT_PLANS_READ: "paymentPlans:read",
  PAYMENT_PLANS_WRITE: "paymentPlans:write",
  SUPPLIER_PAYMENTS_READ: "supplierPayments:read",
  SUPPLIER_PAYMENTS_WRITE: "supplierPayments:write",
  SUPPLIER_PAYMENTS_CONFIRM: "supplierPayments:confirm",
  SUPPLIER_PAYMENTS_REVERSE: "supplierPayments:reverse",
  COSTS_READ: "costs:read",
  COSTS_WRITE: "costs:write",
  EXCHANGE_RATES_READ: "exchangeRates:read",
  EXCHANGE_RATES_WRITE: "exchangeRates:write",
  FINANCE_READ: "finance:read",
  FINANCE_WRITE: "finance:write",
  FINANCE_ADMIN: "finance:admin",
  FINANCE_REVERSE: "finance:reverse",
  TREASURY_READ: "treasury:read",
  TREASURY_WRITE: "treasury:write",
  CONTRACTS_READ: "contracts:read",
  CONTRACTS_WRITE: "contracts:write",
  CONTRACTS_SIGN: "contracts:sign",
  SHIPMENTS_READ: "shipments:read",
  SHIPMENTS_WRITE: "shipments:write",
  SHIPMENTS_TRANSITION: "shipments:transition",
  CUSTOMS_READ: "customs:read",
  CUSTOMS_WRITE: "customs:write",
  CUSTOMS_TRANSITION: "customs:transition",
  CUSTOMS_AUTOMATE: "customs:automate",
  DOCUMENTS_READ: "documents:read",
  DOCUMENTS_WRITE: "documents:write",
  GED_METADATA_LIST: "gedMetadata:list",
  GED_METADATA_READ: "gedMetadata:read",
  GED_METADATA_CREATE: "gedMetadata:create",
  GED_METADATA_UPDATE: "gedMetadata:update",
  GED_METADATA_LINK: "gedMetadata:link",
  GED_METADATA_UNLINK: "gedMetadata:unlink",
  GED_METADATA_ARCHIVE: "gedMetadata:archive",
  GED_AUDIT_READ: "gedAudit:read",
  GED_BYTES_PREVIEW: "gedBytes:preview",
  GED_BYTES_DOWNLOAD: "gedBytes:download",
  GED_BYTES_UPLOAD: "gedBytes:upload",
  GED_BYTES_CREATE_VERSION: "gedBytes:createVersion",
  GED_VALIDATE: "gedValidation:validate",
  GED_REJECT: "gedValidation:reject",
  GED_SENSITIVE_METADATA: "gedSensitive:metadata",
  GED_SENSITIVE_PREVIEW: "gedSensitive:preview",
  GED_SENSITIVE_DOWNLOAD: "gedSensitive:download",
  GED_SENSITIVE_UPLOAD: "gedSensitive:upload",
  DOSSIER_CHECKLIST_READ: "dossierChecklist:read",
  DOSSIER_CHECKLIST_MANAGE: "dossierChecklist:manage",
  TASKS_READ: "tasks:read",
  TASKS_WRITE: "tasks:write",
  TASKS_ASSIGN: "tasks:assign",
  NOTIFICATIONS_READ: "notifications:read",
  NOTIFICATIONS_SEND: "notifications:send",
  NOTIFICATIONS_MANAGE: "notifications:manage",
  AUDIT_READ: "audit:read",
  CRM_TIMELINE_READ: "crmTimeline:read",
  CRM_TIMELINE_WRITE: "crmTimeline:write",
  CALL_CENTER_ACCESS: "callCenter:access",
  CALL_CENTER_DISPATCH: "callCenter:dispatch",
  CALL_CENTER_HANDLE: "callCenter:handle",
  WHATSAPP_HANDLE: "whatsapp:handle",
  APPOINTMENTS_READ: "appointments:read",
  APPOINTMENTS_WRITE: "appointments:write",
  CRM_KPI_OWN: "crmKpi:own",
  CRM_KPI_ORGANIZATION: "crmKpi:organization",
  CHANNELS_MANAGE: "channels:manage",
  REPORTS_READ: "reports:read",
  REPORTS_EXPORT: "reports:export",
  SETTINGS_READ: "settings:read",
  SETTINGS_WRITE: "settings:write",
  SETTINGS_MANAGE: "settings:manage",
  SETTINGS_INTEGRATIONS_MANAGE: "integrations:manage",
  CLIENTS_IDENTITY_REVEAL: "clients:identityReveal",
  CLIENTS_IDENTITY_WRITE: "clients:identityWrite",
  CLIENTS_ARCHIVE: "clients:archive",
  PROSPECTS_TRANSITION: "prospects:transition",
  PROSPECTS_CONVERT: "prospects:convert",
  PROSPECTS_ARCHIVE: "prospects:archive",
  CRM_REFERENCE_MANAGE: "crmReference:manage",
  CRM_REFERENCE_READ: "crmReference:read",
});

const DOSSIER_WORKFLOWS = Object.freeze({
  [DossierType.VEHICLE_SALE_CIF]: Object.freeze([
    DossierStatus.OFFER_SELECTED,
    DossierStatus.CLIENT_CONFIRMED,
    DossierStatus.CONTRACT_SIGNED,
    DossierStatus.DEPOSIT_RECEIVED,
    DossierStatus.VEHICLE_BOOKING,
    DossierStatus.PURCHASE_CONFIRMED,
    DossierStatus.SUPPLIER_PAID,
    DossierStatus.INSPECTION,
    DossierStatus.SHIPMENT_BOOKING,
    DossierStatus.LOADING,
    DossierStatus.BILL_OF_LADING_ISSUED,
    DossierStatus.IN_TRANSIT,
    DossierStatus.ARRIVED_AT_PORT,
    DossierStatus.DOCUMENTS_DELIVERED,
    DossierStatus.CLOSED,
  ]),
  [DossierType.VEHICLE_SALE_DDP]: Object.freeze([
    DossierStatus.OFFER_SELECTED,
    DossierStatus.CLIENT_CONFIRMED,
    DossierStatus.CONTRACT_SIGNED,
    DossierStatus.DEPOSIT_RECEIVED,
    DossierStatus.VEHICLE_BOOKING,
    DossierStatus.PURCHASE_CONFIRMED,
    DossierStatus.SUPPLIER_PAID,
    DossierStatus.INSPECTION,
    DossierStatus.SHIPMENT_BOOKING,
    DossierStatus.LOADING,
    DossierStatus.BILL_OF_LADING_ISSUED,
    DossierStatus.IN_TRANSIT,
    DossierStatus.ARRIVED_AT_PORT,
    DossierStatus.CUSTOMS_CLEARANCE,
    DossierStatus.CUSTOMS_RELEASED,
    DossierStatus.PORT_EXIT,
    DossierStatus.LOCAL_TRANSPORT,
    DossierStatus.DELIVERED_TO_CLIENT,
    DossierStatus.CLOSED,
  ]),
  [DossierType.SHIPPING_ONLY]: Object.freeze([
    DossierStatus.CLIENT_REGISTERED,
    DossierStatus.EXTERNAL_VEHICLE_RECORDED,
    DossierStatus.EXTERNAL_SUPPLIER_RECORDED,
    DossierStatus.PICKUP_RECEIVED,
    DossierStatus.SHIPPING_QUOTED,
    DossierStatus.PAYMENT_RECEIVED,
    DossierStatus.BOOKING,
    DossierStatus.LOADING,
    DossierStatus.CONTAINER_BILL_OF_LADING,
    DossierStatus.IN_TRANSIT,
    DossierStatus.ARRIVED,
    DossierStatus.SERVICE_COMPLETED,
  ]),
});

const ALL_PERMISSIONS = Object.freeze(Object.values(Permission));

module.exports = {
  ALL_PERMISSIONS,
  CustomsStatus,
  DOSSIER_WORKFLOWS,
  DossierStatus,
  DossierType,
  AgentPresenceStatus,
  CandidateStatus,
  CallState,
  CommerceRecordStatus,
  CostType,
  Currency,
  DocumentKind,
  DossierEvidenceCheckpoint,
  IntegrationKind,
  DueTrigger,
  InstallmentStatus,
  InvoiceStatus,
  LeadQualification,
  CrmLeadStatus,
  CrmLeadOutcome,
  CrmReferenceKind,
  OfferStatus,
  OfferReservationStatus,
  OrderStatus,
  PaymentPlanStrategy,
  PaymentStatus,
  Permission,
  PartnerType,
  PurchaseStatus,
  ProspectStatus,
  RecordStatus,
  ShipmentStatus,
  ReservationStatus,
  VehicleRequestStatus,
  VehicleSource,
  VehicleStatus,
};
