"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { UploadCloud } from "lucide-react";
import {
  commerceApi,
  type ApiDossier,
  type ApiDossierEvidence,
} from "@/lib/commerce-api";
import { uploadDocument } from "@/lib/documents-api";
import { inputClass } from "./common";

const checkpoints = [
  "ARRIVAL_AT_PORT",
  "CUSTOMS",
  "PORT_EXIT",
  "LOCAL_TRANSPORT",
] as const;

export default function DossierEvidencePanel({
  dossier,
}: {
  dossier: ApiDossier;
}) {
  const [summary, setSummary] = useState<Awaited<
    ReturnType<typeof commerceApi.dossiers.evidence>
  > | null>(null);
  const [vehicleId, setVehicleId] = useState(dossier.vehicles[0]?.id ?? "");
  const [checkpoint, setCheckpoint] =
    useState<ApiDossierEvidence["checkpoint"]>("ARRIVAL_AT_PORT");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async () => setSummary(await commerceApi.dossiers.evidence(dossier.id)),
    [dossier.id],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function uploadEvidence(event: FormEvent) {
    event.preventDefault();
    if (!evidenceFile || !vehicleId) return;
    setBusy(true);
    setMessage("");
    try {
      await commerceApi.dossiers.uploadEvidence(
        dossier.id,
        { vehicleId, checkpoint },
        evidenceFile,
      );
      setEvidenceFile(null);
      await load();
      setMessage("Preuve enregistrée. La transition reste explicite.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Envoi impossible");
    } finally {
      setBusy(false);
    }
  }

  async function uploadContract() {
    if (!contractFile) return;
    setBusy(true);
    setMessage("");
    try {
      await uploadDocument(contractFile, {
        dossierId: dossier.id,
        kind: "CONTRACT",
        documentType: "SIGNED_CONTRACT",
        title: contractFile.name,
      });
      setContractFile(null);
      setMessage(
        "Contrat signé enregistré. Relancez explicitement la transition.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Envoi impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 border-t border-neutral-200 pt-7">
      <h2 className="font-bold">Photos & preuves</h2>
      <p className="mt-1 text-sm text-muted">
        Une photo privée et lisible est requise pour chaque véhicule à chaque
        checkpoint applicable.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border p-4">
        <label className="text-sm font-semibold">Contrat signé</label>
        <input
          aria-label="Contrat signé"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(event) => setContractFile(event.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          disabled={!contractFile || busy}
          onClick={() => void uploadContract()}
          className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          <UploadCloud className="mr-2 inline h-4 w-4" />
          Importer
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {checkpoints.map((value) => {
          const complete = (summary?.vehicles ?? []).filter(
            ({ vehicleId: id }) =>
              summary?.evidence.some(
                (evidence) =>
                  evidence.vehicleId === id && evidence.checkpoint === value,
              ),
          ).length;
          return (
            <div key={value} className="rounded-xl border p-3 text-sm">
              <p className="font-semibold">{value.replaceAll("_", " ")}</p>
              <p className="mt-1 text-muted">
                {complete}/{summary?.vehicles.length ?? 0} véhicules
              </p>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={uploadEvidence}
        className="mt-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
      >
        <label>
          <span className="field-label">Véhicule</span>
          <select
            className={inputClass}
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
          >
            {summary?.vehicles.map(({ vehicleId: id, vehicle }) => (
              <option key={id} value={id}>
                {vehicle.brand} {vehicle.model} · {vehicle.vin ?? id}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Checkpoint</span>
          <select
            className={inputClass}
            value={checkpoint}
            onChange={(event) =>
              setCheckpoint(
                event.target.value as ApiDossierEvidence["checkpoint"],
              )
            }
          >
            {checkpoints.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <input
          required
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
        />
        <button
          disabled={!evidenceFile || !vehicleId || busy}
          className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Importer la preuve
        </button>
      </form>
      {message && (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
