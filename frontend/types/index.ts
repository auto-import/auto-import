// ─── Enums / Union Types ─────────────────────────────────────────────

export type TypeDossier = 'cif' | 'ddp' | 'shipping_only';

export type StatutDossier =
  | 'offre_selectionnee'
  | 'client_confirme'
  | 'contrat_signe'
  | 'acompte_recu'
  | 'achat_confirme'
  | 'paiement_fournisseur'
  | 'inspection'
  | 'booking'
  | 'chargement'
  | 'bl_emis'
  | 'en_transit'
  | 'arrivee_port'
  | 'documents_remis'
  | 'cloture'
  | 'douane'
  | 'mainlevee'
  | 'sortie_port'
  | 'transport_local'
  | 'livraison_client'
  | 'client'
  | 'vehicule_externe_renseigne'
  | 'fournisseur_externe'
  | 'reception_pickup'
  | 'devis_shipping'
  | 'paiement'
  | 'bl_conteneur'
  | 'arrivee'
  | 'service_termine';

export type OrigineDossier = 'client' | 'stock';

export type SourceVehicule = 'offre' | 'corapide' | 'external';

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

export type StatutOffre = 'disponible' | 'reservee' | 'vendue' | 'expiree';

export type TypeOffre = 'neuf' | 'occasion';

export type StatutFacture = 'payee' | 'en_attente' | 'en_retard' | 'annulee';

export type StatutContrat = 'brouillon' | 'signe' | 'annule';

export type StatutExpedition = 'planifiee' | 'en_mer' | 'arrivee' | 'dedouanee';

export type Devise = 'DZD' | 'USD' | 'CNY' | 'EUR';

export type StatutPaiement = 'en_attente' | 'partiel' | 'paye';

export type TypePaiementClient =
  | 'acompte'
  | 'partiel'
  | 'final'
  | 'shipping'
  | 'douane'
  | 'autre';

export type TypeCout =
  | 'achat_vehicule'
  | 'acompte_fournisseur'
  | 'solde_fournisseur'
  | 'shipping'
  | 'inspection'
  | 'pickup'
  | 'transport_chine'
  | 'port'
  | 'douane'
  | 'transport_local'
  | 'autre';

export type PrioriteTache = 'basse' | 'normale' | 'haute' | 'urgente';

export type StatutTache = 'a_faire' | 'en_cours' | 'en_attente' | 'terminee';

export type TypeDocumentDossier =
  | 'id_client'
  | 'contrat'
  | 'pi_fournisseur'
  | 'facture_fournisseur'
  | 'preuve_paiement'
  | 'documents_vehicule'
  | 'rapport_inspection'
  | 'bl_draft'
  | 'bl_final'
  | 'documents_douane'
  | 'document_livraison';

export type StatutDocument = 'recu' | 'manquant' | 'en_attente' | 'valide' | 'rejete';

export type TypeTimeline = 'statut' | 'paiement' | 'document' | 'note' | 'tache' | 'systeme';

// ─── Interfaces ──────────────────────────────────────────────────────

export interface TimelineEntry {
  id: string;
  dossier_id: string;
  date: string;
  utilisateur: string;
  action: string;
  type: TypeTimeline;
  details: string;
}

export interface Note {
  id: string;
  dossier_id: string;
  auteur: string;
  date: string;
  contenu: string;
}

export interface DossierDocument {
  id: string;
  dossier_id: string;
  type: TypeDocumentDossier;
  nom: string;
  taille: string;
  url: string;
  upload_par: string;
  date: string;
  version: number;
  statut: StatutDocument;
  notes: string;
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
  source: SourceVehicule;
  statut: StatutVehicule;
  photos: string[];
  date_ajout: string;
}

export interface Offre {
  id: string;
  marque: string;
  modele: string;
  annee: number;
  type: TypeOffre;
  kilometrage: number;
  photos: string[];
  fournisseur_nom: string;
  prix_cif: number;
  prix_ddp: number;
  devise: string;
  disponibilite: string;
  statut: StatutOffre;
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

export interface Purchase {
  id: string;
  dossier_id: string;
  vehicle_id: string | null;
  supplier_id: string;
  montant: number;
  devise: Devise;
  acompte_fournisseur: number;
  solde_fournisseur: number;
  statut_paiement: StatutPaiement;
  date_echeance: string | null;
  conditions_negociees: string;
  responsable_chine_id: string;
  documents: string[];
}

export interface PaiementClient {
  id: string;
  dossier_id: string;
  type: TypePaiementClient;
  montant: number;
  devise: Devise;
  taux_change: number | null;
  date: string;
  methode: string;
}

export interface Cout {
  id: string;
  dossier_id: string;
  type: TypeCout;
  montant: number;
  devise: Devise;
  taux_change: number | null;
  date: string;
  fournisseur_id: string | null;
}

export interface Tache {
  id: string;
  dossier_id: string;
  titre: string;
  assigne_a: string;
  departement: string;
  date_echeance: string;
  priorite: PrioriteTache;
  statut: StatutTache;
  description: string;
  commentaires: string;
}

export interface Dossier {
  id: string;
  reference: string;
  type: TypeDossier;
  client_id: string;
  client_nom: string;
  fournisseur_nom: string | null;
  statut: StatutDossier;
  origine: OrigineDossier;
  date_creation: string;
  date_mise_a_jour: string;
  // Responsables (hub)
  responsable_chine_id: string | null;
  responsable_algerie_id: string | null;
  // Commercial
  offre_id: string | null;
  supplier_id: string | null;
  contrat_statut?: StatutContrat;
  contrat_date?: string | null;
  // Nested data (loaded on detail page)
  client?: Client;
  vehicles: Vehicule[];
  purchase?: Purchase;
  paiements_client: PaiementClient[];
  couts: Cout[];
  expedition?: ExpeditionInfo;
  douane?: DouaneInfo;
  documents: DossierDocument[];
  taches: Tache[];
  timeline: TimelineEntry[];
  notes: Note[];
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
  vehicle_ids: string[];
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
