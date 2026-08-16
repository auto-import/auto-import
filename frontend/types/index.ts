// ─── Enums / Union Types ─────────────────────────────────────────────

export type StatutDossier =
  | 'nouveau'
  | 'recherche_vehicule'
  | 'achat_confirme'
  | 'en_mer'
  | 'douane'
  | 'livre'
  | 'cloture';

export type OrigineDossier = 'client' | 'stock';

export type RoleUtilisateur =
  | 'super_admin'
  | 'sales_algerie'
  | 'operations_chine'
  | 'finance'
  | 'shipping'
  | 'dedouanement'
  | 'client'
  | 'fournisseur';

export type StatutVehicule =
  | 'disponible'
  | 'reserve'
  | 'en_mer'
  | 'en_douane'
  | 'livre'
  | 'vendu';

export type StatutFacture = 'payee' | 'en_attente' | 'en_retard' | 'annulee';

export type StatutContrat = 'brouillon' | 'signe' | 'annule';

export type StatutExpedition = 'planifiee' | 'en_mer' | 'arrivee' | 'dedouanee';

// ─── Interfaces ──────────────────────────────────────────────────────

export interface HistoriqueEntry {
  id: string;
  date: string;
  action: string;
  utilisateur: string;
  details: string;
}

export interface DocumentDossier {
  id: string;
  nom: string;
  type: string;
  date: string;
  taille: string;
  url: string;
}

export interface Client {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  numero_passeport: string;
  adresse: string;
  date_inscription: string;
  nombre_dossiers: number;
}

export interface Fournisseur {
  id: string;
  nom: string;
  pays: string;
  ville: string;
  contact: string;
  email: string;
  telephone: string;
  nombre_vehicules: number;
}

export interface Vehicule {
  id: string;
  vin: string;
  marque: string;
  modele: string;
  annee: number;
  couleur: string;
  prix_achat_cny: number;
  prix_achat_dzd: number;
  fournisseur_id: string;
  fournisseur_nom: string;
  statut: StatutVehicule;
  photos: string[];
  date_ajout: string;
}

export interface ExpeditionInfo {
  numero_conteneur: string;
  navire: string;
  numero_bl: string;
  port_depart: string;
  port_arrivee: string;
  etd: string;
  eta: string;
  statut: StatutExpedition;
}

export interface DouaneInfo {
  numero_declaration: string;
  date_declaration: string;
  bureau_douane: string;
  valeur_declaree_dzd: number;
  droits_douane_dzd: number;
  tva_dzd: number;
  total_frais_dzd: number;
  statut: 'en_cours' | 'validee' | 'en_attente';
  date_dedouanement: string | null;
}

export interface Facture {
  id: string;
  reference: string;
  dossier_id: string;
  dossier_reference: string;
  libelle: string;
  montant_dzd: number;
  date: string;
  statut: StatutFacture;
}

export interface Dossier {
  id: string;
  reference: string;
  client_id: string;
  client_nom: string;
  vehicule_id: string | null;
  vehicule_desc: string | null;
  fournisseur_nom: string | null;
  statut: StatutDossier;
  origine: OrigineDossier;
  date_creation: string;
  date_mise_a_jour: string;
  // Nested data (loaded on detail page)
  client?: Client;
  vehicule?: Vehicule;
  expedition?: ExpeditionInfo;
  douane?: DouaneInfo;
  factures?: Facture[];
  documents?: DocumentDossier[];
  historique?: HistoriqueEntry[];
  contrat_statut?: StatutContrat;
  acompte_recu_dzd?: number;
  solde_restant_dzd?: number;
}

export interface Utilisateur {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: RoleUtilisateur;
  actif: boolean;
  date_creation: string;
  avatar_initials: string;
}

export interface Expedition {
  id: string;
  numero_conteneur: string;
  navire: string;
  numero_bl: string;
  port_depart: string;
  port_arrivee: string;
  etd: string;
  eta: string;
  statut: StatutExpedition;
  nombre_vehicules: number;
  dossier_ids: string[];
}

// ─── Component Prop Helpers ──────────────────────────────────────────

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

export interface SidebarItem {
  label: string;
  href: string;
  icon: string;
}

export interface TabItem {
  key: string;
  label: string;
}
