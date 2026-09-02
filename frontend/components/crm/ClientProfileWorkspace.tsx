"use client";

import { getRuntimeLocale } from "@/lib/i18n/runtime-locale";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Mail,
  Phone,
  RefreshCw,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import UnifiedTimeline from "@/components/crm/UnifiedTimeline";
import { crmApi, type ApiClient, type TimelineItem } from "@/lib/crm-api";
import { useAuth } from "@/components/AuthProvider";
import { Permission } from "@/lib/api-contract";

export default function ClientProfileWorkspace({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [client, setClient] = useState<ApiClient | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityDocument, setIdentityDocument] = useState<File | null>(null);
  const [identityForm, setIdentityForm] = useState({
    identityDocumentType: "" as "" | "PASSPORT" | "NATIONAL_ID",
    passportNumber: "",
    nin: "",
    identityIssueCountry: "",
    identityIssueDate: "",
    passportExpiry: "",
  });
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const clientResult = await crmApi.getClient(id);
      setClient(clientResult);
      setIdentityForm((current) => ({
        ...current,
        identityDocumentType: clientResult.identityDocumentType ?? "",
        identityIssueCountry: clientResult.identityIssueCountry ?? "",
        identityIssueDate: clientResult.identityIssueDate?.slice(0, 10) ?? "",
        passportExpiry: clientResult.passportExpiry?.slice(0, 10) ?? "",
      }));
      if (clientResult.access?.interactions) {
        setTimeline((await crmApi.timeline("client", id)).items);
      } else setTimeline([]);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement impossible",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);
  async function addNote() {
    if (!note.trim()) return;
    try {
      await crmApi.addNote("client", id, note.trim());
      setNote("");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Note non enregistrée",
      );
    }
  }
  async function archiveClient() {
    const reason = window.prompt("Motif d’archivage du client");
    if (!reason?.trim()) return;
    try {
      await crmApi.archiveClient(id, reason.trim());
      router.push("/crm/clients");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Archivage impossible",
      );
    }
  }
  async function saveIdentity(event: React.FormEvent) {
    event.preventDefault();
    setIdentitySaving(true);
    setError("");
    try {
      const payload = Object.fromEntries(
        Object.entries(identityForm).map(([key, value]) => [
          key,
          value.trim() || undefined,
        ]),
      ) as Record<string, string | undefined>;
      await crmApi.updateClientIdentity(id, payload, identityDocument);
      setIdentityDocument(null);
      setIdentityForm((current) => ({
        ...current,
        passportNumber: "",
        nin: "",
      }));
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Identité non enregistrée",
      );
    } finally {
      setIdentitySaving(false);
    }
  }
  return (
    <>
      <Topbar title="Profil client" subtitle="Timeline omnicanale" />
      <main className="space-y-6 p-8">
        <button
          onClick={() => router.push("/crm/clients")}
          className="flex items-center gap-1 text-sm text-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux clients
        </button>
        {loading ? (
          <div className="card p-12 text-center text-muted">
            Chargement du profil…
          </div>
        ) : error || !client ? (
          <div className="card p-8 text-status-red-text">
            <p>{error || "Client introuvable"}</p>
            <button
              onClick={() => void load()}
              className="mt-3 flex items-center gap-1 text-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </button>
          </div>
        ) : (
          <>
            <section className="card">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-status-blue-bg text-xl font-bold text-status-blue-text">
                  {client.firstName[0]}
                  {client.lastName[0]}
                </div>
                <div className="flex-1">
                  <h1 className="text-2xl font-bold">
                    {client.firstName} {client.lastName}
                  </h1>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted">
                    {client.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-4 w-4" />
                        {client.phone}
                      </span>
                    )}
                    {client.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-4 w-4" />
                        {client.email}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      {client.assignee
                        ? `${client.assignee.firstName} ${client.assignee.lastName}`
                        : "Non assigné"}
                    </span>
                  </div>
                </div>
                {hasPermission(Permission.CLIENTS_ARCHIVE) && (
                  <button
                    onClick={() => void archiveClient()}
                    className="rounded-button border border-status-red-text px-3 py-2 text-sm text-status-red-text"
                  >
                    Archiver
                  </button>
                )}
              </div>
            </section>
            <nav className="flex flex-wrap gap-2 rounded-card border border-border bg-background p-2">
              {[
                ["overview", "Vue d'ensemble", true],
                ["interactions", "Interactions", client.access?.interactions],
                ["dossiers", "Dossiers", client.access?.dossiers],
                [
                  "identity",
                  "Documents / Identité",
                  client.access?.documents || client.access?.identityReveal,
                ],
                ["payments", "Paiements", client.access?.payments],
                ["vehicles", "Véhicules", client.access?.vehicles],
                ["tasks", "Tâches", client.access?.tasks],
                ["history", "Historique / Audit", client.access?.history],
              ]
                .filter((item) => item[2])
                .map(([value, label]) => (
                  <button
                    key={String(value)}
                    onClick={() => setTab(String(value))}
                    className={`rounded-button px-3 py-2 text-sm ${tab === value ? "bg-foreground text-white" : "hover:bg-surface"}`}
                  >
                    {String(label)}
                  </button>
                ))}
            </nav>
            {tab === "overview" && (
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Info label="NIN" value={client.ninMasked ?? "Non renseigné"} />
                <Info
                  label="Passeport"
                  value={client.passportNumberMasked ?? "Non renseigné"}
                />
                <Info
                  label="Dossiers"
                  value={client.stats?.totalDossiers ?? 0}
                />
                <Info
                  label="Dossiers actifs"
                  value={client.stats?.activeDossiers ?? 0}
                />
                <Info
                  label="Commandes"
                  value={client.stats?.totalOrders ?? 0}
                />
                <Info
                  label="Prochaine action"
                  value={
                    client.nextActionAt
                      ? new Date(client.nextActionAt).toLocaleDateString(
                          getRuntimeLocale(),
                        )
                      : "—"
                  }
                  icon={<Calendar className="h-4 w-4" />}
                />
              </div>
            )}
            {tab === "interactions" && client.access?.interactions && (
              <section className="card">
                <div className="mb-5 flex gap-2">
                  <input
                    className="flex-1 rounded-input border border-border bg-background px-3 py-2 text-sm"
                    placeholder="Ajouter une note interne"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <button
                    onClick={() => void addNote()}
                    disabled={!note.trim()}
                    className="rounded-button bg-foreground px-4 py-2 text-sm text-white disabled:opacity-40"
                  >
                    Ajouter
                  </button>
                </div>
                <h2 className="mb-4 font-semibold">Timeline unifiée</h2>
                <UnifiedTimeline items={timeline} />
              </section>
            )}
            {tab === "dossiers" && (
              <EntityList items={client.dossiers} empty="Aucun dossier." />
            )}
            {tab === "identity" && (
              <section className="card space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Info
                    label="Type de document"
                    value={
                      client.identityDocumentType === "PASSPORT"
                        ? "Passeport"
                        : client.identityDocumentType === "NATIONAL_ID"
                          ? "Carte d’identité / NIN"
                          : "À compléter"
                    }
                  />
                  <Info
                    label="NIN"
                    value={client.ninMasked ?? "Non renseigné"}
                  />
                  <Info
                    label="Passeport"
                    value={client.passportNumberMasked ?? "Non renseigné"}
                  />
                </div>
                {client.access?.identityWrite && (
                  <form
                    onSubmit={saveIdentity}
                    className="grid gap-3 rounded-card border border-border p-4 md:grid-cols-2"
                  >
                    <h2 className="font-semibold md:col-span-2">
                      Compléter les informations d’identité
                    </h2>
                    <select
                      className="rounded-input border border-border bg-background px-3 py-2 text-sm"
                      value={identityForm.identityDocumentType}
                      onChange={(event) =>
                        setIdentityForm({
                          ...identityForm,
                          identityDocumentType: event.target.value as
                            | ""
                            | "PASSPORT"
                            | "NATIONAL_ID",
                        })
                      }
                    >
                      <option value="">Type de document (facultatif)</option>
                      <option value="PASSPORT">Passeport</option>
                      <option value="NATIONAL_ID">
                        Carte d’identité nationale / NIN
                      </option>
                    </select>
                    {identityForm.identityDocumentType === "PASSPORT" ? (
                      <>
                        <input
                          className="rounded-input border border-border bg-background px-3 py-2 text-sm"
                          placeholder="Numéro de passeport"
                          value={identityForm.passportNumber}
                          onChange={(event) =>
                            setIdentityForm({
                              ...identityForm,
                              passportNumber: event.target.value,
                            })
                          }
                        />
                        <input
                          className="rounded-input border border-border bg-background px-3 py-2 text-sm"
                          placeholder="Pays d’émission"
                          value={identityForm.identityIssueCountry}
                          onChange={(event) =>
                            setIdentityForm({
                              ...identityForm,
                              identityIssueCountry: event.target.value,
                            })
                          }
                        />
                        <label className="text-xs text-muted">
                          Date d’émission
                          <input
                            type="date"
                            className="mt-1 w-full rounded-input border border-border bg-background px-3 py-2 text-sm"
                            value={identityForm.identityIssueDate}
                            onChange={(event) =>
                              setIdentityForm({
                                ...identityForm,
                                identityIssueDate: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="text-xs text-muted">
                          Date d’expiration
                          <input
                            type="date"
                            className="mt-1 w-full rounded-input border border-border bg-background px-3 py-2 text-sm"
                            value={identityForm.passportExpiry}
                            onChange={(event) =>
                              setIdentityForm({
                                ...identityForm,
                                passportExpiry: event.target.value,
                              })
                            }
                          />
                        </label>
                      </>
                    ) : identityForm.identityDocumentType === "NATIONAL_ID" ? (
                      <input
                        className="rounded-input border border-border bg-background px-3 py-2 text-sm"
                        inputMode="numeric"
                        pattern="[0-9]{18}"
                        maxLength={18}
                        placeholder="NIN / numéro de carte"
                        value={identityForm.nin}
                        onChange={(event) =>
                          setIdentityForm({
                            ...identityForm,
                            nin: event.target.value,
                          })
                        }
                      />
                    ) : null}
                    {identityForm.identityDocumentType && (
                      <label className="text-xs text-muted">
                        Document privé (facultatif)
                        <input
                          type="file"
                          accept="application/pdf,image/jpeg,image/png"
                          className="mt-1 block w-full"
                          onChange={(event) =>
                            setIdentityDocument(event.target.files?.[0] ?? null)
                          }
                        />
                      </label>
                    )}
                    <button
                      disabled={identitySaving}
                      className="rounded-button bg-foreground px-4 py-2 text-sm text-white disabled:opacity-50 md:col-span-2"
                    >
                      {identitySaving ? "Enregistrement…" : "Enregistrer l’identité"}
                    </button>
                  </form>
                )}
                <h2 className="font-semibold">Documents d’identité</h2>
                <EntityList
                  items={client.documents}
                  empty="Aucun document d’identité lié."
                  nested
                />
                <p className="text-xs text-muted">
                  Les fichiers restent gérés par l’autorité de stockage
                  existante, en préparation de la GED Phase 2.
                </p>
              </section>
            )}
            {tab === "payments" && (
              <EntityList
                items={client.payments}
                empty="Aucun paiement accessible."
              />
            )}
            {tab === "vehicles" && (
              <EntityList
                items={(client.dossiers ?? []).flatMap((item) =>
                  Array.isArray(item.vehicles)
                    ? (item.vehicles as Array<Record<string, unknown>>)
                    : [],
                )}
                empty="Aucun véhicule."
              />
            )}
            {tab === "tasks" && (
              <EntityList
                items={
                  (client.tasks ?? []) as unknown as Array<
                    Record<string, unknown>
                  >
                }
                empty="Aucune tâche."
              />
            )}
            {tab === "history" && (
              <EntityList
                items={client.history}
                empty="Aucun événement d’audit accessible."
              />
            )}
          </>
        )}
      </main>
    </>
  );
}
function EntityList({
  items,
  empty,
  nested = false,
}: {
  items?: Array<Record<string, unknown>>;
  empty: string;
  nested?: boolean;
}) {
  const content = items?.length ? (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={String(item.id ?? index)}
          className="rounded-card border border-border p-3 text-sm"
        >
          <p className="font-medium">
            {String(
              item.reference ??
                item.title ??
                item.action ??
                item.orderNumber ??
                item.vin ??
                `Élément ${index + 1}`,
            )}
          </p>
          <p className="text-xs text-muted">
            {String(item.status ?? item.documentType ?? item.createdAt ?? "")}
          </p>
        </div>
      ))}
    </div>
  ) : (
    <p className="text-sm text-muted">{empty}</p>
  );
  return nested ? content : <section className="card">{content}</section>;
}
function Info({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-border bg-background p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
