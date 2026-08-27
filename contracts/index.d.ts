export type ValueOf<T> = T[keyof T];

export const DossierType: {
  readonly VEHICLE_SALE_CIF: 'VEHICLE_SALE_CIF';
  readonly VEHICLE_SALE_DDP: 'VEHICLE_SALE_DDP';
  readonly SHIPPING_ONLY: 'SHIPPING_ONLY';
};
export type DossierType = ValueOf<typeof DossierType>;

export const DossierStatus: {
  readonly OFFER_SELECTED: 'offerSelected';
  readonly CLIENT_CONFIRMED: 'clientConfirmed';
  readonly CONTRACT_SIGNED: 'contractSigned';
  readonly DEPOSIT_RECEIVED: 'depositReceived';
  readonly PURCHASE_CONFIRMED: 'purchaseConfirmed';
  readonly SUPPLIER_PAID: 'supplierPaid';
  readonly INSPECTION: 'inspection';
  readonly BOOKING: 'booking';
  readonly LOADING: 'loading';
  readonly BILL_OF_LADING_ISSUED: 'billOfLadingIssued';
  readonly IN_TRANSIT: 'inTransit';
  readonly ARRIVED_AT_PORT: 'arrivedAtPort';
  readonly DOCUMENTS_DELIVERED: 'documentsDelivered';
  readonly CUSTOMS_CLEARANCE: 'customsClearance';
  readonly CUSTOMS_RELEASED: 'customsReleased';
  readonly PORT_EXIT: 'portExit';
  readonly LOCAL_TRANSPORT: 'localTransport';
  readonly DELIVERED_TO_CLIENT: 'deliveredToClient';
  readonly CLIENT_REGISTERED: 'clientRegistered';
  readonly EXTERNAL_VEHICLE_RECORDED: 'externalVehicleRecorded';
  readonly EXTERNAL_SUPPLIER_RECORDED: 'externalSupplierRecorded';
  readonly PICKUP_RECEIVED: 'pickupReceived';
  readonly SHIPPING_QUOTED: 'shippingQuoted';
  readonly PAYMENT_RECEIVED: 'paymentReceived';
  readonly CONTAINER_BILL_OF_LADING: 'containerBillOfLading';
  readonly ARRIVED: 'arrived';
  readonly CLOSED: 'closed';
  readonly SERVICE_COMPLETED: 'serviceCompleted';
  readonly CANCELLED: 'cancelled';
};
export type DossierStatus = ValueOf<typeof DossierStatus>;

export const VehicleStatus: {
  readonly PRE_PURCHASE: 'prePurchase';
  readonly AVAILABLE: 'available'; readonly RESERVED: 'reserved';
  readonly IN_TRANSIT: 'inTransit'; readonly IN_CUSTOMS: 'inCustoms';
  readonly DELIVERED: 'delivered'; readonly SOLD: 'sold';
};
export type VehicleStatus = ValueOf<typeof VehicleStatus>;

export const VehicleSource: {
  readonly STOCK: 'stock'; readonly CLIENT_REQUEST: 'clientRequest';
  readonly CHINA_OFFER: 'chinaOffer'; readonly EXTERNAL: 'external';
};
export type VehicleSource = ValueOf<typeof VehicleSource>;

export const PartnerType: {
  readonly SUPPLIER: 'supplier'; readonly CARRIER: 'carrier';
  readonly CUSTOMS_BROKER: 'customsBroker'; readonly LOGISTICS: 'logistics'; readonly OTHER: 'other';
};
export type PartnerType = ValueOf<typeof PartnerType>;

export const CommerceRecordStatus: {
  readonly ACTIVE: 'active'; readonly INACTIVE: 'inactive'; readonly ARCHIVED: 'archived';
};
export type CommerceRecordStatus = ValueOf<typeof CommerceRecordStatus>;

export const OfferReservationStatus: {
  readonly ACTIVE: 'active'; readonly CONSUMED: 'consumed';
  readonly RELEASED: 'released'; readonly EXPIRED: 'expired';
};
export type OfferReservationStatus = ValueOf<typeof OfferReservationStatus>;

export const VehicleRequestStatus: {
  readonly OPEN: 'open'; readonly SOURCING: 'sourcing';
  readonly CANDIDATE_SELECTED: 'candidateSelected'; readonly PURCHASED: 'purchased'; readonly CANCELLED: 'cancelled';
};
export type VehicleRequestStatus = ValueOf<typeof VehicleRequestStatus>;

export const CandidateStatus: {
  readonly PROPOSED: 'proposed'; readonly VALIDATED: 'validated'; readonly REJECTED: 'rejected';
};
export type CandidateStatus = ValueOf<typeof CandidateStatus>;

export const ReservationStatus: {
  readonly ACTIVE: 'active'; readonly RELEASED: 'released'; readonly EXPIRED: 'expired'; readonly CONSUMED: 'consumed';
};
export type ReservationStatus = ValueOf<typeof ReservationStatus>;

export const PurchaseStatus: {
  readonly PENDING: 'pending'; readonly CONFIRMED: 'confirmed'; readonly CANCELLED: 'cancelled';
};
export type PurchaseStatus = ValueOf<typeof PurchaseStatus>;

export const Currency: { readonly DZD: 'DZD'; readonly USD: 'USD'; readonly CNY: 'CNY'; readonly EUR: 'EUR' };
export type Currency = ValueOf<typeof Currency>;

export const OrderStatus: {
  readonly DRAFT: 'draft'; readonly CONFIRMED: 'confirmed';
  readonly PROCESSING: 'processing'; readonly COMPLETED: 'completed';
  readonly CANCELLED: 'cancelled';
};
export type OrderStatus = ValueOf<typeof OrderStatus>;

export const ProspectStatus: {
  readonly NEW: 'new'; readonly CONTACTED: 'contacted';
  readonly INTERESTED: 'interested'; readonly QUALIFIED: 'qualified';
  readonly OFFER_SENT: 'offerSent'; readonly NEGOTIATING: 'negotiating';
  readonly WON: 'won'; readonly LOST: 'lost'; readonly CONVERTED: 'converted';
};
export type ProspectStatus = ValueOf<typeof ProspectStatus>;

export const LeadQualification: {
  readonly HOT: 'HOT'; readonly WARM: 'WARM'; readonly COLD: 'COLD';
  readonly UNCLASSIFIED: 'UNCLASSIFIED';
};
export type LeadQualification = ValueOf<typeof LeadQualification>;

export const CallState: {
  readonly RINGING: 'RINGING'; readonly QUEUED: 'QUEUED';
  readonly ASSIGNED: 'ASSIGNED'; readonly FORWARDED: 'FORWARDED';
  readonly ANSWERED: 'ANSWERED'; readonly COMPLETED: 'COMPLETED';
  readonly MISSED: 'MISSED'; readonly FAILED: 'FAILED';
};
export type CallState = ValueOf<typeof CallState>;

export const AgentPresenceStatus: {
  readonly AVAILABLE: 'AVAILABLE'; readonly BUSY: 'BUSY';
  readonly AWAY: 'AWAY'; readonly OFFLINE: 'OFFLINE';
};
export type AgentPresenceStatus = ValueOf<typeof AgentPresenceStatus>;

export const OfferStatus: {
  readonly AVAILABLE: 'available'; readonly RESERVED: 'reserved';
  readonly SOLD: 'sold'; readonly EXPIRED: 'expired';
};
export type OfferStatus = ValueOf<typeof OfferStatus>;

export const PaymentStatus: {
  readonly PENDING: 'pending'; readonly PARTIAL: 'partial';
  readonly PAID: 'paid'; readonly FAILED: 'failed';
  readonly REFUNDED: 'refunded'; readonly CANCELLED: 'cancelled';
};
export type PaymentStatus = ValueOf<typeof PaymentStatus>;

export const ShipmentStatus: {
  readonly PENDING: 'pending'; readonly BOOKED: 'booked';
  readonly LOADING: 'loading'; readonly IN_TRANSIT: 'inTransit';
  readonly ARRIVED: 'arrived'; readonly DELIVERED: 'delivered';
  readonly CANCELLED: 'cancelled';
};
export type ShipmentStatus = ValueOf<typeof ShipmentStatus>;

export const CustomsStatus: {
  readonly OPEN: 'open'; readonly DOCUMENTS_PENDING: 'documentsPending';
  readonly SUBMITTED: 'submitted'; readonly UNDER_REVIEW: 'underReview';
  readonly CLEARED: 'cleared'; readonly RELEASED: 'released';
  readonly REJECTED: 'rejected';
};
export type CustomsStatus = ValueOf<typeof CustomsStatus>;

export const InvoiceStatus: {
  readonly DRAFT: 'DRAFT';
  readonly ISSUED: 'ISSUED';
  readonly PARTIALLY_PAID: 'PARTIALLY_PAID';
  readonly PAID: 'PAID';
  readonly OVERDUE: 'OVERDUE';
  readonly VOIDED: 'VOIDED';
};
export type InvoiceStatus = ValueOf<typeof InvoiceStatus>;

export const PaymentPlanStrategy: {
  readonly THIRTY_SEVENTY: 'THIRTY_SEVENTY';
  readonly FULL_UPFRONT: 'FULL_UPFRONT';
};
export type PaymentPlanStrategy = ValueOf<typeof PaymentPlanStrategy>;

export const InstallmentStatus: {
  readonly PENDING: 'PENDING';
  readonly DUE: 'DUE';
  readonly PARTIALLY_PAID: 'PARTIALLY_PAID';
  readonly PAID: 'PAID';
  readonly OVERDUE: 'OVERDUE';
  readonly CANCELLED: 'CANCELLED';
};
export type InstallmentStatus = ValueOf<typeof InstallmentStatus>;

export const DueTrigger: {
  readonly ON_PLAN_CREATION: 'ON_PLAN_CREATION';
  readonly BEFORE_PURCHASE: 'BEFORE_PURCHASE';
  readonly ON_VEHICLE_RECOVERY: 'ON_VEHICLE_RECOVERY';
  readonly FIXED_DATE: 'FIXED_DATE';
};
export type DueTrigger = ValueOf<typeof DueTrigger>;

export const CostType: {
  readonly PURCHASE: 'PURCHASE';
  readonly SUPPLIER: 'SUPPLIER';
  readonly SHIPPING: 'SHIPPING';
  readonly CUSTOMS: 'CUSTOMS';
  readonly DUTY: 'DUTY';
  readonly TAX: 'TAX';
  readonly INSURANCE: 'INSURANCE';
  readonly STORAGE: 'STORAGE';
  readonly OTHER: 'OTHER';
};
export type CostType = ValueOf<typeof CostType>;

export const DocumentKind: {
  readonly VEHICLE_PHOTO: 'VEHICLE_PHOTO';
  readonly DOSSIER_DOCUMENT: 'DOSSIER_DOCUMENT';
  readonly PROOF: 'PROOF';
  readonly CONTRACT: 'CONTRACT';
  readonly CUSTOMS_DOCUMENT: 'CUSTOMS_DOCUMENT';
  readonly PAYMENT_RECEIPT: 'PAYMENT_RECEIPT';
  readonly BUSINESS_DOCUMENT: 'BUSINESS_DOCUMENT';
};
export type DocumentKind = ValueOf<typeof DocumentKind>;

export const DossierEvidenceCheckpoint: {
  readonly ARRIVAL_AT_PORT: 'ARRIVAL_AT_PORT';
  readonly CUSTOMS: 'CUSTOMS';
  readonly PORT_EXIT: 'PORT_EXIT';
  readonly LOCAL_TRANSPORT: 'LOCAL_TRANSPORT';
};
export type DossierEvidenceCheckpoint = ValueOf<typeof DossierEvidenceCheckpoint>;

export const IntegrationKind: {
  readonly TELEPHONY: 'telephony';
  readonly WHATSAPP: 'whatsapp';
};
export type IntegrationKind = ValueOf<typeof IntegrationKind>;

export const RecordStatus: {
  readonly ACTIVE: 'active'; readonly INACTIVE: 'inactive';
  readonly SUSPENDED: 'suspended';
};
export type RecordStatus = ValueOf<typeof RecordStatus>;

export const Permission: {
  readonly DASHBOARD_READ: 'dashboard:read';
  readonly USERS_READ: 'users:read'; readonly USERS_WRITE: 'users:write'; readonly USERS_MANAGE: 'users:manage';
  readonly OFFICES_READ: 'offices:read'; readonly OFFICES_WRITE: 'offices:write';
  readonly ROLES_READ: 'roles:read'; readonly ROLES_WRITE: 'roles:write'; readonly ROLES_MANAGE: 'roles:manage';
  readonly PROSPECTS_READ: 'prospects:read'; readonly PROSPECTS_WRITE: 'prospects:write';
  readonly CLIENTS_READ: 'clients:read'; readonly CLIENTS_WRITE: 'clients:write';
  readonly DOSSIERS_READ: 'dossiers:read'; readonly DOSSIERS_WRITE: 'dossiers:write';
  readonly VEHICLES_READ: 'vehicles:read'; readonly VEHICLES_WRITE: 'vehicles:write';
  readonly WAREHOUSES_READ: 'warehouses:read'; readonly WAREHOUSES_WRITE: 'warehouses:write';
  readonly VEHICLE_REQUESTS_READ: 'vehicleRequests:read'; readonly VEHICLE_REQUESTS_WRITE: 'vehicleRequests:write';
  readonly ORDERS_READ: 'orders:read'; readonly ORDERS_WRITE: 'orders:write';
  readonly PURCHASES_READ: 'purchases:read'; readonly PURCHASES_WRITE: 'purchases:write';
  readonly PARTNERS_READ: 'partners:read'; readonly PARTNERS_WRITE: 'partners:write';
  readonly OFFERS_READ: 'offers:read'; readonly OFFERS_WRITE: 'offers:write';
  readonly OFFERS_READ_PURCHASE_PRICE: 'offers:readPurchasePrice'; readonly OFFERS_READ_MARGIN: 'offers:readMargin';
  readonly PAYMENTS_READ: 'payments:read'; readonly PAYMENTS_WRITE: 'payments:write';
  readonly PAYMENTS_CONFIRM: 'payments:confirm'; readonly PAYMENTS_REVERSE: 'payments:reverse';
  readonly INVOICES_READ: 'invoices:read'; readonly INVOICES_WRITE: 'invoices:write';
  readonly INVOICES_ISSUE: 'invoices:issue'; readonly INVOICES_VOID: 'invoices:void';
  readonly PAYMENT_PLANS_READ: 'paymentPlans:read'; readonly PAYMENT_PLANS_WRITE: 'paymentPlans:write';
  readonly SUPPLIER_PAYMENTS_READ: 'supplierPayments:read'; readonly SUPPLIER_PAYMENTS_WRITE: 'supplierPayments:write';
  readonly SUPPLIER_PAYMENTS_CONFIRM: 'supplierPayments:confirm'; readonly SUPPLIER_PAYMENTS_REVERSE: 'supplierPayments:reverse';
  readonly COSTS_READ: 'costs:read'; readonly COSTS_WRITE: 'costs:write';
  readonly EXCHANGE_RATES_READ: 'exchangeRates:read'; readonly EXCHANGE_RATES_WRITE: 'exchangeRates:write';
  readonly FINANCE_READ: 'finance:read'; readonly FINANCE_WRITE: 'finance:write'; readonly FINANCE_ADMIN: 'finance:admin';
  readonly SHIPMENTS_READ: 'shipments:read'; readonly SHIPMENTS_WRITE: 'shipments:write';
  readonly CUSTOMS_READ: 'customs:read'; readonly CUSTOMS_WRITE: 'customs:write';
  readonly DOCUMENTS_READ: 'documents:read'; readonly DOCUMENTS_WRITE: 'documents:write';
  readonly TASKS_READ: 'tasks:read'; readonly TASKS_WRITE: 'tasks:write'; readonly TASKS_ASSIGN: 'tasks:assign';
  readonly NOTIFICATIONS_READ: 'notifications:read'; readonly NOTIFICATIONS_SEND: 'notifications:send'; readonly NOTIFICATIONS_MANAGE: 'notifications:manage';
  readonly AUDIT_READ: 'audit:read';
  readonly CRM_TIMELINE_READ: 'crmTimeline:read'; readonly CRM_TIMELINE_WRITE: 'crmTimeline:write';
  readonly CALL_CENTER_ACCESS: 'callCenter:access'; readonly CALL_CENTER_DISPATCH: 'callCenter:dispatch';
  readonly CALL_CENTER_HANDLE: 'callCenter:handle'; readonly WHATSAPP_HANDLE: 'whatsapp:handle';
  readonly APPOINTMENTS_READ: 'appointments:read'; readonly APPOINTMENTS_WRITE: 'appointments:write';
  readonly CRM_KPI_OWN: 'crmKpi:own'; readonly CRM_KPI_ORGANIZATION: 'crmKpi:organization';
  readonly CHANNELS_MANAGE: 'channels:manage';
  readonly REPORTS_READ: 'reports:read'; readonly REPORTS_EXPORT: 'reports:export';
  readonly SETTINGS_READ: 'settings:read'; readonly SETTINGS_WRITE: 'settings:write'; readonly SETTINGS_MANAGE: 'settings:manage';
  readonly SETTINGS_INTEGRATIONS_MANAGE: 'integrations:manage';
  readonly CLIENTS_IDENTITY_REVEAL: 'clients:identityReveal';
};
export type Permission = ValueOf<typeof Permission>;

export const ALL_PERMISSIONS: readonly Permission[];
export const DOSSIER_WORKFLOWS: Readonly<Record<DossierType, readonly DossierStatus[]>>;
