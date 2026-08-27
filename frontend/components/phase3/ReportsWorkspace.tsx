"use client";

import { getRuntimeLocale } from "@/lib/i18n/runtime-locale";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileBarChart } from "lucide-react";
import Topbar from "@/components/Topbar";
import { phase3Api, type ApiDashboard } from "@/lib/phase3-api";
import {
  ErrorState,
  inputClass,
  LoadingState,
} from "@/components/commerce/common";

export default function ReportsWorkspace() {
  const [data, setData] = useState<
    (ApiDashboard & { generatedAt: string }) | null
  >(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const filters = useMemo(
    () => ({
      from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
    }),
    [from, to],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await phase3Api.reports.summary(filters));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Rapport indisponible",
      );
    } finally {
      setLoading(false);
    }
  }, [filters]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function download() {
    if (downloading) return;
    setDownloading(true);
    try {
      const file = await phase3Api.reports.downloadFinance(filters);
      const url = URL.createObjectURL(file.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Export impossible");
    } finally {
      setDownloading(false);
    }
  }
  return (
    <>
      <Topbar
        title="Rapports"
        subtitle="Synthèses tenant-scoped et exports PDF"
      />
      <main className="space-y-6 p-4 sm:p-8">
        <section className="card flex flex-wrap items-end gap-4">
          <label>
            <span className="field-label">Du</span>
            <input
              type="date"
              className={inputClass}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">Au</span>
            <input
              type="date"
              className={inputClass}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <button
            onClick={() => void load()}
            className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Appliquer
          </button>
          <button
            onClick={() => void download()}
            disabled={downloading}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold"
          >
            <Download className="h-4 w-4" />
            {downloading ? "Génération…" : "Exporter PDF"}
          </button>
        </section>
        {error && <ErrorState message={error} retry={() => void load()} />}
        {loading || !data ? (
          <LoadingState />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ["Facturé", data.finance.issued],
                ["Encaissé", data.finance.collected],
                ["Reste", data.finance.outstanding],
                ["Coûts", data.finance.costs],
                ["Marge brute", data.finance.grossMargin],
              ].map(([label, value]) => (
                <section key={label} className="card">
                  <FileBarChart className="h-5 w-5 text-muted" />
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                    {label}
                  </p>
                  <p className="mt-1 text-xl font-bold">
                    {Number(value).toLocaleString(getRuntimeLocale())}{" "}
                    {data.period.baseCurrency}
                  </p>
                </section>
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Distribution
                title="Dossiers par type"
                values={data.dossiers.byType}
              />
              <Distribution
                title="Véhicules par source"
                values={data.vehicles.bySource}
              />
              <Distribution
                title="Offres par statut"
                values={data.offers.byStatus}
              />
              <section className="card">
                <h2 className="font-bold">CRM et centre d’appels</h2>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <Stat label="Leads actifs" value={data.crm.activeLeads} />
                  <Stat
                    label="Leads qualifiés"
                    value={data.crm.qualifiedLeads}
                  />
                  <Stat label="Conversions" value={data.crm.conversions} />
                  <Stat label="Appels" value={data.callCenter.calls} />
                </dl>
              </section>
            </div>
            <p className="text-xs text-muted">
              Généré le {new Date(data.generatedAt).toLocaleString(getRuntimeLocale())} ·{" "}
              {data.period.timezone}
            </p>
          </>
        )}
      </main>
    </>
  );
}
function Distribution({
  title,
  values,
}: {
  title: string;
  values: Record<string, number>;
}) {
  return (
    <section className="card">
      <h2 className="font-bold">{title}</h2>
      <div className="mt-5 space-y-3">
        {Object.entries(values).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <span>{key}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-bold">{value}</dd>
    </div>
  );
}
