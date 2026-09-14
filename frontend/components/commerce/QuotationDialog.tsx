"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { commerceApi, type ApiQuotationPreview } from "@/lib/commerce-api";
import { ApiError } from "@/lib/api";
import {
  buildQuotationDraft,
  type QuotationCostCalculation,
  type QuotationPriceBasis,
} from "@/lib/quotation-calculation";
import { buttonClass, formatMoney, inputClass } from "./common";
const FOREIGN_CURRENCIES = ["USD", "CNY"];
const foreignCurrency = (value?: string) =>
  FOREIGN_CURRENCIES.includes(value ?? "") ? value! : "USD";
function offerActionError(cause: unknown, fallback: string) {
  return cause instanceof ApiError && cause.details.length
    ? `${cause.message} : ${cause.details.join(" · ")}`
    : cause instanceof Error
      ? cause.message
      : fallback;
}
export interface QuotationSource {
  type: "VEHICLE" | "CHINA_OFFER";
  id: string;
  vehicles: Array<{
    id: string;
    brand: string;
    model: string;
    version?: string | null;
    lineNumber?: number;
    supplierPrice?: string | number | null;
    currency?: string | null;
  }>;
}
export default function QuotationDialog({
  source,
  onClose,
  onCreated,
}: {
  source: QuotationSource;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const id = source.id;
  const offer = source;
  const initial = source.vehicles[0];
  const showQuotation = true;
  const load = onCreated;
  const [changing, setChanging] = useState(false);
  const [quotationForm, setQuotationForm] = useState({
    sourceOfferVehicleId: initial?.id ?? "",
    priceBasis: "CIF",
    vehicleAmount:
      initial?.supplierPrice == null ? "" : String(initial.supplierPrice),
    vehicleCurrency: initial?.currency ?? "USD",
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
    { amount: "", currency: "USD", description: "" },
  ]);
  const [dzdRates, setDzdRates] = useState<
    Array<{ currency: string; exchangeRateUsed: string }>
  >([{ currency: "DZD", exchangeRateUsed: "1" }]);
  const [quotationError, setQuotationError] = useState("");
  const [pricingError, setPricingError] = useState("");
  const [authoritativePreview, setAuthoritativePreview] = useState<{
    payloadKey: string;
    result: Partial<ApiQuotationPreview>;
  } | null>(null);
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
    if (!quotationDraft.amounts) return null;
    if (source.type === "VEHICLE") {
      if (!id) return null;
    } else if (!quotationForm.sourceOfferVehicleId) {
      return null;
    }
    return {
      ...(source.type === "VEHICLE"
        ? { sourceVehicleId: id }
        : {
            sourceOfferId: id,
            sourceOfferVehicleId: quotationForm.sourceOfferVehicleId,
          }),
      priceBasis: quotationForm.priceBasis,
      currency: "DZD",
      ...quotationDraft.amounts,
      expiresAt: quotationForm.expiresAt
        ? new Date(quotationForm.expiresAt).toISOString()
        : undefined,
      paymentConditions: quotationForm.paymentConditions || undefined,
    };
  }, [id, source.type, quotationDraft.amounts, quotationForm]);
  const quotationPayloadKey = useMemo(
    () => (quotationPayload ? JSON.stringify(quotationPayload) : ""),
    [quotationPayload],
  );
  const pricingPreview = useMemo(() => {
    const local = quotationDraft.calculation;
    if (
      !local ||
      !authoritativePreview ||
      authoritativePreview.payloadKey !== quotationPayloadKey
    ) {
      return local;
    }
    const numeric = (
      key: keyof ApiQuotationPreview,
      fallback: number | null,
    ) => {
      const raw = authoritativePreview.result[key];
      const value = Number(raw);
      return raw != null && Number.isFinite(value) ? value : fallback;
    };
    return {
      ...local,
      estimatedCifCostDzd: numeric(
        "estimatedCifCostDzd",
        local.estimatedCifCostDzd,
      )!,
      estimatedDdpCostDzd: numeric(
        "estimatedDdpCostDzd",
        local.estimatedDdpCostDzd,
      )!,
      estimatedLandedCostDzd: numeric(
        "estimatedLandedCostDzd",
        local.estimatedLandedCostDzd,
      )!,
      estimatedTotalCostDzd: numeric(
        "estimatedTotalCostDzd",
        local.estimatedTotalCostDzd,
      )!,
      sellingPriceDzd: numeric("sellingPriceDzd", local.sellingPriceDzd),
      estimatedProfitDzd: numeric(
        "estimatedProfitDzd",
        local.estimatedProfitDzd,
      ),
      estimatedMarginPercent: numeric(
        "estimatedMarginPercent",
        local.estimatedMarginPercent,
      ),
    };
  }, [authoritativePreview, quotationDraft.calculation, quotationPayloadKey]);
  const liveCalculationError = quotationDraft.errors.join(" · ");
  const currencyOptions = FOREIGN_CURRENCIES;

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
        .then((result) => {
          if (!active) return;
          setAuthoritativePreview({
            payloadKey: quotationPayloadKey,
            result,
          });
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
  }, [quotationPayload, quotationPayloadKey, showQuotation]);
  const createQuotation = async (event: FormEvent) => {
    event.preventDefault();
    setQuotationError("");
    if (source.type !== "VEHICLE" && !quotationForm.sourceOfferVehicleId) {
      setQuotationError("Sélectionnez un véhicule de l’offre.");
      return;
    }
    if (!quotationPayload) {
      setQuotationError(
        quotationDraft.errors.join(" · ") ||
          (!quotationForm.sellingPriceDzd.trim()
            ? "Le prix de vente client est requis."
            : "Vérifiez les montants du devis avant de continuer."),
      );
      return;
    }
    setChanging(true);
    try {
      await commerceApi.quotations.create(quotationPayload);
      onClose();
      setOtherCosts([{ amount: "", currency: "USD", description: "" }]);
      await load();
    } catch (caught) {
      setQuotationError(
        offerActionError(caught, "Création du devis impossible."),
      );
    } finally {
      setChanging(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <form
        onSubmit={createQuotation}
        className="card max-h-[92vh] w-full max-w-5xl overflow-y-auto p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Nouveau devis client</h2>
          <button type="button" onClick={() => onClose()}>
            <X />
          </button>
        </div>
        <p className="mt-3 rounded-card border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Les coûts sont convertis en DZD avec les taux Finance actifs. À
          l’enregistrement, chaque montant, devise, taux et contre-valeur DZD
          est figé dans la révision du devis.
        </p>
        {(quotationError || pricingError || liveCalculationError) && (
          <div
            role="alert"
            aria-live="polite"
            className="mt-4 rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {quotationError || pricingError || liveCalculationError}
          </div>
        )}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {source.type === "VEHICLE" ? (
            <div className="rounded-card border border-border p-3 sm:col-span-2">
              <span className="field-label">Véhicule source</span>
              <p className="font-semibold">
                {offer.vehicles[0]?.brand} {offer.vehicles[0]?.model}{" "}
                {offer.vehicles[0]?.version ?? ""} · Stock
              </p>
              <p className="text-xs text-muted">ID: {id} — prix DZD à configurer</p>
            </div>
          ) : (
            <label>
              <span className="field-label">Véhicule *</span>
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
                    vehicleAmount: vehicle ? String(vehicle.supplierPrice) : "",
                    vehicleCurrency: foreignCurrency(
                      vehicle?.currency ?? undefined,
                    ),
                    containerCurrency: foreignCurrency(
                      vehicle?.currency ?? undefined,
                    ),
                    insuranceCurrency: foreignCurrency(
                      vehicle?.currency ?? undefined,
                    ),
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
          )}
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
            <legend className="px-2 font-semibold">
              Prix de base véhicule
            </legend>
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem_1fr]">
              <label>
                <span className="field-label">Montant *</span>
                <input
                  aria-label="Montant véhicule"
                  required
                  min="0.01"
                  step="0.01"
                  type="number"
                  className={inputClass}
                  value={quotationForm.vehicleAmount}
                  onChange={(event) =>
                    setQuotationForm((current) => ({
                      ...current,
                      vehicleAmount: event.target.value,
                    }))
                  }
                />
              </label>
              <CurrencySelect
                label="Devise du véhicule"
                value={quotationForm.vehicleCurrency}
                currencies={
                  source.type === "VEHICLE"
                    ? [...currencyOptions, "DZD"]
                    : currencyOptions
                }
                onChange={(vehicleCurrency) =>
                  setQuotationForm((current) => ({
                    ...current,
                    vehicleCurrency,
                  }))
                }
              />
              <RateEquivalent
                cost={pricingPreview?.vehicle}
                required={Number(quotationForm.vehicleAmount) > 0}
              />
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
                  min="0"
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
                currencies={currencyOptions}
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
              <FreightEquivalent
                cost={pricingPreview?.freight}
                required={Number(quotationForm.containerPrice) > 0}
              />
            </div>
          </fieldset>
          {(
            [
              [
                "insuranceAmount",
                "insuranceCurrency",
                "Assurance",
                pricingPreview?.insurance,
              ],
              [
                "transitAmount",
                "transitCurrency",
                "Transit",
                pricingPreview?.transit,
              ],
            ] as const
          ).map(([amountKey, currencyKey, label, cost]) => (
            <fieldset
              key={amountKey}
              className="rounded-card border border-border p-4 sm:col-span-2"
            >
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
                {currencyKey === "transitCurrency" ? (
                  <div className="rounded-card border border-border p-3">
                    <span className="field-label">Devise Transit</span>
                    <p className="font-semibold">DZD</p>
                    <p className="text-xs text-muted">Aucune conversion</p>
                  </div>
                ) : (
                  <CurrencySelect
                    label={`Devise ${label}`}
                    value={quotationForm[currencyKey]}
                    currencies={currencyOptions}
                    onChange={(currency) =>
                      setQuotationForm((current) => ({
                        ...current,
                        [currencyKey]: currency,
                      }))
                    }
                  />
                )}
                <RateEquivalent
                  cost={
                    Number(quotationForm[amountKey].replace(",", ".")) > 0
                      ? cost
                      : undefined
                  }
                  required={
                    Number(quotationForm[amountKey].replace(",", ".")) > 0
                  }
                />
              </div>
            </fieldset>
          ))}
          <fieldset className="rounded-card border border-border p-4 sm:col-span-2">
            <legend className="px-2 font-semibold">Douane estimée (DZD)</legend>
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
              <div className="rounded-card border border-border p-3">
                <span className="field-label">Devise fixe</span>
                <p className="font-semibold">DZD</p>
                <p className="text-xs text-muted">Aucune conversion</p>
              </div>
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
                className="grid gap-2 sm:grid-cols-[2fr_1fr_7rem_1fr_auto]"
              >
                <input
                  aria-label={`Description autre coût ${index + 1}`}
                  required={Number(cost.amount.replace(",", ".")) > 0}
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
                  {currencyOptions.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
                <RateEquivalent
                  cost={
                    Number(cost.amount.replace(",", ".")) > 0
                      ? pricingPreview?.otherCosts[
                          otherCosts
                            .slice(0, index + 1)
                            .filter(
                              (item) =>
                                Number(item.amount.replace(",", ".")) > 0,
                            ).length - 1
                        ]
                      : undefined
                  }
                  required={Number(cost.amount.replace(",", ".")) > 0}
                />
                {otherCosts.length > 1 && (
                  <button
                    type="button"
                    className="rounded-button border px-3"
                    onClick={() =>
                      setOtherCosts((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
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
                  { amount: "", currency: "USD", description: "" },
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
            <CostSummaryRow
              label="Assurance"
              cost={pricingPreview?.insurance}
            />
            <CostSummaryRow label="Transit" cost={pricingPreview?.transit} />
            {otherCosts
              .filter((cost) => Number(cost.amount.replace(",", ".")) > 0)
              .map((cost, index) => (
                <CostSummaryRow
                  key={`${cost.description}-${index}`}
                  label={cost.description || `Autre coût ${index + 1}`}
                  cost={pricingPreview?.otherCosts[index]}
                />
              ))}
            <div className="flex items-center justify-between gap-4 py-3 text-sm">
              <span>Total autres coûts</span>
              <b className="text-base">
                {formatMoney(pricingPreview?.otherCostsDzd, "DZD")}
              </b>
            </div>
            <CostSummaryRow
              label="Douane estimée"
              cost={pricingPreview?.customs}
            />
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info
              label="Coût CIF estimé"
              value={formatMoney(pricingPreview?.estimatedCifCostDzd, "DZD")}
            />
            <Info
              label="Coût DDP estimé"
              value={formatMoney(pricingPreview?.estimatedDdpCostDzd, "DZD")}
            />
          </dl>
          <div className="mt-4 grid gap-3 border-t-2 border-foreground/15 pt-4 sm:grid-cols-2">
            <Info
              label={`Total estimé ${quotationForm.priceBasis}`}
              value={formatMoney(pricingPreview?.estimatedTotalCostDzd, "DZD")}
            />
            <Info
              label="Prix de vente"
              value={
                pricingPreview?.sellingPriceDzd == null
                  ? "— DZD"
                  : formatMoney(pricingPreview.sellingPriceDzd, "DZD")
              }
            />
            <Info
              label="Bénéfice estimé"
              value={
                pricingPreview?.estimatedProfitDzd == null
                  ? "— DZD"
                  : formatMoney(pricingPreview.estimatedProfitDzd, "DZD")
              }
            />
            <Info
              label="Marge estimée"
              value={
                pricingPreview?.estimatedMarginPercent == null
                  ? "— % · Prix de vente requis"
                  : `${pricingPreview.estimatedMarginPercent.toFixed(2)} %`
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

function RateEquivalent({
  cost,
  required = false,
}: {
  cost?: QuotationCostCalculation;
  required?: boolean;
}) {
  return (
    <div className="rounded-card border border-border p-3">
      <span className="field-label">Taux Finance utilisé</span>
      <p className="text-xs text-muted">
        {cost
          ? `1 ${cost.currency} = ${cost.exchangeRateUsed} DZD`
          : required
            ? "Taux Finance indisponible"
            : "—"}
      </p>
      <p className="mt-1 text-xs text-muted">Équivalent DZD</p>
      <p className="font-semibold text-foreground">
        {cost
          ? formatMoney(cost.amountDzd, "DZD")
          : required
            ? "Indisponible"
            : "0 DZD"}
      </p>
    </div>
  );
}

function FreightEquivalent({
  cost,
  required = false,
}: {
  cost?: QuotationCostCalculation;
  required?: boolean;
}) {
  return (
    <div className="rounded-card border border-border p-3">
      <span className="field-label">Fret calculé</span>
      <p className="font-semibold">
        {formatMoney(cost?.amountOriginal, cost?.currency)}
      </p>
      <p className="mt-1 text-xs text-muted">
        {cost
          ? `1 ${cost.currency} = ${cost.exchangeRateUsed} DZD`
          : required
            ? "Taux Finance indisponible"
            : "—"}
      </p>
      <p className="font-semibold text-foreground">
        {cost
          ? formatMoney(cost.amountDzd, "DZD")
          : required
            ? "Indisponible"
            : "0 DZD"}
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
