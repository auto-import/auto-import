"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, CheckCheck, Circle } from "lucide-react";
import Topbar from "@/components/Topbar";
import { useAuth } from "@/components/AuthProvider";
import { Permission } from "@/lib/api-contract";
import {
  phase3Api,
  type ApiNotification,
  type ApiNotificationTemplate,
  type ApiNotificationSend,
} from "@/lib/phase3-api";
import {
  ErrorState,
  inputClass,
  LoadingState,
} from "@/components/commerce/common";

export default function NotificationsWorkspace() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(Permission.NOTIFICATIONS_MANAGE);
  const canSend = hasPermission(Permission.NOTIFICATIONS_SEND);
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState<ApiNotificationTemplate[]>([]);
  const [template, setTemplate] = useState({
    name: "",
    eventType: "",
    subject: "",
    content: "",
  });
  const [audience, setAudience] = useState<{
    users: Array<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    }>;
    roles: Array<{ id: string; name: string }>;
  }>({ users: [], roles: [] });
  const [compose, setCompose] = useState<ApiNotificationSend>({
    userIds: [],
    roleIds: [],
    allActive: false,
    title: "",
    message: "",
    category: "general",
    severity: "info",
  });
  const [recipientCount, setRecipientCount] = useState(0);
  const [delivery, setDelivery] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const page = await phase3Api.notifications.list({
        unread: unreadOnly ? "true" : undefined,
        limit: 100,
      });
      setItems(page.items);
      setUnreadCount(page.unreadCount);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement impossible",
      );
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (canManage)
      void phase3Api.notifications
        .templates()
        .then(setTemplates)
        .catch(() => undefined);
  }, [canManage]);
  useEffect(() => {
    if (canSend)
      void phase3Api.notifications
        .audience()
        .then(setAudience)
        .catch(() => undefined);
  }, [canSend]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (
        !canSend ||
        (!compose.allActive &&
          !compose.userIds.length &&
          !compose.roleIds.length)
      ) {
        setRecipientCount(0);
        return;
      }
      void phase3Api.notifications
        .resolveAudience(compose)
        .then(({ recipientCount: count }) => setRecipientCount(count))
        .catch(() => setRecipientCount(0));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [canSend, compose]);
  async function sendNotification(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setDelivery("");
    try {
      const result = await phase3Api.notifications.send(compose);
      setDelivery(`${result.delivered} notification(s) in-app envoyée(s).`);
      setCompose({
        userIds: [],
        roleIds: [],
        allActive: false,
        title: "",
        message: "",
        category: "general",
        severity: "info",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Envoi impossible");
    }
  }
  async function read(item: ApiNotification) {
    if (!item.readAt) await phase3Api.notifications.read(item.id);
    await load();
  }
  async function readAll() {
    await phase3Api.notifications.readAll();
    await load();
  }
  async function createTemplate(event: React.FormEvent) {
    event.preventDefault();
    try {
      await phase3Api.notifications.createTemplate(template);
      setTemplate({ name: "", eventType: "", subject: "", content: "" });
      setTemplates(await phase3Api.notifications.templates());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Création impossible",
      );
    }
  }
  return (
    <>
      <Topbar title="Notifications" subtitle="Inbox personnel persistant" />
      <main className="space-y-5 p-4 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setUnreadOnly(false)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${!unreadOnly ? "bg-neutral-900 text-white" : "border border-border"}`}
            >
              Toutes
            </button>
            <button
              onClick={() => setUnreadOnly(true)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${unreadOnly ? "bg-neutral-900 text-white" : "border border-border"}`}
            >
              Non lues ({unreadCount})
            </button>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => void readAll()}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold"
            >
              <CheckCheck className="h-4 w-4" />
              Tout marquer comme lu
            </button>
          )}
        </div>
        {error && <ErrorState message={error} retry={() => void load()} />}
        {delivery && (
          <p
            role="status"
            className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
          >
            {delivery}
          </p>
        )}
        {canSend && (
          <section className="card">
            <h2 className="font-bold">Envoyer une notification ciblée</h2>
            <p className="mt-1 text-sm text-muted">
              Canal in-app uniquement · destinataires actifs de votre
              organisation.
            </p>
            <form
              onSubmit={sendNotification}
              className="mt-5 grid gap-4 sm:grid-cols-2"
            >
              <label>
                <span className="field-label">Utilisateurs</span>
                <select
                  multiple
                  aria-label="Utilisateurs destinataires"
                  className={`${inputClass} min-h-32`}
                  value={compose.userIds}
                  onChange={(event) =>
                    setCompose((current) => ({
                      ...current,
                      userIds: Array.from(
                        event.target.selectedOptions,
                        ({ value }) => value,
                      ),
                    }))
                  }
                >
                  {audience.users.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.firstName} {item.lastName} · {item.email}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Rôles / départements</span>
                <select
                  multiple
                  aria-label="Rôles destinataires"
                  className={`${inputClass} min-h-32`}
                  value={compose.roleIds}
                  onChange={(event) =>
                    setCompose((current) => ({
                      ...current,
                      roleIds: Array.from(
                        event.target.selectedOptions,
                        ({ value }) => value,
                      ),
                    }))
                  }
                >
                  {audience.roles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={compose.allActive}
                  onChange={(event) =>
                    setCompose((current) => ({
                      ...current,
                      allActive: event.target.checked,
                    }))
                  }
                />
                Tous les utilisateurs actifs de l’organisation
              </label>
              <label>
                <span className="field-label">Titre *</span>
                <input
                  required
                  maxLength={120}
                  className={inputClass}
                  value={compose.title}
                  onChange={(event) =>
                    setCompose((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span className="field-label">Lien interne</span>
                <input
                  placeholder="/dossiers/…"
                  className={inputClass}
                  value={compose.entityUrl ?? ""}
                  onChange={(event) =>
                    setCompose((current) => ({
                      ...current,
                      entityUrl: event.target.value || undefined,
                    }))
                  }
                />
              </label>
              <label>
                <span className="field-label">Catégorie</span>
                <select
                  className={inputClass}
                  value={compose.category}
                  onChange={(event) =>
                    setCompose((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                >
                  {[
                    "general",
                    "finance",
                    "logistics",
                    "commercial",
                    "system",
                  ].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Sévérité</span>
                <select
                  className={inputClass}
                  value={compose.severity}
                  onChange={(event) =>
                    setCompose((current) => ({
                      ...current,
                      severity: event.target.value,
                    }))
                  }
                >
                  {["info", "success", "warning", "critical"].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2">
                <span className="field-label">Message *</span>
                <textarea
                  required
                  maxLength={2000}
                  className={`${inputClass} min-h-28`}
                  value={compose.message}
                  onChange={(event) =>
                    setCompose((current) => ({
                      ...current,
                      message: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="flex items-center justify-between gap-4 sm:col-span-2">
                <strong className="text-sm">
                  {recipientCount} destinataire(s) unique(s)
                </strong>
                <button
                  disabled={!recipientCount}
                  className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Confirmer l’envoi
                </button>
              </div>
            </form>
          </section>
        )}
        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <div className="card p-10 text-center text-sm text-muted">
            Aucune notification.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-white">
            {items.map((item) => {
              const content = (
                <>
                  <span
                    className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.severity === "warning" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}
                  >
                    {item.severity === "warning" ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Bell className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm">{item.title}</strong>
                      {!item.readAt && (
                        <Circle className="h-2 w-2 fill-blue-600 text-blue-600" />
                      )}
                    </span>
                    <span className="mt-1 block text-sm text-muted">
                      {item.content || "Sans détail"}
                    </span>
                    <span className="mt-2 block text-xs text-muted">
                      {new Date(item.createdAt).toLocaleString("fr-FR")} ·{" "}
                      {item.category}
                    </span>
                  </span>
                </>
              );
              return item.entityUrl ? (
                <Link
                  key={item.id}
                  href={item.entityUrl}
                  onClick={() => void read(item)}
                  className={`flex gap-3 border-b border-border p-5 last:border-0 hover:bg-surface ${!item.readAt ? "bg-blue-50/30" : ""}`}
                >
                  {content}
                </Link>
              ) : (
                <button
                  key={item.id}
                  onClick={() => void read(item)}
                  className={`flex w-full gap-3 border-b border-border p-5 text-left last:border-0 hover:bg-surface ${!item.readAt ? "bg-blue-50/30" : ""}`}
                >
                  {content}
                </button>
              );
            })}
          </div>
        )}
        {canManage && (
          <section className="card">
            <h2 className="font-bold">Modèles de notification</h2>
            <p className="mt-1 text-sm text-muted">
              Administration tenant-scoped des messages persistants.
            </p>
            <form
              onSubmit={createTemplate}
              className="mt-5 grid gap-3 sm:grid-cols-2"
            >
              <input
                required
                aria-label="Nom du modèle"
                placeholder="Nom"
                className={inputClass}
                value={template.name}
                onChange={(event) =>
                  setTemplate((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
              <input
                required
                aria-label="Type d’événement"
                placeholder="Type d’événement"
                className={inputClass}
                value={template.eventType}
                onChange={(event) =>
                  setTemplate((current) => ({
                    ...current,
                    eventType: event.target.value,
                  }))
                }
              />
              <input
                aria-label="Sujet"
                placeholder="Sujet"
                className={inputClass}
                value={template.subject}
                onChange={(event) =>
                  setTemplate((current) => ({
                    ...current,
                    subject: event.target.value,
                  }))
                }
              />
              <input
                required
                aria-label="Contenu"
                placeholder="Contenu"
                className={inputClass}
                value={template.content}
                onChange={(event) =>
                  setTemplate((current) => ({
                    ...current,
                    content: event.target.value,
                  }))
                }
              />
              <button className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2">
                Créer le modèle
              </button>
            </form>
            {templates.length > 0 && (
              <ul className="mt-5 divide-y divide-border">
                {templates.map((item) => (
                  <li
                    key={item.id}
                    className="flex justify-between py-3 text-sm"
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <span className="ml-2 text-muted">{item.eventType}</span>
                    </span>
                    <span>{item.channel}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </>
  );
}
