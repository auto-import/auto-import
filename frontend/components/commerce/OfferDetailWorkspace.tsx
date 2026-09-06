"use client";

import { getRuntimeLocale } from "@/lib/i18n/runtime-locale";

import React, {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
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
  buildQuotationDraft,
  type QuotationCostCalculation,
  type QuotationPriceBasis,
} from "@/lib/quotation-calculation";
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
  const [showOfferEdit, setShowOfferEdit] = useState(false);
  const [offerEdit, setOfferEdit] = useState({
    supplierPrice: "",
    currency: "USD",
    incoterm: "FOB",
    localCost: "",
    revisionReason: "",
  });
  const [quotationForm, setQuotationForm] = useState({
    sourceOfferVehicleId: "",
    priceBasis: "CIF",
    vehicleAmount: "",
    vehicleCurrency: "USD",
    containerPrice: "0",
    containerCurrency: "USD",
    containerAllocation: "3",
    insuranceAmount: "0",
    insuranceCurrency: "USD",
    customsAmount: "0",
    transitAmount: "0",
    transitCurrency: "DZD",
    sellingPriceDzd: "",
    expiresAt: "",
    paymentConditions: "",
  });
  const [otherCosts, setOtherCosts] = useState([
    { amount: "", currency: "DZD", description: "" },
  ]);
  const [dzdRates, setDzdRates] = useState<
    Array<{ currency: string; exchangeRateUsed: string }>
  >([{ currency: "DZD", exchangeRateUsed: "1" }]);
  const [quotationError, setQuotationError] = useState("");
  const [pricingError, setPricingError] = useState("");
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
  const rateMap = useMemo(
    () =>
      Object.fromEntries(
        dzdRates.map((rate) => [rate.currency, rate.exchangeRateUsed]),
      ),
    [dzdRates],
  );
  const quotationDraft = useMemo(
    () =>
      buildQuotationDraft(
        quotationForm.priceBasis as QuotationPriceBasis,
        quotationForm,
        otherCosts,
        rateMap,
      ),
    [otherCosts, quotationForm, rateMap],
  );
  const quotationPayload = useMemo(() => {
    if (!quotationDraft.amounts || !quotationForm.sourceOfferVehicleId) {
      return null;
    }
    return {
      sourceOfferId: id,
      sourceOfferVehicleId: quotationForm.sourceOfferVehicleId,
      priceBasis: quotationForm.priceBasis,
      currency: "DZD",
      ...quotationDraft.amounts,
      expiresAt: quotationForm.expiresAt
        ? new Date(quotationForm.expiresAt).toISOString()
        : undefined,
      paymentConditions: quotationForm.paymentConditions || undefined,
    };
  }, [id, quotationDraft.amounts, quotationForm]);
  const pricingPreview = quotationDraft.calculation;

  useEffect(() => {
    if (!showQuotation) return;
    let active = true;
    void commerceApi.quotations
      .currentDzdRates()
      .then((result) => {
        if (active) setDzdRates(result.rates);
      })
      .catch((caught) => {
        if (active) {
          setDzdRates([{ currency: "DZD", exchangeRateUsed: "1" }]);
          setPricingError(
            offerActionError(caught, "Taux de change Finance indisponibles."),
          );
        }
      });
    return () => {
      active = false;
    };
  }, [showQuotation]);
  useEffect(() => {
    if (!showQuotation || !quotationPayload) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void commerceApi.quotations
        .preview(quotationPayload)
        .then(() => {
          if (!active) return;
          setPricingError("");
        })
        .catch((caught) => {
          if (active) {
            setPricingError(
              offerActionError(caught, "Aperçu du calcul indisponible."),
            );
          }
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [quotationPayload, showQuotation]);
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
    setQuotationError("");
    if (!quotationForm.sourceOfferVehicleId) {
      setQuotationError("Sélectionnez un véhicule de l’offre.");
      return;
    }
    if (!quotationPayload) {
      setQuotationError(
        quotationDraft.errors.join(" · ") ||
          "Vérifiez les montants du devis avant de continuer.",
      );
      return;
    }
    setChanging(true);
    try {
      await commerceApi.quotations.create(quotationPayload);
      setShowQuotation(false);
      setOtherCosts([{ amount: "", currency: "DZD", description: "" }]);
      await load();
    } catch (caught) {
      setQuotationError(
        offerActionError(caught, "Création du devis impossible."),
      );
    } finally {
      setChanging(false);
    }
  };
  const saveOfferEdit = async (event: FormEvent) => {
    event.preventDefault();
    setChanging(true);
    setError("");
    try {
      await commerceApi.offers.update(id, {
        supplierPrice: Number(offerEdit.supplierPrice),
        currency: offerEdit.currency,
        incoterm: offerEdit.incoterm,
        localCost:
          offerEdit.incoterm === "FCA" ? Number(offerEdit.localCost || 0) : 0,
        revisionReason: offerEdit.revisionReason.trim(),
      });
      setShowOfferEdit(false);
      await load();
    } catch (caught) {
      setError(offerActionError(caught, "Modification impossible"));
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-button border px-4 py-2 text-sm font-medium"
                      onClick={() => {
                        setOfferEdit({
                          supplierPrice: String(offer.supplierPrice ?? ""),
                          currency: offer.currency,
                          incoterm: offer.incoterm ?? "FOB",
                          localCost: String(offer.localCost ?? ""),
                          revisionReason: "",
                        });
                        setShowOfferEdit(true);
                      }}
                    >
                      Modifier l’offre
                    </button>
                    <button
                      className={buttonClass}
                      onClick={() => {
                        const vehicle = offer.vehicles?.[0];
                        setQuotationError("");
                        setPricingError("");
                        setQuotationForm((current) => ({
                          ...current,
                          sourceOfferVehicleId: vehicle?.id ?? "",
                          vehicleAmount: vehicle
                            ? String(vehicle.supplierPrice)
                            : "",
                          vehicleCurrency: vehicle?.currency ?? "DZD",
                          containerCurrency: vehicle?.currency ?? "DZD",
                          insuranceCurrency: vehicle?.currency ?? "DZD",
                        }));
                        setShowQuotation(true);
                      }}
                    >
                      <Plus className="mr-2 inline h-4 w-4" />
                      Créer un devis
                    </button>
                  </div>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Info
                  label="Prix fournisseur"
                  value={formatMoney(offer.supplierPrice, offer.currency)}
                />
                <Info
                  label={`Prix total ${offer.incoterm ?? ""}`}
                  value={formatMoney(
                    offer.totalOfferPrice ?? offer.supplierPrice,
                    offer.currency,
                  )}
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
              <h2 className="mb-3 font-semibold">Devis de l’offre</h2>
              {!quotations.length ? (
                <p className="text-sm text-muted">
                  Aucun devis commercial. L’offre seule n’apparaît pas au
                  Catalogue.
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
                        {quotation.priceBasis} · ligne offre{" "}
                        {quotation.sourceOfferVehicle?.lineNumber ?? "—"}
                      </span>
                      <span>
                        {formatMoney(
                          quotation.currentRevision?.sellingPriceDzd ??
                            quotation.currentRevision?.finalCustomerPriceDzd,
                          "DZD",
                        )}{" "}
                        · marge estimée {Number(
                          quotation.currentRevision?.estimatedMarginPercent ?? 0,
                        ).toFixed(1)} % · {quotation.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
      {showOfferEdit && offer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <form
            onSubmit={saveOfferEdit}
            className="card max-h-[90vh] w-full max-w-xl overflow-y-auto p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Modifier l’offre</h2>
              <button type="button" onClick={() => setShowOfferEdit(false)}>
                <X />
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="field-label">Prix fournisseur *</span>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  className={inputClass}
                  value={offerEdit.supplierPrice}
                  onChange={(event) =>
                    setOfferEdit((current) => ({
                      ...current,
                      supplierPrice: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span className="field-label">Devise *</span>
                <select
                  className={inputClass}
                  value={offerEdit.currency}
                  onChange={(event) =>
                    setOfferEdit((current) => ({
                      ...current,
                      currency: event.target.value,
                    }))
                  }
                >
                  <option value="USD">USD</option>
                  <option value="CNY">CNY</option>
                </select>
              </label>
              <label>
                <span className="field-label">Incoterm *</span>
                <select
                  className={inputClass}
                  value={offerEdit.incoterm}
                  onChange={(event) =>
                    setOfferEdit((current) => ({
                      ...current,
                      incoterm: event.target.value,
                    }))
                  }
                >
                  <option value="FCA">FCA</option>
                  <option value="FOB">FOB</option>
                </select>
              </label>
              {offerEdit.incoterm === "FCA" && (
                <label>
                  <span className="field-label">Frais locaux *</span>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputClass}
                    value={offerEdit.localCost}
                    onChange={(event) =>
                      setOfferEdit((current) => ({
                        ...current,
                        localCost: event.target.value,
                      }))
                    }
                  />
                </label>
              )}
              <div className="rounded-card border border-border p-3">
                <span className="field-label">Nouveau total</span>
                <p className="font-bold">
                  {formatMoney(
                    Number(offerEdit.supplierPrice || 0) +
                      (offerEdit.incoterm === "FCA"
                        ? Number(offerEdit.localCost || 0)
                        : 0),
                    offerEdit.currency,
                  )}
                </p>
              </div>
              <label className="sm:col-span-2">
                <span className="field-label">Motif de révision *</span>
                <textarea
                  required
                  className={inputClass}
                  value={offerEdit.revisionReason}
                  onChange={(event) =>
                    setOfferEdit((current) => ({
                      ...current,
                      revisionReason: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <button
              disabled={changing}
              className={`${buttonClass} mt-6 w-full`}
            >
              {changing ? "Enregistrement…" : "Enregistrer la révision"}
            </button>
          </form>
        </div>
      )}
      {showQuotation && offer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <form
            onSubmit={createQuotation}
            className="card max-h-[92vh] w-full max-w-5xl overflow-y-auto p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Nouveau devis client</h2>
              <button type="button" onClick={() => setShowQuotation(false)}>
                <X />
              </button>
            </div>
            <p className="mt-3 rounded-card border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              Les coûts sont convertis en DZD avec les taux Finance actifs. À
              l’enregistrement, chaque montant, devise, taux et contre-valeur DZD
              est figé dans la révision du devis.
            </p>
            {(quotationError || pricingError) && (
              <div
                role="alert"
                aria-live="polite"
                className="mt-4 rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                {quotationError || pricingError}
              </div>
            )}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="field-label">Véhicule de l’offre *</span>
                <select
                  required
                  className={inputClass}
                  value={quotationForm.sourceOfferVehicleId}
                  onChange={(event) => {
                    const vehicle = offer.vehicles?.find(
                      (item) => item.id === event.target.value,
                    );
                    setQuotationForm((current) => ({
                      ...current,
                      sourceOfferVehicleId: event.target.value,
                      vehicleAmount: vehicle
                        ? String(vehicle.supplierPrice)
                        : "",
                      vehicleCurrency: vehicle?.currency ?? "DZD",
                      containerCurrency: vehicle?.currency ?? "DZD",
                      insuranceCurrency: vehicle?.currency ?? "DZD",
                    }));
                  }}
                >
                  <option value="">Sélectionner une ligne</option>
                  {offer.vehicles?.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      #{vehicle.lineNumber} · {vehicle.brand} {vehicle.model}{" "}
                      {vehicle.version}
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
              <fieldset className="rounded-card border border-border p-4 sm:col-span-2">
                <legend className="px-2 font-semibold">Coût véhicule</legend>
                <div className="grid gap-3 sm:grid-cols-[1fr_8rem_1fr]">
                  <label>
                    <span className="field-label">Montant fournisseur *</span>
                    <input
                      aria-label="Montant fournisseur"
                      readOnly
                      className={inputClass}
                      value={quotationForm.vehicleAmount}
                    />
                  </label>
                  <label>
                    <span className="field-label">Devise</span>
                    <input
                      aria-label="Devise du véhicule"
                      readOnly
                      className={inputClass}
                      value={quotationForm.vehicleCurrency}
                    />
                  </label>
                  <RateEquivalent cost={pricingPreview?.vehicle} />
                </div>
              </fieldset>
              <fieldset className="rounded-card border border-border p-4 sm:col-span-2">
                <legend className="px-2 font-semibold">Fret / conteneur</legend>
                <div className="grid gap-3 sm:grid-cols-4">
                  <label>
                    <span className="field-label">Prix du conteneur *</span>
                    <input
                      aria-label="Prix du conteneur"
                      required
                      min="0.01"
                      step="0.01"
                      type="number"
                      className={inputClass}
                      value={quotationForm.containerPrice}
                      onChange={(event) =>
                        setQuotationForm((current) => ({
                          ...current,
                          containerPrice: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <CurrencySelect
                    label="Devise du conteneur"
                    value={quotationForm.containerCurrency}
                    currencies={dzdRates.map((rate) => rate.currency)}
                    onChange={(containerCurrency) =>
                      setQuotationForm((current) => ({
                        ...current,
                        containerCurrency,
                      }))
                    }
                  />
                  <label>
                    <span className="field-label">Part du véhicule *</span>
                    <select
                      className={inputClass}
                      value={quotationForm.containerAllocation}
                      onChange={(event) =>
                        setQuotationForm((current) => ({
                          ...current,
                          containerAllocation: event.target.value,
                        }))
                      }
                    >
                      <option value="3">1/3</option>
                      <option value="4">1/4</option>
                    </select>
                  </label>
                  <RateEquivalent cost={pricingPreview?.freight} />
                </div>
              </fieldset>
              {(
                [
                  ["insuranceAmount", "insuranceCurrency", "Assurance", pricingPreview?.insurance],
                  ["transitAmount", "transitCurrency", "Transit", pricingPreview?.transit],
                ] as const
              ).map(([amountKey, currencyKey, label, cost]) => (
                <fieldset key={amountKey} className="rounded-card border border-border p-4 sm:col-span-2">
                  <legend className="px-2 font-semibold">{label}</legend>
                  <div className="grid gap-3 sm:grid-cols-[1fr_8rem_1fr]">
                    <label>
                      <span className="field-label">Montant</span>
                      <input
                        aria-label={label}
                        min="0"
                        step="0.01"
                        type="number"
                        className={inputClass}
                        value={quotationForm[amountKey]}
                        onChange={(event) =>
                          setQuotationForm((current) => ({
                            ...current,
                            [amountKey]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <CurrencySelect
                      label={`Devise ${label}`}
                      value={quotationForm[currencyKey]}
                      currencies={dzdRates.map((rate) => rate.currency)}
                      onChange={(currency) =>
                        setQuotationForm((current) => ({
                          ...current,
                          [currencyKey]: currency,
                        }))
                      }
                    />
                    <RateEquivalent cost={cost} />
                  </div>
                </fieldset>
              ))}
              <fieldset className="rounded-card border border-border p-4 sm:col-span-2">
                <legend className="px-2 font-semibold">
                  Douane estimée (DZD)
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="field-label">Montant DZD</span>
                    <input
                      aria-label="Douane estimée (DZD)"
                      min="0"
                      step="0.01"
                      type="number"
                      className={inputClass}
                      value={quotationForm.customsAmount}
                      onChange={(event) =>
                        setQuotationForm((current) => ({
                          ...current,
                          customsAmount: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <RateEquivalent cost={pricingPreview?.customs} />
                </div>
                {quotationForm.priceBasis === "CIF" && (
                  <p className="mt-2 text-xs text-muted">
                    Affichée dans le coût rendu, mais exclue du coût opérationnel
                    CIF utilisé pour la marge CIF.
                  </p>
                )}
              </fieldset>
              <label className="sm:col-span-2">
                <span className="field-label">Prix de vente client (DZD) *</span>
                <input
                  aria-label="Prix de vente client (DZD)"
                  required
                  min="0.01"
                  step="0.01"
                  type="number"
                  className={inputClass}
                  value={quotationForm.sellingPriceDzd}
                  onChange={(event) =>
                    setQuotationForm((current) => ({
                      ...current,
                      sellingPriceDzd: event.target.value,
                    }))
                  }
                />
              </label>
              <fieldset className="space-y-3 rounded-card border border-border p-4 sm:col-span-2">
                <legend className="px-2 font-semibold">Autres coûts</legend>
                {otherCosts.map((cost, index) => (
                  <div
                    key={index}
                    className="grid gap-2 sm:grid-cols-[1fr_7rem_2fr_1fr_auto]"
                  >
                    <input
                      aria-label={`Montant autre coût ${index + 1}`}
                      min="0"
                      step="0.01"
                      type="number"
                      className={inputClass}
                      placeholder="Montant"
                      value={cost.amount}
                      onChange={(event) =>
                        setOtherCosts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, amount: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <select
                      aria-label={`Devise autre coût ${index + 1}`}
                      className={inputClass}
                      value={cost.currency}
                      onChange={(event) =>
                        setOtherCosts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, currency: event.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      {dzdRates.map((rate) => (
                        <option key={rate.currency} value={rate.currency}>
                          {rate.currency}
                        </option>
                      ))}
                    </select>
                    {Number(cost.amount.replace(",", ".")) > 0 && (
                      <input
                        aria-label={`Description autre coût ${index + 1}`}
                        required
                        className={inputClass}
                        placeholder="Description du coût"
                        value={cost.description}
                        onChange={(event) =>
                          setOtherCosts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, description: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    )}
                    <RateEquivalent cost={pricingPreview?.otherCosts[index]} />
                    {otherCosts.length > 1 && (
                      <button
                        type="button"
                        className="rounded-button border px-3"
                        onClick={() =>
                          setOtherCosts((current) =>
                            current.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                      >
                        Retirer
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="rounded-button border px-3 py-2 text-sm"
                  onClick={() =>
                    setOtherCosts((current) => [
                      ...current,
                      { amount: "", currency: "DZD", description: "" },
                    ])
                  }
                >
                  + Ajouter un autre coût
                </button>
              </fieldset>
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
            <section className="mt-5 rounded-card border-2 border-foreground/15 bg-neutral-50 p-4">
              <h3 className="font-bold uppercase tracking-wide">
                Récapitulatif des coûts estimés
              </h3>
              <div className="mt-3 divide-y divide-border rounded-card border border-border bg-white px-4">
                <CostSummaryRow label="Véhicule" cost={pricingPreview?.vehicle} />
                <CostSummaryRow label="Fret" cost={pricingPreview?.freight} />
                <CostSummaryRow label="Assurance" cost={pricingPreview?.insurance} />
                <CostSummaryRow label="Transit" cost={pricingPreview?.transit} />
                <div className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span>Autres coûts</span>
                  <b>{formatMoney(pricingPreview?.otherCostsDzd, "DZD")}</b>
                </div>
                <CostSummaryRow
                  label="Douane estimée"
                  cost={pricingPreview?.customs}
                />
              </div>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <Info
                  label="Coût opérationnel CIF"
                  value={formatMoney(pricingPreview?.estimatedCifCostDzd, "DZD")}
                />
                <Info
                  label="Coût rendu avec douane"
                  value={formatMoney(
                    pricingPreview?.estimatedLandedCostDzd,
                    "DZD",
                  )}
                />
              </dl>
              <div className="mt-4 grid gap-3 border-t-2 border-foreground/15 pt-4 sm:grid-cols-2">
                <Info
                  label={`Total estimé ${quotationForm.priceBasis}`}
                  value={formatMoney(
                    pricingPreview?.estimatedTotalCostDzd,
                    "DZD",
                  )}
                />
                <Info
                  label="Prix de vente"
                  value={formatMoney(pricingPreview?.sellingPriceDzd, "DZD")}
                />
                <Info
                  label="Profit estimé"
                  value={formatMoney(pricingPreview?.estimatedProfitDzd, "DZD")}
                />
                <Info
                  label="Marge estimée"
                  value={
                    pricingPreview
                      ? `${pricingPreview.estimatedMarginPercent.toFixed(1)} %`
                      : "—"
                  }
                />
              </div>
            </section>
            <button
              type="submit"
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

function CurrencySelect({
  label,
  value,
  currencies,
  onChange,
}: {
  label: string;
  value: string;
  currencies: string[];
  onChange: (currency: string) => void;
}) {
  return (
    <label>
      <span className="field-label">{label}</span>
      <select
        aria-label={label}
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {currencies.map((currency) => (
          <option key={currency} value={currency}>
            {currency}
          </option>
        ))}
      </select>
    </label>
  );
}

function RateEquivalent({ cost }: { cost?: QuotationCostCalculation }) {
  return (
    <div className="rounded-card border border-border p-3">
      <span className="field-label">Taux / équivalent</span>
      <p className="text-xs text-muted">
        {cost ? `1 ${cost.currency} = ${cost.exchangeRateUsed} DZD` : "—"}
      </p>
      <p className="font-semibold">
        {formatMoney(cost?.amountDzd, "DZD")}
      </p>
    </div>
  );
}

function CostSummaryRow({
  label,
  cost,
}: {
  label: string;
  cost?: QuotationCostCalculation;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      <span className="font-medium">{label}</span>
      <span className="text-right">
        <span className="block">
          {formatMoney(cost?.amountOriginal, cost?.currency ?? "DZD")}
          {cost && cost.currency !== "DZD" && ` × ${cost.exchangeRateUsed}`}
        </span>
        <b>{formatMoney(cost?.amountDzd, "DZD")}</b>
      </span>
    </div>
  );
}
