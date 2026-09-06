"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Topbar from "@/components/Topbar";
import {
  commerceApi,
  type ApiCatalogueItem,
  type ApiCataloguePricing,
} from "@/lib/commerce-api";
import { VEHICLE_STATUS_LABELS_API } from "@/lib/api-contract";
import { ErrorState, formatMoney, LoadingState } from "./common";

export default function CatalogueDetailWorkspace({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const [item, setItem] = useState<ApiCatalogueItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItem(await commerceApi.catalogue.get(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => void load(), [load]);

  return (
    <>
      <Topbar
        title="Détail catalogue"
        subtitle="Véhicule, tarification publiée et rentabilité"
      />
      <main className="space-y-5 p-4 sm:p-8">
        <Link href="/catalogue" className="inline-flex items-center gap-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> Retour au catalogue
        </Link>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} retry={() => void load()} />
        ) : item ? (
          <>
            <section className="card p-5">
              <h1 className="text-2xl font-bold">
                {item.brand} {item.model} {item.version}
              </h1>
              <p className="mt-1 text-sm text-muted">
                Offre Chine {item.offer.reference}
              </p>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="Marque" value={item.brand} />
                <Detail label="Modèle" value={item.model} />
                <Detail label="Version" value={item.version} />
                <Detail label="Année" value={item.year} />
                <Detail label="VIN" value={item.vin} />
                <Detail label="Kilométrage" value={item.mileage} />
                <Detail label="Carburant" value={item.fuel} />
                <Detail label="Transmission" value={item.transmission} />
                <Detail label="Couleur" value={item.color} />
                <Detail
                  label="Statut véhicule"
                  value={VEHICLE_STATUS_LABELS_API[item.status] ?? item.status}
                />
              </dl>
            </section>
            <div className="grid gap-5 xl:grid-cols-2">
              {item.pricing.cif && (
                <PricingPanel title="Tarification CIF" pricing={item.pricing.cif} />
              )}
              {item.pricing.ddp && (
                <PricingPanel title="Tarification DDP" pricing={item.pricing.ddp} />
              )}
            </div>
          </>
        ) : null}
      </main>
    </>
  );
}

function PricingPanel({
  title,
  pricing,
}: {
  title: string;
  pricing: ApiCataloguePricing;
}) {
  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-xs text-muted">
          {pricing.quotationNumber} · instantané historique
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <Detail
          label="Prix de vente"
          value={formatMoney(pricing.sellingPriceDzd, "DZD")}
        />
        <Detail
          label="Coût estimé"
          value={formatMoney(pricing.estimatedTotalCostDzd, "DZD")}
        />
        <Detail
          label="Profit estimé"
          value={formatMoney(pricing.estimatedProfitDzd, "DZD")}
        />
        <Detail
          label="Marge estimée"
          value={`${Number(pricing.estimatedMarginPercent).toFixed(1)} %`}
        />
      </dl>
      <div className="divide-y rounded-card border border-border px-3 text-sm">
        {pricing.estimatedCosts.map((cost) => (
          <div key={cost.id} className="flex justify-between gap-3 py-3">
            <span>{cost.description}</span>
            <span className="text-right">
              <span className="block text-xs text-muted">
                {formatMoney(cost.originalAmount, cost.currency)} · taux {String(cost.exchangeRateUsed)}
              </span>
              <b>{formatMoney(cost.amountDzd, "DZD")}</b>
            </span>
          </div>
        ))}
      </div>
      {pricing.actual?.available ? (
        <div className="rounded-card border border-primary/25 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase text-muted">
            Rentabilité réelle · {pricing.actual.dossierReference}
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            <Detail
              label="Coût réel"
              value={formatMoney(pricing.actual.totalCostDzd, "DZD")}
            />
            <Detail
              label="Profit réel"
              value={formatMoney(pricing.actual.profitDzd, "DZD")}
            />
            <Detail
              label="Marge réelle"
              value={`${Number(pricing.actual.marginPercent).toFixed(1)} %`}
            />
          </dl>
          {!pricing.actual.finalized && (
            <p className="mt-3 text-xs text-amber-700">
              Coûts réels en cours de finalisation
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-card bg-neutral-100 p-3 text-sm text-muted">
          Coûts réels non finalisés
        </p>
      )}
    </section>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
