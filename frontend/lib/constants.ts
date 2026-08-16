import type { StatutDossier, StatutVehicule, StatutFacture, StatutContrat, StatutExpedition, TabItem } from '@/types';

// ─── Dossier Statuts (ordered for stepper) ───────────────────────────

export const DOSSIER_STATUTS: StatutDossier[] = [
  'nouveau',
  'recherche_vehicule',
  'achat_confirme',
  'en_mer',
  'douane',
  'livre',
  'cloture',
];

export const DOSSIER_STATUT_LABELS: Record<StatutDossier, string> = {
  nouveau: 'Nouveau',
  recherche_vehicule: 'Recherche véhicule',
  achat_confirme: 'Achat confirmé',
  en_mer: 'En mer',
  douane: 'Douane',
  livre: 'Livré',
  cloture: 'Clôturé',
};

export const DOSSIER_STATUT_VARIANTS: Record<StatutDossier, string> = {
  nouveau: 'blue',
  recherche_vehicule: 'blue',
  achat_confirme: 'blue',
  en_mer: 'blue',
  douane: 'amber',
  livre: 'green',
  cloture: 'gray',
};

// ─── Véhicule Statuts ────────────────────────────────────────────────

export const VEHICULE_STATUT_LABELS: Record<StatutVehicule, string> = {
  disponible: 'Disponible',
  reserve: 'Réservé',
  en_mer: 'En mer',
  en_douane: 'En douane',
  livre: 'Livré',
  vendu: 'Vendu',
};

export const VEHICULE_STATUT_VARIANTS: Record<StatutVehicule, string> = {
  disponible: 'green',
  reserve: 'amber',
  en_mer: 'blue',
  en_douane: 'amber',
  livre: 'green',
  vendu: 'gray',
};

// ─── Facture Statuts ─────────────────────────────────────────────────

export const FACTURE_STATUT_LABELS: Record<StatutFacture, string> = {
  payee: 'payée',
  en_attente: 'en attente',
  en_retard: 'en retard',
  annulee: 'annulée',
};

export const FACTURE_STATUT_VARIANTS: Record<StatutFacture, string> = {
  payee: 'green',
  en_attente: 'amber',
  en_retard: 'red',
  annulee: 'gray',
};

// ─── Contrat Statuts ─────────────────────────────────────────────────

export const CONTRAT_STATUT_LABELS: Record<StatutContrat, string> = {
  brouillon: 'Brouillon',
  signe: 'Signé',
  annule: 'Annulé',
};

export const CONTRAT_STATUT_VARIANTS: Record<StatutContrat, string> = {
  brouillon: 'gray',
  signe: 'green',
  annule: 'red',
};

// ─── Expédition Statuts ──────────────────────────────────────────────

export const EXPEDITION_STATUT_LABELS: Record<StatutExpedition, string> = {
  planifiee: 'Planifiée',
  en_mer: 'En mer',
  arrivee: 'Arrivée',
  dedouanee: 'Dédouanée',
};

export const EXPEDITION_STATUT_VARIANTS: Record<StatutExpedition, string> = {
  planifiee: 'gray',
  en_mer: 'blue',
  arrivee: 'green',
  dedouanee: 'green',
};

// ─── Sidebar Navigation ─────────────────────────────────────────────

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export const SIDEBAR_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: 'LayoutDashboard' },
  { label: 'Véhicules / Stock', href: '/vehicules', icon: 'Car' },
  { label: 'Dossiers', href: '/dossiers', icon: 'FolderOpen' },
  { label: 'Fournisseurs', href: '/fournisseurs', icon: 'Handshake' },
  { label: 'Expéditions maritimes', href: '/expeditions', icon: 'Ship' },
  { label: 'Facturation & paiements', href: '/facturation', icon: 'Receipt' },
  { label: 'Clients', href: '/clients', icon: 'Users' },
  { label: 'Notifications', href: '/notifications', icon: 'Bell' },
  { label: 'Utilisateurs & rôles', href: '/utilisateurs', icon: 'UserCog' },
  { label: 'Rapports', href: '/rapports', icon: 'BarChart3' },
  { label: 'Paramètres', href: '/parametres', icon: 'Settings' },
];

// ─── Dossier Detail Tabs ─────────────────────────────────────────────

export const DOSSIER_TABS: TabItem[] = [
  { key: 'client', label: 'Client' },
  { key: 'vehicule', label: 'Véhicule' },
  { key: 'paiements', label: 'Paiements' },
  { key: 'documents', label: 'Documents' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'douane', label: 'Douane' },
  { key: 'historique', label: 'Historique' },
];

// ─── Formatting Helpers ──────────────────────────────────────────────

export function formatMontant(value: number): string {
  return new Intl.NumberFormat('fr-DZ', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + ' DA';
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
