"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  DOSSIER_STATUS_LABELS_API,
  type ApiDossierStatus,
} from "@/lib/api-contract";
import {
  commerceApi,
  type ApiDossier,
  type ApiPartner,
} from "@/lib/commerce-api";
import { uploadDocument } from "@/lib/documents-api";
import { inputClass } from "./common";

export const DATA_ENTRY_STATUSES = new Set<ApiDossierStatus>([
  "depositReceived",
  "vehicleBooking",
  "purchaseConfirmed",
  "inspection",
  "shipmentBooking",
  "billOfLadingIssued",
]);

export default function DossierTransitionDialog({
  dossier,
  status,
  partners,
  comment,
  onClose,
  onComplete,
}: {
  dossier: ApiDossier;
  status: ApiDossierStatus;
  partners: ApiPartner[];
  comment?: string;
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const supplierId =
    dossier.vehicles[0]?.supplierId ?? dossier.offerReservation?.offer.supplierId ?? "";
  const [form, setForm] = useState<Record<string, string>>({
    currency: dossier.vehicles[0]?.currency ?? "USD",
    receivedAt: today,
    bookingDate: today,
    invoiceDate: today,
    supplierId,
  });
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const forwarders = useMemo(() => {
    const tagged = partners.filter(
      (partner) =>
        partner.supplierType?.toUpperCase().includes("FORWARD") ||
        ["carrier", "logistics"].includes(partner.type),
    );
    return tagged.length ? tagged : partners;
  }, [partners]);
  const field = (name: string, value: string) =>
    setForm((current) => ({ ...current, [name]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      let documentId: string | undefined;
      if (file) {
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
          throw new Error("Seuls les fichiers PDF sont acceptés.");
        }
        const document = await uploadDocument(file, {
          dossierId: dossier.id,
          kind: "DOSSIER_DOCUMENT",
          documentType:
            status === "inspection" ? "rapport_inspection" : "bl_final",
          title:
            status === "inspection" ? "Rapport d’inspection" : "Bill of Lading",
        });
        documentId = document.id;
      }
      const payload: Record<string, unknown> = { comment };
      if (status === "depositReceived") {
        payload.deposit = {
          amount: Number(form.amount),
          currency: form.currency,
          paymentMethod: form.paymentMethod,
          receivedAt: form.receivedAt,
          reference: form.reference || undefined,
          note: form.note || undefined,
        };
      } else if (status === "vehicleBooking") {
        payload.vehicleBooking = {
          vehicleId: form.vehicleId,
          bookingDate: form.bookingDate,
          note: form.note || undefined,
        };
      } else if (status === "purchaseConfirmed") {
        payload.purchase = {
          invoiceNumber: form.invoiceNumber,
          amount: Number(form.amount),
          currency: form.currency,
          invoiceDate: form.invoiceDate,
          supplierId: form.supplierId,
        };
      } else if (status === "inspection") {
        payload.inspection = {
          documentId,
          url: form.url || undefined,
          note: form.note || undefined,
        };
      } else if (status === "shipmentBooking") {
        payload.shipmentBooking = {
          forwarderSupplierId: form.forwarderSupplierId,
          note: form.note || undefined,
        };
      } else if (status === "billOfLadingIssued") {
        if (!documentId) throw new Error("Le PDF du BL est obligatoire.");
        payload.billOfLading = { documentId };
      }
      await commerceApi.dossiers.transition(dossier.id, status, payload);
      await onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Transition impossible");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold">{DOSSIER_STATUS_LABELS_API[status]}</h2>
        <p className="mt-1 text-sm text-muted">Les données obligatoires seront enregistrées dans le dossier et son historique.</p>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {status === "depositReceived" && <>
            <RequiredInput label="Montant reçu" type="number" min="0.01" step="0.01" value={form.amount} onChange={(v) => field("amount", v)} />
            <RequiredInput label="Devise" value={form.currency} onChange={(v) => field("currency", v)} />
            <label><span className="field-label">Moyen de paiement *</span><select required className={inputClass} value={form.paymentMethod ?? ""} onChange={(e) => field("paymentMethod", e.target.value)}><option value="">Sélectionner</option><option value="BANK_TRANSFER">Virement bancaire</option><option value="CASH">Espèces</option><option value="CHEQUE">Chèque</option><option value="CARD">Carte</option><option value="OTHER">Autre</option></select></label>
            <RequiredInput label="Date reçue" type="date" value={form.receivedAt} onChange={(v) => field("receivedAt", v)} />
            <Input label="Référence / transaction" value={form.reference} onChange={(v) => field("reference", v)} />
          </>}
          {status === "vehicleBooking" && <>
            <label className="sm:col-span-2"><span className="field-label">Véhicule / VIN *</span><select required className={inputClass} value={form.vehicleId ?? ""} onChange={(e) => field("vehicleId", e.target.value)}><option value="">Sélectionner</option>{dossier.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vin || "VIN en attente"} · {vehicle.brand} {vehicle.model}</option>)}</select></label>
            <RequiredInput label="Date de réservation" type="date" value={form.bookingDate} onChange={(v) => field("bookingDate", v)} />
          </>}
          {status === "purchaseConfirmed" && <>
            <RequiredInput label="N° facture fournisseur" value={form.invoiceNumber} onChange={(v) => field("invoiceNumber", v)} />
            <RequiredInput label="Montant FOB/FCA" type="number" min="0.01" step="0.01" value={form.amount} onChange={(v) => field("amount", v)} />
            <RequiredInput label="Devise" value={form.currency} onChange={(v) => field("currency", v)} />
            <RequiredInput label="Date facture" type="date" value={form.invoiceDate} onChange={(v) => field("invoiceDate", v)} />
            <label className="sm:col-span-2"><span className="field-label">Fournisseur véhicule *</span><select required className={inputClass} value={form.supplierId} onChange={(e) => field("supplierId", e.target.value)}><option value="">Sélectionner</option>{partners.filter((p) => p.type === "supplier").map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>
          </>}
          {status === "inspection" && <>
            <FileInput label="Rapport PDF" onChange={setFile} />
            <Input label="Lien du rapport" type="url" value={form.url} onChange={(v) => field("url", v)} />
            <p className="sm:col-span-2 text-xs text-muted">Ajoutez au moins un PDF ou une URL. Les deux sont acceptés.</p>
          </>}
          {status === "shipmentBooking" && <label className="sm:col-span-2"><span className="field-label">Forwarder *</span><select required className={inputClass} value={form.forwarderSupplierId ?? ""} onChange={(e) => field("forwarderSupplierId", e.target.value)}><option value="">Sélectionner</option>{forwarders.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>}
          {status === "billOfLadingIssued" && <FileInput required label="Description complète / BL PDF *" onChange={setFile} />}
          {status !== "billOfLadingIssued" && <label className="sm:col-span-2"><span className="field-label">Note</span><textarea className={inputClass} value={form.note ?? ""} onChange={(e) => field("note", e.target.value)} /></label>}
        </div>
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold">Annuler</button><button disabled={working} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{working ? "Enregistrement…" : "Valider l’étape"}</button></div>
      </form>
    </div>
  );
}

function Input({ label, value = "", onChange, ...props }: { label: string; value?: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <label><span className="field-label">{label}</span><input {...props} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
function RequiredInput(props: Parameters<typeof Input>[0]) { return <Input {...props} required />; }
function FileInput({ label, required, onChange }: { label: string; required?: boolean; onChange: (file: File | null) => void }) {
  return <label className="sm:col-span-2"><span className="field-label">{label}</span><input required={required} type="file" accept="application/pdf,.pdf" className={inputClass} onChange={(event) => onChange(event.target.files?.[0] ?? null)} /></label>;
}
