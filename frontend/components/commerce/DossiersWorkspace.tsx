"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Plus, Search } from "lucide-react";
import Topbar from "@/components/Topbar";
import {
  DOSSIER_STATUS_LABELS_API,
  DOSSIER_TYPE_LABELS_API,
  DossierType,
} from "@/lib/api-contract";
import { commerceApi, type ApiDossier } from "@/lib/commerce-api";
import {
  buttonClass,
  EmptyState,
  ErrorState,
  inputClass,
  LoadingState,
} from "./common";

export default function DossiersWorkspace() {
  const [items, setItems] = useState<ApiDossier[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    completionRate: number;
  } | null>(null);
  const [reference, setReference] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [page, kpis] = await Promise.all([
        commerceApi.dossiers.list({ reference, type, limit: 100 }),
        commerceApi.dossiers.statistics(),
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
  }, [reference, type]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <>
      <Topbar title="Dossiers" subtitle="Transactions et workflow canonique" />
      <main className="space-y-5 p-8">
        {stats && (
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Total", stats.total],
              [
                "En cours",
                stats.total -
                  (stats.byStatus.closed ?? 0) -
                  (stats.byStatus.serviceCompleted ?? 0) -
                  (stats.byStatus.cancelled ?? 0),
              ],
              [
                "Terminés",
                (stats.byStatus.closed ?? 0) +
                  (stats.byStatus.serviceCompleted ?? 0),
              ],
              ["Taux de clôture", `${stats.completionRate.toFixed(0)} %`],
            ].map(([label, value]) => (
              <div key={label} className="card p-4">
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted">{label}</p>
              </div>
            ))}
          </div>
        )}
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
          <Link href="/dossiers/creer" className={buttonClass}>
            <Plus className="mr-2 inline h-4 w-4" />
            Créer
          </Link>
        </div>
        {error && <ErrorState message={error} retry={() => void load()} />}
        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState label="Aucun dossier persistant." />
        ) : (
          <div className="card divide-y divide-border overflow-hidden p-0">
            {items.map((dossier) => (
              <Link
                href={`/dossiers/${dossier.id}`}
                key={dossier.id}
                className="grid gap-3 p-4 hover:bg-surface md:grid-cols-[1fr_1fr_auto]"
              >
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
            ))}
          </div>
        )}
      </main>
    </>
  );
}
