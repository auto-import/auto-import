'use client';

import { useState } from 'react';
import {
  X,
  Phone,
  Mail,
  MapPin,
  Calendar,
  DollarSign,
  Car,
  User,
  Tag,
  Clock,
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { LEAD_STATUT_LABELS, LEAD_SOURCE_LABELS, LEAD_STATUT_VARIANTS } from '@/lib/constants';
import { utilisateurs, activites, convertLeadToClient, updateLeadStatut, createActivite } from '@/lib/mockData';
import { StatusBadge } from '@/components';
import type { Lead, StatutLead, TypeClient } from '@/types';

interface LeadDetailModalProps {
  lead: Lead;
  onClose: () => void;
  onUpdated: () => void;
}

const STATUT_FLOW: StatutLead[] = ['nouveau', 'contacte', 'interesse', 'qualification', 'offre_envoyee', 'negociation', 'gagne', 'perdu'];

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  appel: Phone,
  whatsapp: MessageSquare,
  email: Mail,
  reunion: User,
  note: Tag,
  offre: DollarSign,
  suivi: Clock,
};

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-card border border-border">
      <Icon className="w-4 h-4 text-muted mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium mt-0.5">{value || '—'}</p>
      </div>
    </div>
  );
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export default function LeadDetailModal({ lead, onClose, onUpdated }: LeadDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'activites'>('details');
  const [noteText, setNoteText] = useState('');
  const [showConvertPanel, setShowConvertPanel] = useState(false);
  const [convertType, setConvertType] = useState<TypeClient>('particulier');

  const assigne = utilisateurs.find((u) => u.id === lead.assigne_a);
  const leadActivites = activites.filter((a) => a.lead_id === lead.id).sort((a, b) => (a.date < b.date ? 1 : -1));

  const currentStepIndex = STATUT_FLOW.indexOf(lead.statut);
  const nextStatus = lead.statut !== 'gagne' && lead.statut !== 'perdu'
    ? STATUT_FLOW[currentStepIndex + 1]
    : null;

  const handleAdvance = () => {
    if (!nextStatus) return;
    updateLeadStatut(lead.id, nextStatus);
    onUpdated();
  };

  const handleMarkLost = () => {
    updateLeadStatut(lead.id, 'perdu');
    onUpdated();
  };

  const handleConvert = () => {
    convertLeadToClient(lead.id);
    setShowConvertPanel(false);
    onUpdated();
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    createActivite({
      client_id: '',
      lead_id: lead.id,
      type: 'note',
      description: noteText.trim(),
      utilise_par: lead.assigne_a,
    });
    setNoteText('');
    onUpdated();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto card rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur px-6 py-4 border-b border-border flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-status-blue-bg flex items-center justify-center shrink-0">
                <User className="w-6 h-6 text-status-blue-text" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-bold truncate">{lead.prenom} {lead.nom}</h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <StatusBadge
                    variant={LEAD_STATUT_VARIANTS[lead.statut]}
                    label={LEAD_STATUT_LABELS[lead.statut]}
                    size="sm"
                  />
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-surface border border-border">
                    {LEAD_SOURCE_LABELS[lead.source]}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-3 overflow-x-auto">
              {STATUT_FLOW.map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                      i < currentStepIndex
                        ? 'bg-status-green-bg text-status-green-text'
                        : i === currentStepIndex
                          ? 'bg-status-blue-bg text-status-blue-text ring-2 ring-status-blue-border'
                          : 'bg-surface text-muted'
                    }`}
                  >
                    {i < currentStepIndex ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  {i < STATUT_FLOW.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-muted shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-button hover:bg-surface transition-colors shrink-0"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'details'
                ? 'text-foreground border-b-2 border-foreground'
                : 'text-muted hover:text-foreground'
            }`}
          >
            Détails
          </button>
          <button
            onClick={() => setActiveTab('activites')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'activites'
                ? 'text-foreground border-b-2 border-foreground'
                : 'text-muted hover:text-foreground'
            }`}
          >
            Activités ({leadActivites.length})
          </button>
        </div>

        {activeTab === 'details' && (
          <div className="px-6 py-6 space-y-6">
            <div>
              <h4 className="section-title mb-3">Informations de contact</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <InfoRow icon={Phone} label="Téléphone" value={lead.telephone} />
                <InfoRow icon={MessageSquare} label="WhatsApp" value={lead.whatsapp || ''} />
                <InfoRow icon={Mail} label="Email" value={lead.email || ''} />
                <InfoRow icon={MapPin} label="Ville" value={lead.ville || ''} />
              </div>
            </div>

            <div>
              <h4 className="section-title mb-3">Informations commerciales</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <InfoRow icon={Tag} label="Source" value={LEAD_SOURCE_LABELS[lead.source]} />
                <InfoRow icon={Car} label="Type dossier attendu" value={lead.type_dossier_attendu?.toUpperCase() || '—'} />
                <InfoRow icon={Car} label="Véhicule d'intérêt" value={lead.vehicule_interet || ''} />
                <InfoRow icon={DollarSign} label="Valeur attendue" value={lead.valeur_attendue ? `${lead.valeur_attendue.toLocaleString('fr-FR')} ${lead.devise_attendue || ''}` : ''} />
              </div>
              <div className="mt-3 flex items-center gap-3 px-3 py-2.5 rounded-card border border-border">
                <div className="w-7 h-7 rounded-full bg-status-blue-bg flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-status-blue-text">
                    {assigne?.avatar_initials || '—'}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted uppercase tracking-wide">Assigné à</p>
                  <p className="text-sm font-medium mt-0.5">
                    {assigne ? `${assigne.prenom} ${assigne.nom}` : '—'}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="section-title mb-3">Suivi</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <InfoRow icon={Clock} label="Date dernier contact" value={lead.date_dernier_contact ? formatDate(lead.date_dernier_contact) : ''} />
                <InfoRow icon={Calendar} label="Date prochain suivi" value={lead.date_prochain_suivi ? formatDate(lead.date_prochain_suivi) : ''} />
              </div>
              {lead.raison_suivi && (
                <div className="mt-2 px-4 py-3 rounded-card bg-status-amber-bg border border-status-amber-text/30">
                  <p className="text-[11px] text-muted uppercase tracking-wide">Raison du suivi</p>
                  <p className="text-sm mt-0.5">{lead.raison_suivi}</p>
                </div>
              )}
            </div>

            {lead.notes && (
              <div>
                <h4 className="section-title mb-3">Notes</h4>
                <div className="px-4 py-3 rounded-card bg-surface border border-border">
                  <p className="text-sm">{lead.notes}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'activites' && (
          <div className="px-6 py-6">
            <div className="mb-4">
              <h4 className="section-title mb-3">Ajouter une note</h4>
              <div className="flex gap-2">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Écrire une note..."
                  className="flex-1 px-3 py-2 text-sm rounded-card border border-border bg-background resize-none"
                  rows={2}
                />
                <button
                  onClick={handleAddNote}
                  disabled={!noteText.trim()}
                  className="px-4 py-2 text-sm font-medium rounded-button bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shrink-0 self-end"
                >
                  Ajouter
                </button>
              </div>
            </div>

            {leadActivites.length === 0 ? (
              <div className="card p-6 text-center text-sm text-muted">
                Aucune activité enregistrée
              </div>
            ) : (
              <div className="space-y-4">
                {leadActivites.map((act) => {
                  const IconComp = ACTIVITY_ICONS[act.type] || Tag;
                  const utilisateur = utilisateurs.find((u) => u.id === act.utilise_par);
                  return (
                    <div key={act.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center shrink-0 mt-0.5">
                        <IconComp className="w-4 h-4 text-muted" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium capitalize">{act.type}</span>
                          <span className="text-xs text-muted">par {utilisateur ? `${utilisateur.prenom} ${utilisateur.nom}` : '—'}</span>
                          <span className="text-xs text-muted">· {formatDateTime(act.date)}</span>
                        </div>
                        <p className="text-sm text-muted mt-1">{act.description}</p>
                        {act.date_prochain_suivi && (
                          <p className="text-xs text-muted mt-1">
                            Prochain suivi : {formatDate(act.date_prochain_suivi)}
                            {act.raison_suivi && ` — ${act.raison_suivi}`}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {showConvertPanel && (
          <div className="px-6 pb-4 border-t border-border pt-4">
            <h4 className="section-title mb-3">Convertir en client</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              {(['particulier', 'revendeur', 'importateur', 'societe'] as TypeClient[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setConvertType(t)}
                  className={`px-3 py-2.5 text-sm font-medium rounded-card border transition-colors capitalize ${
                    convertType === t
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border hover:bg-surface'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleConvert}
                className="px-4 py-2 text-sm font-medium rounded-button bg-status-green-bg text-status-green-text border border-status-green-border hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirmer la conversion
              </button>
              <button
                onClick={() => setShowConvertPanel(false)}
                className="px-4 py-2 text-sm font-medium border border-border rounded-button hover:bg-surface transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        <div className="px-6 py-4 border-t border-border flex items-center gap-2 flex-wrap">
          {nextStatus && (
            <button
              onClick={handleAdvance}
              className="px-4 py-2 text-sm font-medium rounded-button bg-status-blue-bg text-status-blue-text border border-status-blue-border hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              Avancer → {LEAD_STATUT_LABELS[nextStatus]}
            </button>
          )}
          {lead.statut !== 'perdu' && lead.statut !== 'gagne' && (
            <button
              onClick={handleMarkLost}
              className="px-4 py-2 text-sm font-medium rounded-button bg-status-red-bg text-status-red-text border border-status-red-border hover:opacity-90 transition-opacity"
            >
              Marquer perdu
            </button>
          )}
          {lead.statut === 'gagne' && !lead.client_id && (
            <button
              onClick={() => setShowConvertPanel(true)}
              className="px-4 py-2 text-sm font-medium rounded-button bg-status-green-bg text-status-green-text border border-status-green-border hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Convertir en client
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
