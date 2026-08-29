"use client";

import { getRuntimeLocale } from "@/lib/i18n/runtime-locale";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
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
  supplierPrice: "",
  supplierReference: "",
  incoterm: "FOB",
  location: "",
  leadTimeDays: "",
  paymentConditions: "",
  vin: "",
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
  const [photos, setPhotos] = useState<Array<File | null>>([null, null, null]);
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
      const selectedPhotos = photos.filter((photo): photo is File =>
        Boolean(photo),
      );
      if (selectedPhotos.length !== 3)
        throw new Error("Les trois photos distinctes sont obligatoires.");
      if (
        selectedPhotos.some(
          (photo) =>
            photo.size > 8 * 1024 * 1024 ||
            !["image/jpeg", "image/png", "image/webp"].includes(photo.type),
        )
      ) {
        throw new Error(
          "Chaque photo doit être un JPEG, PNG ou WebP de 8 Mo maximum.",
        );
      }
      const checksums = await Promise.all(
        selectedPhotos.map(async (photo) => {
          const digest = await crypto.subtle.digest(
            "SHA-256",
            await photo.arrayBuffer(),
          );
          return Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("");
        }),
      );
      if (new Set(checksums).size !== 3) {
        throw new Error(
          "Les trois photos doivent contenir des images distinctes.",
        );
      }
      await commerceApi.offers.createWithPhotos(
        {
          ...form,
          year: form.year ? Number(form.year) : undefined,
          purchasePrice: form.purchasePrice
            ? Number(form.purchasePrice)
            : undefined,
          supplierPrice: Number(form.supplierPrice),
          leadTimeDays: form.leadTimeDays
            ? Number(form.leadTimeDays)
            : undefined,
          cifPrice: form.cifPrice ? Number(form.cifPrice) : undefined,
          ddpPrice: form.ddpPrice ? Number(form.ddpPrice) : undefined,
          availableQuantity: Number(form.availableQuantity),
          specification: {},
          validFrom: new Date(form.validFrom).toISOString(),
          validUntil: new Date(form.validUntil).toISOString(),
        },
        selectedPhotos,
      );
      setShowForm(false);
      setForm(empty);
      setPhotos([null, null, null]);
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-64 flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
              <input
                className={`${inputClass} pl-9`}
                placeholder="Rechercher par référence, marque, modèle…"
                value={filters.search}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    search: e.target.value,
                    page: 1,
                  }))
                }
              />
            </label>
            <select
              aria-label="Statut"
              className={inputClass}
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  status: e.target.value,
                  page: 1,
                }))
              }
            >
              <option value="">Tous les statuts</option>
              <option value="draft">Brouillon</option>
              <option value="available">Disponible</option>
              <option value="reserved">Réservé</option>
              <option value="sold">Vendu</option>
              <option value="expired">Expiré</option>
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
          </div>
        </div>
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
                      "Prix fournisseur",
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
                    <OfferCover offer={offer} className="h-20 w-24" />
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
                        getRuntimeLocale(),
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
              <p className="rounded-card border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 sm:col-span-2">
                Le prix fournisseur et son historique sont l’autorité de cette
                offre. Les prix client CIF/DDP restent des champs historiques de
                compatibilité; la tarification finale est établie dans
                Tarification/Devis.
              </p>
              {Object.entries({
                supplierId: "Fournisseur *",
                supplierReference: "Référence fournisseur",
                brand: "Marque *",
                model: "Modèle *",
                year: "Année",
                supplierPrice: "Prix fournisseur *",
                incoterm: "Incoterm",
                location: "Localisation",
                leadTimeDays: "Délai (jours)",
                paymentConditions: "Conditions de paiement",
                vin: "VIN optionnel",
                purchasePrice: "Prix achat (référence)",
                cifPrice: "Estimation CIF (optionnel)",
                ddpPrice: "Estimation DDP (optionnel)",
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
                        "supplierPrice",
                        "validFrom",
                        "validUntil",
                        "availableQuantity",
                      ].includes(key)}
                      type={
                        key.startsWith("valid")
                          ? "date"
                          : [
                                "brand",
                                "model",
                                "supplierReference",
                                "incoterm",
                                "location",
                                "paymentConditions",
                                "vin",
                              ].includes(key)
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
            <fieldset className="mt-5">
              <legend className="field-label">Trois photos ordonnées *</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {photos.map((photo, index) => (
                  <label
                    key={index}
                    className="rounded-xl border border-dashed p-3 text-sm"
                  >
                    <span className="block font-semibold">
                      {index === 0
                        ? "Photo 1 · couverture"
                        : `Photo ${index + 1}`}
                    </span>
                    <input
                      required
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="mt-2 w-full text-xs"
                      onChange={(event) =>
                        setPhotos((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? (event.target.files?.[0] ?? null)
                              : item,
                          ),
                        )
                      }
                    />
                    {photo && <OfferPhotoPreview file={photo} index={index} />}
                  </label>
                ))}
              </div>
            </fieldset>
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
        <OfferCover offer={offer} className="h-14 w-16" />
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
        {formatMoney(offer.supplierPrice, offer.currency)}
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
        {new Date(offer.validUntil).toLocaleDateString(getRuntimeLocale())}
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
function OfferCover({
  offer,
  className,
}: {
  offer: ApiOffer;
  className: string;
}) {
  const photo =
    offer.photos?.find(({ isPrimary }) => isPrimary) ?? offer.photos?.[0];
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) return;
    let active = true;
    let objectUrl = "";
    void commerceApi.offers
      .photoBlob(photo.id)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo]);
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 ${className}`}
    >
      {url ? (
        <Image
          unoptimized
          fill
          sizes="96px"
          src={url}
          alt={`${offer.brand} ${offer.model}`}
          className="object-cover"
        />
      ) : (
        <CarFront className="h-5 w-5 text-muted" />
      )}
    </div>
  );
}

function OfferPhotoPreview({ file, index }: { file: File; index: number }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return (
    <span className="mt-2 block">
      <span className="relative block aspect-[4/3] overflow-hidden rounded-lg bg-neutral-100">
        {url && (
          <Image
            unoptimized
            fill
            sizes="240px"
            src={url}
            alt={`Aperçu de la photo ${index + 1}`}
            className="object-cover"
          />
        )}
      </span>
      <span className="mt-1 block truncate text-xs text-muted">
        {file.name}
      </span>
    </span>
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
