import { getRuntimeLocale } from "@/lib/i18n/runtime-locale";
import type {
  StatutDossier,
  StatutVehicule,
  StatutFacture,
  StatutContrat,
  StatutExpedition,
  StatutOffre,
  StatutPaiement,
  TypePaiementClient,
  TypeCout,
  PrioriteTache,
  StatutTache,
  TypeDocumentDossier,
  StatutDocument,
  TypeTimeline,
  Devise,
  TabItem,
  TypeDossier,
  SourceVehicule,
  Vehicule,
  Dossier,
  PaiementClient,
  Cout,
  RoleUtilisateur,
  EtatVehicule,
  TypeCarrosserie,
  Carburant,
  BoiteVitesse,
  Direction,
  SourceLead,
  StatutLead,
  TypeClient,
  TypeActivite,
  Permission,
} from "@/types";

// ─── Dossier Statuts (per workflow type) ─────────────────────────────

export const DOSSIER_STATUTS_CIF: StatutDossier[] = [
  "offre_selectionnee",
  "client_confirme",
  "contrat_signe",
  "acompte_recu",
  "achat_confirme",
  "paiement_fournisseur",
  "inspection",
  "booking",
  "chargement",
  "bl_emis",
  "en_transit",
  "arrivee_port",
  "documents_remis",
  "cloture",
];

export const DOSSIER_STATUTS_DDP: StatutDossier[] = [
  "offre_selectionnee",
  "client_confirme",
  "contrat_signe",
  "acompte_recu",
  "achat_confirme",
  "paiement_fournisseur",
  "inspection",
  "booking",
  "chargement",
  "bl_emis",
  "en_transit",
  "arrivee_port",
  "douane",
  "mainlevee",
  "sortie_port",
  "transport_local",
  "livraison_client",
  "cloture",
];

export const DOSSIER_STATUTS_SHIPPING: StatutDossier[] = [
  "client",
  "vehicule_externe_renseigne",
  "fournisseur_externe",
  "reception_pickup",
  "devis_shipping",
  "paiement",
  "booking",
  "chargement",
  "bl_conteneur",
  "en_transit",
  "arrivee",
  "service_termine",
];

export const ROLE_LABELS: Record<RoleUtilisateur, string> = {
  super_admin: "Super Admin",
  sales_algerie: "Commercial Algérie",
  operations_chine: "Opérations Chine",
  finance: "Finance",
  shipping: "Shipping",
  dedouanement: "Dédouanement",
  client: "Client",
  fournisseur: "Fournisseur",
};

// Preuves (photos/vidéos) requises avant d'avancer — étapes physiques
export const PREUVE_REQUISE_PAR_ETAPE: Partial<Record<StatutDossier, string>> =
  {
    inspection: "Photos/vidéos du véhicule lors de l\u2019inspection",
    chargement: "Photos/vidéos du véhicule au chargement (conteneur)",
    arrivee_port: "Photos/vidéos du véhicule au port d\u2019arrivée",
    douane: "Photos/vidéos du véhicule en douane",
    mainlevee: "Photos/vidéos du véhicule après mainlevée",
    sortie_port: "Photos/vidéos du véhicule à la sortie du port",
    transport_local: "Photos/vidéos du véhicule en transport local",
    livraison_client: "Photos/vidéos du véhicule à la livraison client",
    reception_pickup: "Photos/vidéos du véhicule à la réception / pick-up",
    arrivee: "Photos/vidéos du véhicule à l\u2019arrivée",
  };

export function getPreuveRequise(statut: StatutDossier): string | undefined {
  return PREUVE_REQUISE_PAR_ETAPE[statut];
}

export function etapeRequiertPreuve(statut: StatutDossier): boolean {
  return statut in PREUVE_REQUISE_PAR_ETAPE;
}

export const DOSSIER_STATUTS_BY_TYPE: Record<TypeDossier, StatutDossier[]> = {
  cif: DOSSIER_STATUTS_CIF,
  ddp: DOSSIER_STATUTS_DDP,
  shipping_only: DOSSIER_STATUTS_SHIPPING,
};

// Global ordered union (for filters & charts across all types)
export const DOSSIER_STATUTS: StatutDossier[] = Array.from(
  new Set([
    ...DOSSIER_STATUTS_CIF,
    ...DOSSIER_STATUTS_DDP,
    ...DOSSIER_STATUTS_SHIPPING,
  ]),
);

export const DOSSIER_STATUT_LABELS: Record<StatutDossier, string> = {
  offre_selectionnee: "Offre sélectionnée",
  client_confirme: "Client confirmé",
  contrat_signe: "Contrat signé",
  acompte_recu: "Acompte reçu",
  achat_confirme: "Achat confirmé",
  paiement_fournisseur: "Paiement fournisseur",
  inspection: "Inspection",
  booking: "Booking",
  chargement: "Chargement",
  bl_emis: "BL émis",
  en_transit: "En transit",
  arrivee_port: "Arrivée port",
  documents_remis: "Documents remis",
  cloture: "Clôturé",
  douane: "Douane",
  mainlevee: "Mainlevée",
  sortie_port: "Sortie port",
  transport_local: "Transport local",
  livraison_client: "Livraison client",
  client: "Client",
  vehicule_externe_renseigne: "Véhicule externe renseigné",
  fournisseur_externe: "Fournisseur externe",
  reception_pickup: "Réception / pickup",
  devis_shipping: "Devis shipping",
  paiement: "Paiement",
  bl_conteneur: "BL / conteneur",
  arrivee: "Arrivée",
  service_termine: "Service terminé",
};

export const DOSSIER_STATUT_VARIANTS: Record<StatutDossier, string> = {
  offre_selectionnee: "blue",
  client_confirme: "blue",
  contrat_signe: "blue",
  acompte_recu: "blue",
  achat_confirme: "blue",
  paiement_fournisseur: "amber",
  inspection: "amber",
  booking: "blue",
  chargement: "blue",
  bl_emis: "blue",
  en_transit: "blue",
  arrivee_port: "green",
  documents_remis: "green",
  cloture: "gray",
  douane: "amber",
  mainlevee: "green",
  sortie_port: "green",
  transport_local: "green",
  livraison_client: "green",
  client: "gray",
  vehicule_externe_renseigne: "gray",
  fournisseur_externe: "gray",
  reception_pickup: "blue",
  devis_shipping: "amber",
  paiement: "amber",
  bl_conteneur: "blue",
  arrivee: "green",
  service_termine: "gray",
};

// ─── Dossier Types ───────────────────────────────────────────────────

export const DOSSIER_TYPE_LABELS: Record<TypeDossier, string> = {
  cif: "CIF",
  ddp: "DDP",
  shipping_only: "Expédition seule",
};

export const DOSSIER_TYPE_VARIANTS: Record<TypeDossier, string> = {
  cif: "blue",
  ddp: "amber",
  shipping_only: "gray",
};

// ─── Véhicule Statuts ────────────────────────────────────────────────

export const VEHICULE_STATUT_LABELS: Record<StatutVehicule, string> = {
  disponible: "Disponible",
  reserve: "Réservé",
  en_mer: "En mer",
  en_douane: "En douane",
  livre: "Livré",
  vendu: "Vendu",
};

export const VEHICULE_STATUT_VARIANTS: Record<StatutVehicule, string> = {
  disponible: "green",
  reserve: "amber",
  en_mer: "blue",
  en_douane: "amber",
  livre: "green",
  vendu: "gray",
};

// ─── Source Véhicule ─────────────────────────────────────────────────

export const VEHICLE_SOURCE_LABELS: Record<SourceVehicule, string> = {
  offre: "Offre",
  corapide: "Corapide",
  external: "Externe",
};

export const VEHICLE_SOURCE_VARIANTS: Record<SourceVehicule, string> = {
  offre: "blue",
  corapide: "green",
  external: "gray",
};

// ─── Caractéristiques Véhicule ───────────────────────────────────────

export const VEHICULE_ETAT_LABELS: Record<EtatVehicule, string> = {
  neuf: "Neuf",
  occasion: "Occasion",
};

export const CARROSSERIE_LABELS: Record<TypeCarrosserie, string> = {
  suv: "SUV",
  berline: "Berline",
  "4x4": "4x4",
  crossover: "Crossover",
  compacte: "Compacte",
  coupe: "Coupé",
  monospace: "Monospace",
};

export const CARBURANT_LABELS: Record<Carburant, string> = {
  essence: "Essence",
  diesel: "Diesel",
  hybride: "Hybride",
  electrique: "Électrique",
};

export const BOITE_LABELS: Record<BoiteVitesse, string> = {
  automatique: "Automatique",
  manuelle: "Manuelle",
};

export const DIRECTION_LABELS: Record<Direction, string> = {
  gauche: "Volant à gauche",
  droite: "Volant à droite",
};

// ─── CRM / Leads ──────────────────────────────────────────────────────

export const LEAD_SOURCE_LABELS: Record<SourceLead, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  referral: "Parrainage",
  website: "Site web",
  walk_in: "Walk-in",
  existing_client: "Client existant",
  autre: "Autre",
};

export const LEAD_STATUT_LABELS: Record<StatutLead, string> = {
  nouveau: "Nouveau",
  contacte: "Contacté",
  interesse: "Intéressé",
  qualification: "Qualification",
  offre_envoyee: "Offre envoyée",
  negociation: "Négociation",
  gagne: "Gagné",
  perdu: "Perdu",
};

export const LEAD_STATUT_VARIANTS: Record<StatutLead, string> = {
  nouveau: "blue",
  contacte: "amber",
  interesse: "amber",
  qualification: "blue",
  offre_envoyee: "amber",
  negociation: "amber",
  gagne: "green",
  perdu: "red",
};

export const TYPE_CLIENT_LABELS: Record<TypeClient, string> = {
  particulier: "Particulier",
  revendeur: "Revendeur",
  importateur: "Importateur",
  societe: "Société",
};

export const TYPE_ACTIVITE_LABELS: Record<TypeActivite, string> = {
  appel: "Appel",
  whatsapp: "WhatsApp",
  email: "Email",
  reunion: "Réunion",
  note: "Note",
  offre: "Offre",
  suivi: "Suivi",
};

export const LEAD_PIPELINE_STAGES: StatutLead[] = [
  "nouveau",
  "contacte",
  "interesse",
  "qualification",
  "offre_envoyee",
  "negociation",
  "gagne",
  "perdu",
];

// ─── Permissions & Roles ──────────────────────────────────────────────

export const PERMISSION_LABELS: Record<Permission, string> = {
  dashboard: "Tableau de bord",
  dossiers_lecture: "Dossiers — Lecture",
  dossiers_ecriture: "Dossiers — Écriture",
  vehicules_lecture: "Véhicules — Lecture",
  vehicules_ecriture: "Véhicules — Écriture",
  offres_lecture: "Offres — Lecture",
  offres_ecriture: "Offres — Écriture",
  offres_prix_achat: "Offres — Prix d'achat",
  offres_marge: "Offres — Marge",
  fournisseurs_lecture: "Fournisseurs — Lecture",
  fournisseurs_ecriture: "Fournisseurs — Écriture",
  expeditions_lecture: "Expéditions — Lecture",
  expeditions_ecriture: "Expéditions — Écriture",
  facturation_lecture: "Facturation — Lecture",
  facturation_ecriture: "Facturation — Écriture",
  crm_lecture: "CRM / Clients — Lecture",
  crm_ecriture: "CRM / Clients — Écriture",
  documents_lecture: "Documents — Lecture",
  documents_ecriture: "Documents — Écriture",
  taches_lecture: "Tâches — Lecture",
  taches_ecriture: "Tâches — Écriture",
  rapports: "Rapports",
  utilisateurs: "Gestion utilisateurs",
  parametres: "Paramètres",
};

export interface PermissionGroup {
  label: string;
  permissions: Permission[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: "Tableau de bord",
    permissions: ["dashboard"],
  },
  {
    label: "Dossiers",
    permissions: ["dossiers_lecture", "dossiers_ecriture"],
  },
  {
    label: "Véhicules",
    permissions: ["vehicules_lecture", "vehicules_ecriture"],
  },
  {
    label: "Offres Chine",
    permissions: [
      "offres_lecture",
      "offres_ecriture",
      "offres_prix_achat",
      "offres_marge",
    ],
  },
  {
    label: "Fournisseurs",
    permissions: ["fournisseurs_lecture", "fournisseurs_ecriture"],
  },
  {
    label: "Expéditions",
    permissions: ["expeditions_lecture", "expeditions_ecriture"],
  },
  {
    label: "Facturation",
    permissions: ["facturation_lecture", "facturation_ecriture"],
  },
  {
    label: "CRM / Clients",
    permissions: ["crm_lecture", "crm_ecriture"],
  },
  {
    label: "Documents",
    permissions: ["documents_lecture", "documents_ecriture"],
  },
  {
    label: "Tâches",
    permissions: ["taches_lecture", "taches_ecriture"],
  },
  {
    label: "Rapports",
    permissions: ["rapports"],
  },
  {
    label: "Gestion utilisateurs",
    permissions: ["utilisateurs"],
  },
  {
    label: "Paramètres",
    permissions: ["parametres"],
  },
];

export const ALL_PERMISSIONS: Permission[] = [
  "dashboard",
  "dossiers_lecture",
  "dossiers_ecriture",
  "vehicules_lecture",
  "vehicules_ecriture",
  "offres_lecture",
  "offres_ecriture",
  "offres_prix_achat",
  "offres_marge",
  "fournisseurs_lecture",
  "fournisseurs_ecriture",
  "expeditions_lecture",
  "expeditions_ecriture",
  "facturation_lecture",
  "facturation_ecriture",
  "crm_lecture",
  "crm_ecriture",
  "documents_lecture",
  "documents_ecriture",
  "taches_lecture",
  "taches_ecriture",
  "rapports",
  "utilisateurs",
  "parametres",
];

// ─── Offres ──────────────────────────────────────────────────────────

export const OFFRE_STATUT_LABELS: Record<StatutOffre, string> = {
  disponible: "Disponible",
  reservee: "Réservée",
  vendue: "Vendue",
  expiree: "Expirée",
};

export const OFFRE_STATUT_VARIANTS: Record<StatutOffre, string> = {
  disponible: "green",
  reservee: "amber",
  vendue: "gray",
  expiree: "red",
};

// ─── Facture Statuts ─────────────────────────────────────────────────

export const FACTURE_STATUT_LABELS: Record<StatutFacture, string> = {
  payee: "payée",
  en_attente: "en attente",
  en_retard: "en retard",
  annulee: "annulée",
};

export const FACTURE_STATUT_VARIANTS: Record<StatutFacture, string> = {
  payee: "green",
  en_attente: "amber",
  en_retard: "red",
  annulee: "gray",
};

// ─── Contrat Statuts ─────────────────────────────────────────────────

export const CONTRAT_STATUT_LABELS: Record<StatutContrat, string> = {
  brouillon: "Brouillon",
  signe: "Signé",
  annule: "Annulé",
};

export const CONTRAT_STATUT_VARIANTS: Record<StatutContrat, string> = {
  brouillon: "gray",
  signe: "green",
  annule: "red",
};

// ─── Expédition Statuts ──────────────────────────────────────────────

export const EXPEDITION_STATUT_LABELS: Record<StatutExpedition, string> = {
  planifiee: "Planifiée",
  en_mer: "En mer",
  arrivee: "Arrivée",
  dedouanee: "Dédouanée",
};

export const EXPEDITION_STATUT_VARIANTS: Record<StatutExpedition, string> = {
  planifiee: "gray",
  en_mer: "blue",
  arrivee: "green",
  dedouanee: "green",
};

// ─── Devises ─────────────────────────────────────────────────────────

export const DEVISE_LABELS: Record<Devise, string> = {
  DZD: "DA",
  USD: "$",
  CNY: "¥",
  EUR: "€",
};

export const BASE_DEVISE: Devise = "USD";

// ─── Purchase / Paiement Fournisseur ─────────────────────────────────

export const STATUT_PAIEMENT_LABELS: Record<StatutPaiement, string> = {
  en_attente: "En attente",
  partiel: "Partiel",
  paye: "Payé",
};

export const STATUT_PAIEMENT_VARIANTS: Record<StatutPaiement, string> = {
  en_attente: "amber",
  partiel: "blue",
  paye: "green",
};

// ─── Paiements Client ────────────────────────────────────────────────

export const TYPE_PAIEMENT_CLIENT_LABELS: Record<TypePaiementClient, string> = {
  acompte: "Acompte",
  partiel: "Paiement partiel",
  final: "Solde final",
  shipping: "Paiement shipping",
  douane: "Paiement douane",
  autre: "Autre",
};

// ─── Coûts (Money Out) ───────────────────────────────────────────────

export const TYPE_COUT_LABELS: Record<TypeCout, string> = {
  achat_vehicule: "Achat véhicule",
  acompte_fournisseur: "Acompte fournisseur",
  solde_fournisseur: "Solde fournisseur",
  shipping: "Fret / shipping",
  inspection: "Inspection",
  pickup: "Pickup Chine",
  transport_chine: "Transport Chine",
  port: "Frais port",
  douane: "Douane",
  transport_local: "Transport local",
  autre: "Autre",
};

// ─── Tâches ──────────────────────────────────────────────────────────

export const PRIORITE_TACHE_LABELS: Record<PrioriteTache, string> = {
  basse: "Basse",
  normale: "Normale",
  haute: "Haute",
  urgente: "Urgente",
};

export const PRIORITE_TACHE_VARIANTS: Record<PrioriteTache, string> = {
  basse: "gray",
  normale: "blue",
  haute: "amber",
  urgente: "red",
};

export const STATUT_TACHE_LABELS: Record<StatutTache, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  en_attente: "En attente",
  terminee: "Terminée",
};

export const STATUT_TACHE_VARIANTS: Record<StatutTache, string> = {
  a_faire: "gray",
  en_cours: "blue",
  en_attente: "amber",
  terminee: "green",
};

// ─── Documents (checklist) ───────────────────────────────────────────

export const DOCUMENT_TYPE_LABELS: Record<TypeDocumentDossier, string> = {
  id_client: "Pièce d'identité client",
  contrat: "Contrat signé",
  pi_fournisseur: "Proforma fournisseur",
  facture_fournisseur: "Facture fournisseur",
  preuve_paiement: "Preuve de paiement",
  documents_vehicule: "Documents du véhicule",
  rapport_inspection: "Rapport d'inspection",
  bl_draft: "BL provisoire",
  bl_final: "BL final",
  documents_douane: "Documents douane",
  document_livraison: "Document de livraison",
};

export const DOCUMENT_STATUT_LABELS: Record<StatutDocument, string> = {
  recu: "Reçu",
  manquant: "Manquant",
  en_attente: "En attente",
  valide: "Validé",
  rejete: "Rejeté",
};

export const DOCUMENT_STATUT_VARIANTS: Record<StatutDocument, string> = {
  recu: "green",
  manquant: "red",
  en_attente: "amber",
  valide: "blue",
  rejete: "gray",
};

// ─── Timeline ────────────────────────────────────────────────────────

export const TIMELINE_TYPE_LABELS: Record<TypeTimeline, string> = {
  statut: "Statut",
  paiement: "Paiement",
  document: "Document",
  note: "Note",
  tache: "Tâche",
  systeme: "Système",
};

export const TIMELINE_TYPE_VARIANTS: Record<TypeTimeline, string> = {
  statut: "blue",
  paiement: "green",
  document: "amber",
  note: "gray",
  tache: "amber",
  systeme: "gray",
};

// ─── Sidebar Navigation ─────────────────────────────────────────────

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export const SIDEBAR_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "LayoutDashboard" },
  { label: "CRM / Clients", href: "/crm", icon: "Users" },
  { label: "Call Center", href: "/crm/call-center", icon: "PhoneCall" },
  { label: "Offres Chine", href: "/offres", icon: "PackageSearch" },
  { label: "Dossiers", href: "/dossiers", icon: "FolderOpen" },
  { label: "Véhicules", href: "/vehicules", icon: "Car" },
  { label: "Achats / Suppliers", href: "/fournisseurs", icon: "Handshake" },
  { label: "Logistics / Shipments", href: "/expeditions", icon: "Ship" },
  { label: "Contrats & Encaissements", href: "/facturation", icon: "Receipt" },
  { label: "Finance", href: "/finance", icon: "DollarSign" },
  { label: "Documents", href: "/documents", icon: "FileText" },
  { label: "Tasks", href: "/tasks", icon: "CheckSquare" },
  { label: "Notifications", href: "/notifications", icon: "Bell" },
  { label: "Reports", href: "/rapports", icon: "BarChart3" },
  { label: "Users & Roles", href: "/utilisateurs", icon: "UserCog" },
  { label: "Settings", href: "/parametres", icon: "Settings" },
];

// ─── Dossier Detail Tabs ─────────────────────────────────────────────

export const DOSSIER_TABS: TabItem[] = [
  { key: "overview", label: "Vue d\u2019ensemble" },
  { key: "client", label: "Client" },
  { key: "vehicles", label: "Véhicules" },
  { key: "purchase", label: "Achat" },
  { key: "shipping", label: "Shipping" },
  { key: "finance", label: "Finance" },
  { key: "documents", label: "Documents" },
  { key: "preuves", label: "Photos & preuves" },
  { key: "tasks", label: "Tâches" },
  { key: "timeline", label: "Timeline" },
  { key: "notes", label: "Notes" },
];

// ─── CRM / Client Profile Tabs ────────────────────────────────────────

export const CLIENT_PROFILE_TABS: TabItem[] = [
  { key: "overview", label: "Vue d\u2019ensemble" },
  { key: "dossiers", label: "Dossiers" },
  { key: "vehicles", label: "Véhicules" },
  { key: "payments", label: "Paiements" },
  { key: "documents", label: "Documents" },
  { key: "activities", label: "Activités" },
  { key: "notes", label: "Notes" },
];

// ─── Formatting Helpers ──────────────────────────────────────────────

export function formatMontant(value: number): string {
  return (
    new Intl.NumberFormat(getRuntimeLocale(), {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value) + " DA"
  );
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat(getRuntimeLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function dossierVehiculesSummary(vehicles: Vehicule[]): string {
  if (vehicles.length === 0) return "—";
  return vehicles.map((v) => `${v.marque} ${v.modele} ${v.annee}`).join(", ");
}

export function formatOffrePrix(value: number, devise: string): string {
  return (
    new Intl.NumberFormat(getRuntimeLocale(), {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value) +
    " " +
    devise
  );
}

export function formatMontantDevise(montant: number, devise: Devise): string {
  const value = new Intl.NumberFormat(getRuntimeLocale(), {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(montant);
  return `${DEVISE_LABELS[devise]}${value}`;
}

function enBase(
  montant: number,
  devise: Devise,
  tauxChange: number | null,
): number {
  if (devise === BASE_DEVISE) return montant;
  return tauxChange ? montant * tauxChange : montant;
}

export interface DossierFinance {
  revenu: number;
  cout_total: number;
  marge: number;
  marge_pct: number;
}

export function computeDossierFinance(
  dossier: Pick<Dossier, "paiements_client" | "couts">,
): DossierFinance {
  const revenu = dossier.paiements_client.reduce(
    (sum: number, p: PaiementClient) =>
      sum + enBase(p.montant, p.devise, p.taux_change),
    0,
  );
  const cout_total = dossier.couts.reduce(
    (sum: number, c: Cout) => sum + enBase(c.montant, c.devise, c.taux_change),
    0,
  );
  const marge = revenu - cout_total;
  const marge_pct = revenu > 0 ? Math.round((marge / revenu) * 100) : 0;
  return { revenu, cout_total, marge, marge_pct };
}
