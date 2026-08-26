"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { CarFront, Eye, Plus, Search, X } from "lucide-react";
import Topbar from "@/components/Topbar";
import { useAuth } from "@/components/AuthProvider";
import {
  OFFER_STATUS_LABELS_API,
  Permission,
  type ApiOfferStatus,
} from "@/lib/api-contract";
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

const empty = {
  supplierId: "",
  brand: "",
  model: "",
  year: "",
  condition: "new",
  purchasePrice: "",
  cifPrice: "",
  ddpPrice: "",
  currency: "USD",
  validFrom: new Date().toISOString().slice(0, 10),
  validUntil: "",
  availableQuantity: "1",
};

export default function OffersChinaPolished() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(Permission.OFFERS_WRITE);
  const canSeePurchase = hasPermission(Permission.OFFERS_READ_PURCHASE_PRICE);
  const [items, setItems] = useState<ApiOffer[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    byStatus: Record<string, number>;
  } | null>(null);
  const [suppliers, setSuppliers] = useState<ApiPartner[]>([]);
  const [filters, setFilters] = useState(() => {
    if (typeof window === "undefined")
      return { search: "", status: "", condition: "", page: 1 };
    const query = new URLSearchParams(window.location.search);
    return {
      search: query.get("search") ?? "",
      status: query.get("status") ?? "",
      condition: query.get("condition") ?? "",
      page: Number(query.get("page") ?? 1),
    };
  });
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 0,
    totalItems: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const syncUrl = useCallback(() => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 1) query.set(key, String(value));
    });
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query.size ? `?${query}` : ""}`,
    );
  }, [filters]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [page, totals, partnerPage] = await Promise.all([
        commerceApi.offers.list({ ...filters, limit: 12 }),
        commerceApi.offers.statistics(),
        canWrite
          ? commerceApi.partners.list({
              type: "supplier",
              status: "active",
              limit: 100,
            })
          : Promise.resolve({ items: [] as ApiPartner[] }),
      ]);
      setItems(page.items);
      setPagination({
        page: page.pagination.page,
        totalPages: page.pagination.totalPages,
        totalItems: page.pagination.totalItems,
      });
      setStats(totals);
      setSuppliers(partnerPage.items);
      syncUrl();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Chargement impossible",
      );
    } finally {
      setLoading(false);
    }
  }, [canWrite, filters, syncUrl]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 180);
    return () => clearTimeout(timer);
  }, [load]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await commerceApi.offers.create({
        ...form,
        year: form.year ? Number(form.year) : undefined,
        purchasePrice: form.purchasePrice
          ? Number(form.purchasePrice)
          : undefined,
        cifPrice: Number(form.cifPrice),
        ddpPrice: Number(form.ddpPrice),
        availableQuantity: Number(form.availableQuantity),
        specification: {},
        validFrom: new Date(form.validFrom).toISOString(),
        validUntil: new Date(form.validUntil).toISOString(),
      });
      setShowForm(false);
      setForm(empty);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Création impossible");
    } finally {
      setSaving(false);
    }
  }
  const cards = stats
    ? [
        ["Total offres", stats.total, "text-neutral-900"],
        ["Disponibles", stats.byStatus.available ?? 0, "text-emerald-600"],
        ["Réservées", stats.byStatus.reserved ?? 0, "text-amber-600"],
        ["Vendues", stats.byStatus.sold ?? 0, "text-blue-600"],
        ["Expirées", stats.byStatus.expired ?? 0, "text-red-600"],
      ]
    : [];
  return (
    <>
      <Topbar
        title="Offres Chine"
        subtitle="Catalogue véhicules fournisseurs chinois"
      />
      <main className="space-y-6 p-4 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map(([label, value, color]) => (
            <section key={String(label)} className="card min-h-32">
              <p className="text-sm uppercase tracking-wide text-muted">
                {label}
              </p>
              <p className={`mt-4 text-3xl font-bold ${color}`}>{value}</p>
            </section>
          ))}
        </div>
        <section className="card flex flex-wrap items-center gap-4">
          <label className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-3 h-5 w-5 text-muted" />
            <span className="sr-only">Rechercher</span>
            <input
              className={`${inputClass} pl-10`}
              placeholder="Rechercher…"
              value={filters.search}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  search: event.target.value,
                  page: 1,
                }))
              }
            />
          </label>
          <select
            aria-label="Statut"
            className={inputClass}
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value,
                page: 1,
              }))
            }
          >
            <option value="">Tous les statuts</option>
            {["available", "reserved", "sold", "expired", "upcoming"].map(
              (value) => (
                <option key={value} value={value}>
                  {OFFER_STATUS_LABELS_API[value as ApiOfferStatus] ??
                    (value === "upcoming" ? "À venir" : value)}
                </option>
              ),
            )}
          </select>
          <select
            aria-label="Condition"
            className={inputClass}
            value={filters.condition}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                condition: event.target.value,
                page: 1,
              }))
            }
          >
            <option value="">Toutes conditions</option>
            <option value="new">Neuf</option>
            <option value="used">Occasion</option>
          </select>
          {canWrite && (
            <button className={buttonClass} onClick={() => setShowForm(true)}>
              <Plus className="mr-2 inline h-4 w-4" />
              Nouvelle offre
            </button>
          )}
        </section>
        {error && <ErrorState message={error} retry={() => void load()} />}
        {loading ? (
          <LoadingState />
        ) : !items.length ? (
          <EmptyState label="Aucune offre pour ces filtres." />
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-border bg-white lg:block">
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted">
                    {[
                      "Photo",
                      "Véhicule",
                      "Fournisseur",
                      "Année",
                      "État",
                      "Prix CIF",
                      "Prix DDP",
                      ...(canSeePurchase ? ["Prix achat"] : []),
                      "Disponibilité",
                      "Statut",
                      "Validité",
                      "Actions",
                    ].map((label) => (
                      <th key={label} className="px-4 py-4">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((offer) => (
                    <OfferRow
                      key={offer.id}
                      offer={offer}
                      canSeePurchase={canSeePurchase}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-4 lg:hidden">
              {items.map((offer) => (
                <article key={offer.id} className="card">
                  <div className="flex gap-4">
                    <div className="flex h-20 w-24 items-center justify-center rounded-lg bg-neutral-100">
                      <CarFront className="text-muted" />
                    </div>
                    <div>
                      <p className="font-bold">
                        {offer.brand} {offer.model}
                      </p>
                      <p className="text-xs text-muted">
                        {offer.reference} · {offer.supplier.name}
                      </p>
                      <p className="mt-2 text-sm">
                        CIF {formatMoney(offer.cifPrice, offer.currency)} · DDP{" "}
                        {formatMoney(offer.ddpPrice, offer.currency)}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <Mini
                      label="État"
                      value={offer.condition === "new" ? "Neuf" : "Occasion"}
                    />
                    <Mini
                      label="Disponible"
                      value={String(offer.remainingQuantity)}
                    />
                    <Mini
                      label="Statut"
                      value={
                        OFFER_STATUS_LABELS_API[
                          offer.status as ApiOfferStatus
                        ] ?? offer.status
                      }
                    />
                    <Mini
                      label="Validité"
                      value={new Date(offer.validUntil).toLocaleDateString(
                        "fr-FR",
                      )}
                    />
                  </dl>
                  <Link
                    className="mt-4 inline-flex items-center gap-2 font-semibold text-blue-700"
                    href={`/offres/${offer.id}`}
                  >
                    <Eye className="h-4 w-4" />
                    Voir l’offre
                  </Link>
                </article>
              ))}
            </div>
          </>
        )}
        {pagination.totalPages > 1 && (
          <nav className="flex justify-center gap-3" aria-label="Pagination">
            <button
              disabled={pagination.page <= 1}
              className="rounded-lg border px-4 py-2 disabled:opacity-40"
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page - 1,
                }))
              }
            >
              Précédent
            </button>
            <span className="py-2 text-sm">
              Page {pagination.page}/{pagination.totalPages}
            </span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              className="rounded-lg border px-4 py-2 disabled:opacity-40"
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page + 1,
                }))
              }
            >
              Suivant
            </button>
          </nav>
        )}
      </main>
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3">
          <form
            onSubmit={save}
            className="card max-h-[92vh] w-full max-w-3xl overflow-y-auto p-6"
          >
            <div className="flex justify-between">
              <h2 className="text-xl font-bold">Nouvelle offre</h2>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setShowForm(false)}
              >
                <X />
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {Object.entries({
                supplierId: "Fournisseur *",
                brand: "Marque *",
                model: "Modèle *",
                year: "Année",
                purchasePrice: "Prix achat",
                cifPrice: "Prix CIF *",
                ddpPrice: "Prix DDP *",
                validFrom: "Valide du *",
                validUntil: "Valide jusqu’au *",
                availableQuantity: "Quantité *",
              }).map(([key, label]) =>
                key === "supplierId" ? (
                  <label key={key}>
                    <span className="field-label">{label}</span>
                    <select
                      required
                      className={inputClass}
                      value={form.supplierId}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          supplierId: event.target.value,
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
                ) : (
                  <label key={key}>
                    <span className="field-label">{label}</span>
                    <input
                      required={[
                        "brand",
                        "model",
                        "cifPrice",
                        "ddpPrice",
                        "validFrom",
                        "validUntil",
                        "availableQuantity",
                      ].includes(key)}
                      type={
                        key.startsWith("valid")
                          ? "date"
                          : ["brand", "model"].includes(key)
                            ? "text"
                            : "number"
                      }
                      className={inputClass}
                      value={form[key as keyof typeof form]}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ),
              )}
            </div>
            <button disabled={saving} className={`${buttonClass} mt-6 w-full`}>
              {saving ? "Création…" : "Créer l’offre"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
function OfferRow({
  offer,
  canSeePurchase,
}: {
  offer: ApiOffer;
  canSeePurchase: boolean;
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-4">
        <div className="flex h-14 w-16 items-center justify-center rounded-lg bg-neutral-100">
          <CarFront className="h-5 w-5 text-muted" />
        </div>
      </td>
      <td className="px-4 py-4">
        <strong>
          {offer.brand} {offer.model}
        </strong>
        <span className="block text-xs text-muted">{offer.reference}</span>
      </td>
      <td className="px-4 py-4">
        {offer.supplier.name}
        <span className="block text-xs text-muted">
          {offer.supplier.city ?? offer.supplier.country ?? "Non renseigné"}
        </span>
      </td>
      <td className="px-4 py-4">{offer.year ?? "—"}</td>
      <td className="px-4 py-4">
        {offer.condition === "new" ? "Neuf" : "Occasion"}
      </td>
      <td className="px-4 py-4">
        {formatMoney(offer.cifPrice, offer.currency)}
      </td>
      <td className="px-4 py-4">
        {formatMoney(offer.ddpPrice, offer.currency)}
      </td>
      {canSeePurchase && (
        <td className="px-4 py-4">
          {formatMoney(offer.purchasePrice, offer.currency)}
        </td>
      )}
      <td className="px-4 py-4">{offer.remainingQuantity}</td>
      <td className="px-4 py-4">
        <span className="rounded-full border border-border px-3 py-1">
          {OFFER_STATUS_LABELS_API[offer.status as ApiOfferStatus] ??
            offer.status}
        </span>
      </td>
      <td className="px-4 py-4">
        {new Date(offer.validUntil).toLocaleDateString("fr-FR")}
      </td>
      <td className="px-4 py-4">
        <Link
          aria-label={`Voir ${offer.reference}`}
          href={`/offres/${offer.id}`}
        >
          <Eye />
        </Link>
      </td>
    </tr>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
