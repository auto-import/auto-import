"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { crmApi, type ApiCrmReference } from "@/lib/crm-api";
import { LeadQualification } from "@/lib/api-contract";

export default function LeadFormDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    wilaya: "",
    entryChannelId: "",
    marketingSourceId: "",
    countryId: "",
    city: "",
    qualification: LeadQualification.UNCLASSIFIED,
    nextAction: "",
    nextActionAt: "",
    brand: "",
    model: "",
    requirements: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [references, setReferences] = useState<ApiCrmReference[]>([]);
  const byKind = useMemo(
    () => (kind: ApiCrmReference["kind"]) =>
      references.filter((item) => item.kind === kind && item.active),
    [references],
  );
  useEffect(() => {
    void crmApi
      .referenceData()
      .then((items) => {
        setReferences(items);
        const channels = items.filter(
          (item) => item.kind === "ENTRY_CHANNEL" && item.active,
        );
        const sources = items.filter(
          (item) => item.kind === "MARKETING_SOURCE" && item.active,
        );
        const countries = items.filter(
          (item) => item.kind === "COUNTRY" && item.active,
        );
        setValues((current) => ({
          ...current,
          entryChannelId:
            channels.find((item) => item.code === "MANUAL")?.id ||
            channels[0]?.id ||
            "",
          marketingSourceId:
            sources.find((item) => item.code === "OTHER")?.id ||
            sources[0]?.id ||
            "",
          countryId: countries.find((item) => item.code === "DZ")?.id || "",
        }));
      })
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Référentiels CRM indisponibles",
        ),
      );
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await crmApi.createProspect({
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        email: values.email || undefined,
        wilaya: values.wilaya || undefined,
        city: values.city || undefined,
        countryId: values.countryId || undefined,
        entryChannelId: values.entryChannelId,
        marketingSourceId: values.marketingSourceId,
        qualification: values.qualification,
        notes: values.notes || undefined,
        nextAction: values.nextAction || undefined,
        nextActionAt: values.nextActionAt || undefined,
        requirement:
          values.brand || values.model || values.requirements
            ? {
                brand: values.brand || undefined,
                model: values.model || undefined,
                requirements: values.requirements || undefined,
              }
            : undefined,
      });
      if (!result.created) {
        setError(
          result.matchState === "AMBIGUOUS"
            ? "Plusieurs fiches partagent ce numéro. Une réconciliation est requise."
            : "Ce numéro est déjà connu. La prise de contact a été ajoutée à la fiche existante.",
        );
        return;
      }
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible d’enregistrer le lead",
      );
    } finally {
      setSaving(false);
    }
  }
  const input =
    "w-full rounded-input border border-border bg-background px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="card w-full max-w-xl space-y-4 bg-background"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Nouveau lead</h2>
            <p className="text-sm text-muted">
              Coordonnées normalisées pour les appels et WhatsApp.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && (
          <p className="rounded-card bg-status-red-bg p-3 text-sm text-status-red-text">
            {error}
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <input
            required
            className={input}
            placeholder="Prénom"
            value={values.firstName}
            onChange={(event) =>
              setValues({ ...values, firstName: event.target.value })
            }
          />
          <input
            required
            className={input}
            placeholder="Nom"
            value={values.lastName}
            onChange={(event) =>
              setValues({ ...values, lastName: event.target.value })
            }
          />
          <input
            required
            className={input}
            placeholder="Téléphone"
            value={values.phone}
            onChange={(event) =>
              setValues({ ...values, phone: event.target.value })
            }
          />
          <input
            type="email"
            className={input}
            placeholder="Email"
            value={values.email}
            onChange={(event) =>
              setValues({ ...values, email: event.target.value })
            }
          />
          <input
            className={input}
            placeholder="Wilaya"
            value={values.wilaya}
            onChange={(event) =>
              setValues({ ...values, wilaya: event.target.value })
            }
          />
          <input
            className={input}
            placeholder="Ville"
            value={values.city}
            onChange={(event) =>
              setValues({ ...values, city: event.target.value })
            }
          />
          <select
            className={input}
            required
            value={values.entryChannelId}
            onChange={(event) =>
              setValues({ ...values, entryChannelId: event.target.value })
            }
          >
            <option value="">Canal d&apos;entrée</option>
            {byKind("ENTRY_CHANNEL").map((item) => (
              <option key={item.id} value={item.id}>
                {item.labelFr}
              </option>
            ))}
          </select>
          <select
            className={input}
            required
            value={values.marketingSourceId}
            onChange={(event) =>
              setValues({ ...values, marketingSourceId: event.target.value })
            }
          >
            <option value="">Source marketing</option>
            {byKind("MARKETING_SOURCE").map((item) => (
              <option key={item.id} value={item.id}>
                {item.labelFr}
              </option>
            ))}
          </select>
          <select
            className={input}
            value={values.countryId}
            onChange={(event) =>
              setValues({ ...values, countryId: event.target.value })
            }
          >
            <option value="">Pays</option>
            {byKind("COUNTRY").map((item) => (
              <option key={item.id} value={item.id}>
                {item.labelFr}
              </option>
            ))}
          </select>
          <select
            className={input}
            value={values.qualification}
            onChange={(event) =>
              setValues({
                ...values,
                qualification: event.target
                  .value as typeof values.qualification,
              })
            }
          >
            <option value={LeadQualification.UNCLASSIFIED}>Non qualifié</option>
            <option value={LeadQualification.HOT}>Hot</option>
            <option value={LeadQualification.WARM}>Warm</option>
            <option value={LeadQualification.COLD}>Cold</option>
          </select>
        </div>
        <fieldset className="grid gap-3 rounded-card border border-border p-3 md:grid-cols-2">
          <legend className="px-2 text-sm font-medium">
            Véhicule / besoin client
          </legend>
          <input
            className={input}
            placeholder="Marque"
            value={values.brand}
            onChange={(event) =>
              setValues({ ...values, brand: event.target.value })
            }
          />
          <input
            className={input}
            placeholder="Modèle"
            value={values.model}
            onChange={(event) =>
              setValues({ ...values, model: event.target.value })
            }
          />
          <textarea
            className={`${input} md:col-span-2`}
            rows={2}
            placeholder="Exigences"
            value={values.requirements}
            onChange={(event) =>
              setValues({ ...values, requirements: event.target.value })
            }
          />
        </fieldset>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            className={input}
            placeholder="Prochaine action"
            value={values.nextAction}
            onChange={(event) =>
              setValues({ ...values, nextAction: event.target.value })
            }
          />
          <input
            type="datetime-local"
            className={input}
            value={values.nextActionAt}
            onChange={(event) =>
              setValues({ ...values, nextActionAt: event.target.value })
            }
          />
        </div>
        <textarea
          className={input}
          rows={3}
          placeholder="Notes"
          value={values.notes}
          onChange={(event) =>
            setValues({ ...values, notes: event.target.value })
          }
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-button border border-border px-4 py-2 text-sm"
          >
            Annuler
          </button>
          <button
            disabled={saving}
            className="rounded-button bg-foreground px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Créer le lead"}
          </button>
        </div>
      </form>
    </div>
  );
}
