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
  async function assign() {
    if (!vehicleId) return;
    setError("");
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
        <div className="mt-7 flex flex-wrap items-end gap-3"><label className="min-w-72 flex-1"><span className="field-label">Ajouter un véhicule</span><select className={inputClass} value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="">Sélectionner</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vin || "VIN manquant"} · {vehicle.brand} {vehicle.model}</option>)}</select></label><button type="button" onClick={() => void assign().catch((cause) => setError(cause instanceof Error ? cause.message : "Affectation impossible"))} className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white">Affecter</button></div>
        <div className="mt-7 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-muted"><th className="p-3">VIN / véhicule</th><th className="p-3">Dimensions</th><th className="p-3">Poids</th><th className="p-3">Dossier / client</th><th className="p-3">Fournisseur</th></tr></thead><tbody>{shipment.vehicles?.map((link) => { const vehicle = link.vehicle; const parent = vehicle?.dossierVehicles?.[0]?.dossier; return <tr key={link.id} className="border-b"><td className="p-3"><b>{vehicle?.vin || "VIN manquant"}</b><br />{vehicle?.brand} {vehicle?.model}</td><td className="p-3">{vehicle?.lengthCm && vehicle.widthCm && vehicle.heightCm ? `${vehicle.lengthCm} × ${vehicle.widthCm} × ${vehicle.heightCm} cm` : "À compléter"}</td><td className="p-3">{vehicle?.weightKg ? `${vehicle.weightKg} kg` : "À compléter"}</td><td className="p-3">{parent ? <Link href={`/dossiers/${parent.id}`} className="font-semibold text-blue-700 underline">{parent.reference} · {parent.client.firstName} {parent.client.lastName}</Link> : "Non lié"}</td><td className="p-3">{vehicle?.supplier?.name || "—"}</td></tr>; })}</tbody></table></div>
        <div className="mt-7"><h3 className="font-bold">Documents liés</h3>{shipment.documents?.length ? <ul className="mt-3 space-y-2">{shipment.documents.map((document) => <li key={document.id} className="rounded-lg border p-3 text-sm">{document.title || document.documentType} {document.dossier ? `· ${document.dossier.reference}` : ""}</li>)}</ul> : <p className="mt-2 text-sm text-muted">Aucun document lié.</p>}</div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border p-4"><p className="text-xs font-semibold uppercase text-muted">{label}</p><p className="mt-1 font-bold">{value}</p></div>; }
