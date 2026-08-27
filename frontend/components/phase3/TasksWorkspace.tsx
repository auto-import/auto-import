"use client";

import { getRuntimeLocale } from "@/lib/i18n/runtime-locale";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Clock3, Plus, XCircle } from "lucide-react";
import Topbar from "@/components/Topbar";
import { useAuth } from "@/components/AuthProvider";
import { Permission } from "@/lib/api-contract";
import { adminApi, type User } from "@/lib/admin-api";
import { phase3Api, type ApiTask } from "@/lib/phase3-api";
import {
  ErrorState,
  inputClass,
  LoadingState,
} from "@/components/commerce/common";

export default function TasksWorkspace() {
  const { currentUser, hasPermission } = useAuth();
  const canWrite = hasPermission(Permission.TASKS_WRITE);
  const canAssign = hasPermission(Permission.TASKS_ASSIGN);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState("");
  const [view, setView] = useState<"mine" | "team">("mine");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "follow_up",
    priority: "normal",
    dueDate: "",
    assignedTo: "",
  });
  const load = useCallback(async () => {
    setError("");
    try {
      const [page, userPage] = await Promise.all([
        phase3Api.tasks.list({ view, status, limit: 100 }),
        canAssign
          ? adminApi.listUsers({ status: "active", limit: 100 })
          : Promise.resolve({
              items: [],
              total: 0,
              page: 1,
              limit: 100,
              totalPages: 0,
            }),
      ]);
      setTasks(page.items);
      setUsers(userPage.items);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement impossible",
      );
    } finally {
      setLoading(false);
    }
  }, [canAssign, status, view]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await phase3Api.tasks.create({
        ...form,
        dueDate: form.dueDate
          ? new Date(form.dueDate).toISOString()
          : undefined,
        assignedTo: form.assignedTo || undefined,
      });
      setForm({
        title: "",
        description: "",
        type: "follow_up",
        priority: "normal",
        dueDate: "",
        assignedTo: "",
      });
      setShowForm(false);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Création impossible",
      );
    }
  }
  async function action(task: ApiTask, next: "complete" | "cancel") {
    try {
      if (next === "complete") await phase3Api.tasks.complete(task.id);
      else await phase3Api.tasks.cancel(task.id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action impossible");
    }
  }
  return (
    <>
      <Topbar title="Tâches" subtitle="Relances et actions opérationnelles" />
      <main className="space-y-5 p-4 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <select
              aria-label="Filtrer par statut"
              className={inputClass}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">Tous les statuts</option>
              <option value="todo">À faire</option>
              <option value="in_progress">En cours</option>
              <option value="completed">Terminées</option>
              <option value="cancelled">Annulées</option>
            </select>
            {canAssign && (
              <select
                aria-label="Vue des tâches"
                className={inputClass}
                value={view}
                onChange={(event) =>
                  setView(event.target.value as "mine" | "team")
                }
              >
                <option value="mine">Mes tâches</option>
                <option value="team">Équipe</option>
              </select>
            )}
          </div>
          {canWrite && (
            <button
              onClick={() => setShowForm((value) => !value)}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Nouvelle tâche
            </button>
          )}
        </div>
        {error && <ErrorState message={error} retry={() => void load()} />}
        {showForm && (
          <form onSubmit={create} className="card grid gap-4 sm:grid-cols-2">
            <label>
              <span className="field-label">Titre *</span>
              <input
                required
                className={inputClass}
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span className="field-label">Type</span>
              <select
                className={inputClass}
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value,
                  }))
                }
              >
                <option value="follow_up">Relance</option>
                <option value="document">Document</option>
                <option value="payment">Paiement</option>
                <option value="operation">Opération</option>
              </select>
            </label>
            <label>
              <span className="field-label">Priorité</span>
              <select
                className={inputClass}
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: event.target.value,
                  }))
                }
              >
                <option value="low">Basse</option>
                <option value="normal">Normale</option>
                <option value="high">Haute</option>
                <option value="urgent">Urgente</option>
              </select>
            </label>
            <label>
              <span className="field-label">Échéance</span>
              <input
                type="datetime-local"
                className={inputClass}
                value={form.dueDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
              />
            </label>
            {canAssign && (
              <label>
                <span className="field-label">Assignée à</span>
                <select
                  className={inputClass}
                  value={form.assignedTo}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      assignedTo: event.target.value,
                    }))
                  }
                >
                  <option value="">Moi-même</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.firstName} {user.lastName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="sm:col-span-2">
              <span className="field-label">Description</span>
              <textarea
                className={`${inputClass} min-h-24`}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <button className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white">
                Créer la tâche
              </button>
            </div>
          </form>
        )}
        {loading ? (
          <LoadingState />
        ) : tasks.length === 0 ? (
          <div className="card p-10 text-center text-sm text-muted">
            Aucune tâche pour ces filtres.
          </div>
        ) : (
          <div className="grid gap-3">
            {tasks.map((task) => (
              <article
                key={task.id}
                className={`card flex flex-wrap items-start justify-between gap-4 ${task.overdue ? "border-red-200" : ""}`}
              >
                <div className="flex min-w-0 gap-3">
                  {task.status === "completed" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-neutral-400" />
                  )}
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{task.title}</h2>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold uppercase">
                        {task.priority}
                      </span>
                      {task.overdue && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          En retard
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {task.description || "Sans description"}
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                      <span>
                        {task.assignee.firstName} {task.assignee.lastName}
                      </span>
                      {task.dueDate && (
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" />
                          {new Date(task.dueDate).toLocaleString(getRuntimeLocale())}
                        </span>
                      )}
                      {task.dossier && <span>{task.dossier.reference}</span>}
                    </p>
                  </div>
                </div>
                {canWrite &&
                  !["completed", "cancelled"].includes(task.status) &&
                  task.assignedTo === currentUser?.id && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => void action(task, "complete")}
                        className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void action(task, "cancel")}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  )}
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
