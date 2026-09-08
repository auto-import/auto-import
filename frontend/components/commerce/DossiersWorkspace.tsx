"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  FolderOpen,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import {
  DOSSIER_STATUS_LABELS_API,
  DOSSIER_TYPE_LABELS_API,
  DossierType,
  Permission,
} from "@/lib/api-contract";
import { commerceApi, type ApiDossier } from "@/lib/commerce-api";
import {
  buttonClass,
  EmptyState,
  ErrorState,
  inputClass,
  LoadingState,
} from "./common";
import { useAuth } from "@/components/AuthProvider";

export default function DossiersWorkspace() {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<ApiDossier[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    active: number;
    archived: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    completionRate: number;
    created: {
      count: number;
      period: string;
      from: string;
      toExclusive: string;
      timezone: string;
    };
  } | null>(null);
  const [view, setView] = useState<"active" | "archives">("active");
  const [period, setPeriod] = useState<
    "today" | "week" | "month" | "year" | "custom"
  >("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [reference, setReference] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [page, kpis] = await Promise.all([
        commerceApi.dossiers.list({
          reference,
          type,
          limit: 100,
          archivedOnly: view === "archives",
          activeOnly: view === "active",
        }),
        commerceApi.dossiers.statistics({
          period:
            period === "custom" && (!customFrom || !customTo)
              ? "month"
              : period,
          from: period === "custom" ? customFrom || undefined : undefined,
          to: period === "custom" ? customTo || undefined : undefined,
        }),
      ]);
      setItems(page.items);
      setStats(kpis);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement impossible",
      );
    } finally {
      setLoading(false);
    }
  }, [customFrom, customTo, period, reference, type, view]);
  async function restore(id: string) {
    try {
      await commerceApi.dossiers.restore(id);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Restauration impossible",
      );
    }
  }
  async function permanentlyDelete(id: string) {
    if (
      !window.confirm(
        "Êtes-vous sûr de vouloir supprimer définitivement ce dossier ?\n\nCette action peut être irréversible.",
      )
    )
      return;
    try {
      await commerceApi.dossiers.permanentlyDelete(id);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Suppression impossible",
      );
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <>
      <Topbar title="Dossiers" subtitle="Transactions et workflow canonique" />
      <main className="space-y-5 p-4 sm:p-8">
        {stats && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Dossiers créés", stats.created.count],
              ["Actifs", stats.active],
              ["Archivés", stats.archived],
              [
                "Terminés",
                (stats.byStatus.closed ?? 0) +
                  (stats.byStatus.serviceCompleted ?? 0),
              ],
              ["Annulés", stats.byStatus.cancelled ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="card p-4">
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted">{label}</p>
              </div>
            ))}
          </div>
        )}
        <section className="card flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted">
            Période des dossiers créés
            <select
              className={`${inputClass} mt-1 block`}
              value={period}
              onChange={(event) =>
                setPeriod(event.target.value as typeof period)
              }
            >
              <option value="today">Aujourd’hui</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
              <option value="year">Cette année</option>
              <option value="custom">Personnalisé</option>
            </select>
          </label>
          {period === "custom" && (
            <>
              <label className="text-xs text-muted">
                Date début
                <input
                  type="date"
                  className={`${inputClass} mt-1 block`}
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </label>
              <label className="text-xs text-muted">
                Date fin
                <input
                  type="date"
                  className={`${inputClass} mt-1 block`}
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                />
              </label>
            </>
          )}
          {stats && (
            <p className="text-xs text-muted">
              Fuseau horaire : {stats.created.timezone}
            </p>
          )}
        </section>
        <div className="flex gap-2 rounded-card border border-border bg-background p-2">
          <button
            className={`rounded-button px-4 py-2 text-sm ${view === "active" ? "bg-foreground text-white" : "hover:bg-surface"}`}
            onClick={() => setView("active")}
          >
            <FolderOpen className="mr-2 inline h-4 w-4" />
            Actifs
          </button>
          <button
            className={`rounded-button px-4 py-2 text-sm ${view === "archives" ? "bg-foreground text-white" : "hover:bg-surface"}`}
            onClick={() => setView("archives")}
          >
            <Archive className="mr-2 inline h-4 w-4" />
            Archives
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
            <input
              className={`${inputClass} pl-9`}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Référence"
            />
          </label>
          <select
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">Tous les types</option>
            {Object.values(DossierType).map((value) => (
              <option key={value} value={value}>
                {DOSSIER_TYPE_LABELS_API[value]}
              </option>
            ))}
          </select>
          {view === "active" && (
            <Link href="/dossiers/creer" className={buttonClass}>
              <Plus className="mr-2 inline h-4 w-4" />
              Créer
            </Link>
          )}
        </div>
        {error && <ErrorState message={error} retry={() => void load()} />}
        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState
            label={
              view === "archives"
                ? "Aucun dossier archivé."
                : "Aucun dossier actif."
            }
          />
        ) : (
          <div className="card divide-y divide-border overflow-hidden p-0">
            {items.map((dossier) => (
              <div
                key={dossier.id}
                className="grid items-center gap-3 p-4 hover:bg-surface md:grid-cols-[1fr_1fr_auto_auto]"
              >
                <Link href={`/dossiers/${dossier.id}`} className="contents">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-5 w-5 text-muted" />
                    <div>
                      <p className="font-semibold">{dossier.reference}</p>
                      <p className="text-xs text-muted">
                        {DOSSIER_TYPE_LABELS_API[dossier.type]}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm">
                    {dossier.client.firstName} {dossier.client.lastName}
                  </p>
                  <span className="text-sm text-muted">
                    {DOSSIER_STATUS_LABELS_API[dossier.status]}
                  </span>
                </Link>
                {view === "archives" &&
                  hasPermission(Permission.DOSSIERS_ARCHIVE_MANAGE) && (
                    <div className="flex gap-2">
                      <button
                        title="Restaurer"
                        aria-label={`Restaurer ${dossier.reference}`}
                        onClick={() => void restore(dossier.id)}
                        className="rounded-button border border-border p-2"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        title="Supprimer"
                        aria-label={`Supprimer ${dossier.reference}`}
                        onClick={() => void permanentlyDelete(dossier.id)}
                        className="rounded-button border border-status-red-text p-2 text-status-red-text"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
