"use client";

import { FormEvent, useEffect, useState } from "react";
import { Building2, Globe2, ReceiptText } from "lucide-react";
import Topbar from "@/components/Topbar";
import { phase3Api, type ApiSettings } from "@/lib/phase3-api";
import {
  ErrorState,
  inputClass,
  LoadingState,
} from "@/components/commerce/common";
import IntegrationsPanel from "./IntegrationsPanel";
import { useAuth } from "@/components/AuthProvider";
import { Permission } from "@/lib/api-contract";

export default function SettingsWorkspace() {
  const { hasPermission } = useAuth();
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const load = async () => {
    setError("");
    try {
      setSettings(await phase3Api.settings.get());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement impossible",
      );
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaved(false);
    setError("");
    try {
      const {
        displayName,
        legalName,
        phone,
        email,
        address,
        locale,
        timezone,
        baseCurrency,
        dossierPrefix,
        invoicePrefix,
        notificationDefaults,
      } = settings;
      setSettings(
        await phase3Api.settings.update({
          displayName,
          legalName,
          phone,
          email,
          address,
          locale,
          timezone,
          baseCurrency,
          dossierPrefix,
          invoicePrefix,
          notificationDefaults,
        }),
      );
      setSaved(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Enregistrement impossible",
      );
    }
  }
  if (!settings)
    return (
      <>
        <Topbar title="Paramètres" subtitle="Configuration de l’organisation" />
        <main className="p-8">
          {error ? (
            <ErrorState message={error} retry={() => void load()} />
          ) : (
            <LoadingState />
          )}
        </main>
      </>
    );
  const field = (key: keyof ApiSettings, value: string) =>
    setSettings((current) =>
      current ? { ...current, [key]: value } : current,
    );
  return (
    <>
      <Topbar
        title="Paramètres"
        subtitle="Configuration persistée de l’organisation"
      />
      <main className="p-4 sm:p-8">
        <form onSubmit={save} className="mx-auto max-w-5xl space-y-6">
          {error && <ErrorState message={error} retry={() => setError("")} />}
          {saved && (
            <p
              role="status"
              className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"
            >
              Modifications enregistrées.
            </p>
          )}
          <Section icon={Building2} title="Organisation">
            <label>
              <span className="field-label">Nom affiché</span>
              <input
                className={inputClass}
                value={settings.displayName ?? ""}
                onChange={(event) => field("displayName", event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">Raison sociale</span>
              <input
                className={inputClass}
                value={settings.legalName ?? ""}
                onChange={(event) => field("legalName", event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">Téléphone</span>
              <input
                className={inputClass}
                value={settings.phone ?? ""}
                onChange={(event) => field("phone", event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">E-mail</span>
              <input
                type="email"
                className={inputClass}
                value={settings.email ?? ""}
                onChange={(event) => field("email", event.target.value)}
              />
            </label>
            <label className="sm:col-span-2">
              <span className="field-label">Adresse</span>
              <input
                className={inputClass}
                value={settings.address ?? ""}
                onChange={(event) => field("address", event.target.value)}
              />
            </label>
          </Section>
          <Section icon={Globe2} title="Régional">
            <label>
              <span className="field-label">Langue</span>
              <select
                className={inputClass}
                value={settings.locale}
                onChange={(event) => field("locale", event.target.value)}
              >
                <option value="fr-DZ">Français (Algérie)</option>
                <option value="fr-FR">Français (France)</option>
                <option value="ar-DZ">العربية (الجزائر)</option>
              </select>
            </label>
            <label>
              <span className="field-label">Fuseau horaire</span>
              <select
                className={inputClass}
                value={settings.timezone}
                onChange={(event) => field("timezone", event.target.value)}
              >
                <option value="Africa/Algiers">Africa/Algiers</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
            <label>
              <span className="field-label">Devise de base</span>
              <select
                className={inputClass}
                value={settings.baseCurrency}
                onChange={(event) => field("baseCurrency", event.target.value)}
              >
                <option>DZD</option>
                <option>USD</option>
                <option>EUR</option>
                <option>CNY</option>
              </select>
            </label>
          </Section>
          <Section icon={ReceiptText} title="Numérotation">
            <label>
              <span className="field-label">Préfixe dossier</span>
              <input
                className={inputClass}
                value={settings.dossierPrefix}
                onChange={(event) => field("dossierPrefix", event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">Préfixe facture</span>
              <input
                className={inputClass}
                value={settings.invoicePrefix}
                onChange={(event) => field("invoicePrefix", event.target.value)}
              />
            </label>
          </Section>
          <div className="flex justify-end">
            <button className="rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white">
              Enregistrer les modifications
            </button>
          </div>
        </form>
        {hasPermission(Permission.SETTINGS_INTEGRATIONS_MANAGE) && (
          <IntegrationsPanel />
        )}
      </main>
    </>
  );
}
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Building2;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100">
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="font-bold">{title}</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
