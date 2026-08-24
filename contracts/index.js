'use strict';

const DossierType = Object.freeze({
  VEHICLE_SALE_CIF: 'VEHICLE_SALE_CIF',
  VEHICLE_SALE_DDP: 'VEHICLE_SALE_DDP',
  SHIPPING_ONLY: 'SHIPPING_ONLY',
});

const DossierStatus = Object.freeze({
  OFFER_SELECTED: 'offerSelected',
  CLIENT_CONFIRMED: 'clientConfirmed',
  CONTRACT_SIGNED: 'contractSigned',
  DEPOSIT_RECEIVED: 'depositReceived',
  PURCHASE_CONFIRMED: 'purchaseConfirmed',
  SUPPLIER_PAID: 'supplierPaid',
  INSPECTION: 'inspection',
  BOOKING: 'booking',
  LOADING: 'loading',
  BILL_OF_LADING_ISSUED: 'billOfLadingIssued',
  IN_TRANSIT: 'inTransit',
  ARRIVED_AT_PORT: 'arrivedAtPort',
  DOCUMENTS_DELIVERED: 'documentsDelivered',
  CUSTOMS_CLEARANCE: 'customsClearance',
  CUSTOMS_RELEASED: 'customsReleased',
  PORT_EXIT: 'portExit',
  LOCAL_TRANSPORT: 'localTransport',
  DELIVERED_TO_CLIENT: 'deliveredToClient',
  CLIENT_REGISTERED: 'clientRegistered',
  EXTERNAL_VEHICLE_RECORDED: 'externalVehicleRecorded',
  EXTERNAL_SUPPLIER_RECORDED: 'externalSupplierRecorded',
  PICKUP_RECEIVED: 'pickupReceived',
  SHIPPING_QUOTED: 'shippingQuoted',
  PAYMENT_RECEIVED: 'paymentReceived',
  CONTAINER_BILL_OF_LADING: 'containerBillOfLading',
  ARRIVED: 'arrived',
  CLOSED: 'closed',
  SERVICE_COMPLETED: 'serviceCompleted',
  CANCELLED: 'cancelled',
});

const VehicleStatus = Object.freeze({
  AVAILABLE: 'available',
  RESERVED: 'reserved',
  IN_TRANSIT: 'inTransit',
  IN_CUSTOMS: 'inCustoms',
  DELIVERED: 'delivered',
  SOLD: 'sold',
});

const OrderStatus = Object.freeze({
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

const ProspectStatus = Object.freeze({
  NEW: 'new',
  CONTACTED: 'contacted',
  INTERESTED: 'interested',
  QUALIFIED: 'qualified',
  OFFER_SENT: 'offerSent',
  NEGOTIATING: 'negotiating',
  WON: 'won',
  LOST: 'lost',
  CONVERTED: 'converted',
});

const LeadQualification = Object.freeze({
  HOT: 'HOT',
  WARM: 'WARM',
  COLD: 'COLD',
  UNCLASSIFIED: 'UNCLASSIFIED',
});

const CallState = Object.freeze({
  RINGING: 'RINGING',
  QUEUED: 'QUEUED',
  ASSIGNED: 'ASSIGNED',
  FORWARDED: 'FORWARDED',
  ANSWERED: 'ANSWERED',
  COMPLETED: 'COMPLETED',
  MISSED: 'MISSED',
  FAILED: 'FAILED',
});

const AgentPresenceStatus = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  BUSY: 'BUSY',
  AWAY: 'AWAY',
  OFFLINE: 'OFFLINE',
});

const OfferStatus = Object.freeze({
  AVAILABLE: 'available',
  RESERVED: 'reserved',
  SOLD: 'sold',
  EXPIRED: 'expired',
});

const PaymentStatus = Object.freeze({
  PENDING: 'pending',
  PARTIAL: 'partial',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
});

const ShipmentStatus = Object.freeze({
  PENDING: 'pending',
  BOOKED: 'booked',
  LOADING: 'loading',
  IN_TRANSIT: 'inTransit',
  ARRIVED: 'arrived',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
});

const CustomsStatus = Object.freeze({
  OPEN: 'open',
  DOCUMENTS_PENDING: 'documentsPending',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'underReview',
  CLEARED: 'cleared',
  RELEASED: 'released',
  REJECTED: 'rejected',
});

const RecordStatus = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
});

const Permission = Object.freeze({
  DASHBOARD_READ: 'dashboard:read',
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_MANAGE: 'users:manage',
  OFFICES_READ: 'offices:read',
  OFFICES_WRITE: 'offices:write',
  ROLES_READ: 'roles:read',
  ROLES_WRITE: 'roles:write',
  ROLES_MANAGE: 'roles:manage',
  PROSPECTS_READ: 'prospects:read',
  PROSPECTS_WRITE: 'prospects:write',
  CLIENTS_READ: 'clients:read',
  CLIENTS_WRITE: 'clients:write',
  DOSSIERS_READ: 'dossiers:read',
  DOSSIERS_WRITE: 'dossiers:write',
  VEHICLES_READ: 'vehicles:read',
  VEHICLES_WRITE: 'vehicles:write',
  WAREHOUSES_READ: 'warehouses:read',
  WAREHOUSES_WRITE: 'warehouses:write',
  VEHICLE_REQUESTS_READ: 'vehicleRequests:read',
  VEHICLE_REQUESTS_WRITE: 'vehicleRequests:write',
  ORDERS_READ: 'orders:read',
  ORDERS_WRITE: 'orders:write',
  PARTNERS_READ: 'partners:read',
  PARTNERS_WRITE: 'partners:write',
  OFFERS_READ: 'offers:read',
  OFFERS_WRITE: 'offers:write',
  OFFERS_READ_PURCHASE_PRICE: 'offers:readPurchasePrice',
  OFFERS_READ_MARGIN: 'offers:readMargin',
  PAYMENTS_READ: 'payments:read',
  PAYMENTS_WRITE: 'payments:write',
  SHIPMENTS_READ: 'shipments:read',
  SHIPMENTS_WRITE: 'shipments:write',
  CUSTOMS_READ: 'customs:read',
  CUSTOMS_WRITE: 'customs:write',
  DOCUMENTS_READ: 'documents:read',
  DOCUMENTS_WRITE: 'documents:write',
  TASKS_READ: 'tasks:read',
  TASKS_WRITE: 'tasks:write',
  CRM_TIMELINE_READ: 'crmTimeline:read',
  CRM_TIMELINE_WRITE: 'crmTimeline:write',
  CALL_CENTER_ACCESS: 'callCenter:access',
  CALL_CENTER_DISPATCH: 'callCenter:dispatch',
  CALL_CENTER_HANDLE: 'callCenter:handle',
  WHATSAPP_HANDLE: 'whatsapp:handle',
  APPOINTMENTS_READ: 'appointments:read',
  APPOINTMENTS_WRITE: 'appointments:write',
  CRM_KPI_OWN: 'crmKpi:own',
  CRM_KPI_ORGANIZATION: 'crmKpi:organization',
  CHANNELS_MANAGE: 'channels:manage',
  REPORTS_READ: 'reports:read',
  SETTINGS_MANAGE: 'settings:manage',
});

const DOSSIER_WORKFLOWS = Object.freeze({
  [DossierType.VEHICLE_SALE_CIF]: Object.freeze([
    DossierStatus.OFFER_SELECTED,
    DossierStatus.CLIENT_CONFIRMED,
    DossierStatus.CONTRACT_SIGNED,
    DossierStatus.DEPOSIT_RECEIVED,
    DossierStatus.PURCHASE_CONFIRMED,
    DossierStatus.SUPPLIER_PAID,
    DossierStatus.INSPECTION,
    DossierStatus.BOOKING,
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
    DossierStatus.PURCHASE_CONFIRMED,
    DossierStatus.SUPPLIER_PAID,
    DossierStatus.INSPECTION,
    DossierStatus.BOOKING,
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
  CallState,
  LeadQualification,
  OfferStatus,
  OrderStatus,
  PaymentStatus,
  Permission,
  ProspectStatus,
  RecordStatus,
  ShipmentStatus,
  VehicleStatus,
};
