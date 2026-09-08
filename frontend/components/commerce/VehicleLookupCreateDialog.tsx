"use client";

import { FormEvent, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { ApiVehicleLookup } from "@/lib/commerce-api";
import { buttonClass, inputClass } from "./common";

type LookupKind = ApiVehicleLookup["kind"];

const labels: Record<LookupKind, string> = {
  BRAND: "marque",
  MODEL: "modèle",
  VERSION: "version",
  ENGINE: "motorisation",
  TRANSMISSION: "transmission",
  FUEL_TYPE: "carburant",
  COLOR: "couleur",
  BODY_TYPE: "carrosserie",
};

export default function VehicleLookupCreateDialog({
  kind,
  lookups,
  initialParentId,
  create,
  onCreated,
  onClose,
}: {
  kind: LookupKind;
  lookups: ApiVehicleLookup[];
  initialParentId?: string;
  create: (data: {
    kind: LookupKind;
    value: string;
    parentId?: string;
  }) => Promise<ApiVehicleLookup>;
  onCreated: (value: ApiVehicleLookup) => void;
  onClose: () => void;
}) {
  const initialModel = lookups.find(
    (item) => item.kind === "MODEL" && item.id === initialParentId,
  );
  const [brandId, setBrandId] = useState(
    kind === "MODEL" ? (initialParentId ?? "") : (initialModel?.parentId ?? ""),
  );
  const [modelId, setModelId] = useState(
    kind === "VERSION" ? (initialParentId ?? "") : "",
  );
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const brands = useMemo(
    () => lookups.filter((item) => item.kind === "BRAND" && item.active),
    [lookups],
  );
  const models = useMemo(
    () =>
      lookups.filter(
        (item) =>
          item.kind === "MODEL" && item.active && item.parentId === brandId,
      ),
    [brandId, lookups],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) return setError("Le nom est obligatoire.");
    const parentId =
      kind === "MODEL" ? brandId : kind === "VERSION" ? modelId : undefined;
    if (["MODEL", "VERSION"].includes(kind) && !parentId) {
      return setError(
        kind === "MODEL"
          ? "Sélectionnez une marque."
          : "Sélectionnez une marque puis un modèle.",
      );
    }
    setSaving(true);
    setError("");
    try {
      onCreated(await create({ kind, value: normalized, parentId }));
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Enregistrement impossible.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="lookup-create-title"
        onSubmit={submit}
        className="card max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto p-6"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="lookup-create-title" className="text-lg font-bold">
            Ajouter {["MODEL", "FUEL_TYPE"].includes(kind) ? "un" : "une"}{" "}
            {labels[kind]}
          </h2>
          <button type="button" aria-label="Fermer" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        {["MODEL", "VERSION"].includes(kind) && (
          <label>
            <span className="field-label">Marque *</span>
            <select
              required
              className={inputClass}
              value={brandId}
              onChange={(event) => {
                setBrandId(event.target.value);
                setModelId("");
              }}
            >
              <option value="">Sélectionner une marque</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.value}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "VERSION" && (
          <label>
            <span className="field-label">Modèle *</span>
            <select
              required
              disabled={!brandId}
              className={inputClass}
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
            >
              <option value="">Sélectionner un modèle</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.value}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="field-label">
            Nom {["MODEL", "FUEL_TYPE"].includes(kind) ? "du" : "de la"}{" "}
            {labels[kind]} *
          </span>
          <input
            autoFocus
            required
            maxLength={100}
            className={inputClass}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="rounded-button border px-4 py-2"
            onClick={onClose}
          >
            Annuler
          </button>
          <button
            disabled={saving}
            className={`${buttonClass} disabled:opacity-50`}
          >
            {saving ? "Ajout…" : "Ajouter"}
          </button>
        </div>
      </form>
    </div>
  );
}
