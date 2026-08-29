"use client";

import { getRuntimeLocale } from "@/lib/i18n/runtime-locale";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Calendar, Plus, Search, X } from "lucide-react";
import Topbar from "@/components/Topbar";
import {
  commerceApi,
  type ApiOffer,
  type ApiPartner,
} from "@/lib/commerce-api";
import {
  buttonClass,
  EmptyState,
  ErrorState,
  formatMoney,
  inputClass,
  LoadingState,
} from "./common";

const today = new Date().toISOString().slice(0, 10);
const emptyForm = {
  supplierId: "",
  brand: "",
  model: "",
  version: "",
  year: "",
  condition: "new",
  mileage: "",
  engine: "",
  fuelType: "",
  transmission: "",
  color: "",
  supplierPrice: "",
  purchasePrice: "",
  cifPrice: "",
  ddpPrice: "",
  currency: "USD",
  validFrom: today,
  validUntil: "",
  availableQuantity: "1",
  estimatedDelayDays: "",
  notes: "",
};

export default function OffersWorkspace() {
  const [items, setItems] = useState<ApiOffer[]>([]);
  const [suppliers, setSuppliers] = useState<ApiPartner[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    byStatus: Record<string, number>;
    availableQuantity: number;
    reservedQuantity: number;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ApiOffer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [offers, supplierPage, kpis] = await Promise.all([
        commerceApi.offers.list({ search, status, limit: 100 }),
        commerceApi.partners.list({
          type: "supplier",
          status: "active",
          limit: 100,
        }),
        commerceApi.offers.statistics(),
      ]);
      setItems(offers.items);
      setSuppliers(supplierPage.items);
      setStats(kpis);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement impossible",
      );
    } finally {
      setLoading(false);
    }
  }, [search, status]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  const open = (offer?: ApiOffer) => {
    setEditing(offer ?? null);
    setShowForm(true);
    setForm(
      offer
        ? {
            supplierId: offer.supplierId,
            brand: offer.brand,
            model: offer.model,
            version: offer.version ?? "",
            year: offer.year?.toString() ?? "",
            condition: offer.condition,
            mileage: offer.mileage?.toString() ?? "",
            engine: String(offer.specification.engine ?? ""),
            fuelType: String(offer.specification.fuelType ?? ""),
            transmission: String(offer.specification.transmission ?? ""),
            color: String(offer.specification.color ?? ""),
            supplierPrice:
              offer.supplierPrice?.toString() ??
              offer.purchasePrice?.toString() ??
              "",
            purchasePrice: offer.purchasePrice?.toString() ?? "",
            cifPrice: offer.cifPrice?.toString() ?? "",
            ddpPrice: offer.ddpPrice?.toString() ?? "",
            currency: offer.currency,
            validFrom: offer.validFrom.slice(0, 10),
            validUntil: offer.validUntil.slice(0, 10),
            availableQuantity: offer.availableQuantity.toString(),
            estimatedDelayDays: offer.estimatedDelayDays?.toString() ?? "",
            notes: offer.notes ?? "",
          }
        : emptyForm,
    );
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const supplierPriceVal = form.supplierPrice
      ? Number(form.supplierPrice)
      : form.purchasePrice
        ? Number(form.purchasePrice)
        : 0;
    const payload = {
      supplierId: form.supplierId,
      brand: form.brand,
      model: form.model,
      version: form.version || undefined,
      year: form.year ? Number(form.year) : undefined,
      condition: form.condition,
      mileage: form.mileage ? Number(form.mileage) : undefined,
      specification: {
        engine: form.engine,
        fuelType: form.fuelType,
        transmission: form.transmission,
        color: form.color,
      },
      supplierPrice: supplierPriceVal,
      purchasePrice: supplierPriceVal,
      cifPrice: form.cifPrice ? Number(form.cifPrice) : undefined,
      ddpPrice: form.ddpPrice ? Number(form.ddpPrice) : undefined,
      currency: form.currency,
      validFrom: new Date(form.validFrom).toISOString(),
      validUntil: new Date(form.validUntil).toISOString(),
      availableQuantity: Number(form.availableQuantity),
      estimatedDelayDays: form.estimatedDelayDays
        ? Number(form.estimatedDelayDays)
        : undefined,
      notes: form.notes || undefined,
    };
    try {
      if (editing) await commerceApi.offers.update(editing.id, payload);
      else await commerceApi.offers.createWithPhotos(payload, []);
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Enregistrement impossible",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Topbar
        title="Offres Chine"
        subtitle="Catalogue fournisseur et réservations"
      />
      <main className="space-y-5 p-8">
        {stats && (
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Offres", stats.total],
              ["Disponibles", stats.byStatus.available ?? 0],
              ["Quantité réservée", stats.reservedQuantity],
              ["Expirées", stats.byStatus.expired ?? 0],
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Référence, marque, modèle"
            />
          </label>
          <select
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Tous</option>
            <option value="available">Disponibles</option>
            <option value="reserved">Réservées</option>
            <option value="expired">Expirées</option>
            <option value="upcoming">À venir</option>
          </select>
          <button className={buttonClass} onClick={() => open()}>
            <Plus className="mr-2 inline h-4 w-4" />
            Nouvelle offre
          </button>
        </div>
        {error && <ErrorState message={error} retry={() => void load()} />}
        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState label="Aucune offre persistante." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((offer) => (
              <article key={offer.id} className="card space-y-4 p-5">
                <div className="flex justify-between">
                  <div>
                    <p className="text-xs text-muted">{offer.reference}</p>
                    <h2 className="font-semibold">
                      {offer.brand} {offer.model}
                    </h2>
                  </div>
                  <span className="text-xs">{offer.status}</span>
                </div>
                <p className="text-sm text-muted">
                  {offer.supplier.name} ·{" "}
                  {offer.condition === "new" ? "Neuf" : "Occasion"}
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span>CIF {formatMoney(offer.cifPrice, offer.currency)}</span>
                  <span>DDP {formatMoney(offer.ddpPrice, offer.currency)}</span>
                  <span>{offer.remainingQuantity} disponible(s)</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(offer.validUntil).toLocaleDateString(getRuntimeLocale())}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/offres/${offer.id}`}
                    className="rounded-button border px-3 py-2 text-sm"
                  >
                    Détails
                  </Link>
                  <Link
                    href={`/dossiers/creer?offerId=${offer.id}`}
                    className={buttonClass}
                  >
                    Créer un dossier
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={save}
            className="card max-h-[90vh] w-full max-w-4xl space-y-5 overflow-auto p-6"
          >
            <div className="flex justify-between">
              <h2 className="text-lg font-semibold">
                {editing ? "Modifier l’offre" : "Nouvelle offre"}
              </h2>
              <button type="button" onClick={() => setShowForm(false)}>
                <X />
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label>
                <span className="field-label">Fournisseur *</span>
                <select
                  required
                  className={inputClass}
                  value={form.supplierId}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      supplierId: e.target.value,
                    }))
                  }
                >
                  <option value="">Sélectionner</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  "brand",
                  "model",
                  "version",
                  "year",
                  "mileage",
                  "engine",
                  "fuelType",
                  "transmission",
                  "color",
                  "supplierPrice",
                  "purchasePrice",
                  "cifPrice",
                  "ddpPrice",
                  "availableQuantity",
                  "estimatedDelayDays",
                ] as const
              ).map((key) => (
                <label key={key}>
                  <span className="field-label">
                    {
                      {
                        brand: "Marque *",
                        model: "Modèle *",
                        version: "Version",
                        year: "Année",
                        mileage: "Kilométrage",
                        engine: "Moteur",
                        fuelType: "Carburant",
                        transmission: "Transmission",
                        color: "Couleur",
                        supplierPrice: "Prix fournisseur / achat *",
                        purchasePrice: "Prix achat (référence)",
                        cifPrice: "Prix CIF (optionnel)",
                        ddpPrice: "Prix DDP (optionnel)",
                        availableQuantity: "Quantité *",
                        estimatedDelayDays: "Délai estimé (jours)",
                      }[key]
                    }
                  </span>
                  <input
                    required={[
                      "brand",
                      "model",
                      "supplierPrice",
                      "availableQuantity",
                    ].includes(key)}
                    type={
                      [
                        "brand",
                        "model",
                        "version",
                        "engine",
                        "fuelType",
                        "transmission",
                        "color",
                      ].includes(key)
                        ? "text"
                        : "number"
                    }
                    className={inputClass}
                    value={form[key]}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        [key]: e.target.value,
                      }))
                    }
                  />
                </label>
              ))}
              <label>
                <span className="field-label">État</span>
                <select
                  className={inputClass}
                  value={form.condition}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      condition: e.target.value,
                    }))
                  }
                >
                  <option value="new">Neuf</option>
                  <option value="used">Occasion</option>
                </select>
              </label>
              <label>
                <span className="field-label">Devise</span>
                <select
                  className={inputClass}
                  value={form.currency}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      currency: e.target.value,
                    }))
                  }
                >
                  {["USD", "EUR", "CNY", "DZD"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Valide du *</span>
                <input
                  required
                  type="date"
                  className={inputClass}
                  value={form.validFrom}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      validFrom: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span className="field-label">Au *</span>
                <input
                  required
                  type="date"
                  className={inputClass}
                  value={form.validUntil}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      validUntil: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <label>
              <span className="field-label">Notes</span>
              <textarea
                className={inputClass}
                value={form.notes}
                onChange={(e) =>
                  setForm((current) => ({ ...current, notes: e.target.value }))
                }
              />
            </label>
            <div className="flex justify-end">
              <button disabled={saving} className={buttonClass}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
