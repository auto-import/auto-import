"use client";

import { useCallback, useEffect, useState } from "react";
import { Cable, ShieldCheck } from "lucide-react";
import {
  integrationsApi,
  type ApiIntegrationConfig,
} from "@/lib/integrations-api";
import { inputClass } from "@/components/commerce/common";

export default function IntegrationsPanel() {
  const [items, setItems] = useState<ApiIntegrationConfig[]>([]);
  const [kind, setKind] = useState<ApiIntegrationConfig["kind"]>("telephony");
  const [providerName, setProviderName] = useState("mock");
  const [displayName, setDisplayName] = useState("Simulateur local");
  const [identifier, setIdentifier] = useState("");
  const [secret, setSecret] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    async () => setItems(await integrationsApi.list()),
    [],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await integrationsApi.save({
        kind,
        providerName,
        displayName,
        publicIdentifiers: identifier ? { accountId: identifier } : undefined,
        credentials: secret ? { secret } : undefined,
        enabled,
      });
      setSecret("");
      await load();
      setMessage("Configuration chiffrée enregistrée.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Enregistrement impossible",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mx-auto max-w-5xl">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100">
          <Cable className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-bold">Intégrations</h2>
          <p className="text-sm text-muted">
            Contrôle sécurisé indépendant du fournisseur. Aucun adaptateur live
            n’est installé.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <article key={item.kind} className="rounded-xl border p-4">
            <div className="flex justify-between gap-3">
              <strong>
                {item.kind === "telephony" ? "Téléphonie" : "WhatsApp Business"}
              </strong>
              <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs">
                {item.configured ? item.liveStatus : "NON CONFIGURÉ"}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">
              {item.providerName} · {item.credentialsMasked ?? "aucun secret"}
            </p>
            <p className="mt-2 break-all text-xs text-muted">
              Webhook: {item.webhookUrl}
            </p>
            <button
              type="button"
              className="mt-3 rounded-lg border px-3 py-1.5 text-xs font-semibold"
              onClick={async () =>
                setMessage(
                  JSON.stringify(await integrationsApi.test(item.kind)),
                )
              }
            >
              Tester sans effet
            </button>
          </article>
        ))}
      </div>
      <div className="mt-5 grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <label>
          <span className="field-label">Canal</span>
          <select
            className={inputClass}
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as ApiIntegrationConfig["kind"])
            }
          >
            <option value="telephony">Téléphonie</option>
            <option value="whatsapp">WhatsApp Business</option>
          </select>
        </label>
        <label>
          <span className="field-label">Fournisseur</span>
          <select
            className={inputClass}
            value={providerName}
            onChange={(event) => setProviderName(event.target.value)}
          >
            <option value="mock">Simulateur</option>
            <option value="unconfigured">
              Non configuré / adaptateur requis
            </option>
          </select>
        </label>
        <label>
          <span className="field-label">Nom affiché</span>
          <input
            className={inputClass}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label>
          <span className="field-label">Identifiant public</span>
          <input
            className={inputClass}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          <span className="field-label">Secret (jamais relu)</span>
          <input
            className={inputClass}
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className="flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Activer cette configuration
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white sm:col-span-2"
        >
          <ShieldCheck className="mr-2 inline h-4 w-4" />
          Enregistrer chiffré
        </button>
      </div>
      {message && (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
