/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck Legacy mock implementation retained only as an exported reference.
'use client';

import { useState, useMemo } from 'react';
import { Topbar } from '@/components';
import {
  LEAD_STATUT_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_PIPELINE_STAGES,
} from '@/lib/constants';
import type { Lead, StatutLead } from '@/types';
import {
  Search,
  Plus,
  Calendar,
  DollarSign,
  Car,
  ChevronRight,
} from 'lucide-react';
import LeadDetailModal from '@/components/LeadDetailModal';
import LeadFormModal from '@/components/LeadFormModal';

export { default } from '@/components/crm/LeadsWorkspace';

const leads: Lead[] = [];
const utilisateurs: Array<{ id: string; avatar_initials: string }> = [];
const getLeadsParStatut = (): Record<StatutLead, number> => ({
  nouveau: 0, contacte: 0, interesse: 0, qualification: 0,
  offre_envoyee: 0, negociation: 0, gagne: 0, perdu: 0,
});

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const assigne = utilisateurs.find((u) => u.id === lead.assigne_a);
  return (
    <div
      onClick={onClick}
      className="p-3 rounded-card border border-border bg-background hover:shadow-md transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm group-hover:text-status-blue-text transition-colors">
            {lead.prenom} {lead.nom}
          </p>
          <p className="text-xs text-muted mt-0.5">
            {LEAD_SOURCE_LABELS[lead.source]}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {lead.vehicule_interet && (
        <div className="flex items-center gap-1.5 mt-2 text-xs text-muted">
          <Car className="w-3 h-3" />
          <span className="truncate">{lead.vehicule_interet}</span>
        </div>
      )}

      {lead.valeur_attendue && (
        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted">
          <DollarSign className="w-3 h-3" />
          <span>
            {lead.valeur_attendue.toLocaleString('en-US')}{' '}
            {lead.devise_attendue || 'USD'}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
        <div className="flex items-center gap-1.5">
          {lead.date_prochain_suivi && (
            <div className="flex items-center gap-1 text-[11px] text-status-amber-text">
              <Calendar className="w-3 h-3" />
              <span>{new Date(lead.date_prochain_suivi).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
            </div>
          )}
        </div>
        {assigne && (
          <div className="w-6 h-6 rounded-full bg-status-blue-bg flex items-center justify-center text-[10px] font-bold text-status-blue-text">
            {assigne.avatar_initials}
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({
  statut,
  leads: columnLeads,
  onSelectLead,
}: {
  statut: StatutLead;
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
}) {
  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px]">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{LEAD_STATUT_LABELS[statut]}</h3>
          <span className="inline-flex items-center justify-center w-5 h-5 text-[11px] font-medium rounded-full bg-surface text-muted">
            {columnLeads.length}
          </span>
        </div>
      </div>
      <div className="flex-1 space-y-2 p-2 rounded-card bg-surface/50 min-h-[200px]">
        {columnLeads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onClick={() => onSelectLead(lead)} />
        ))}
        {columnLeads.length === 0 && (
          <div className="text-center text-xs text-muted py-8">
            Aucun lead
          </div>
        )}
      </div>
    </div>
  );
}

export function LegacyLeadsPage() {
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [, setRefresh] = useState(0);

  const filtered = useMemo(() => {
    if (!search) return leads;
    const q = search.toLowerCase();
    return leads.filter(
      (l) =>
        l.nom.toLowerCase().includes(q) ||
        l.prenom.toLowerCase().includes(q) ||
        l.telephone.includes(q) ||
        l.vehicule_interet?.toLowerCase().includes(q)
    );
  }, [search]);

  const leadsParStatut = useMemo(() => {
    const grouped: Record<StatutLead, Lead[]> = {
      nouveau: [], contacte: [], interesse: [], qualification: [],
      offre_envoyee: [], negociation: [], gagne: [], perdu: [],
    };
    filtered.forEach((l) => {
      grouped[l.statut].push(l);
    });
    return grouped;
  }, [filtered]);

  const stats = useMemo(() => {
    const counts = getLeadsParStatut();
    const totalValue = leads.reduce((sum, l) => sum + (l.valeur_attendue || 0), 0);
    return {
      total: leads.length,
      actifs: leads.filter((l) => l.statut !== 'gagne' && l.statut !== 'perdu').length,
      gagnes: counts.gagne,
      perdus: counts.perdu,
      valeur_totale: totalValue,
    };
  }, []);

  return (
    <>
      <Topbar title="Leads" subtitle="Pipeline commercial — CRM" />
      <div className="p-8 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="px-4 py-3 rounded-card border border-border text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-[11px] text-muted mt-1">Total leads</p>
          </div>
          <div className="px-4 py-3 rounded-card border border-border text-center">
            <p className="text-2xl font-bold text-status-blue-text">{stats.actifs}</p>
            <p className="text-[11px] text-muted mt-1">En cours</p>
          </div>
          <div className="px-4 py-3 rounded-card border border-border text-center">
            <p className="text-2xl font-bold text-status-green-text">{stats.gagnes}</p>
            <p className="text-[11px] text-muted mt-1">Gagnés</p>
          </div>
          <div className="px-4 py-3 rounded-card border border-border text-center">
            <p className="text-2xl font-bold text-status-red-text">{stats.perdus}</p>
            <p className="text-[11px] text-muted mt-1">Perdus</p>
          </div>
          <div className="px-4 py-3 rounded-card border border-border text-center">
            <p className="text-2xl font-bold">${(stats.valeur_totale / 1000).toFixed(0)}k</p>
            <p className="text-[11px] text-muted mt-1">Valeur pipeline</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, téléphone, véhicule..."
              className="w-full ps-10 pe-4 py-2.5 text-sm border border-border rounded-input bg-background placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="ms-auto flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Nouveau lead
          </button>
        </div>

        {/* Kanban Pipeline */}
        <div className="flex gap-4 overflow-x-auto pb-4">
          {LEAD_PIPELINE_STAGES.map((statut) => (
            <KanbanColumn
              key={statut}
              statut={statut}
              leads={leadsParStatut[statut]}
              onSelectLead={setSelectedLead}
            />
          ))}
        </div>
      </div>

      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdated={() => setRefresh((v) => v + 1)}
        />
      )}

      {showForm && (
        <LeadFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            setRefresh((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
