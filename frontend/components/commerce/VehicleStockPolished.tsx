"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Fuel, Gauge, Plus, Search, Settings2, X } from "lucide-react";
import Topbar from "@/components/Topbar";
import { useAuth } from "@/components/AuthProvider";
import {
  Permission,
  VehicleStatus,
  VEHICLE_STATUS_LABELS_API,
} from "@/lib/api-contract";
import { commerceApi, type ApiVehicle } from "@/lib/commerce-api";
import {
  buttonClass,
  EmptyState,
  ErrorState,
  formatMoney,
  inputClass,
  LoadingState,
} from "./common";

const sourceLabels: Record<string, string> = {
  stock: "Stock",
  clientRequest: "Demande client",
  chinaOffer: "Offre",
  external: "Externe",
};
const empty = {
  vin: "",
  brand: "",
  model: "",
  year: "",
  mileage: "",
  condition: "used",
  sellingPrice: "",
  currency: "DZD",
  status: "available",
  acquisitionType: "stock",
  engine: "",
  fuelType: "",
  transmission: "",
  color: "",
  description: "",
};

export default function VehicleStockPolished() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(Permission.VEHICLES_WRITE);
  const [items, setItems] = useState<ApiVehicle[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 0,
    totalItems: 0,
  });
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    acquisitionType: "",
    page: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ApiVehicle | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ApiVehicle | null>(null);
  const [form, setForm] = useState(empty);
  const [files, setFiles] = useState<Array<File | null>>([null, null, null]);
  const [saving, setSaving] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const page = await commerceApi.vehicles.list({ ...filters, limit: 12 });
      setItems(page.items);
      setPagination({
        page: page.pagination.page,
        totalPages: page.pagination.totalPages,
        totalItems: page.pagination.totalItems,
      });
      const pairs = await Promise.all(
        page.items.flatMap((vehicle) =>
          (vehicle.photos ?? []).map(
            async (photo) =>
              [
                photo.id,
                URL.createObjectURL(
                  await commerceApi.vehicles.photoBlob(photo.id),
                ),
              ] as const,
          ),
        ),
      );
      setPhotoUrls((previous) => {
        if (typeof URL.revokeObjectURL === "function")
          Object.values(previous).forEach((url) => URL.revokeObjectURL(url));
        return Object.fromEntries(pairs);
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Chargement impossible",
      );
    } finally {
      setLoading(false);
    }
  }, [filters]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 180);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(
    () => () => {
      if (typeof URL.revokeObjectURL === "function")
        Object.values(photoUrls).forEach((url) => URL.revokeObjectURL(url));
    },
    [photoUrls],
  );

  function openForm(vehicle?: ApiVehicle) {
    setEditing(vehicle ?? null);
    setFiles([null, null, null]);
    setFormOpen(true);
    setForm(
      vehicle
        ? {
            vin: vehicle.vin ?? "",
            brand: vehicle.brand,
            model: vehicle.model,
            year: String(vehicle.year ?? ""),
            mileage: String(vehicle.mileage ?? ""),
            condition: vehicle.condition ?? "used",
            sellingPrice: String(vehicle.sellingPrice ?? ""),
            currency: vehicle.currency ?? "DZD",
            status: vehicle.status,
            acquisitionType: vehicle.acquisitionType,
            engine: vehicle.specs?.engine ?? "",
            fuelType: vehicle.specs?.fuelType ?? "",
            transmission: vehicle.specs?.transmission ?? "",
            color: vehicle.specs?.color ?? "",
            description: vehicle.specs?.description ?? "",
          }
        : empty,
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    const legacyComplete = editing && (editing.photos?.length ?? 0) === 3;
    if (!legacyComplete && files.some((file) => !file)) {
      setError("Les trois photos distinctes sont obligatoires.");
      return;
    }
    const chosen = files.filter((file): file is File => Boolean(file));
    if (chosen.length > 0 && chosen.length !== 3) {
      setError("Remplacez les trois photos ensemble.");
      return;
    }
    if (
      chosen.length &&
      new Set(
        chosen.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
      ).size !== 3
    ) {
      setError("Les trois photos doivent être distinctes.");
      return;
    }
    setSaving(true);
    const payload = {
      vin: form.vin || undefined,
      brand: form.brand,
      model: form.model,
      year: form.year || undefined,
      mileage: form.mileage || undefined,
      condition: form.condition,
      sellingPrice: form.sellingPrice || undefined,
      currency: form.currency,
      status: form.status,
      acquisitionType: form.acquisitionType,
    };
    try {
      const vehicle = editing
        ? await commerceApi.vehicles.update(editing.id, payload)
        : await commerceApi.vehicles.createWithPhotos(payload, chosen);
      if (editing && chosen.length)
        await commerceApi.vehicles.replacePhotos(editing.id, chosen);
      await commerceApi.vehicles.saveSpecs(vehicle.id, {
        engine: form.engine || undefined,
        fuelType: form.fuelType || undefined,
        transmission: form.transmission || undefined,
        color: form.color || undefined,
        description: form.description || undefined,
      });
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Enregistrement impossible",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Topbar title="Véhicules / Stock" subtitle="Gestion du parc automobile" />
      <main className="space-y-6 p-4 sm:p-8">
        <section className="flex flex-wrap gap-3">
          <label className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-3 h-5 w-5 text-muted" />
            <span className="sr-only">Rechercher</span>
            <input
              className={`${inputClass} pl-10`}
              placeholder="Rechercher par VIN, marque, modèle…"
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
            {Object.values(VehicleStatus).map((status) => (
              <option key={status} value={status}>
                {VEHICLE_STATUS_LABELS_API[status]}
              </option>
            ))}
          </select>
          <select
            aria-label="Source"
            className={inputClass}
            value={filters.acquisitionType}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                acquisitionType: event.target.value,
                page: 1,
              }))
            }
          >
            <option value="">Toutes les sources</option>
            {Object.entries(sourceLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {canWrite && (
            <button className={buttonClass} onClick={() => openForm()}>
              <Plus className="mr-2 inline h-4 w-4" />
              Ajouter un véhicule
            </button>
          )}
        </section>
        <p className="text-sm text-muted">
          {pagination.totalItems} véhicule(s)
        </p>
        {error && <ErrorState message={error} retry={() => void load()} />}
        {loading ? (
          <LoadingState />
        ) : !items.length ? (
          <EmptyState label="Aucun véhicule pour ces filtres." />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((vehicle) => {
              const photos = vehicle.photos ?? [];
              const cover =
                photos.find(({ isPrimary }) => isPrimary) ?? photos[0];
              return (
                <article key={vehicle.id} className="card overflow-hidden p-0">
                  <div className="relative aspect-[16/10] bg-neutral-100">
                    {cover && photoUrls[cover.id] ? (
                      <Image
                        unoptimized
                        fill
                        sizes="(min-width: 1536px) 25vw, (min-width: 640px) 50vw, 100vw"
                        src={photoUrls[cover.id]}
                        alt={`${vehicle.brand} ${vehicle.model}, vue principale`}
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted">
                        Aucune photo
                      </div>
                    )}
                    <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold">
                      {VEHICLE_STATUS_LABELS_API[vehicle.status]}
                    </span>
                    <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
                      <Camera className="h-3.5 w-3.5" />
                      {photos.length}
                    </span>
                    <span className="absolute bottom-4 left-4 rounded-full bg-black/75 px-3 py-1 text-xs text-white">
                      {vehicle.condition === "new" ? "Neuf" : "Occasion"}
                    </span>
                  </div>
                  <div className="space-y-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="text-lg font-bold">
                          {vehicle.brand} {vehicle.model}
                        </h2>
                        <p className="text-sm text-muted">
                          {vehicle.year ?? "Non renseigné"} ·{" "}
                          {vehicle.specs?.color ?? "Couleur non renseignée"}
                        </p>
                      </div>
                      <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-xs text-blue-700">
                        {sourceLabels[vehicle.acquisitionType] ??
                          vehicle.acquisitionType}
                      </span>
                    </div>
                    <p className="flex flex-wrap gap-3 text-sm text-muted">
                      <span className="inline-flex gap-1">
                        <Fuel className="h-4 w-4" />
                        {vehicle.specs?.fuelType ?? "Non renseigné"}
                      </span>
                      <span className="inline-flex gap-1">
                        <Settings2 className="h-4 w-4" />
                        {vehicle.specs?.transmission ?? "Non renseignée"}
                      </span>
                      <span className="inline-flex gap-1">
                        <Gauge className="h-4 w-4" />
                        {vehicle.mileage != null
                          ? `${vehicle.mileage.toLocaleString("fr-FR")} km`
                          : "Non renseigné"}
                      </span>
                    </p>
                    {photos.length !== 3 && (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                        Photos incomplètes · compléter à la prochaine
                        modification
                      </p>
                    )}
                    <div className="flex items-center justify-between border-t border-border pt-4">
                      <strong>
                        {formatMoney(vehicle.sellingPrice, vehicle.currency)}
                      </strong>
                      <button
                        className="font-semibold text-blue-700"
                        onClick={() => setSelected(vehicle)}
                      >
                        Voir détails
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {pagination.totalPages > 1 && (
          <nav aria-label="Pagination" className="flex justify-center gap-3">
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
      {selected && (
        <VehicleDialog
          vehicle={selected}
          urls={photoUrls}
          canWrite={canWrite}
          close={() => setSelected(null)}
          edit={() => {
            setSelected(null);
            openForm(selected);
          }}
        />
      )}
      {formOpen && (
        <VehicleForm
          editing={editing}
          form={form}
          setForm={setForm}
          files={files}
          setFiles={setFiles}
          saving={saving}
          close={() => setFormOpen(false)}
          save={save}
        />
      )}
    </>
  );
}

function VehicleDialog({
  vehicle,
  urls,
  close,
  edit,
  canWrite,
}: {
  vehicle: ApiVehicle;
  urls: Record<string, string>;
  close: () => void;
  edit: () => void;
  canWrite: boolean;
}) {
  const [index, setIndex] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const photos = vehicle.photos ?? [];
  useEffect(() => {
    closeRef.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [close]);
  const specs = [
    ["État", vehicle.condition === "new" ? "Neuf" : "Occasion"],
    ["Carburant", vehicle.specs?.fuelType],
    ["Boîte de vitesses", vehicle.specs?.transmission],
    ["Motorisation", vehicle.specs?.engine],
    ["Puissance", vehicle.specs?.power],
    ["Portes", vehicle.specs?.doors],
    ["Places", vehicle.specs?.seats],
    ["Couleur extérieure", vehicle.specs?.color],
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="vehicle-title"
        className="card max-h-[94vh] w-full max-w-5xl overflow-y-auto p-5 sm:p-8"
      >
        <div className="flex justify-between">
          <div>
            <h2 id="vehicle-title" className="text-2xl font-bold">
              {vehicle.brand} {vehicle.model} {vehicle.year}
            </h2>
            <p className="mt-2 flex gap-2">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                {VEHICLE_STATUS_LABELS_API[vehicle.status]}
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs">
                {sourceLabels[vehicle.acquisitionType] ??
                  vehicle.acquisitionType}
              </span>
            </p>
          </div>
          <button ref={closeRef} aria-label="Fermer" onClick={close}>
            <X />
          </button>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            {photos[index] && urls[photos[index].id] ? (
              <Image
                unoptimized
                width={800}
                height={500}
                src={urls[photos[index].id]}
                alt={`${vehicle.brand} ${vehicle.model}, photo ${index + 1}`}
                className="aspect-[16/10] w-full rounded-xl object-cover"
              />
            ) : (
              <div className="flex aspect-[16/10] items-center justify-center rounded-xl bg-neutral-100">
                Aucune photo
              </div>
            )}
            <div className="mt-3 grid grid-cols-3 gap-3">
              {photos.map((photo, photoIndex) => (
                <button
                  key={photo.id}
                  aria-label={`Afficher la photo ${photoIndex + 1}`}
                  onClick={() => setIndex(photoIndex)}
                  className={`overflow-hidden rounded-lg border-2 ${photoIndex === index ? "border-neutral-900" : "border-transparent"}`}
                >
                  <Image
                    unoptimized
                    width={240}
                    height={150}
                    src={urls[photo.id]}
                    alt=""
                    className="aspect-[16/10] w-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted">
              Caractéristiques
            </h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {specs.map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-border p-4"
                >
                  <dt className="text-xs uppercase text-muted">{label}</dt>
                  <dd className="mt-1 font-medium">
                    {value ?? "Non renseigné"}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 border-t border-border pt-5 text-sm text-muted">
              <p>Fournisseur : {vehicle.supplier?.name ?? "Non renseigné"}</p>
              <p className="mt-1">VIN : {vehicle.vin ?? "Non renseigné"}</p>
            </div>
            {canWrite && (
              <button className={`${buttonClass} mt-5`} onClick={edit}>
                Modifier
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function VehicleForm({
  editing,
  form,
  setForm,
  files,
  setFiles,
  saving,
  close,
  save,
}: {
  editing: ApiVehicle | null;
  form: typeof empty;
  setForm: React.Dispatch<React.SetStateAction<typeof empty>>;
  files: Array<File | null>;
  setFiles: React.Dispatch<React.SetStateAction<Array<File | null>>>;
  saving: boolean;
  close: () => void;
  save: (event: FormEvent) => void;
}) {
  const labels = ["Avant / couverture", "Arrière", "Intérieur / côté"];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3">
      <form
        onSubmit={save}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vehicle-form-title"
        className="card max-h-[94vh] w-full max-w-4xl overflow-y-auto p-5 sm:p-8"
      >
        <div className="flex justify-between">
          <h2 id="vehicle-form-title" className="text-xl font-bold">
            {editing ? "Modifier le véhicule" : "Ajouter un véhicule"}
          </h2>
          <button type="button" aria-label="Fermer" onClick={close}>
            <X />
          </button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["brand", "Marque *"],
              ["model", "Modèle *"],
              ["vin", "VIN"],
              ["year", "Année"],
              ["mileage", "Kilométrage"],
              ["sellingPrice", "Prix de vente"],
              ["engine", "Moteur"],
              ["fuelType", "Carburant"],
              ["transmission", "Transmission"],
              ["color", "Couleur"],
            ] as Array<[keyof typeof empty, string]>
          ).map(([key, label]) => (
            <label key={key}>
              <span className="field-label">{label}</span>
              <input
                required={key === "brand" || key === "model"}
                type={
                  ["year", "mileage", "sellingPrice"].includes(key)
                    ? "number"
                    : "text"
                }
                className={inputClass}
                value={form[key]}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
          <label>
            <span className="field-label">Statut</span>
            <select
              className={inputClass}
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
            >
              {Object.values(VehicleStatus).map((status) => (
                <option key={status} value={status}>
                  {VEHICLE_STATUS_LABELS_API[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Source</span>
            <select
              className={inputClass}
              value={form.acquisitionType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  acquisitionType: event.target.value,
                }))
              }
            >
              {Object.entries(sourceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="mt-6">
          <legend className="font-bold">
            Trois photos ordonnées{" "}
            {editing && (editing.photos?.length ?? 0) === 3
              ? "(facultatif si inchangées)"
              : "*"}
          </legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {labels.map((label, index) => (
              <label
                key={label}
                className="rounded-xl border border-dashed border-neutral-300 p-4"
              >
                <span className="text-sm font-semibold">
                  {index + 1}. {label}
                </span>
                {files[index] ? (
                  <FilePreview file={files[index]!} label={label} />
                ) : (
                  <div className="mt-3 flex aspect-[16/10] items-center justify-center rounded-lg bg-neutral-50 text-xs text-muted">
                    Sélectionner une photo
                  </div>
                )}
                <input
                  className="mt-3 block w-full text-xs"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    setFiles((current) =>
                      current.map((item, fileIndex) =>
                        fileIndex === index
                          ? (event.target.files?.[0] ?? null)
                          : item,
                      ),
                    )
                  }
                />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-6 flex justify-end">
          <button disabled={saving} className={buttonClass}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>
  );
}

function FilePreview({ file, label }: { file: File; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(file);
    const timer = window.setTimeout(() => setUrl(next), 0);
    return () => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(next);
    };
  }, [file]);
  return url ? (
    <Image
      unoptimized
      width={480}
      height={300}
      src={url}
      alt={`Prévisualisation ${label}`}
      className="mt-3 aspect-[16/10] w-full rounded-lg object-cover"
    />
  ) : (
    <div className="mt-3 aspect-[16/10] rounded-lg bg-neutral-50" />
  );
}
