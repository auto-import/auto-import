"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  LeadQualification,
  ProspectStatus,
  PROSPECT_STATUS_LABELS_API,
} from "@/lib/api-contract";
import { crmApi, type ApiProspect, type TimelineItem } from "@/lib/crm-api";
import UnifiedTimeline from "@/components/crm/UnifiedTimeline";

export default function LeadDetailDialog({
  lead,
  onClose,
  onUpdated,
}: {
  lead: ApiProspect;
  onClose: () => void;
  onUpdated: () => void;
}) {
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
              {current.source || "Source inconnue"}
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
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs text-muted">
            Statut
            <select
              disabled={saving}
              className={`${control} block w-full`}
              value={current.status}
              onChange={(event) =>
                void update({
                  status: event.target.value as ApiProspect["status"],
                })
              }
            >
              {Object.values(ProspectStatus).map((status) => (
                <option key={status} value={status}>
                  {PROSPECT_STATUS_LABELS_API[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted">
            Qualification
            <select
              disabled={saving}
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
          {!current.client && (
            <button
              disabled={saving}
              onClick={() => void convert()}
              className="rounded-button border border-border px-4 py-2 text-sm"
            >
              Convertir en client
            </button>
          )}
        </div>
        <UnifiedTimeline
          items={timeline}
          emptyMessage="Aucune interaction enregistrée."
        />
      </div>
    </div>
  );
}
