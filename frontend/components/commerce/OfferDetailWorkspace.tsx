"use client";

import { getRuntimeLocale } from "@/lib/i18n/runtime-locale";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Calendar, Package } from "lucide-react";
import Topbar from "@/components/Topbar";
import { commerceApi, type ApiOffer } from "@/lib/commerce-api";
import { useAuth } from "@/components/AuthProvider";
import { Permission } from "@/lib/api-contract";
import { ErrorState, formatMoney, LoadingState } from "./common";
import PrivateOfferGallery from "./PrivateOfferGallery";

export default function OfferDetailWorkspace({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const { hasPermission } = useAuth();
  const canTransition = hasPermission(Permission.OFFERS_TRANSITION);
  const [offer, setOffer] = useState<ApiOffer | null>(null);
  const [error, setError] = useState("");
  const [changing, setChanging] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      setOffer(await commerceApi.offers.get(id));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement impossible",
      );
    }
  }, [id]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const transition = async (status: string) => {
    setChanging(true);
    setError("");
    try {
      await commerceApi.offers.transition(id, status);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Transition impossible",
      );
    } finally {
      setChanging(false);
    }
  };
  return (
    <>
      <Topbar
        title="Détail de l’offre"
        subtitle={offer?.reference ?? "Chargement…"}
      />
      <main className="space-y-5 p-8">
        <Link
          href="/offres"
          className="inline-flex items-center gap-2 text-sm text-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux offres
        </Link>
        {error && <ErrorState message={error} retry={() => void load()} />}
        {!offer ? (
          <LoadingState />
        ) : (
          <>
            <PrivateOfferGallery offer={offer} onReplaced={setOffer} />
            <section className="card space-y-5 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-muted">
                    {offer.reference} · {offer.supplier.name}
                  </p>
                  <h1 className="text-2xl font-bold">
                    {offer.brand} {offer.model} {offer.version}
                  </h1>
                  <p className="mt-1 text-sm text-muted">
                    {offer.condition === "new" ? "Neuf" : "Occasion"} ·{" "}
                    {offer.year ?? "—"}
                  </p>
                </div>
                <Link
                  href={`/dossiers/creer?offerId=${offer.id}`}
                  className="rounded-button bg-foreground px-4 py-2 text-sm font-medium text-white"
                >
                  Créer un dossier
                </Link>
                {canTransition && (
                  <div className="flex flex-wrap gap-2">
                    {[
                      "UNDER_VERIFICATION",
                      "VALIDATED",
                      "REJECTED",
                      "RESERVED",
                    ].map((status) => (
                      <button
                        key={status}
                        disabled={changing || offer.status === status}
                        onClick={() => void transition(status)}
                        className="rounded-button border px-3 py-2 text-xs disabled:opacity-40"
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <Info
                  label="Prix fournisseur"
                  value={formatMoney(offer.supplierPrice, offer.currency)}
                />
                <Info
                  label="Prix CIF"
                  value={formatMoney(offer.cifPrice, offer.currency)}
                />
                <Info
                  label="Prix DDP"
                  value={formatMoney(offer.ddpPrice, offer.currency)}
                />
                <Info
                  label="Disponible"
                  value={`${offer.remainingQuantity} / ${offer.availableQuantity}`}
                />
                <Info label="Statut" value={offer.status} />
              </div>
            </section>
            <section className="grid gap-5 md:grid-cols-2">
              <div className="card p-5">
                <h2 className="mb-3 flex items-center gap-2 font-semibold">
                  <Package className="h-4 w-4" />
                  Spécification
                </h2>
                <pre className="whitespace-pre-wrap text-sm text-muted">
                  {JSON.stringify(offer.specification, null, 2)}
                </pre>
              </div>
              <div className="card p-5">
                <h2 className="mb-3 flex items-center gap-2 font-semibold">
                  <Calendar className="h-4 w-4" />
                  Validité
                </h2>
                <p className="text-sm">
                  Du{" "}
                  {new Date(offer.validFrom).toLocaleDateString(
                    getRuntimeLocale(),
                  )}{" "}
                  au{" "}
                  {new Date(offer.validUntil).toLocaleDateString(
                    getRuntimeLocale(),
                  )}
                </p>
                <p className="mt-2 text-sm text-muted">
                  Délai estimé : {offer.estimatedDelayDays ?? "—"} jours
                </p>
              </div>
            </section>
            {offer.reservations && (
              <section className="card p-5">
                <h2 className="mb-3 font-semibold">Intérêts et réservations</h2>
                {offer.reservations.length === 0 ? (
                  <p className="text-sm text-muted">Aucune réservation.</p>
                ) : (
                  <div className="divide-y">
                    {offer.reservations.map((reservation) => (
                      <div
                        key={reservation.id}
                        className="flex justify-between py-3 text-sm"
                      >
                        <span>
                          {reservation.client?.firstName}{" "}
                          {reservation.client?.lastName}
                        </span>
                        <span>
                          {reservation.quantity} · {reservation.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            <section className="grid gap-5 md:grid-cols-2">
              <div className="card p-5">
                <h2 className="mb-3 font-semibold">Historique des prix</h2>
                {!offer.revisions?.length ? (
                  <p className="text-sm text-muted">
                    Offre héritée à rapprocher; la première modification créera
                    la version initiale.
                  </p>
                ) : (
                  offer.revisions.map((revision) => (
                    <div
                      key={revision.id}
                      className="border-b py-2 text-sm last:border-0"
                    >
                      <b>v{revision.version}</b> ·{" "}
                      {formatMoney(revision.supplierPrice, revision.currency)}
                      <span className="block text-xs text-muted">
                        {revision.changeReason}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="card p-5">
                <h2 className="mb-3 font-semibold">Historique du workflow</h2>
                {!offer.statusHistory?.length ? (
                  <p className="text-sm text-muted">
                    Aucune transition enregistrée.
                  </p>
                ) : (
                  offer.statusHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="border-b py-2 text-sm last:border-0"
                    >
                      {entry.fromStatus ?? "—"} → <b>{entry.toStatus}</b>
                      {entry.reason && (
                        <span className="block text-xs text-muted">
                          {entry.reason}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
