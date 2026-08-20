import { DossierType } from '../dto/dossier-type.enum';

/**
 * Sequential steps for VEHICLE_SALE_CIF workflow (14 steps)
 */
export const DOSSIER_STATUTS_CIF: string[] = [
  'offre_selectionnee',
  'client_confirme',
  'contrat_signe',
  'acompte_recu',
  'achat_confirme',
  'paiement_fournisseur',
  'inspection',
  'booking',
  'chargement',
  'bl_emis',
  'en_transit',
  'arrivee_port',
  'documents_remis',
  'cloture',
];

/**
 * Sequential steps for VEHICLE_SALE_DDP workflow (18 steps)
 */
export const DOSSIER_STATUTS_DDP: string[] = [
  'offre_selectionnee',
  'client_confirme',
  'contrat_signe',
  'acompte_recu',
  'achat_confirme',
  'paiement_fournisseur',
  'inspection',
  'booking',
  'chargement',
  'bl_emis',
  'en_transit',
  'arrivee_port',
  'douane',
  'mainlevee',
  'sortie_port',
  'transport_local',
  'livraison_client',
  'cloture',
];

/**
 * Sequential steps for SHIPPING_ONLY workflow (12 steps)
 */
export const DOSSIER_STATUTS_SHIPPING: string[] = [
  'client',
  'vehicule_externe_renseigne',
  'fournisseur_externe',
  'reception_pickup',
  'devis_shipping',
  'paiement',
  'booking',
  'chargement',
  'bl_conteneur',
  'en_transit',
  'arrivee',
  'service_termine',
];

/**
 * All terminal statuses across all workflows
 */
export const TERMINAL_STATUSES: Set<string> = new Set([
  'cloture',
  'service_termine',
  'annule',
]);

/**
 * Initial default status per workflow type
 */
export const INITIAL_STATUS_BY_TYPE: Record<DossierType, string> = {
  [DossierType.VEHICLE_SALE_CIF]: 'offre_selectionnee',
  [DossierType.VEHICLE_SALE_DDP]: 'offre_selectionnee',
  [DossierType.SHIPPING_ONLY]: 'client',
};

/**
 * Ordered status lists indexed by DossierType
 */
export const WORKFLOW_STEPS_BY_TYPE: Record<DossierType, string[]> = {
  [DossierType.VEHICLE_SALE_CIF]: DOSSIER_STATUTS_CIF,
  [DossierType.VEHICLE_SALE_DDP]: DOSSIER_STATUTS_DDP,
  [DossierType.SHIPPING_ONLY]: DOSSIER_STATUTS_SHIPPING,
};

/**
 * Legacy aliases mapped to canonical status values
 */
export const LEGACY_STATUS_ALIASES: Record<string, string> = {
  prospection: 'offre_selectionnee',
  recherche_vehicule: 'achat_confirme',
  achat: 'achat_confirme',
  shipping: 'booking',
  livraison: 'livraison_client',
};
