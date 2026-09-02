"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { PackageCheck, Search } from "lucide-react";
import Topbar from "@/components/Topbar";
import { commerceApi, type ApiVehicle } from "@/lib/commerce-api";
import { VEHICLE_STATUS_LABELS_API } from "@/lib/api-contract";
import {
  EmptyState,
  ErrorState,
  inputClass,
  LoadingState,
} from "./common";
import { getRuntimeLocale } from "@/lib/i18n/runtime-locale";

export default function CatalogueWorkspace() {
  const [items, setItems] = useState<ApiVehicle[]>([]);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    acquisitionType: "",
    page: 1,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 0,
    totalItems: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await commerceApi.catalogue.list({
        ...filters,
        limit: 12,
      });
      setItems(result.items);
      setPagination({
        page: result.pagination.page,
        totalPages: result.pagination.totalPages,
        totalItems: result.pagination.totalItems,
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement impossible",
      );
    } finally {
      setLoading(false);
    }
  }, [filters]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <>
      <Topbar
        title="Catalogue"
        subtitle="Véhicules acquis et détenus par Corapide"
      />
      <main className="space-y-6 p-4 sm:p-8">
        <section className="card flex flex-wrap items-center gap-3">
          <label className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Marque, modèle, version ou VIN"
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
            className={inputClass}
            aria-label="Disponibilité"
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value,
                page: 1,
              }))
            }
          >
            <option value="">Toutes disponibilités</option>
            <option value="available">Disponible</option>
            <option value="reserved">Réservé</option>
            <option value="inTransit">En transit</option>
            <option value="inCustoms">En douane</option>
            <option value="delivered">Livré</option>
            <option value="sold">Vendu</option>
          </select>
          <select
            className={inputClass}
            aria-label="Mode d’acquisition"
            value={filters.acquisitionType}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                acquisitionType: event.target.value,
                page: 1,
              }))
            }
          >
            <option value="">Toutes acquisitions</option>
            <option value="chinaOffer">Offres Chine achetées</option>
            <option value="stock">Stock Corapide</option>
          </select>
        </section>
        <p className="text-sm text-muted">
          {pagination.totalItems} véhicule(s) détenu(s)
        </p>
        {error && <ErrorState message={error} retry={() => void load()} />}
        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState label="Aucun véhicule acquis pour ces filtres." />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((vehicle) => (
              <CatalogueCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        )}
        {pagination.totalPages > 1 && (
          <nav className="flex justify-center gap-3" aria-label="Pagination">
            <button
              className="rounded-button border px-4 py-2 disabled:opacity-40"
              disabled={pagination.page <= 1}
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
              className="rounded-button border px-4 py-2 disabled:opacity-40"
              disabled={pagination.page >= pagination.totalPages}
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
    </>
  );
}

function CatalogueCard({ vehicle }: { vehicle: ApiVehicle }) {
  const photo =
    vehicle.photos?.find((item) => item.isPrimary) ?? vehicle.photos?.[0];
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) return;
    let active = true;
    let objectUrl = "";
    void commerceApi.vehicles
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
  const purchase = vehicle.purchases?.[0];
  return (
    <article className="card overflow-hidden p-0">
      <div className="relative aspect-[16/10] bg-neutral-100">
        {url ? (
          <Image
            unoptimized
            fill
            sizes="(min-width: 1536px) 25vw, (min-width: 640px) 50vw, 100vw"
            src={url}
            alt={`${vehicle.brand} ${vehicle.model}`}
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            <PackageCheck className="h-10 w-10" />
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold">
          {VEHICLE_STATUS_LABELS_API[vehicle.status] ?? vehicle.status}
        </span>
      </div>
      <div className="space-y-3 p-5">
        <div>
          <h2 className="text-lg font-bold">
            {vehicle.brand} {vehicle.model} {vehicle.trim}
          </h2>
          <p className="text-sm text-muted">
            {vehicle.year ?? "Année non renseignée"} ·{" "}
            {vehicle.vin ?? "VIN non renseigné"}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Mini label="Transmission" value={vehicle.specs?.transmission} />
          <Mini label="Moteur" value={vehicle.specs?.engine} />
          <Mini label="Fournisseur" value={vehicle.supplier?.name} />
          <Mini
            label="Date d’achat"
            value={
              purchase?.purchaseDate
                ? new Date(purchase.purchaseDate).toLocaleDateString(
                    getRuntimeLocale(),
                  )
                : "Acquis en stock"
            }
          />
        </dl>
        <div className="border-t border-border pt-3 text-xs text-muted">
          <p>Acquisition : {vehicle.acquisitionType}</p>
          {purchase?.sourceOffer && (
            <p>
              Offre source : {purchase.sourceOffer.reference}
              {purchase.sourceOfferVehicle
                ? ` · ligne ${purchase.sourceOfferVehicle.lineNumber}`
                : ""}
            </p>
          )}
          {purchase && <p>Achat : {purchase.purchaseNumber}</p>}
        </div>
      </div>
    </article>
  );
}

function Mini({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-card border border-border p-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium">{value || "Non renseigné"}</dd>
    </div>
  );
}
