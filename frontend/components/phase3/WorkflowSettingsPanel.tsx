"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Permission } from "@/lib/api-contract";
import { commerceApi, type ApiVehicleLookup } from "@/lib/commerce-api";
import { inputClass } from "@/components/commerce/common";

type PricingSettings = {
  insuranceRatePercent: string | number | null;
  dutyRates: Array<{ id: string; category: string; ratePercent: string | number | null; active: boolean }>;
  deliveryRates: Array<{ id: string; destination: string; amount: string | number | null; currency: string; active: boolean }>;
};

const kindLabels: Record<ApiVehicleLookup["kind"], string> = {
  BRAND: "Marques",
  MODEL: "Modèles",
  ENGINE: "Moteurs",
  TRANSMISSION: "Transmissions",
  FUEL_TYPE: "Carburants",
  COLOR: "Couleurs",
  BODY_TYPE: "Carrosseries",
};

export default function WorkflowSettingsPanel() {
  const { hasPermission } = useAuth();
  const canManageSettings = hasPermission(Permission.SETTINGS_WRITE);
  const canManageLookups = hasPermission(Permission.VEHICLES_WRITE);
  const [lookups, setLookups] = useState<ApiVehicleLookup[]>([]);
  const [pricing, setPricing] = useState<PricingSettings | null>(null);
  const [insurance, setInsurance] = useState("");
  const [duty, setDuty] = useState({ category: "", ratePercent: "" });
  const [delivery, setDelivery] = useState({ destination: "", amount: "", currency: "DZD" });
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const [lookupItems, pricingData] = await Promise.all([
      commerceApi.configuration.lookups({ includeInactive: "true" }),
      commerceApi.configuration.pricingSettings(),
    ]);
    const typed = pricingData as unknown as PricingSettings;
    setLookups(lookupItems);
    setPricing(typed);
    setInsurance(String(typed.insuranceRatePercent ?? ""));
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function saveInsurance() {
    await commerceApi.configuration.updateInsurance(insurance ? Number(insurance) : undefined);
    setMessage("Taux d’assurance enregistré.");
    await load();
  }
  async function addDuty(event: FormEvent) {
    event.preventDefault();
    await commerceApi.configuration.upsertDuty({ category: duty.category, ratePercent: duty.ratePercent ? Number(duty.ratePercent) : undefined });
    setDuty({ category: "", ratePercent: "" });
    setMessage("Barème douanier enregistré.");
    await load();
  }
  async function addDelivery(event: FormEvent) {
    event.preventDefault();
    await commerceApi.configuration.upsertDelivery({ destination: delivery.destination, amount: delivery.amount ? Number(delivery.amount) : undefined, currency: delivery.currency });
    setDelivery({ destination: "", amount: "", currency: "DZD" });
    setMessage("Tarif de livraison enregistré.");
    await load();
  }
  async function editLookup(item: ApiVehicleLookup) {
    const value = window.prompt("Modifier la valeur", item.value)?.trim();
    if (!value || value === item.value) return;
    await commerceApi.configuration.updateLookup(item.id, { value });
    await load();
  }
  async function toggleLookup(item: ApiVehicleLookup) {
    await commerceApi.configuration.updateLookup(item.id, { active: !item.active });
    await load();
  }

  return (
    <div className="mx-auto mt-6 max-w-5xl space-y-6">
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</p>}
      <section className="card">
        <h2 className="font-bold">Tarification CIF / DDP</h2>
        <p className="mt-1 text-sm text-muted">Aucune valeur par défaut n’est appliquée. Les calculs restent bloqués tant que les taux requis sont absents.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label><span className="field-label">Assurance (%)</span><input disabled={!canManageSettings} type="number" min="0" step="0.0001" className={inputClass} value={insurance} placeholder="Non configuré" onChange={(event) => setInsurance(event.target.value)} /></label>
          <button type="button" disabled={!canManageSettings} onClick={() => void saveInsurance()} className="self-end rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Enregistrer l’assurance</button>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <form onSubmit={addDuty} className="rounded-xl border p-4"><h3 className="font-semibold">Droits par carrosserie</h3><input required disabled={!canManageSettings} className={`${inputClass} mt-3`} placeholder="Catégorie / carrosserie" value={duty.category} onChange={(e) => setDuty((v) => ({ ...v, category: e.target.value }))} /><input disabled={!canManageSettings} className={`${inputClass} mt-3`} type="number" min="0" step="0.0001" placeholder="Taux (%) — non configuré" value={duty.ratePercent} onChange={(e) => setDuty((v) => ({ ...v, ratePercent: e.target.value }))} /><button disabled={!canManageSettings} className="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold">Ajouter / modifier</button><ul className="mt-3 text-sm">{pricing?.dutyRates.map((rate) => <li key={rate.id}>{rate.category}: {rate.ratePercent ?? "non configuré"}%</li>)}</ul></form>
          <form onSubmit={addDelivery} className="rounded-xl border p-4"><h3 className="font-semibold">Livraison locale</h3><input required disabled={!canManageSettings} className={`${inputClass} mt-3`} placeholder="Destination ou DEFAULT" value={delivery.destination} onChange={(e) => setDelivery((v) => ({ ...v, destination: e.target.value }))} /><div className="mt-3 flex gap-2"><input disabled={!canManageSettings} className={inputClass} type="number" min="0" step="0.01" placeholder="Montant — non configuré" value={delivery.amount} onChange={(e) => setDelivery((v) => ({ ...v, amount: e.target.value }))} /><input disabled={!canManageSettings} className={inputClass} value={delivery.currency} onChange={(e) => setDelivery((v) => ({ ...v, currency: e.target.value }))} /></div><button disabled={!canManageSettings} className="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold">Ajouter / modifier</button><ul className="mt-3 text-sm">{pricing?.deliveryRates.map((rate) => <li key={rate.id}>{rate.destination}: {rate.amount ?? "non configuré"} {rate.currency}</li>)}</ul></form>
        </div>
      </section>
      <section className="card">
        <h2 className="font-bold">Listes véhicules</h2>
        <p className="mt-1 text-sm text-muted">Les valeurs désactivées restent liées aux véhicules historiques mais disparaissent des nouvelles saisies.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(kindLabels) as ApiVehicleLookup["kind"][]).map((kind) => <div key={kind} className="rounded-xl border p-4"><h3 className="font-semibold">{kindLabels[kind]}</h3><ul className="mt-3 max-h-56 space-y-2 overflow-auto text-sm">{lookups.filter((item) => item.kind === kind).map((item) => <li key={item.id} className={`flex items-center justify-between gap-2 ${item.active ? "" : "text-muted line-through"}`}><button type="button" disabled={!canManageLookups} onClick={() => void editLookup(item)} className="text-left">{item.value}{item.needsReview ? " ⚠" : ""}</button><button type="button" disabled={!canManageLookups} onClick={() => void toggleLookup(item)} className="text-xs font-semibold text-blue-700">{item.active ? "Désactiver" : "Réactiver"}</button></li>)}</ul></div>)}
        </div>
      </section>
    </div>
  );
}
