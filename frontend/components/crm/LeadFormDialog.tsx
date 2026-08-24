"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { crmApi } from "@/lib/crm-api";
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
    source: "MANUAL",
    qualification: LeadQualification.UNCLASSIFIED,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await crmApi.createProspect({
        ...values,
        email: values.email || undefined,
        phone: values.phone || undefined,
      });
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible dâ€™enregistrer le lead",
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
              CoordonnÃ©es normalisÃ©es pour les appels et WhatsApp.
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
            placeholder="PrÃ©nom"
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
            className={input}
            placeholder="TÃ©lÃ©phone"
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
          <select
            className={input}
            value={values.source}
            onChange={(event) =>
              setValues({ ...values, source: event.target.value })
            }
          >
            <option value="MANUAL">Saisie manuelle</option>
            <option value="INBOUND_CALL">Appel entrant</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="WEBSITE">Site web</option>
            <option value="REFERRAL">Recommandation</option>
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
            <option value={LeadQualification.UNCLASSIFIED}>
              Non qualifiÃ©
            </option>
            <option value={LeadQualification.HOT}>Hot</option>
            <option value={LeadQualification.WARM}>Warm</option>
            <option value={LeadQualification.COLD}>Cold</option>
          </select>
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
            {saving ? "Enregistrementâ€¦" : "CrÃ©er le lead"}
          </button>
        </div>
      </form>
    </div>
  );
}
