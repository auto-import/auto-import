/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck Legacy mock implementation retained only as an exported reference.
'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Topbar, StatusBadge } from '@/components';
import {
  CLIENT_PROFILE_TABS,
  TYPE_CLIENT_LABELS,
  TYPE_ACTIVITE_LABELS,
  DOSSIER_STATUT_LABELS,
} from '@/lib/constants';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  DollarSign,
  FolderOpen,
  Car,
  Clock,
  User,
  Building2,
  MessageSquare,
  FileText,
  Edit,
} from 'lucide-react';

export { default } from '@/components/crm/ClientProfileWorkspace';

const getClientCRMById = (_id: string): never | undefined => undefined;
const getDossiersByClient = (_id: string): never[] => [];
const getVehiculesByClient = (_id: string): never[] => [];
const getPaiementsByClient = (_id: string): never[] => [];
const getActivitesByClient = (_id: string): never[] => [];
const utilisateurs: never[] = [];

interface ClientProfilePageProps {
  params: Promise<{ id: string }>;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatMontant(value: number): string {
  return `$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)}`;
}

function formatMontantDA(value: number): string {
  return `${new Intl.NumberFormat('fr-DZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)} DA`;
}

const STATUT_CLIENT_VARIANTS: Record<string, string> = {
  actif: 'green',
  inactif: 'gray',
  suspendu: 'red',
};

const STATUT_CLIENT_LABELS: Record<string, string> = {
  actif: 'Actif',
  inactif: 'Inactif',
  suspendu: 'Suspendu',
};

const TYPE_ACTIVITE_ICONS: Record<string, string> = {
  appel: '📞',
  whatsapp: '💬',
  email: '✉️',
  reunion: '🤝',
  note: '📝',
  offre: '💰',
  suivi: '👁️',
};

function getInitials(prenom: string, nom: string): string {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
}

export function LegacyClientProfilePage({ params }: ClientProfilePageProps) {
  const { id } = React.use(params);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('overview');

  const client = getClientCRMById(id);
  const dossiers = useMemo(() => (client ? getDossiersByClient(client.id) : []), [client]);
  const vehicules = useMemo(() => (client ? getVehiculesByClient(client.id) : []), [client]);
  const paiements = useMemo(() => (client ? getPaiementsByClient(client.id) : []), [client]);
  const activites = useMemo(() => (client ? getActivitesByClient(client.id) : []), [client]);

  const vendeur = client
    ? utilisateurs.find((u) => u.id === client.assigne_a)
    : undefined;

  const dossiersCompletes = dossiers.filter(
    (d) => d.statut === 'cloture' || d.statut === 'service_termine',
  ).length;
  const dossiersActifs = dossiers.length - dossiersCompletes;

  if (!client) {
    return (
      <>
        <Topbar title="Client introuvable" />
        <div className="p-8">
          <p className="text-muted text-sm">Ce client n&apos;existe pas.</p>
          <button
            onClick={() => router.push('/crm/clients')}
            className="mt-4 text-sm font-medium text-status-blue-text hover:underline"
          >
            ← Retour aux clients
          </button>
        </div>
      </>
    );
  }

  const recentActivities = activites.slice(0, 5);
  const lastContact = client.date_derniere_activite
    ? formatDate(client.date_derniere_activite)
    : '—';
  const nextFollowup = client.date_prochain_suivi
    ? formatDate(client.date_prochain_suivi)
    : '—';

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card">
              <h3 className="section-title">Informations client</h3>
              <div className="space-y-4">
                <div>
                  <p className="field-label">Type</p>
                  <p className="field-value">{TYPE_CLIENT_LABELS[client.type_client]}</p>
                </div>
                <div>
                  <p className="field-label">Téléphone</p>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted" />
                    <p className="field-value">{client.telephone}</p>
                  </div>
                </div>
                {client.whatsapp && (
                  <div>
                    <p className="field-label">WhatsApp</p>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-muted" />
                      <p className="field-value">{client.whatsapp}</p>
                    </div>
                  </div>
                )}
                {client.email && (
                  <div>
                    <p className="field-label">Email</p>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted" />
                      <p className="field-value">{client.email}</p>
                    </div>
                  </div>
                )}
                {client.ville && (
                  <div>
                    <p className="field-label">Ville</p>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted" />
                      <p className="field-value">{client.ville}</p>
                    </div>
                  </div>
                )}
                {client.societe_nom && (
                  <div>
                    <p className="field-label">Société</p>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted" />
                      <p className="field-value">{client.societe_nom}</p>
                    </div>
                  </div>
                )}
                <div>
                  <p className="field-label">Vendeur assigné</p>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted" />
                    <p className="field-value">
                      {vendeur ? `${vendeur.prenom} ${vendeur.nom}` : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="section-title">Situation actuelle</h3>
              <div className="space-y-4">
                <div>
                  <p className="field-label">Dossiers actifs</p>
                  <p className="field-value">{dossiersActifs}</p>
                </div>
                <div>
                  <p className="field-label">Solde dû</p>
                  <p
                    className={`field-value ${client.solde_du && client.solde_du > 0 ? 'text-status-red-text' : ''}`}
                  >
                    {client.solde_du ? formatMontant(client.solde_du) : '—'}
                  </p>
                </div>
                <div>
                  <p className="field-label">Dernier contact</p>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted" />
                    <p className="field-value">{lastContact}</p>
                  </div>
                </div>
                <div>
                  <p className="field-label">Prochain suivi</p>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted" />
                    <p className="field-value">{nextFollowup}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="section-title">Activité récente</h3>
              <div className="space-y-3">
                {recentActivities.length === 0 && (
                  <p className="text-sm text-muted">Aucune activité récente.</p>
                )}
                {recentActivities.map((act) => (
                  <div
                    key={act.id}
                    className="flex items-start gap-3 rounded-card border border-border p-3"
                  >
                    <span className="text-lg leading-none mt-0.5">
                      {TYPE_ACTIVITE_ICONS[act.type] || '📌'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground line-clamp-2">{act.description}</p>
                      <p className="text-xs text-muted mt-1">{formatDate(act.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'dossiers':
        return (
          <div className="card">
            <h3 className="section-title">Dossiers du client</h3>
            {dossiers.length === 0 ? (
              <p className="text-sm text-muted">Aucun dossier pour ce client.</p>
            ) : (
              <div className="space-y-3">
                {dossiers.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => router.push(`/dossiers/${d.id}`)}
                    className="flex items-center justify-between rounded-card border border-border p-4 hover:bg-surface cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-blue-bg">
                        <FolderOpen className="w-5 h-5 text-status-blue-text" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{d.reference}</p>
                        <p className="text-xs text-muted mt-0.5">
                          {d.vehicles.length > 0
                            ? d.vehicles
                                .map((v) => `${v.marque} ${v.modele}`)
                                .join(', ')
                            : 'Aucun véhicule'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge
                        variant={
                          d.type === 'cif'
                            ? 'blue'
                            : d.type === 'ddp'
                              ? 'amber'
                              : 'gray'
                        }
                        label={d.type.toUpperCase()}
                        size="sm"
                      />
                      <StatusBadge
                        variant={
                          d.statut === 'cloture' || d.statut === 'service_termine'
                            ? 'green'
                            : d.statut === 'en_transit'
                              ? 'blue'
                              : 'amber'
                        }
                        label={DOSSIER_STATUT_LABELS[d.statut]}
                        size="sm"
                      />
                      <span className="text-xs text-muted">{formatDate(d.date_creation)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'vehicles':
        return (
          <div className="card">
            <h3 className="section-title">Véhicules du client</h3>
            {vehicules.length === 0 ? (
              <p className="text-sm text-muted">Aucun véhicule pour ce client.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {vehicules.map((v) => (
                  <div
                    key={v.id}
                    className="rounded-card border border-border overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div className="h-40 bg-surface flex items-center justify-center">
                      {v.photos && v.photos.length > 0 ? (
                        <img
                          src={v.photos[0]}
                          alt={`${v.marque} ${v.modele}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Car className="w-12 h-12 text-muted" />
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm">
                            {v.marque} {v.modele}
                          </p>
                          <p className="text-xs text-muted">{v.annee}</p>
                        </div>
                        <StatusBadge
                          variant={
                            v.source === 'external'
                              ? 'gray'
                              : v.statut === 'disponible'
                                ? 'green'
                                : v.statut === 'en_mer'
                                  ? 'blue'
                                  : v.statut === 'livre' || v.statut === 'vendu'
                                    ? 'gray'
                                    : 'amber'
                          }
                          label={
                            v.source === 'external'
                              ? 'Externe'
                              : v.statut.charAt(0).toUpperCase() + v.statut.slice(1).replace('_', ' ')
                          }
                          size="sm"
                        />
                      </div>
                      {v.vin && (
                        <p className="text-xs text-muted mt-2">VIN: {v.vin}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'payments':
        return (
          <div className="card">
            <h3 className="section-title">Paiements du client</h3>
            {paiements.length === 0 ? (
              <p className="text-sm text-muted">Aucun paiement pour ce client.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 font-medium text-muted">Date</th>
                        <th className="text-left py-3 px-4 font-medium text-muted">Type</th>
                        <th className="text-right py-3 px-4 font-medium text-muted">Montant</th>
                        <th className="text-left py-3 px-4 font-medium text-muted">Devise</th>
                        <th className="text-left py-3 px-4 font-medium text-muted">Méthode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paiements.map((p) => (
                        <tr key={p.id} className="border-b border-border-light">
                          <td className="py-3 px-4">{formatDate(p.date)}</td>
                          <td className="py-3 px-4">
                            <StatusBadge variant="blue" label={p.type} size="sm" />
                          </td>
                          <td className="py-3 px-4 text-right font-medium">
                            {p.devise === 'DZD' ? formatMontantDA(p.montant) : formatMontant(p.montant)}
                          </td>
                          <td className="py-3 px-4">{p.devise}</td>
                          <td className="py-3 px-4">{p.methode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <span className="text-sm font-medium text-muted">Total</span>
                  <span className="text-lg font-bold">
                    {formatMontant(
                      paiements.reduce((sum, p) => {
                        const rate = p.devise === 'DZD' ? 0.0077 : 1;
                        return sum + p.montant * rate;
                      }, 0),
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
        );

      case 'documents':
        return (
          <div className="card">
            <h3 className="section-title">Documents du client</h3>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-muted" />
              </div>
              <p className="text-sm font-medium text-foreground">Documents du client</p>
              <p className="text-sm text-muted mt-1 max-w-sm">
                Les documents du client (pièce d&apos;identité, contrat signé, etc.) sont gérés au
                niveau de chaque dossier.
              </p>
              <button
                onClick={() => {
                  if (dossiers.length > 0) {
                    router.push(`/dossiers/${dossiers[0].id}`);
                  }
                }}
                className="mt-4 px-4 py-2 text-sm font-medium border border-border rounded-button hover:bg-surface transition-colors"
              >
                Voir les documents des dossiers
              </button>
            </div>
          </div>
        );

      case 'activities':
        return (
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h3 className="section-title mb-0">Activités</h3>
              <button className="px-4 py-2 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity">
                Ajouter une activité
              </button>
            </div>
            {activites.length === 0 ? (
              <p className="text-sm text-muted">Aucune activité pour ce client.</p>
            ) : (
              <div className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
                <div className="space-y-6">
                  {activites.map((act) => (
                    <div key={act.id} className="relative flex items-start gap-4">
                      <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-surface border border-border text-lg">
                        {TYPE_ACTIVITE_ICONS[act.type] || '📌'}
                      </div>
                      <div className="flex-1 rounded-card border border-border p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusBadge variant="blue" label={TYPE_ACTIVITE_LABELS[act.type]} size="sm" />
                          <span className="text-xs text-muted">{formatDate(act.date)}</span>
                        </div>
                        <p className="text-sm text-foreground">{act.description}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted">
                          <User className="w-3 h-3" />
                          {(() => {
                            const user = utilisateurs.find((u) => u.id === act.utilise_par);
                            return user ? `${user.prenom} ${user.nom}` : act.utilise_par;
                          })()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'notes':
        return (
          <div className="card">
            <h3 className="section-title">Notes</h3>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mb-4">
                <Edit className="w-8 h-8 text-muted" />
              </div>
              <p className="text-sm font-medium text-foreground">Notes du client</p>
              <p className="text-sm text-muted mt-1 max-w-sm">
                Les notes et commentaires internes concernant ce client seront affichés ici.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Topbar title="Profil client" />
      <div className="p-8 space-y-6">
        <button
          onClick={() => router.push('/crm/clients')}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux clients
        </button>

        <div className="card">
          <div className="flex items-start gap-6">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-status-blue-bg text-2xl font-bold text-status-blue-text">
              {getInitials(client.prenom, client.nom)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-bold">
                  {client.prenom} {client.nom}
                </h2>
                <StatusBadge
                  variant={STATUT_CLIENT_VARIANTS[client.statut] || 'gray'}
                  label={STATUT_CLIENT_LABELS[client.statut] || client.statut}
                />
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <Building2 className="w-4 h-4" />
                  {TYPE_CLIENT_LABELS[client.type_client]}
                </span>
                {client.ville && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {client.ville}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-4 h-4" />
                  {client.telephone}
                </span>
                {client.whatsapp && (
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="w-4 h-4" />
                    WhatsApp
                  </span>
                )}
                {client.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="w-4 h-4" />
                    {client.email}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-3 text-sm flex-wrap">
                {vendeur && (
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-status-blue-bg text-xs font-semibold text-status-blue-text">
                      {vendeur.avatar_initials}
                    </div>
                    <span className="text-muted">
                      {vendeur.prenom} {vendeur.nom}
                    </span>
                  </div>
                )}
                <span className="inline-flex items-center gap-1 text-muted">
                  <Calendar className="w-4 h-4" />
                  Client depuis {formatDate(client.date_inscription)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="card text-center">
            <div className="flex items-center justify-center mb-2">
              <FolderOpen className="w-5 h-5 text-muted" />
            </div>
            <p className="text-2xl font-bold">{dossiers.length}</p>
            <p className="text-xs text-muted mt-1">Dossiers</p>
          </div>
          <div className="card text-center">
            <div className="flex items-center justify-center mb-2">
              <Car className="w-5 h-5 text-muted" />
            </div>
            <p className="text-2xl font-bold">{vehicules.length}</p>
            <p className="text-xs text-muted mt-1">Véhicules</p>
          </div>
          <div className="card text-center">
            <div className="flex items-center justify-center mb-2">
              <DollarSign className="w-5 h-5 text-muted" />
            </div>
            <p className="text-2xl font-bold">{formatMontant(client.revenu_total || 0)}</p>
            <p className="text-xs text-muted mt-1">Revenu total</p>
          </div>
          <div className="card text-center">
            <div className="flex items-center justify-center mb-2">
              <DollarSign className="w-5 h-5 text-status-red-text" />
            </div>
            <p className={`text-2xl font-bold ${client.solde_du && client.solde_du > 0 ? 'text-status-red-text' : ''}`}>
              {client.solde_du ? formatMontant(client.solde_du) : '$0'}
            </p>
            <p className="text-xs text-muted mt-1">Solde dû</p>
          </div>
          <div className="card text-center">
            <div className="flex items-center justify-center mb-2">
              <Clock className="w-5 h-5 text-status-green-text" />
            </div>
            <p className="text-2xl font-bold text-status-green-text">{dossiersCompletes}</p>
            <p className="text-xs text-muted mt-1">Complétés</p>
          </div>
          <div className="card text-center">
            <div className="flex items-center justify-center mb-2">
              <FolderOpen className="w-5 h-5 text-status-blue-text" />
            </div>
            <p className="text-2xl font-bold text-status-blue-text">{dossiersActifs}</p>
            <p className="text-xs text-muted mt-1">Actifs</p>
          </div>
        </div>

        <div className="card">
          <div className="flex gap-1 border-b border-border -mx-6 px-6 overflow-x-auto">
            {CLIENT_PROFILE_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="mt-6">{renderTabContent()}</div>
        </div>
      </div>
    </>
  );
}
