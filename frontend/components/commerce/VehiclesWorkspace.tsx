"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Archive, Car, Plus, Search, X } from "lucide-react";
import Topbar from "@/components/Topbar";
import { VehicleStatus, VEHICLE_STATUS_LABELS_API } from "@/lib/api-contract";
import {
  commerceApi,
  type ApiPartner,
  type ApiVehicle,
} from "@/lib/commerce-api";
import {
  buttonClass,
  EmptyState,
  ErrorState,
  formatMoney,
  inputClass,
  LoadingState,
} from "./common";

const emptyForm = {
  vin: "",
  brand: "",
  model: "",
  year: "",
  mileage: "",
  condition: "used",
  purchasePrice: "",
  sellingPrice: "",
  currency: "USD",
  status: "available",
  acquisitionType: "stock",
  supplierId: "",
  engine: "",
  fuelType: "",
  transmission: "",
  color: "",
  description: "",
};

export default function VehiclesWorkspace() {
  const [items, setItems] = useState<ApiVehicle[]>([]);
  const [suppliers, setSuppliers] = useState<ApiPartner[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ApiVehicle | null>(null);
  const [editing, setEditing] = useState<ApiVehicle | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [vehicles, partnerPage] = await Promise.all([
        commerceApi.vehicles.list({ search, status, limit: 100 }),
        commerceApi.partners.list({
          type: "supplier",
          status: "active",
          limit: 100,
        }),
      ]);
      setItems(vehicles.items);
      setSuppliers(partnerPage.items);
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

  const open = (vehicle?: ApiVehicle) => {
    setEditing(vehicle ?? null);
    setShowForm(true);
    setForm(
      vehicle
        ? {
            vin: vehicle.vin ?? "",
            brand: vehicle.brand,
            model: vehicle.model,
            year: vehicle.year?.toString() ?? "",
            mileage: vehicle.mileage?.toString() ?? "",
            condition: vehicle.condition ?? "used",
            purchasePrice: vehicle.purchasePrice?.toString() ?? "",
            sellingPrice: vehicle.sellingPrice?.toString() ?? "",
            currency: vehicle.currency ?? "USD",
            status: vehicle.status,
            acquisitionType: vehicle.acquisitionType,
            supplierId: vehicle.supplierId ?? "",
            engine: vehicle.specs?.engine ?? "",
            fuelType: vehicle.specs?.fuelType ?? "",
            transmission: vehicle.specs?.transmission ?? "",
            color: vehicle.specs?.color ?? "",
            description: vehicle.specs?.description ?? "",
          }
        : emptyForm,
    );
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      vin: form.vin || undefined,
      brand: form.brand,
      model: form.model,
      year: form.year ? Number(form.year) : undefined,
      mileage: form.mileage ? Number(form.mileage) : undefined,
      condition: form.condition,
      purchasePrice: form.purchasePrice
        ? Number(form.purchasePrice)
        : undefined,
      sellingPrice: form.sellingPrice ? Number(form.sellingPrice) : undefined,
      currency: form.currency,
      status: form.status,
      acquisitionType: form.acquisitionType,
      supplierId: form.supplierId || undefined,
    };
    try {
      const vehicle = editing
        ? await commerceApi.vehicles.update(editing.id, payload)
        : await commerceApi.vehicles.create(payload);
      await commerceApi.vehicles.saveSpecs(vehicle.id, {
        engine: form.engine || undefined,
        fuelType: form.fuelType || undefined,
        transmission: form.transmission || undefined,
        color: form.color || undefined,
        description: form.description || undefined,
      });
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
      <Topbar title="Véhicules" subtitle="Stock, sources et emplacements" />
      <main className="space-y-5 p-8">
        <div className="flex flex-wrap gap-3">
          <label className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
            <input
              className={`${inputClass} pl-9`}
              value={search}
              placeholder="VIN, marque ou modèle"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Tous les statuts</option>
            {Object.values(VehicleStatus).map((value) => (
              <option key={value} value={value}>
                {VEHICLE_STATUS_LABELS_API[value]}
              </option>
            ))}
          </select>
          <button className={buttonClass} onClick={() => open()}>
            <Plus className="mr-2 inline h-4 w-4" />
            Ajouter
          </button>
        </div>
        {error && <ErrorState message={error} retry={() => void load()} />}
        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState label="Aucun véhicule persistant." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((vehicle) => (
              <button
                key={vehicle.id}
                className="card space-y-3 p-5 text-left hover:border-foreground/30"
                onClick={() => setSelected(vehicle)}
              >
                <div className="flex justify-between">
                  <span className="font-semibold">
                    {vehicle.brand} {vehicle.model}
                  </span>
                  <span className="text-xs text-muted">
                    {VEHICLE_STATUS_LABELS_API[vehicle.status]}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  {vehicle.vin || "VIN en attente"} · {vehicle.year ?? "—"}
                </p>
                <p className="text-sm">
                  {formatMoney(vehicle.sellingPrice, vehicle.currency)}
                </p>
                <p className="text-xs text-muted">
                  {vehicle.currentLocation
                    ? `${vehicle.currentLocation.warehouse?.name ?? "Entrepôt"} / ${vehicle.currentLocation.code}`
                    : "Sans emplacement"}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>
      {selected && !showForm && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelected(null)}
        >
          <section
            className="card w-full max-w-2xl space-y-5 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Car />
                {selected.brand} {selected.model}
              </h2>
              <button onClick={() => setSelected(null)}>
                <X />
              </button>
            </div>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <dt className="text-muted">VIN</dt>
                <dd>{selected.vin || "En attente"}</dd>
              </div>
              <div>
                <dt className="text-muted">Source</dt>
                <dd>{selected.acquisitionType}</dd>
              </div>
              <div>
                <dt className="text-muted">Fournisseur</dt>
                <dd>{selected.supplier?.name || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Spécifications</dt>
                <dd>
                  {[
                    selected.specs?.engine,
                    selected.specs?.fuelType,
                    selected.specs?.transmission,
                    selected.specs?.color,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </dd>
              </div>
            </dl>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-button border px-4 py-2 text-sm"
                onClick={() => open(selected)}
              >
                Modifier
              </button>
              <button
                className="rounded-button border border-red-200 px-4 py-2 text-sm text-red-700"
                onClick={async () => {
                  if (window.confirm("Archiver ce véhicule ?")) {
                    await commerceApi.vehicles.archive(selected.id);
                    setSelected(null);
                    await load();
                  }
                }}
              >
                <Archive className="mr-2 inline h-4 w-4" />
                Archiver
              </button>
            </div>
          </section>
        </div>
      )}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={save}
            className="card max-h-[90vh] w-full max-w-4xl space-y-5 overflow-auto p-6"
          >
            <div className="flex justify-between">
              <h2 className="text-lg font-semibold">
                {editing ? "Modifier le véhicule" : "Nouveau véhicule"}
              </h2>
              <button type="button" onClick={() => setShowForm(false)}>
                <X />
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {(
                [
                  "vin",
                  "brand",
                  "model",
                  "year",
                  "mileage",
                  "purchasePrice",
                  "sellingPrice",
                  "engine",
                  "fuelType",
                  "transmission",
                  "color",
                ] as const
              ).map((key) => (
                <label key={key}>
                  <span className="field-label">
                    {
                      {
                        vin: "VIN",
                        brand: "Marque *",
                        model: "Modèle *",
                        year: "Année",
                        mileage: "Kilométrage",
                        purchasePrice: "Prix achat",
                        sellingPrice: "Prix vente",
                        engine: "Moteur",
                        fuelType: "Carburant",
                        transmission: "Transmission",
                        color: "Couleur",
                      }[key]
                    }
                  </span>
                  <input
                    required={key === "brand" || key === "model"}
                    type={
                      [
                        "year",
                        "mileage",
                        "purchasePrice",
                        "sellingPrice",
                      ].includes(key)
                        ? "number"
                        : "text"
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
                <span className="field-label">Statut</span>
                <select
                  className={inputClass}
                  value={form.status}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      status: e.target.value,
                    }))
                  }
                >
                  {Object.values(VehicleStatus).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Source</span>
                <select
                  className={inputClass}
                  value={form.acquisitionType}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      acquisitionType: e.target.value,
                    }))
                  }
                >
                  {["stock", "clientRequest", "chinaOffer", "external"].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                <span className="field-label">Fournisseur</span>
                <select
                  className={inputClass}
                  value={form.supplierId}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      supplierId: e.target.value,
                    }))
                  }
                >
                  <option value="">—</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              <span className="field-label">Description technique</span>
              <textarea
                className={inputClass}
                value={form.description}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    description: e.target.value,
                  }))
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
