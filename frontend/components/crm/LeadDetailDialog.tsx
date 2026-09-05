"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  LeadQualification,
  CrmLeadStatus,
  CRM_LEAD_STATUS_LABELS,
  type ApiCrmLeadStatus,
  Permission,
} from "@/lib/api-contract";
import { crmApi, type ApiProspect, type TimelineItem } from "@/lib/crm-api";
import UnifiedTimeline from "@/components/crm/UnifiedTimeline";
import { useAuth } from "@/components/AuthProvider";

const nextStatus: Partial<Record<ApiCrmLeadStatus, ApiCrmLeadStatus>> = {
  NEW: CrmLeadStatus.CONTACTED,
  CONTACTED: CrmLeadStatus.QUALIFIED,
  QUALIFIED: CrmLeadStatus.APPOINTMENT,
  APPOINTMENT: CrmLeadStatus.CONVERTED,
};

export default function LeadDetailDialog({
  lead,
  onClose,
  onUpdated,
}: {
  lead: ApiProspect;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { hasPermission } = useAuth();
  const [current, setCurrent] = useState(lead);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void crmApi
      .timeline("prospect", lead.id)
      .then((result) => setTimeline(result.items))
      .catch((caught: Error) => setError(caught.message));
  }, [lead.id]);
  async function update(input: Partial<ApiProspect>) {
    setSaving(true);
    setError("");
    try {
      const updated = await crmApi.updateProspect(current.id, input);
      setCurrent({ ...current, ...updated });
      onUpdated();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Mise à jour impossible",
      );
    } finally {
      setSaving(false);
    }
  }
  async function addNote() {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await crmApi.addNote("prospect", current.id, note.trim());
      setNote("");
      setTimeline((await crmApi.timeline("prospect", current.id)).items);
      onUpdated();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Note non enregistrée",
      );
    } finally {
      setSaving(false);
    }
  }
  async function convert() {
    setSaving(true);
    try {
      await crmApi.convertProspect(current.id);
      onUpdated();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Conversion impossible",
      );
    } finally {
      setSaving(false);
    }
  }
  async function transition(status: ApiCrmLeadStatus) {
    setSaving(true);
    setError("");
    try {
      const updated = await crmApi.transitionProspect(current.id, status);
      setCurrent({ ...current, ...updated });
      setTimeline((await crmApi.timeline("prospect", current.id)).items);
      onUpdated();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Transition impossible",
      );
    } finally {
      setSaving(false);
    }
  }
  async function archive() {
    const reason = window.prompt("Motif d’archivage du lead");
    if (!reason?.trim()) return;
    setSaving(true);
    try {
      await crmApi.archiveProspect(current.id, reason.trim());
      onUpdated();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Archivage impossible",
      );
    } finally {
      setSaving(false);
    }
  }
  const control =
    "rounded-input border border-border bg-background px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[92vh] w-full max-w-4xl overflow-y-auto bg-background">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              {current.firstName} {current.lastName}
            </h2>
            <p className="text-sm text-muted">
              {current.phone || "Sans téléphone"} ·{" "}
              {current.entryChannel?.labelFr || "Canal inconnu"} ·{" "}
              {current.marketingSource?.labelFr || "Source inconnue"}
            </p>
          </div>
          <button onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && (
          <p className="mb-4 rounded-card bg-status-red-bg p-3 text-sm text-status-red-text">
            {error}
          </p>
        )}
        {current.archivedAt && (
          <p className="mb-4 rounded-card bg-surface p-3 text-sm text-muted">
            Ce lead est archivé. Son historique reste consultable en lecture
            seule.
          </p>
        )}
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs text-muted">
            Statut
            <div className={`${control} block w-full`}>
              {current.crmStatus
                ? CRM_LEAD_STATUS_LABELS[current.crmStatus]
                : "À réconcilier"}
            </div>
            {!current.archivedAt &&
              current.crmStatus &&
              nextStatus[current.crmStatus] && (
                <button
                  disabled={saving}
                  className="mt-2 rounded-button border border-border px-3 py-1 text-xs"
                  onClick={() =>
                    void transition(nextStatus[current.crmStatus!]!)
                  }
                >
                  Passer à{" "}
                  {CRM_LEAD_STATUS_LABELS[nextStatus[current.crmStatus]!]}
                </button>
              )}
          </label>
          <label className="space-y-1 text-xs text-muted">
            Qualification
            <select
              disabled={saving || Boolean(current.archivedAt)}
              className={`${control} block w-full`}
              value={current.qualification}
              onChange={(event) =>
                void update({
                  qualification: event.target
                    .value as ApiProspect["qualification"],
                })
              }
            >
              {Object.values(LeadQualification).map((value) => (
                <option key={value} value={value}>
                  {value === "UNCLASSIFIED" ? "Non qualifié" : value}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-card border border-border p-3 text-sm">
            <p className="text-xs text-muted">Agent responsable</p>
            <p>
              {current.assignee
                ? `${current.assignee.firstName} ${current.assignee.lastName}`
                : "Non assigné"}
            </p>
          </div>
        </div>
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs text-muted">
            Prochaine action
            <input
              className={`${control} block w-full`}
              disabled={saving || Boolean(current.archivedAt)}
              value={current.nextAction || ""}
              onChange={(event) =>
                setCurrent({ ...current, nextAction: event.target.value })
              }
              onBlur={() => void update({ nextAction: current.nextAction })}
            />
          </label>
          <label className="space-y-1 text-xs text-muted">
            Date et heure de relance
            <input
              type="datetime-local"
              className={`${control} block w-full`}
              disabled={saving || Boolean(current.archivedAt)}
              value={
                current.nextActionAt
                  ? new Date(current.nextActionAt).toISOString().slice(0, 16)
                  : ""
              }
              onChange={(event) =>
                setCurrent({ ...current, nextActionAt: event.target.value })
              }
              onBlur={() => void update({ nextActionAt: current.nextActionAt })}
            />
          </label>
          {current.needType === "SHIPPING" ? (
            <div className="rounded-card border border-border p-3 text-sm md:col-span-2">
              <p className="text-xs text-muted">Besoin Shipping / Expédition</p>
              <p>{current.shippingDescription || "Description à compléter"}</p>
              <p className="text-muted">
                {[current.shippingCargoType, current.shippingDestination]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {current.shippingRequirements && (
                <p className="text-muted">{current.shippingRequirements}</p>
              )}
            </div>
          ) : current.vehicleRequests?.[0] ? (
            <div className="rounded-card border border-border p-3 text-sm md:col-span-2">
              <p className="text-xs text-muted">Besoin véhicule</p>
              <p>
                {[
                  current.vehicleRequests[0].brand,
                  current.vehicleRequests[0].model,
                ]
                  .filter(Boolean)
                  .join(" ") || "Besoin général"}
              </p>
              {current.vehicleRequests[0].requirements && (
                <p className="text-muted">
                  {current.vehicleRequests[0].requirements}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-card border border-border p-3 text-sm md:col-span-2">
              <p className="text-xs text-muted">Besoin véhicule</p>
              <p>Informations à compléter</p>
            </div>
          )}
        </div>
        {!current.archivedAt && (
          <div className="mb-6 flex gap-2">
            <input
              className={`${control} flex-1`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ajouter une note à la timeline"
            />
            <button
              disabled={saving || !note.trim()}
              onClick={() => void addNote()}
              className="rounded-button bg-foreground px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Ajouter
            </button>
            {!current.client &&
              current.crmStatus === CrmLeadStatus.APPOINTMENT && (
                <button
                  disabled={saving}
                  onClick={() => void convert()}
                  className="rounded-button border border-border px-4 py-2 text-sm"
                >
                  Convertir en client
                </button>
              )}
            {hasPermission(Permission.PROSPECTS_ARCHIVE) && (
              <button
                disabled={saving}
                onClick={() => void archive()}
                className="rounded-button border border-status-red-text px-4 py-2 text-sm text-status-red-text"
              >
                Archiver
              </button>
            )}
          </div>
        )}
        <UnifiedTimeline
          items={timeline}
          emptyMessage="Aucune interaction enregistrée."
        />
      </div>
    </div>
  );
}
