"use client";

import { getRuntimeLocale } from "@/lib/i18n/runtime-locale";

import React, { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Calendar, Package, Plus, X } from "lucide-react";
import Topbar from "@/components/Topbar";
import {
  commerceApi,
  type ApiCustomerQuotation,
  type ApiOffer,
} from "@/lib/commerce-api";
import { useAuth } from "@/components/AuthProvider";
import {
  OFFER_STATUS_LABELS_API,
  Permission,
  type ApiOfferStatus,
} from "@/lib/api-contract";
import { ApiError } from "@/lib/api";
import {
  buttonClass,
  ErrorState,
  formatMoney,
  inputClass,
  LoadingState,
} from "./common";
import PrivateOfferGallery from "./PrivateOfferGallery";

const actionLabels: Partial<Record<ApiOfferStatus, string>> = {
  UNDER_VERIFICATION: "Mettre en vérification",
  VALIDATED: "Marquer disponible",
  RESERVED: "Réserver",
  LOST_DEAL: "Marquer perdue",
  EXPIRED: "Marquer expirée",
};

function offerActionError(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError && cause.details.length) {
    return `${cause.message} : ${cause.details.join(" · ")}`;
  }
  return cause instanceof Error ? cause.message : fallback;
}

export default function OfferDetailWorkspace({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const { hasPermission } = useAuth();
  const canTransition = hasPermission(Permission.OFFERS_TRANSITION);
  const canWrite = hasPermission(Permission.OFFERS_WRITE);
  const canPurchase = hasPermission(Permission.PURCHASES_WRITE);
  const [offer, setOffer] = useState<ApiOffer | null>(null);
  const [quotations, setQuotations] = useState<ApiCustomerQuotation[]>([]);
  const [error, setError] = useState("");
  const [changing, setChanging] = useState(false);
  const [showQuotation, setShowQuotation] = useState(false);
  const [quotationForm, setQuotationForm] = useState({
    dossierId: "",
    priceBasis: "CIF",
    vehicleAmount: "",
    freightAmount: "0",
    insuranceAmount: "0",
    customsAmount: "0",
    transitAmount: "0",
    otherCostsAmount: "0",
    marginAmount: "0",
    currency: "USD",
    expiresAt: "",
    paymentConditions: "",
  });
  const load = useCallback(async () => {
    setError("");
    try {
      const [offerResult, quotationPage] = await Promise.all([
        commerceApi.offers.get(id),
        commerceApi.quotations.list({ sourceOfferId: id, limit: 100 }),
      ]);
      setOffer(offerResult);
      setQuotations(quotationPage.items);
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
      const reason =
        status === "LOST_DEAL"
          ? window.prompt("Motif du deal perdu")?.trim()
          : undefined;
      if (status === "LOST_DEAL" && !reason) return;
      await commerceApi.offers.transition(id, status, reason);
      await load();
    } catch (caught) {
      setError(offerActionError(caught, "Transition impossible"));
    } finally {
      setChanging(false);
    }
  };
  const purchaseVehicle = async (vehicleId: string) => {
    if (
      !window.confirm(
        "Confirmer l’achat de ce véhicule et son entrée au Catalogue ?",
      )
    )
      return;
    const vin = window.prompt("VIN (facultatif si non disponible)")?.trim();
    setChanging(true);
    setError("");
    try {
      await commerceApi.offers.purchaseVehicle(id, vehicleId, {
        vin: vin || undefined,
      });
      await load();
    } catch (caught) {
      setError(offerActionError(caught, "Achat impossible"));
    } finally {
      setChanging(false);
    }
  };
  const loseVehicle = async (vehicleId: string) => {
    const reason = window
      .prompt("Motif du deal perdu pour ce véhicule")
      ?.trim();
    if (!reason) return;
    setChanging(true);
    try {
      await commerceApi.offers.loseVehicle(id, vehicleId, reason);
      await load();
    } catch (caught) {
      setError(offerActionError(caught, "Mise à jour impossible"));
    } finally {
      setChanging(false);
    }
  };
  const createQuotation = async (event: FormEvent) => {
    event.preventDefault();
    setChanging(true);
    setError("");
    try {
      const amountKeys = [
        "vehicleAmount",
        "freightAmount",
        "insuranceAmount",
        "customsAmount",
        "transitAmount",
        "otherCostsAmount",
        "marginAmount",
      ] as const;
      const amounts = Object.fromEntries(
        amountKeys.map((key) => [key, Number(quotationForm[key] || 0)]),
      );
      const finalCustomerPrice = Object.values(amounts).reduce(
        (sum, amount) => sum + amount,
        0,
      );
      await commerceApi.quotations.create({
        ...quotationForm,
        ...amounts,
        finalCustomerPrice,
        sourceOfferId: id,
        expiresAt: quotationForm.expiresAt
          ? new Date(quotationForm.expiresAt).toISOString()
          : undefined,
      });
      setShowQuotation(false);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Création impossible",
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
                      "RESERVED",
                      "LOST_DEAL",
                      "EXPIRED",
                    ].map((status) => (
                      <button
                        key={status}
                        disabled={changing || offer.status === status}
                        onClick={() => void transition(status)}
                        className="rounded-button border px-3 py-2 text-xs disabled:opacity-40"
                      >
                        {actionLabels[status as ApiOfferStatus] ?? status}
                      </button>
                    ))}
                  </div>
                )}
                {canWrite && (
                  <button
                    className={buttonClass}
                    onClick={() => {
                      const dossierId =
                        offer.reservations?.find((item) => item.dossier)
                          ?.dossier?.id ?? "";
                      setQuotationForm((current) => ({
                        ...current,
                        dossierId,
                        currency: offer.currency,
                        vehicleAmount: String(offer.supplierPrice ?? ""),
                      }));
                      setShowQuotation(true);
                    }}
                  >
                    <Plus className="mr-2 inline h-4 w-4" />
                    Créer un devis
                  </button>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Info
                  label="Prix fournisseur"
                  value={formatMoney(offer.supplierPrice, offer.currency)}
                />
                <Info
                  label="Disponible"
                  value={`${offer.remainingQuantity} / ${offer.availableQuantity}`}
                />
                <Info
                  label="Statut"
                  value={
                    OFFER_STATUS_LABELS_API[offer.status as ApiOfferStatus] ??
                    offer.status
                  }
                />
              </div>
            </section>
            <section className="card p-5">
              <h2 className="mb-3 font-semibold">Véhicules de l’offre</h2>
              {!offer.vehicles?.length ? (
                <p className="text-sm text-muted">Aucune ligne véhicule.</p>
              ) : (
                <div className="space-y-3">
                  {offer.vehicles.map((vehicle) => (
                    <article
                      key={vehicle.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border p-4"
                    >
                      <div>
                        <p className="font-semibold">
                          #{vehicle.lineNumber} · {vehicle.brand}{" "}
                          {vehicle.model} {vehicle.version}
                        </p>
                        <p className="text-sm text-muted">
                          {vehicle.year ?? "—"} ·{" "}
                          {vehicle.vin || "VIN non renseigné"} ·{" "}
                          {formatMoney(vehicle.supplierPrice, vehicle.currency)}
                        </p>
                        <p className="text-xs text-muted">
                          {vehicle.purchasedQuantity}/{vehicle.quantity}{" "}
                          acheté(s) · {vehicle.status}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {canPurchase &&
                          ["VALIDATED", "RESERVED"].includes(vehicle.status) &&
                          vehicle.purchasedQuantity < vehicle.quantity && (
                            <button
                              disabled={changing}
                              onClick={() => void purchaseVehicle(vehicle.id)}
                              className={buttonClass}
                            >
                              Acheter / Confirmer l’achat
                            </button>
                          )}
                        {canTransition &&
                          !["PURCHASED", "LOST_DEAL"].includes(
                            vehicle.status,
                          ) && (
                            <button
                              disabled={changing}
                              onClick={() => void loseVehicle(vehicle.id)}
                              className="rounded-button border border-status-red-text px-3 py-2 text-sm text-status-red-text"
                            >
                              Marquer Deal perdu
                            </button>
                          )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
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
                      <b>v{revision.revisionNumber}</b> ·{" "}
                      {formatMoney(revision.supplierPrice, revision.currency)}
                      <span className="block text-xs text-muted">
                        {revision.reason}
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
            <section className="card p-5">
              <h2 className="mb-3 font-semibold">
                Tarification / Devis client
              </h2>
              {!quotations.length ? (
                <p className="text-sm text-muted">
                  Aucun prix client n’est enregistré sur l’offre fournisseur.
                  Affectez l’offre à un dossier puis créez un devis CIF ou DDP.
                </p>
              ) : (
                <div className="divide-y">
                  {quotations.map((quotation) => (
                    <div
                      key={quotation.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                    >
                      <span>
                        <b>{quotation.quotationNumber}</b> ·{" "}
                        {quotation.priceBasis} · {quotation.dossier?.reference}
                      </span>
                      <span>
                        {formatMoney(
                          quotation.currentRevision?.finalCustomerPrice,
                          quotation.currency,
                        )}{" "}
                        · {quotation.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
      {showQuotation && offer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <form
            onSubmit={createQuotation}
            className="card max-h-[92vh] w-full max-w-3xl overflow-y-auto p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Nouveau devis client</h2>
              <button type="button" onClick={() => setShowQuotation(false)}>
                <X />
              </button>
            </div>
            <p className="mt-3 rounded-card border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              Ce devis est indépendant du prix fournisseur et conserve chaque
              révision de prix client.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="field-label">Dossier *</span>
                <select
                  required
                  className={inputClass}
                  value={quotationForm.dossierId}
                  onChange={(event) =>
                    setQuotationForm((current) => ({
                      ...current,
                      dossierId: event.target.value,
                    }))
                  }
                >
                  <option value="">
                    Affecter d’abord l’offre à un dossier
                  </option>
                  {offer.reservations
                    ?.filter((reservation) => reservation.dossier)
                    .map((reservation) => (
                      <option
                        key={reservation.dossier!.id}
                        value={reservation.dossier!.id}
                      >
                        {reservation.dossier!.reference}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span className="field-label">Base tarifaire *</span>
                <select
                  className={inputClass}
                  value={quotationForm.priceBasis}
                  onChange={(event) =>
                    setQuotationForm((current) => ({
                      ...current,
                      priceBasis: event.target.value,
                    }))
                  }
                >
                  <option value="CIF">CIF</option>
                  <option value="DDP">DDP</option>
                </select>
              </label>
              {(
                [
                  ["vehicleAmount", "Base véhicule"],
                  ["freightAmount", "Fret"],
                  ["insuranceAmount", "Assurance"],
                  ["customsAmount", "Douane"],
                  ["transitAmount", "Transit"],
                  ["otherCostsAmount", "Autres coûts"],
                  ["marginAmount", "Marge"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <span className="field-label">{label}</span>
                  <input
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    className={inputClass}
                    value={quotationForm[key]}
                    onChange={(event) =>
                      setQuotationForm((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
              <label>
                <span className="field-label">Expiration</span>
                <input
                  type="date"
                  className={inputClass}
                  value={quotationForm.expiresAt}
                  onChange={(event) =>
                    setQuotationForm((current) => ({
                      ...current,
                      expiresAt: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="sm:col-span-2">
                <span className="field-label">Conditions de paiement</span>
                <textarea
                  className={inputClass}
                  value={quotationForm.paymentConditions}
                  onChange={(event) =>
                    setQuotationForm((current) => ({
                      ...current,
                      paymentConditions: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <button
              disabled={changing}
              className={`${buttonClass} mt-6 w-full`}
            >
              {changing ? "Création…" : "Créer le devis"}
            </button>
          </form>
        </div>
      )}
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
