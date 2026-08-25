"use client";

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

export default function ClientProfileWorkspace({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const router = useRouter();
  const [client, setClient] = useState<ApiClient | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [clientResult, timelineResult] = await Promise.all([
        crmApi.getClient(id),
        crmApi.timeline("client", id),
      ]);
      setClient(clientResult);
      setTimeline(timelineResult.items);
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
              </div>
            </section>
            <div className="grid gap-3 md:grid-cols-4">
              <Info label="Dossiers" value={client.stats?.totalDossiers ?? 0} />
              <Info
                label="Dossiers actifs"
                value={client.stats?.activeDossiers ?? 0}
              />
              <Info label="Commandes" value={client.stats?.totalOrders ?? 0} />
              <Info
                label="Prochaine action"
                value={
                  client.nextActionAt
                    ? new Date(client.nextActionAt).toLocaleDateString("fr-FR")
                    : "—"
                }
                icon={<Calendar className="h-4 w-4" />}
              />
            </div>
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
          </>
        )}
      </main>
    </>
  );
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
