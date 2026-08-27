"use client";

import { getRuntimeLocale } from "@/lib/i18n/runtime-locale";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Banknote, CarFront, FolderOpen } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Topbar from "@/components/Topbar";
import {
  DOSSIER_STATUS_LABELS_API,
  type ApiDossierStatus,
} from "@/lib/api-contract";
import { phase3Api, type ApiDashboard } from "@/lib/phase3-api";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/commerce/common";

export default function DashboardPolished() {
  const [data, setData] = useState<ApiDashboard | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      setData(await phase3Api.dashboard());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Chargement impossible",
      );
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const statusData = useMemo(
    () =>
      Object.entries(data?.dossiers.byStatus ?? {}).map(([status, count]) => ({
        status,
        label: DOSSIER_STATUS_LABELS_API[status as ApiDossierStatus] ?? status,
        count,
      })),
    [data],
  );
  const revenueData = useMemo(
    () =>
      (data?.finance.trend ?? []).map((item) => ({
        ...item,
        value: Number(item.collections),
        label: new Date(`${item.month}-01T00:00:00Z`).toLocaleDateString(
          getRuntimeLocale(),
          { month: "short", year: "2-digit", timeZone: "UTC" },
        ),
      })),
    [data],
  );
  return (
    <>
      <Topbar title="Dashboard" subtitle="Vue d’ensemble de l’activité" />
      <main className="space-y-6 p-4 sm:p-8">
        {error && <ErrorState message={error} retry={() => void load()} />}
        {!data ? (
          <LoadingState />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi
                icon={<FolderOpen />}
                label="Total dossiers"
                value={data.dossiers.total}
              />
              <Kpi
                icon={<CarFront />}
                label="Véhicules en stock"
                value={
                  (data.vehicles.byStatus.available ?? 0) +
                  (data.vehicles.byStatus.reserved ?? 0)
                }
                detail={`Disponible : ${data.vehicles.byStatus.available ?? 0} · Réservé : ${data.vehicles.byStatus.reserved ?? 0}`}
              />
              <Kpi
                icon={<Banknote />}
                label="CA encaissé"
                value={`${Number(data.finance.collected).toLocaleString(getRuntimeLocale())} ${data.period.baseCurrency}`}
              />
              <Kpi
                icon={<AlertTriangle />}
                label="Factures en retard"
                value={data.finance.overdueInvoices}
              />
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard
                title="Dossiers par statut"
                description={
                  statusData
                    .map(({ label, count }) => `${label}: ${count}`)
                    .join(", ") || "Aucun dossier"
                }
              >
                {statusData.length ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      data={statusData}
                      layout="vertical"
                      margin={{ left: 28, right: 24 }}
                      accessibilityLayer
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis
                        dataKey="label"
                        type="category"
                        width={145}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        formatter={(value) => [Number(value), "Dossiers"]}
                      />
                      <Bar
                        dataKey="count"
                        fill="#171717"
                        radius={[0, 5, 5, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState label="Aucun dossier sur la période." />
                )}
              </ChartCard>
              <ChartCard
                title={`Revenu mensuel (${data.period.baseCurrency})`}
                description={
                  revenueData
                    .map(({ label, value }) => `${label}: ${value}`)
                    .join(", ") || "Aucun encaissement"
                }
              >
                {revenueData.length ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart
                      data={revenueData}
                      margin={{ left: 12, right: 20 }}
                      accessibilityLayer
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis
                        tickFormatter={(value) =>
                          new Intl.NumberFormat(getRuntimeLocale(), {
                            notation: "compact",
                          }).format(value)
                        }
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        formatter={(value) => [
                          `${Number(value).toLocaleString(getRuntimeLocale())} ${data.period.baseCurrency}`,
                          "Encaissé",
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#171717"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState label="Aucun encaissement sur la période." />
                )}
              </ChartCard>
            </div>
            <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
              <section className="card overflow-hidden p-0">
                <div className="px-6 py-5">
                  <h2 className="font-bold uppercase tracking-wide text-muted">
                    Dossiers récents
                  </h2>
                </div>
                {data.recent.dossiers.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-y border-border text-xs uppercase text-muted">
                          <th className="px-6 py-3">Référence</th>
                          <th className="px-6 py-3">Client</th>
                          <th className="px-6 py-3">Véhicule(s)</th>
                          <th className="px-6 py-3">Statut</th>
                          <th className="px-6 py-3">Dernière MAJ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recent.dossiers.map((dossier) => (
                          <tr
                            key={dossier.id}
                            className="border-b border-border last:border-0"
                          >
                            <td className="px-6 py-4">
                              <Link
                                className="font-semibold text-blue-700"
                                href={`/dossiers/${dossier.id}`}
                              >
                                {dossier.reference}
                              </Link>
                            </td>
                            <td className="px-6 py-4">
                              {dossier.client.firstName}{" "}
                              {dossier.client.lastName}
                            </td>
                            <td className="px-6 py-4">
                              {dossier.dossierVehicles
                                ?.map(
                                  ({ vehicle }) =>
                                    `${vehicle.brand} ${vehicle.model}${vehicle.year ? ` ${vehicle.year}` : ""}`,
                                )
                                .join(", ") || "Non renseigné"}
                            </td>
                            <td className="px-6 py-4">
                              <span className="rounded-full border border-border bg-neutral-50 px-3 py-1">
                                {DOSSIER_STATUS_LABELS_API[
                                  dossier.status as ApiDossierStatus
                                ] ?? dossier.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-muted">
                              {new Date(dossier.updatedAt).toLocaleDateString(
                                getRuntimeLocale(),
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState label="Aucun dossier récent." />
                )}
              </section>
              <section className="card">
                <h2 className="font-bold uppercase tracking-wide text-muted">
                  Alertes
                </h2>
                <div className="mt-5 space-y-3">
                  {data.alerts.items?.length ? (
                    data.alerts.items.map((item) => (
                      <Link
                        key={`${item.kind}:${item.id}`}
                        href={item.href}
                        className={`block rounded-xl border p-4 text-sm ${item.severity === "critical" ? "border-red-100 bg-red-50 text-red-800" : "border-blue-100 bg-blue-50 text-blue-800"}`}
                      >
                        <strong>{item.title}</strong>
                        <span className="mt-1 block">{item.detail}</span>
                      </Link>
                    ))
                  ) : (
                    <>
                      <AlertRow
                        label="Factures en retard"
                        value={data.alerts.overdueInvoices}
                      />
                      <AlertRow
                        label="Expéditions en retard"
                        value={data.alerts.lateShipments}
                      />
                      <AlertRow
                        label="Rappels en retard"
                        value={data.alerts.overdueCallbacks ?? 0}
                      />
                    </>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function Kpi({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <section className="card min-h-40">
      <div className="flex justify-between text-muted">
        <p className="text-xs font-bold uppercase tracking-wide">{label}</p>
        <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      </div>
      <p className="mt-5 text-3xl font-bold">{value}</p>
      {detail && <p className="mt-4 text-sm text-muted">{detail}</p>}
    </section>
  );
}
function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card min-w-0">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
        {title}
      </h2>
      <p className="sr-only">{description}</p>
      <div
        className="mt-5 min-h-80"
        role="img"
        aria-label={`${title}. ${description}`}
      >
        {children}
      </div>
    </section>
  );
}
function AlertRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border p-4 text-sm">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
