"use client";

import { getRuntimeLocale } from "@/lib/i18n/runtime-locale";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  CarFront,
  FolderOpen,
  PhoneCall,
  Ship,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import {
  DOSSIER_STATUS_LABELS_API,
  type ApiDossierStatus,
} from "@/lib/api-contract";
import { phase3Api, type ApiDashboard } from "@/lib/phase3-api";
import { ErrorState, LoadingState } from "@/components/commerce/common";

export default function DashboardWorkspace() {
  const [data, setData] = useState<ApiDashboard | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    try {
      setData(await phase3Api.dashboard());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement impossible",
      );
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      <Topbar
        title="Tableau de bord"
        subtitle="Indicateurs issus des données opérationnelles"
      />
      <main className="space-y-6 p-4 sm:p-8">
        {error && <ErrorState message={error} retry={() => void load()} />}
        {!data ? (
          <LoadingState />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi
                icon={FolderOpen}
                label="Dossiers actifs"
                value={data.dossiers.active}
                detail={`${data.dossiers.total} ouverts sur la période`}
              />
              <Kpi
                icon={CarFront}
                label="Véhicules disponibles"
                value={data.vehicles.byStatus.available ?? 0}
                detail={`${data.vehicles.byStatus.reserved ?? 0} réservés`}
              />
              <Kpi
                icon={Banknote}
                label="Encaissé"
                value={`${Number(data.finance.collected).toLocaleString(getRuntimeLocale())} ${data.period.baseCurrency}`}
                detail={`${Number(data.finance.outstanding).toLocaleString(getRuntimeLocale())} restant`}
              />
              <Kpi
                icon={AlertTriangle}
                label="Alertes"
                value={
                  data.alerts.overdueTasks +
                  data.alerts.overdueInvoices +
                  data.alerts.lateShipments
                }
                detail="Tâches, factures et expéditions"
              />
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              <section className="card lg:col-span-2">
                <h2 className="font-bold">Dossiers par statut</h2>
                <div className="mt-5 space-y-3">
                  {Object.entries(data.dossiers.byStatus).map(
                    ([status, count]) => {
                      const max = Math.max(
                        ...Object.values(data.dossiers.byStatus),
                        1,
                      );
                      return (
                        <div
                          key={status}
                          className="grid grid-cols-[150px_1fr_32px] items-center gap-3 text-sm"
                        >
                          <span className="truncate">
                            {DOSSIER_STATUS_LABELS_API[
                              status as ApiDossierStatus
                            ] ?? status}
                          </span>
                          <span className="h-2 overflow-hidden rounded-full bg-neutral-100">
                            <span
                              className="block h-full rounded-full bg-neutral-900"
                              style={{ width: `${(count / max) * 100}%` }}
                            />
                          </span>
                          <strong className="text-right">{count}</strong>
                        </div>
                      );
                    },
                  )}
                </div>
              </section>
              <section className="card">
                <h2 className="font-bold">Opérations</h2>
                <div className="mt-5 space-y-4">
                  <Line
                    icon={PhoneCall}
                    label="Appels / manqués"
                    value={`${data.callCenter.calls} / ${data.callCenter.missedCalls}`}
                  />
                  <Line
                    icon={Ship}
                    label="Expéditions en retard"
                    value={data.logistics.lateShipments}
                  />
                  <Line
                    icon={AlertTriangle}
                    label="Douanes actives"
                    value={data.logistics.activeCustomsFiles}
                  />
                </div>
              </section>
            </div>
            <section className="card p-0 overflow-hidden">
              <div className="border-b border-border px-6 py-4">
                <h2 className="font-bold">Dossiers récents</h2>
              </div>
              {data.recent.dossiers.length ? (
                data.recent.dossiers.map((dossier) => (
                  <Link
                    key={dossier.id}
                    href={`/dossiers/${dossier.id}`}
                    className="grid gap-2 border-b border-border px-6 py-4 text-sm last:border-0 hover:bg-surface sm:grid-cols-[150px_1fr_180px]"
                  >
                    <strong>{dossier.reference}</strong>
                    <span>
                      {dossier.client.firstName} {dossier.client.lastName}
                    </span>
                    <span className="text-muted sm:text-right">
                      {DOSSIER_STATUS_LABELS_API[
                        dossier.status as ApiDossierStatus
                      ] ?? dossier.status}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="p-8 text-center text-sm text-muted">
                  Aucun dossier sur la période.
                </p>
              )}
            </section>
            {data.finance.conversionIssues.length > 0 && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Certaines écritures sans taux historique sont exclues des totaux
                : {data.finance.conversionIssues.join(", ")}
              </p>
            )}
          </>
        )}
      </main>
    </>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof FolderOpen;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <section className="card">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </section>
  );
}
function Line({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Ship;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm text-muted">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}
