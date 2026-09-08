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
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [
                  "Contrats signés ce mois",
                  String(data.finance.contractsSignedThisMonth),
                  "",
                ],
                [
                  "CA encaissé",
                  data.finance.collected,
                  data.period.baseCurrency,
                ],
                [
                  "Solde clients restant",
                  data.finance.outstanding,
                  data.period.baseCurrency,
                ],
                [
                  "Marge brute",
                  data.finance.grossMargin,
                  data.period.baseCurrency,
                ],
              ].map(([label, value, currency]) => (
                <section key={label} className="card">
                  <FileBarChart className="h-5 w-5 text-muted" />
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                    {label}
                  </p>
                  <p className="mt-1 text-xl font-bold">
                    {Number(value).toLocaleString(getRuntimeLocale())}{" "}
                    {currency}
                  </p>
                </section>
              ))}
            </div>
            <section className="card">
              <h2 className="font-bold">Indicateurs opérationnels</h2>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <Stat label="Dossiers actifs" value={data.dossiers.active} />
                <Stat
                  label="Véhicules achetés"
                  value={data.vehicles.purchased}
                />
                <Stat
                  label="Véhicules en transit"
                  value={data.vehicles.inTransit}
                />
                <Stat
                  label="Véhicules en douane"
                  value={data.vehicles.inCustoms}
                />
                <Stat
                  label="Véhicules livrés ce mois"
                  value={data.vehicles.deliveredThisMonth}
                />
                <Stat
                  label="Dossiers en retard"
                  value={data.dossiers.overdue}
                />
                <Stat
                  label="Paiements fournisseurs à effectuer"
                  value={data.finance.supplierPaymentsDue}
                />
                <div>
                  <dt className="text-muted">Solde fournisseurs restant dû</dt>
                  <dd className="mt-1 text-xl font-bold">
                    {Number(data.finance.supplierOutstanding).toLocaleString(
                      getRuntimeLocale(),
                    )}{" "}
                    DZD
                  </dd>
                </div>
              </dl>
            </section>
            <div className="grid gap-6 lg:grid-cols-2">
              <Distribution
                title="Dossiers par statut"
                values={data.dossiers.byStatus}
              />
              <Distribution
                title="Véhicules par étape opérationnelle"
                values={data.vehicles.byStatus}
              />
              <Distribution
                title="Offres par statut"
                values={data.offers.byStatus}
              />
              <section className="card">
                <h2 className="font-bold">CRM et centre d’appels</h2>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <Stat label="Leads ce mois" value={data.crm.leadsThisMonth} />
                  <Stat
                    label="Leads qualifiés"
                    value={data.crm.qualifiedLeads}
                  />
                  <Stat label="Conversions" value={data.crm.conversions} />
                  <Stat
                    label="Taux Lead → Contrat"
                    value={Number(data.crm.conversionRate.toFixed(2))}
                  />
                </dl>
              </section>
              <Distribution
                title="Funnel Leads → Contrats"
                values={data.crm.funnel}
              />
              <section className="card">
                <h2 className="font-bold">Alertes</h2>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <Stat
                    label="Paiements clients en retard"
                    value={data.alerts.overdueInvoices}
                  />
                  <Stat
                    label="Paiements fournisseurs à échéance"
                    value={data.alerts.supplierPaymentsDue}
                  />
                  <Stat
                    label="Expéditions en retard"
                    value={data.alerts.lateShipments}
                  />
                  <Stat
                    label="Douanes bloquées"
                    value={data.alerts.blockedCustoms}
                  />
                  <Stat
                    label="Documents expirants"
                    value={data.alerts.expiringDocuments}
                  />
                  <Stat
                    label="Tâches en retard"
                    value={data.alerts.overdueTasks}
                  />
                </dl>
              </section>
            </div>
            <p className="text-xs text-muted">
              Généré le{" "}
              {new Date(data.generatedAt).toLocaleString(getRuntimeLocale())} ·{" "}
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
