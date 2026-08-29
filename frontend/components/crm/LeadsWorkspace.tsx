"use client";

import { getRuntimeLocale } from "@/lib/i18n/runtime-locale";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ChevronRight,
  Plus,
  RefreshCw,
  Search,
  User,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import LeadDetailDialog from "@/components/crm/LeadDetailDialog";
import LeadFormDialog from "@/components/crm/LeadFormDialog";
import {
  LeadQualification,
  CrmLeadStatus,
  CRM_LEAD_STATUS_LABELS,
} from "@/lib/api-contract";
import {
  crmApi,
  type AgentSummary,
  type ApiCrmReference,
  type ApiProspect,
} from "@/lib/crm-api";

const stages = [
  CrmLeadStatus.NEW,
  CrmLeadStatus.CONTACTED,
  CrmLeadStatus.QUALIFIED,
  CrmLeadStatus.APPOINTMENT,
  CrmLeadStatus.CONTRACT,
  CrmLeadStatus.DEPOSIT,
  CrmLeadStatus.CONVERTED,
] as const;
const qualificationClass: Record<string, string> = {
  HOT: "bg-status-red-bg text-status-red-text",
  WARM: "bg-status-amber-bg text-status-amber-text",
  COLD: "bg-status-blue-bg text-status-blue-text",
  UNCLASSIFIED: "bg-surface text-muted",
};

export default function LeadsWorkspace() {
  const [leads, setLeads] = useState<ApiProspect[]>([]);
  const [search, setSearch] = useState("");
  const [entryChannelId, setEntryChannelId] = useState("");
  const [marketingSourceId, setMarketingSourceId] = useState("");
  const [status, setStatus] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [qualification, setQualification] = useState("");
  const [references, setReferences] = useState<ApiCrmReference[]>([]);
  const [assignees, setAssignees] = useState<AgentSummary[]>([]);
  const [selected, setSelected] = useState<ApiProspect | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await crmApi.listProspects({
        limit: 100,
        search,
        entryChannelId,
        marketingSourceId,
        status,
        assignedTo,
        overdue: overdue ? "true" : undefined,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        qualification,
      });
      setLeads(result.items);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement impossible",
      );
    } finally {
      setLoading(false);
    }
  }, [
    search,
    entryChannelId,
    marketingSourceId,
    status,
    assignedTo,
    overdue,
    createdFrom,
    createdTo,
    qualification,
  ]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    void Promise.all([crmApi.referenceData(), crmApi.assignees()]).then(
      ([items, users]) => {
        setReferences(items);
        setAssignees(users);
      },
    );
  }, []);
  const groups = useMemo(
    () =>
      Object.fromEntries(
        stages.map((stage) => [
          stage,
          leads.filter((lead) => lead.crmStatus === stage),
        ]),
      ) as Record<(typeof stages)[number], ApiProspect[]>,
    [leads],
  );
  const active = leads.filter(
    (lead) => lead.crmStatus !== CrmLeadStatus.CONVERTED,
  ).length;
  return (
    <>
      <Topbar
        title="Leads"
        subtitle="Pipeline commercial — données CRM en temps réel"
      />
      <main className="space-y-6 p-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Total leads" value={leads.length} />
          <Kpi label="En cours" value={active} />
          <Kpi
            label="Hot"
            value={
              leads.filter(
                (lead) => lead.qualification === LeadQualification.HOT,
              ).length
            }
          />
          <Kpi
            label="Convertis"
            value={
              leads.filter(
                (lead) =>
                  lead.crmStatus === CrmLeadStatus.CONVERTED || lead.client,
              ).length
            }
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-64 flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              className="w-full rounded-input border border-border bg-background py-2 pl-9 pr-3 text-sm"
              placeholder="Nom, téléphone ou email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select
            className="rounded-input border border-border bg-background px-3 py-2 text-sm"
            value={entryChannelId}
            onChange={(event) => setEntryChannelId(event.target.value)}
          >
            <option value="">Tous les canaux</option>
            {references
              .filter((item) => item.kind === "ENTRY_CHANNEL" && item.active)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.labelFr}
                </option>
              ))}
          </select>
          <select
            className="rounded-input border border-border bg-background px-3 py-2 text-sm"
            value={marketingSourceId}
            onChange={(event) => setMarketingSourceId(event.target.value)}
          >
            <option value="">Toutes les sources marketing</option>
            {references
              .filter((item) => item.kind === "MARKETING_SOURCE" && item.active)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.labelFr}
                </option>
              ))}
          </select>
          <select
            className="rounded-input border border-border bg-background px-3 py-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Tous les statuts</option>
            {stages.map((value) => (
              <option key={value} value={value}>
                {CRM_LEAD_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
          <select
            className="rounded-input border border-border bg-background px-3 py-2 text-sm"
            value={assignedTo}
            onChange={(event) => setAssignedTo(event.target.value)}
          >
            <option value="">Tous les agents</option>
            {assignees.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.firstName} {agent.lastName}
              </option>
            ))}
          </select>
          <select
            className="rounded-input border border-border bg-background px-3 py-2 text-sm"
            value={qualification}
            onChange={(event) => setQualification(event.target.value)}
          >
            <option value="">Toutes qualifications</option>
            {Object.values(LeadQualification).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overdue}
              onChange={(event) => setOverdue(event.target.checked)}
            />{" "}
            Relances en retard
          </label>
          <label className="text-xs text-muted">
            Créé du{" "}
            <input
              type="date"
              className="ml-1 rounded-input border border-border bg-background px-2 py-1 text-sm"
              value={createdFrom}
              onChange={(event) => setCreatedFrom(event.target.value)}
            />
          </label>
          <label className="text-xs text-muted">
            au{" "}
            <input
              type="date"
              className="ml-1 rounded-input border border-border bg-background px-2 py-1 text-sm"
              value={createdTo}
              onChange={(event) => setCreatedTo(event.target.value)}
            />
          </label>
          <button
            onClick={() => setShowForm(true)}
            className="ml-auto flex items-center gap-2 rounded-button bg-foreground px-4 py-2 text-sm text-white"
          >
            <Plus className="h-4 w-4" />
            Nouveau lead
          </button>
        </div>
        {error && (
          <div className="rounded-card bg-status-red-bg p-4 text-sm text-status-red-text">
            <p>{error}</p>
            <button
              onClick={() => void load()}
              className="mt-2 flex items-center gap-1 font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </button>
          </div>
        )}
        {loading ? (
          <div className="card p-12 text-center text-muted">
            Chargement du pipeline…
          </div>
        ) : leads.length === 0 ? (
          <div className="card p-12 text-center text-muted">
            Aucun lead ne correspond aux filtres.
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => (
              <section key={stage} className="min-w-72 max-w-80 flex-1">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold">
                    {CRM_LEAD_STATUS_LABELS[stage]}
                  </h2>
                  <span className="rounded-full bg-surface px-2 text-xs">
                    {groups[stage].length}
                  </span>
                </div>
                <div className="min-h-48 space-y-2 rounded-card bg-surface/60 p-2">
                  {groups[stage].map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => setSelected(lead)}
                      className="w-full rounded-card border border-border bg-background p-3 text-left transition-shadow hover:shadow-md"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold">
                            {lead.firstName} {lead.lastName}
                          </p>
                          <p className="text-xs text-muted">
                            {lead.entryChannel?.labelFr || "Canal inconnu"} ·{" "}
                            {lead.marketingSource?.labelFr || "Source inconnue"}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span
                          className={`rounded-full px-2 py-1 ${qualificationClass[lead.qualification]}`}
                        >
                          {lead.qualification}
                        </span>
                        {lead.assignee && (
                          <span className="flex items-center gap-1 rounded-full bg-surface px-2 py-1">
                            <User className="h-3 w-3" />
                            {lead.assignee.firstName}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 border-t border-border pt-2 text-xs text-muted">
                        {lead.nextActionAt ? (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span
                              className={
                                new Date(lead.nextActionAt) < new Date()
                                  ? "font-semibold text-status-red-text"
                                  : ""
                              }
                            >
                              {lead.nextAction || "Relance"}{" "}
                              {new Date(lead.nextActionAt).toLocaleString(
                                getRuntimeLocale(),
                              )}
                            </span>
                          </span>
                        ) : lead.lastInteractionAt ? (
                          `Dernière interaction ${new Date(lead.lastInteractionAt).toLocaleDateString(getRuntimeLocale())}`
                        ) : (
                          "Aucune interaction"
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
      {selected && (
        <LeadDetailDialog
          lead={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => void load()}
        />
      )}
      {showForm && (
        <LeadFormDialog
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-border bg-background p-4 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
