"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { commerceApi, type ApiVehicle } from "@/lib/commerce-api";
import {
  addShipmentVehicle,
  fetchShipment,
  type ApiShipment,
} from "@/lib/logistics-api";
import { inputClass } from "./common";

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
  const load = async () => {
    const [record, page] = await Promise.all([
      fetchShipment(id),
      commerceApi.vehicles.list({ limit: 100 }),
    ]);
    setShipment(record);
    setVehicles(page.items.filter((vehicle) => !record.vehicles?.some((link) => link.vehicleId === vehicle.id)));
  };
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Chargement impossible")); }, [id]);
  function prospective(vehicle: ApiVehicle | undefined) {
    if (!vehicle) return null;
    const volume =
      vehicle.lengthCm && vehicle.widthCm && vehicle.heightCm
        ? (Number(vehicle.lengthCm) * Number(vehicle.widthCm) * Number(vehicle.heightCm)) / 1_000_000
        : null;
    const weight = vehicle.weightKg != null ? Number(vehicle.weightKg) : null;
    const cap = shipment?.capacity;
    const overVolume =
      volume != null && cap?.remainingVolumeM3 != null && volume > cap.remainingVolumeM3;
    const overWeight =
      weight != null && cap?.remainingWeightKg != null && weight > cap.remainingWeightKg;
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
    if (!vehicleId) return;
    setError("");
    if (preview?.wouldExceed) {
      if (!window.confirm("La capacité serait dépassée. Confirmer un override explicite ?")) return;
      const overrideReason = window.prompt("Justification obligatoire de l’override")?.trim();
      if (!overrideReason) return;
      await addShipmentVehicle(id, { vehicleId, capacityOverride: true, overrideReason });
    } else {
      try {
        await addShipmentVehicle(id, { vehicleId });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Affectation impossible";
        if (!message.toLowerCase().includes("capacity")) throw cause;
        if (!window.confirm("La capacité ou les dimensions seraient dépassées. Confirmer un override explicite ?")) return;
        const overrideReason = window.prompt("Justification obligatoire de l’override")?.trim();
        if (!overrideReason) return;
        await addShipmentVehicle(id, { vehicleId, capacityOverride: true, overrideReason });
      }
    }
    setVehicleId("");
    await Promise.all([load(), changed()]);
  }
  if (!shipment) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div className="card p-8">{error || "Chargement…"}</div></div>;
  const suppliers = [...new Set(shipment.vehicles?.map((link) => link.vehicle?.supplier?.name).filter(Boolean))];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <section className="card max-h-[92vh] w-full max-w-6xl overflow-y-auto p-6">
        <div className="flex items-start justify-between"><div><h2 className="text-xl font-bold">{shipment.shipmentNumber}</h2><p className="text-sm text-muted">{shipment.containerPreset?.label || "Type de conteneur non configuré"} · {shipment.containerNumber || "N° conteneur en attente"}</p></div><button onClick={close} className="rounded-lg border px-3 py-2">Fermer</button></div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Metric label="Volume utilisé" value={`${shipment.capacity?.usedVolumeM3.toFixed(2) ?? 0} / ${shipment.capacity?.totalVolumeM3 ?? "—"} m³`} />
          <Metric label="Volume restant" value={`${shipment.capacity?.remainingVolumeM3?.toFixed(2) ?? "—"} m³`} />
          <Metric label="Poids utilisé" value={`${shipment.capacity?.usedWeightKg.toFixed(0) ?? 0} / ${shipment.capacity?.totalWeightKg ?? "—"} kg`} />
          <Metric label="Poids restant" value={`${shipment.capacity?.remainingWeightKg?.toFixed(0) ?? "—"} kg`} />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2"><Metric label="Fournisseurs véhicules" value={suppliers.join(", ") || "Non renseignés"} /><Metric label="Forwarder" value={shipment.carrierPartner?.name || "Non affecté"} /></div>
        <div className="mt-7">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-72 flex-1"><span className="field-label">Ajouter un véhicule</span><select className={inputClass} value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="">Sélectionner</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vin || "VIN manquant"} · {vehicle.brand} {vehicle.model}</option>)}</select></label>
            <button type="button" onClick={() => void assign().catch((cause) => setError(cause instanceof Error ? cause.message : "Affectation impossible"))} className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white">Affecter</button>
          </div>
          {selected && preview && (
            <div className={`mt-3 rounded-lg border p-3 text-sm ${preview.wouldExceed ? "border-amber-300 bg-amber-50 text-amber-800" : "border-neutral-200 bg-neutral-50"}`}>
              <p className="font-semibold">{selected.vin || "VIN manquant"} · {selected.brand} {selected.model}</p>
              <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                <span>Volume : +{preview.volume != null ? preview.volume.toFixed(2) : "—"} m³{shipment.capacity?.totalVolumeM3 != null ? ` → ${((shipment.capacity.usedVolumeM3 ?? 0) + (preview.volume ?? 0)).toFixed(2)} / ${Number(shipment.capacity.totalVolumeM3).toFixed(2)} m³` : ""}</span>
                <span>Poids : +{preview.weight != null ? `${preview.weight} kg` : "—"}{shipment.capacity?.totalWeightKg != null ? ` → ${Math.round((shipment.capacity.usedWeightKg ?? 0) + (preview.weight ?? 0))} / ${Math.round(Number(shipment.capacity.totalWeightKg))} kg` : ""}</span>
              </div>
              {preview.wouldExceed && (
                <p className="mt-2 font-semibold">⚠ La capacité serait dépassée{preview.overVolume ? " en volume" : ""}{preview.overVolume && preview.overWeight ? " et" : ""}{preview.overWeight ? " en poids" : ""}. Un override explicite sera demandé à la confirmation.</p>
              )}
              {preview.incomplete && !preview.wouldExceed && (
                <p className="mt-2 text-muted">Dimensions ou poids incomplets — la vérification de capacité sera partielle.</p>
              )}
            </div>
          )}
        </div>
        <div className="mt-7 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-muted"><th className="p-3">VIN / véhicule</th><th className="p-3">Dimensions</th><th className="p-3">Poids</th><th className="p-3">Dossier / client</th><th className="p-3">Fournisseur</th></tr></thead><tbody>{shipment.vehicles?.map((link) => { const vehicle = link.vehicle; const parent = vehicle?.dossierVehicles?.[0]?.dossier; return <tr key={link.id} className="border-b"><td className="p-3"><b>{vehicle?.vin || "VIN manquant"}</b><br />{vehicle?.brand} {vehicle?.model}</td><td className="p-3">{vehicle?.lengthCm && vehicle.widthCm && vehicle.heightCm ? `${vehicle.lengthCm} × ${vehicle.widthCm} × ${vehicle.heightCm} cm` : "À compléter"}</td><td className="p-3">{vehicle?.weightKg ? `${vehicle.weightKg} kg` : "À compléter"}</td><td className="p-3">{parent ? <Link href={`/dossiers/${parent.id}`} className="font-semibold text-blue-700 underline">{parent.reference} · {parent.client.firstName} {parent.client.lastName}</Link> : "Non lié"}</td><td className="p-3">{vehicle?.supplier?.name || "—"}</td></tr>; })}</tbody></table></div>
        <div className="mt-7">
          <h3 className="font-bold">Documents liés</h3>
          {shipment.documents?.length ? (
            <ul className="mt-3 space-y-2">
              {shipment.documents.map((document) => <li key={document.id} className="rounded-lg border p-3 text-sm">{document.title || document.documentType} {document.dossier ? `· ${document.dossier.reference}` : ""}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Aucun document lié.</p>
          )}
          {shipment.customsFiles?.length ? (
            <div className="mt-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted">Dossiers douane</h4>
              <ul className="mt-2 space-y-2">
                {shipment.customsFiles.map((file) => <li key={file.id} className="rounded-lg border p-3 text-sm font-mono">{file.reference} · {file.status}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border p-4"><p className="text-xs font-semibold uppercase text-muted">{label}</p><p className="mt-1 font-bold">{value}</p></div>; }
