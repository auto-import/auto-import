"use client";

import { useState } from "react";

export interface ReferenceDraft {
  name: string;
  code: string;
  country: string;
}

/** Creation is delegated to the API owner; no local value is ever added optimistically. */
export default function PersistentReferenceSelect({
  label,
  value,
  options,
  loading,
  error,
  retry,
  onChange,
  create,
  port = false,
  required = false,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  loading: boolean;
  error: string;
  retry: () => void;
  onChange: (id: string) => void;
  create?: (draft: ReferenceDraft) => Promise<string>;
  port?: boolean;
  required?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ReferenceDraft>({
    name: "",
    code: "",
    country: "",
  });
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const input =
    "w-full rounded-input border border-border bg-background px-3 py-2 text-sm";
  async function save() {
    setSaveError("");
    if (!draft.name.trim() || (port && !draft.code.trim())) {
      setSaveError(
        port
          ? "Renseignez le nom et le code du port."
          : "Renseignez le nom du pays.",
      );
      return;
    }
    if (!create) return;
    setSaving(true);
    try {
      const id = await create(draft);
      onChange(id);
      setAdding(false);
      setSuccess("Valeur enregistrée.");
      setDraft({ name: "", code: "", country: "" });
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : "Enregistrement impossible",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">
        {label}
        <select
          aria-label={label}
          className={input}
          value={value}
          required={required}
          disabled={loading || Boolean(error)}
          onChange={(event) => {
            onChange(event.target.value);
            setSuccess("");
          }}
        >
          <option value="">
            {loading
              ? "Chargement..."
              : error
                ? "Chargement impossible"
                : options.length
                  ? "Sélectionner"
                  : port
                    ? "Aucun port enregistré"
                    : "Aucun pays enregistré"}
          </option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}{" "}
          <button type="button" onClick={retry} className="underline">
            Réessayer
          </button>
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-green-700">
          {success}
        </p>
      )}
      {create && !adding && (
        <button
          type="button"
          className="text-sm underline"
          onClick={() => {
            setAdding(true);
            setSaveError("");
            setSuccess("");
          }}
        >
          + Ajouter un {port ? "port" : "pays"}
        </button>
      )}
      {adding && (
        <div className="space-y-2 rounded border p-3">
          <input
            aria-label={port ? "Nom du port" : "Nom du pays"}
            placeholder={port ? "Nom du port" : "Nom du pays"}
            maxLength={120}
            className={input}
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
          <input
            aria-label={port ? "Code du port" : "Code pays (facultatif)"}
            placeholder={port ? "Code du port" : "Code pays (facultatif)"}
            maxLength={port ? 20 : 40}
            className={input}
            value={draft.code}
            onChange={(event) =>
              setDraft({ ...draft, code: event.target.value })
            }
          />
          {port && (
            <input
              aria-label="Pays du port (facultatif)"
              placeholder="Pays (facultatif)"
              className={input}
              maxLength={120}
              value={draft.country}
              onChange={(event) =>
                setDraft({ ...draft, country: event.target.value })
              }
            />
          )}
          {saveError && (
            <p role="alert" className="text-sm text-red-700">
              {saveError}
            </p>
          )}
          <div className="flex gap-3">
            <button type="button" disabled={saving} onClick={() => void save()}>
              {saving
                ? "Enregistrement..."
                : port
                  ? "Enregistrer le port"
                  : "Enregistrer le pays"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setAdding(false)}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
