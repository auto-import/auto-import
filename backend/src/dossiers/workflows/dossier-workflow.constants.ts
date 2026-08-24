import { DossierStatus, DossierType } from '@auto-import/contracts';

/**
 * Sequential steps for VEHICLE_SALE_CIF workflow (14 steps)
 */
export const DOSSIER_STATUSES_CIF: DossierStatus[] = [
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
];

/**
 * Sequential steps for VEHICLE_SALE_DDP workflow (18 steps)
 */
export const DOSSIER_STATUSES_DDP: DossierStatus[] = [
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
];

/**
 * Sequential steps for SHIPPING_ONLY workflow (12 steps)
 */
export const DOSSIER_STATUSES_SHIPPING: DossierStatus[] = [
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
];

/**
 * All terminal statuses across all workflows
 */
export const TERMINAL_STATUSES: Set<string> = new Set([
  DossierStatus.CLOSED,
  DossierStatus.SERVICE_COMPLETED,
  DossierStatus.CANCELLED,
]);

/**
 * Initial default status per workflow type
 */
export const INITIAL_STATUS_BY_TYPE: Record<DossierType, DossierStatus> = {
  [DossierType.VEHICLE_SALE_CIF]: DossierStatus.OFFER_SELECTED,
  [DossierType.VEHICLE_SALE_DDP]: DossierStatus.OFFER_SELECTED,
  [DossierType.SHIPPING_ONLY]: DossierStatus.CLIENT_REGISTERED,
};

/**
 * Ordered status lists indexed by DossierType
 */
export const WORKFLOW_STEPS_BY_TYPE: Record<DossierType, DossierStatus[]> = {
  [DossierType.VEHICLE_SALE_CIF]: DOSSIER_STATUSES_CIF,
  [DossierType.VEHICLE_SALE_DDP]: DOSSIER_STATUSES_DDP,
  [DossierType.SHIPPING_ONLY]: DOSSIER_STATUSES_SHIPPING,
};

/**
 * Legacy aliases mapped to canonical status values
 */
export const LEGACY_STATUS_ALIASES: Record<string, DossierStatus> = {
  prospection: DossierStatus.OFFER_SELECTED,
  offre_selectionnee: DossierStatus.OFFER_SELECTED,
  client_confirme: DossierStatus.CLIENT_CONFIRMED,
  contrat_signe: DossierStatus.CONTRACT_SIGNED,
  acompte_recu: DossierStatus.DEPOSIT_RECEIVED,
  recherche_vehicule: DossierStatus.PURCHASE_CONFIRMED,
  achat: DossierStatus.PURCHASE_CONFIRMED,
  achat_confirme: DossierStatus.PURCHASE_CONFIRMED,
  paiement_fournisseur: DossierStatus.SUPPLIER_PAID,
  chargement: DossierStatus.LOADING,
  bl_emis: DossierStatus.BILL_OF_LADING_ISSUED,
  en_transit: DossierStatus.IN_TRANSIT,
  arrivee_port: DossierStatus.ARRIVED_AT_PORT,
  documents_remis: DossierStatus.DOCUMENTS_DELIVERED,
  douane: DossierStatus.CUSTOMS_CLEARANCE,
  mainlevee: DossierStatus.CUSTOMS_RELEASED,
  sortie_port: DossierStatus.PORT_EXIT,
  transport_local: DossierStatus.LOCAL_TRANSPORT,
  livraison: DossierStatus.DELIVERED_TO_CLIENT,
  livraison_client: DossierStatus.DELIVERED_TO_CLIENT,
  client: DossierStatus.CLIENT_REGISTERED,
  vehicule_externe_renseigne: DossierStatus.EXTERNAL_VEHICLE_RECORDED,
  fournisseur_externe: DossierStatus.EXTERNAL_SUPPLIER_RECORDED,
  reception_pickup: DossierStatus.PICKUP_RECEIVED,
  devis_shipping: DossierStatus.SHIPPING_QUOTED,
  paiement: DossierStatus.PAYMENT_RECEIVED,
  bl_conteneur: DossierStatus.CONTAINER_BILL_OF_LADING,
  cloture: DossierStatus.CLOSED,
  service_termine: DossierStatus.SERVICE_COMPLETED,
  annule: DossierStatus.CANCELLED,
};

// Backward-compatible export names; their values are canonical English statuses.
export const DOSSIER_STATUTS_CIF = DOSSIER_STATUSES_CIF;
export const DOSSIER_STATUTS_DDP = DOSSIER_STATUSES_DDP;
export const DOSSIER_STATUTS_SHIPPING = DOSSIER_STATUSES_SHIPPING;
