import { DossierStatus, VehicleStatus } from '@auto-import/contracts';

/**
 * Authoritative mapping between dossier milestones and vehicle statuses.
 *
 * This is the single source of truth for dossier → vehicle status
 * synchronization. The dossier workflow is the ONLY place that advances a
 * dossier-linked vehicle's status; the frontend never decides this on its own.
 *
 * A dossier milestone with no entry here carries no vehicle-status consequence
 * (the vehicle keeps its current status).
 *
 * Note on SHIPMENT_BOOKING: it does NOT mark a vehicle as in-transit. A vehicle
 * only becomes physically in-transit once it is loaded and shipped
 * (LOADING / BILL_OF_LADING_ISSUED / IN_TRANSIT).
 */
export const DOSSIER_STATUS_TO_VEHICLE_STATUS: Partial<
  Record<DossierStatus, VehicleStatus>
> = {
  // ── Réservé: from dossier creation up to shipment booking ──────────────
  [DossierStatus.OFFER_SELECTED]: VehicleStatus.RESERVED,
  [DossierStatus.CLIENT_CONFIRMED]: VehicleStatus.RESERVED,
  [DossierStatus.CONTRACT_SIGNED]: VehicleStatus.RESERVED,
  [DossierStatus.DEPOSIT_RECEIVED]: VehicleStatus.RESERVED,
  [DossierStatus.VEHICLE_BOOKING]: VehicleStatus.RESERVED,
  [DossierStatus.PURCHASE_CONFIRMED]: VehicleStatus.RESERVED,
  [DossierStatus.SUPPLIER_PAID]: VehicleStatus.RESERVED,
  [DossierStatus.INSPECTION]: VehicleStatus.RESERVED,
  [DossierStatus.SHIPMENT_BOOKING]: VehicleStatus.RESERVED,

  // ── En transit: physically shipped ──────────────────────────────────────
  [DossierStatus.LOADING]: VehicleStatus.IN_TRANSIT,
  [DossierStatus.BILL_OF_LADING_ISSUED]: VehicleStatus.IN_TRANSIT,
  [DossierStatus.IN_TRANSIT]: VehicleStatus.IN_TRANSIT,
  [DossierStatus.ARRIVED_AT_PORT]: VehicleStatus.IN_TRANSIT,

  // ── En douane (DDP) ─────────────────────────────────────────────────────
  [DossierStatus.CUSTOMS_CLEARANCE]: VehicleStatus.IN_CUSTOMS,
  [DossierStatus.CUSTOMS_RELEASED]: VehicleStatus.IN_CUSTOMS,

  // ── Livré ───────────────────────────────────────────────────────────────
  [DossierStatus.DOCUMENTS_DELIVERED]: VehicleStatus.DELIVERED,
  [DossierStatus.PORT_EXIT]: VehicleStatus.DELIVERED,
  [DossierStatus.LOCAL_TRANSPORT]: VehicleStatus.DELIVERED,
  [DossierStatus.DELIVERED_TO_CLIENT]: VehicleStatus.DELIVERED,

  // ── Vendu (final sale) ──────────────────────────────────────────────────
  [DossierStatus.CLOSED]: VehicleStatus.SOLD,

  // ── Shipping-only workflow ──────────────────────────────────────────────
  [DossierStatus.CLIENT_REGISTERED]: VehicleStatus.RESERVED,
  [DossierStatus.EXTERNAL_VEHICLE_RECORDED]: VehicleStatus.RESERVED,
  [DossierStatus.EXTERNAL_SUPPLIER_RECORDED]: VehicleStatus.RESERVED,
  [DossierStatus.PICKUP_RECEIVED]: VehicleStatus.RESERVED,
  [DossierStatus.SHIPPING_QUOTED]: VehicleStatus.RESERVED,
  [DossierStatus.PAYMENT_RECEIVED]: VehicleStatus.RESERVED,
  [DossierStatus.BOOKING]: VehicleStatus.RESERVED,
  [DossierStatus.CONTAINER_BILL_OF_LADING]: VehicleStatus.IN_TRANSIT,
  [DossierStatus.ARRIVED]: VehicleStatus.DELIVERED,
  [DossierStatus.SERVICE_COMPLETED]: VehicleStatus.DELIVERED,
};

/**
 * Resolve the vehicle status a given dossier milestone maps to, or `null` when
 * the milestone has no vehicle-status consequence (or is handled separately —
 * e.g. cancellation, which only releases reserved vehicles).
 */
export function getTargetVehicleStatus(status: string): VehicleStatus | null {
  return DOSSIER_STATUS_TO_VEHICLE_STATUS[status as DossierStatus] ?? null;
}
