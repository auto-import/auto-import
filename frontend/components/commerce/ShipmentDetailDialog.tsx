"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { commerceApi, type ApiVehicle } from "@/lib/commerce-api";
import {
  addShipmentVehicle,
  fetchShipment,
  removeShipmentVehicle,
  type ApiShipment,
} from "@/lib/logistics-api";
import { formatMontant } from "@/lib/constants";
import { inputClass } from "./common";
import { ApiError } from "@/lib/api";

export default function ShipmentDetailDialog({
  id,
  close,
  changed,
}: {
  id: string;
  close: () => void;
  changed: () => Promise<void>;
}) {
  const [shipment, setShipment] = useState<ApiShipment | null>(null);
  const [vehicles, setVehicles] = useState<ApiVehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [error, setError] = useState("");
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [success, setSuccess] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const load = async () => {
    setVehiclesLoading(true);
    setError("");
    try {
      const [record, page] = await Promise.all([
        fetchShipment(id),
        loadVehiclePage(),
      ]);
      setShipment(record);
      setVehicles(
        page.items.filter(
          (vehicle) =>
            !record.vehicles?.some((link) => link.vehicleId === vehicle.id),
        ),
      );
      setTotalPages(page.pagination.totalPages);
    } finally {
      setVehiclesLoading(false);
    }
  };
  function loadVehiclePage() {
    return commerceApi.vehicles.list({
      limit: 50,
      page,
      search: search || undefined,
      shipmentAssignable: "true",
    });
  }
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void load().catch((cause) =>
          setError(
            cause instanceof Error
              ? cause.message
              : "Impossible de charger les véhicules",
          ),
        ),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [id, search, page]);

  const maxVehicles = shipment?.capacity?.maxVehicles ?? null;
  const atCapacity =
    maxVehicles != null &&
    (shipment?.capacity?.vehicleCount ?? 0) >= maxVehicles;

  function prospective(vehicle: ApiVehicle | undefined) {
    if (!vehicle) return null;
    const volume =
      vehicle.lengthCm && vehicle.widthCm && vehicle.heightCm
        ? (Number(vehicle.lengthCm) *
            Number(vehicle.widthCm) *
            Number(vehicle.heightCm)) /
          1_000_000
        : null;
    const weight = vehicle.weightKg != null ? Number(vehicle.weightKg) : null;
    const cap = shipment?.capacity;
    const overVolume =
      volume != null &&
      cap?.remainingVolumeM3 != null &&
      volume > cap.remainingVolumeM3;
    const overWeight =
      weight != null &&
      cap?.remainingWeightKg != null &&
      weight > cap.remainingWeightKg;
    return {
      volume,
      weight,
      overVolume,
      overWeight,
      wouldExceed: Boolean(overVolume || overWeight),
      incomplete: volume == null || weight == null,
    };
  }
  const selected = vehicles.find((vehicle) => vehicle.id === vehicleId);
  const preview = prospective(selected);

  async function assign() {
    if (!vehicleId || assigning) return;
    setAssigning(true);
    try {
      setError("");
      if (preview?.wouldExceed) {
        if (
          !window.confirm(
            "La capacité serait dépassée. Confirmer un override explicite ?",
          )
        )
          return;
        const overrideReason = window
          .prompt("Justification obligatoire de l'override")
          ?.trim();
        if (!overrideReason) return;
        await addShipmentVehicle(id, {
          vehicleId,
          capacityOverride: true,
          overrideReason,
        });
      } else {
        try {
          await addShipmentVehicle(id, { vehicleId });
        } catch (cause) {
          if (
            !(cause instanceof ApiError) ||
            cause.code !== "SHIPMENT_CAPACITY_OVERRIDE_REQUIRED"
          )
            throw cause;
          if (
            !window.confirm(
              "La capacité ou les dimensions seraient dépassées. Confirmer un override explicite ?",
            )
          )
            return;
          const overrideReason = window
            .prompt("Justification obligatoire de l'override")
            ?.trim();
          if (!overrideReason) return;
          await addShipmentVehicle(id, {
            vehicleId,
            capacityOverride: true,
            overrideReason,
          });
        }
      }
      setVehicleId("");
      setSuccess("Véhicule affecté à l’expédition.");
      await Promise.all([load(), changed()]);
    } finally {
      setAssigning(false);
    }
  }

  async function handleRemove(vehicleIdToRemove: string) {
    if (!window.confirm("Retirer ce véhicule de l'expédition ?")) return;
    setRemoving(vehicleIdToRemove);
    try {
      await removeShipmentVehicle(id, vehicleIdToRemove);
      await Promise.all([load(), changed()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Retrait impossible");
    } finally {
      setRemoving(null);
    }
  }

  if (!shipment)
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="card p-8">
          <p role={error ? "alert" : "status"}>{error || "Chargement…"}</p>
          {error && (
            <button
              type="button"
              onClick={() =>
                void load().catch((cause) =>
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Chargement impossible",
                  ),
                )
              }
            >
              Réessayer
            </button>
          )}
          <button type="button" onClick={close}>
            Fermer
          </button>
        </div>
      </div>
    );
  const suppliers = [
    ...new Set(
      shipment.vehicles
        ?.map((link) => link.vehicle?.supplier?.name)
        .filter(Boolean),
    ),
  ];
  const cap = shipment.capacity;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <section className="card max-h-[92vh] w-full max-w-6xl overflow-y-auto p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{shipment.shipmentNumber}</h2>
            <p className="text-sm text-muted">
              Fournisseur : {shipment.carrierPartner?.name ?? "Non renseigné"}
            </p>
            <p className="text-sm text-muted">
              {maxVehicles
                ? `${maxVehicles} véhicules`
                : shipment.containerPreset?.label ||
                  "Type de conteneur non configuré"}{" "}
              · {shipment.containerNumber || "N° conteneur en attente"}
            </p>
          </div>
          <button onClick={close} className="rounded-lg border px-3 py-2">
            Fermer
          </button>
        </div>
        {success && (
          <p role="status" className="text-sm text-green-700">
            {success}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}{" "}
            <button
              type="button"
              className="underline"
              onClick={() =>
                void load().catch((cause) =>
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Chargement impossible",
                  ),
                )
              }
            >
              Réessayer
            </button>
          </p>
        )}
        <div className="mt-6 grid gap-4 md:grid-cols-5">
          <Metric
            label="Véhicules"
            value={
              maxVehicles != null
                ? `${cap?.vehicleCount ?? 0} / ${maxVehicles}`
                : `${cap?.vehicleCount ?? 0}`
            }
            highlight={atCapacity}
          />
          <Metric
            label="Volume utilisé"
            value={`${cap?.usedVolumeM3?.toFixed(2) ?? 0} / ${cap?.totalVolumeM3 ?? "—"} m³`}
          />
          <Metric
            label="Volume restant"
            value={`${cap?.remainingVolumeM3?.toFixed(2) ?? "—"} m³`}
          />
          <Metric
            label="Fret par véhicule"
            value={
              cap?.freightPerVehicle != null
                ? `${formatMontant(cap.freightPerVehicle)} ${cap.freightCurrency || ""}`
                : "—"
            }
          />
          <Metric
            label="Fret total"
            value={
              shipment.totalFreightCost != null
                ? `${formatMontant(Number(shipment.totalFreightCost))} ${shipment.freightCurrency || ""}`
                : "—"
            }
          />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Metric
            label="Fournisseurs véhicules"
            value={suppliers.join(", ") || "Non renseignés"}
          />
          <Metric
            label="Forwarder"
            value={shipment.carrierPartner?.name || "Non affecté"}
          />
        </div>
        <div className="mt-7">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-72 flex-1">
              <span className="field-label">Ajouter un véhicule</span>
              <input
                aria-label="Rechercher un véhicule à charger"
                className={inputClass}
                value={search}
                placeholder="Marque, modèle ou VIN"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                  setVehicleId("");
                }}
              />
              <select
                aria-label="Ajouter un véhicule"
                className={inputClass}
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                disabled={atCapacity || vehiclesLoading || Boolean(error)}
              >
                <option value="">
                  {vehiclesLoading
                    ? "Chargement..."
                    : error
                      ? "Chargement impossible"
                      : atCapacity
                        ? `Capacité atteinte (${maxVehicles}/${maxVehicles})`
                        : vehicles.length
                          ? "Sélectionner"
                          : "Aucun véhicule disponible"}
                </option>
                {!atCapacity &&
                  vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.vin || "VIN manquant"} · {vehicle.brand}{" "}
                      {vehicle.model}
                    </option>
                  ))}
              </select>
            </label>
            {totalPages > 1 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => {
                    setPage((value) => value - 1);
                    setVehicleId("");
                  }}
                >
                  Précédent
                </button>
                <span>
                  {page}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => {
                    setPage((value) => value + 1);
                    setVehicleId("");
                  }}
                >
                  Suivant
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() =>
                void assign().catch((cause) =>
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Affectation impossible",
                  ),
                )
              }
              disabled={
                !vehicleId || atCapacity || assigning || vehiclesLoading
              }
              className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Affecter
            </button>
          </div>
          {atCapacity && (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 font-medium">
              ⚠ Ce conteneur est limité à {maxVehicles} véhicules — capacité
              atteinte.
            </p>
          )}
          {selected && preview && !atCapacity && (
            <div
              className={`mt-3 rounded-lg border p-3 text-sm ${preview.wouldExceed ? "border-amber-300 bg-amber-50 text-amber-800" : "border-neutral-200 bg-neutral-50"}`}
            >
              <p className="font-semibold">
                {selected.vin || "VIN manquant"} · {selected.brand}{" "}
                {selected.model}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                <span>
                  Volume : +
                  {preview.volume != null ? preview.volume.toFixed(2) : "—"} m³
                  {cap?.totalVolumeM3 != null
                    ? ` → ${((cap.usedVolumeM3 ?? 0) + (preview.volume ?? 0)).toFixed(2)} / ${Number(cap.totalVolumeM3).toFixed(2)} m³`
                    : ""}
                </span>
                <span>
                  Poids : +
                  {preview.weight != null ? `${preview.weight} kg` : "—"}
                  {cap?.totalWeightKg != null
                    ? ` → ${Math.round((cap.usedWeightKg ?? 0) + (preview.weight ?? 0))} / ${Math.round(Number(cap.totalWeightKg))} kg`
                    : ""}
                </span>
              </div>
              {preview.wouldExceed && (
                <p className="mt-2 font-semibold">
                  ⚠ La capacité serait dépassée
                  {preview.overVolume ? " en volume" : ""}
                  {preview.overVolume && preview.overWeight ? " et" : ""}
                  {preview.overWeight ? " en poids" : ""}. Un override explicite
                  sera demandé à la confirmation.
                </p>
              )}
              {preview.incomplete && !preview.wouldExceed && (
                <p className="mt-2 text-muted">
                  Dimensions ou poids incomplets — la vérification de capacité
                  sera partielle.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="mt-7 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-muted">
                <th className="p-3">VIN / véhicule</th>
                <th className="p-3">Dimensions</th>
                <th className="p-3">Poids</th>
                <th className="p-3">Part de fret</th>
                <th className="p-3">Dossier / client</th>
                <th className="p-3">Fournisseur</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shipment.vehicles?.map((link) => {
                const vehicle = link.vehicle;
                const parent = vehicle?.dossierVehicles?.[0]?.dossier;
                return (
                  <tr key={link.id} className="border-b">
                    <td className="p-3">
                      <b>{vehicle?.vin || "VIN manquant"}</b>
                      <br />
                      {vehicle?.brand} {vehicle?.model}
                    </td>
                    <td className="p-3">
                      {vehicle?.lengthCm && vehicle.widthCm && vehicle.heightCm
                        ? `${vehicle.lengthCm} × ${vehicle.widthCm} × ${vehicle.heightCm} cm`
                        : "À compléter"}
                    </td>
                    <td className="p-3">
                      {vehicle?.weightKg
                        ? `${vehicle.weightKg} kg`
                        : "À compléter"}
                    </td>
                    <td className="p-3 font-semibold">
                      {link.freightShare != null
                        ? `${formatMontant(Number(link.freightShare))} ${link.freightCurrency || ""}`
                        : "—"}
                    </td>
                    <td className="p-3">
                      {parent ? (
                        <Link
                          href={`/dossiers/${parent.id}`}
                          className="font-semibold text-blue-700 underline"
                        >
                          {parent.reference} · {parent.client.firstName}{" "}
                          {parent.client.lastName}
                        </Link>
                      ) : (
                        "Non lié"
                      )}
                    </td>
                    <td className="p-3">{vehicle?.supplier?.name || "—"}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => handleRemove(link.vehicleId)}
                        disabled={removing === link.vehicleId}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40"
                      >
                        {removing === link.vehicleId ? "Retrait…" : "Retirer"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-7">
          <h3 className="font-bold">Documents liés</h3>
          {shipment.documents?.length ? (
            <ul className="mt-3 space-y-2">
              {shipment.documents.map((document) => (
                <li key={document.id} className="rounded-lg border p-3 text-sm">
                  {document.title || document.documentType}{" "}
                  {document.dossier ? `· ${document.dossier.reference}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Aucun document lié.</p>
          )}
          {shipment.customsFiles?.length ? (
            <div className="mt-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Dossiers douane
              </h4>
              <ul className="mt-2 space-y-2">
                {shipment.customsFiles.map((file) => (
                  <li
                    key={file.id}
                    className="rounded-lg border p-3 text-sm font-mono"
                  >
                    {file.reference} · {file.status}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${highlight ? "border-amber-300 bg-amber-50" : ""}`}
    >
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p className={`mt-1 font-bold ${highlight ? "text-amber-800" : ""}`}>
        {value}
      </p>
    </div>
  );
}
