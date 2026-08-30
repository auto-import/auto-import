"use client";

import { getRuntimeLocale } from "@/lib/i18n/runtime-locale";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Activity,
  Calendar,
  MessageSquare,
  Plus,
  Phone,
  PhoneCall,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import {
  AgentPresenceStatus,
  CallState,
  LeadQualification,
} from "@/lib/api-contract";
import {
  callCenterApi,
  crmApi,
  type AgentSummary,
  type ApiAppointment,
  type ApiCall,
  type ApiConversation,
  type ApiKpis,
  type ApiPresence,
  type ApiProspect,
  type ApiClient,
  type ApiTask,
  type ManualCallInput,
} from "@/lib/crm-api";
import type { PaginatedData } from "@/lib/api-contract";
import { connectCallCenterRealtime } from "@/lib/call-center-realtime";

export default function CallCenterWorkspace() {
  const [calls, setCalls] = useState<ApiCall[]>([]);
  const [history, setHistory] = useState<PaginatedData<ApiCall>>({
    items: [],
    pagination: {
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  });
  const [prospects, setProspects] = useState<ApiProspect[]>([]);
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [presence, setPresence] = useState<ApiPresence[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [conversations, setConversations] = useState<ApiConversation[]>([]);
  const [followUps, setFollowUps] = useState<ApiTask[]>([]);
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [kpis, setKpis] = useState<ApiKpis | null>(null);
  const [channels, setChannels] = useState<
    Array<{ id: string; channel: string; normalizedNumber: string }>
  >([]);
  const [selectedCall, setSelectedCall] = useState<ApiCall | null>(null);
  const [selectedConversation, setSelectedConversation] =
    useState<ApiConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        callData,
        presenceData,
        agentData,
        conversationData,
        taskData,
        appointmentData,
        kpiData,
        channelData,
        historyData,
        prospectData,
        clientData,
      ] = await Promise.all([
        callCenterApi.calls(),
        callCenterApi.presence(),
        callCenterApi.agents(),
        callCenterApi.conversations(),
        callCenterApi.followUps(),
        callCenterApi.appointments(),
        callCenterApi.kpis(),
        callCenterApi.channels(),
        callCenterApi.history(),
        crmApi.listProspects({ limit: 100 }),
        crmApi.listClients({ limit: 100 }),
      ]);
      setCalls(callData);
      setPresence(presenceData);
      setAgents(agentData);
      setConversations(conversationData);
      setFollowUps(taskData);
      setAppointments(appointmentData);
      setKpis(kpiData);
      setChannels(channelData);
      setHistory(historyData);
      setProspects(prospectData.items);
      setClients(clientData.items);
      setSelectedCall((current) =>
        current
          ? (callData.find((call) => call.id === current.id) ?? null)
          : null,
      );
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible de charger le call center",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const disconnect = connectCallCenterRealtime(
      () => void load(),
      setConnected,
    );
    const heartbeat = window.setInterval(
      () => void callCenterApi.heartbeat(),
      60_000,
    );
    return () => {
      window.clearTimeout(initialLoad);
      disconnect();
      window.clearInterval(heartbeat);
    };
  }, [load]);
  const queueStates: ApiCall["state"][] = [CallState.RINGING, CallState.QUEUED];
  const activeStates: ApiCall["state"][] = [
    CallState.ASSIGNED,
    CallState.FORWARDED,
    CallState.ANSWERED,
  ];
  const queue = calls.filter((call) => queueStates.includes(call.state));
  const active = calls.filter((call) => activeStates.includes(call.state));
  const missed = calls.filter((call) => call.state === CallState.MISSED);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  }
  if (loading && calls.length === 0)
    return (
      <>
        <Topbar title="Call Center" />
        <div className="p-12 text-center text-muted">
          Chargement du centre omnicanal…
        </div>
      </>
    );
  return (
    <>
      <Topbar
        title="Call Center"
        subtitle="Appels, WhatsApp, relances et rendez-vous"
      />
      <main className="space-y-6 p-6">
        <div
          className={`rounded-card px-4 py-2 text-sm ${connected ? "bg-status-green-bg text-status-green-text" : "bg-status-amber-bg text-status-amber-text"}`}
        >
          {connected
            ? "Temps réel connecté"
            : "Hors ligne / reconnexion en cours — les données REST restent disponibles"}
        </div>
        {error && (
          <div className="flex items-center justify-between rounded-card bg-status-red-bg p-4 text-status-red-text">
            <span>{error}</span>
            <button onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        )}
        {kpis && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Metric label="Reçus" value={kpis.dispatcher.callsReceived} />
            <Metric
              label="Dispatchés"
              value={kpis.dispatcher.callsDispatched}
            />
            <Metric
              label="Manqués"
              value={kpis.dispatcher.missedOrUnassigned}
            />
            <Metric label="Répondus" value={kpis.agent.answeredCalls} />
            <Metric
              label="Durée moy."
              value={`${kpis.agent.averageTalkSeconds}s`}
            />
            <Metric
              label="Leads qualifiés"
              value={kpis.agent.qualifiedLeads}
            />
            <Metric
              label="Rendez-vous"
              value={kpis.agent.appointmentsCreated}
            />
            <Metric label="Conversions" value={kpis.agent.conversions} />
          </div>
        )}
        <ManualCallForm
          agents={agents}
          prospects={prospects}
          clients={clients}
          busy={busy}
          run={action}
        />
        {process.env.NODE_ENV !== "production" && (
          <SimulatorPanel
            voiceNumber={
              channels.find((channel) => channel.channel === "VOICE")
                ?.normalizedNumber
            }
            whatsappNumber={
              channels.find((channel) => channel.channel === "WHATSAPP")
                ?.normalizedNumber
            }
            run={action}
          />
        )}
        <div className="grid gap-5 xl:grid-cols-3">
          <section className="card xl:col-span-2">
            <PanelTitle
              icon={<PhoneCall className="h-5 w-5" />}
              title={`File d’attente (${queue.length})`}
            />
            {queue.length === 0 ? (
              <Empty text="Aucun appel en attente." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {queue.map((call) => (
                  <CallCard
                    key={call.id}
                    call={call}
                    onSelect={() => setSelectedCall(call)}
                  />
                ))}
              </div>
            )}
            <PanelTitle
              icon={<Activity className="h-5 w-5" />}
              title={`Appels actifs (${active.length})`}
            />
            {active.length === 0 ? (
              <Empty text="Aucun appel actif." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {active.map((call) => (
                  <CallCard
                    key={call.id}
                    call={call}
                    onSelect={() => setSelectedCall(call)}
                  />
                ))}
              </div>
            )}
          </section>
          <section className="card">
            <PanelTitle
              icon={<Users className="h-5 w-5" />}
              title="Présence agents"
            />
            <div className="space-y-2">
              {presence.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-card border border-border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {item.user.firstName} {item.user.lastName}
                    </p>
                    <p className="text-xs text-muted">
                      {item.currentCall?.externalNumber ||
                        new Date(item.lastHeartbeatAt).toLocaleTimeString(
                          getRuntimeLocale(),
                        )}
                    </p>
                  </div>
                  <PresenceBadge status={item.status} />
                </div>
              ))}
              {presence.length === 0 && (
                <Empty text="Aucune présence enregistrée." />
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                AgentPresenceStatus.AVAILABLE,
                AgentPresenceStatus.AWAY,
                AgentPresenceStatus.OFFLINE,
              ].map((status) => (
                <button
                  disabled={busy}
                  key={status}
                  onClick={() =>
                    void action(() => callCenterApi.setPresence(status))
                  }
                  className="rounded-button border border-border px-3 py-2 text-xs"
                >
                  Me mettre {status.toLowerCase()}
                </button>
              ))}
            </div>
          </section>
        </div>
        {selectedCall && (
          <CallScreen
            call={selectedCall}
            agents={agents}
            busy={busy}
            run={action}
            onClose={() => setSelectedCall(null)}
          />
        )}
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="card">
            <PanelTitle
              icon={<MessageSquare className="h-5 w-5" />}
              title="Inbox WhatsApp"
            />
            <div className="grid min-h-80 gap-3 md:grid-cols-2">
              <div className="space-y-2 border-r border-border pr-3">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    onClick={() =>
                      void callCenterApi
                        .conversation(conversation.id)
                        .then(setSelectedConversation)
                    }
                    className="w-full rounded-card border border-border p-3 text-left"
                  >
                    <p className="font-medium">{contactName(conversation)}</p>
                    <p className="text-xs text-muted">
                      {conversation.externalNumber}
                    </p>
                    <p className="mt-1 truncate text-sm">
                      {conversation.messages[0]?.text || "Message"}
                    </p>
                  </button>
                ))}
                {conversations.length === 0 && (
                  <Empty text="Aucune conversation." />
                )}
              </div>
              <ConversationPanel
                conversation={selectedConversation}
                busy={busy}
                run={action}
                reload={async () => {
                  if (selectedConversation)
                    setSelectedConversation(
                      await callCenterApi.conversation(selectedConversation.id),
                    );
                }}
              />
            </div>
          </section>
          <section className="card">
            <PanelTitle
              icon={<Calendar className="h-5 w-5" />}
              title="Relances et rendez-vous"
            />
            <h3 className="mb-2 text-sm font-semibold">Relances ouvertes</h3>
            <div className="max-h-52 space-y-2 overflow-y-auto">
              {followUps
                .filter(
                  (task) => !["completed", "cancelled"].includes(task.status),
                )
                .map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between rounded-card border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-muted">
                        {task.dueDate
                          ? new Date(task.dueDate).toLocaleString(getRuntimeLocale())
                          : "Sans échéance"}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        void action(() =>
                          callCenterApi.setTaskStatus(task.id, "completed"),
                        )
                      }
                      className="rounded-button border border-border px-2 py-1 text-xs"
                    >
                      Terminé
                    </button>
                  </div>
                ))}
            </div>
            <h3 className="mb-2 mt-5 text-sm font-semibold">Rendez-vous</h3>
            <div className="max-h-52 space-y-2 overflow-y-auto">
              {appointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="rounded-card border border-border p-3"
                >
                  <p className="text-sm font-medium">{appointment.title}</p>
                  <p className="text-xs text-muted">
                    {new Date(appointment.scheduledStart).toLocaleString(
                      getRuntimeLocale(),
                    )}{" "}
                    · {appointment.status}
                  </p>
                </div>
              ))}
              {appointments.length === 0 && <Empty text="Aucun rendez-vous." />}
            </div>
          </section>
        </div>
        <section className="card">
          <PanelTitle
            icon={<Phone className="h-5 w-5" />}
            title={`Appels manqués (${missed.length})`}
          />
          {missed.length === 0 ? (
            <Empty text="Aucun appel manqué." />
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {missed.map((call) => (
                <CallCard
                  key={call.id}
                  call={call}
                  onSelect={() => setSelectedCall(call)}
                />
              ))}
            </div>
          )}
        </section>
        <CallHistoryPanel
          data={history}
          agents={agents}
          onChange={setHistory}
          onSelect={setSelectedCall}
        />
      </main>
    </>
  );
}

function ManualCallForm({
  agents,
  prospects,
  clients,
  busy,
  run,
}: {
  agents: AgentSummary[];
  prospects: ApiProspect[];
  clients: ApiClient[];
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const initial: ManualCallInput = {
    phone: "",
    callAt: "",
    direction: "INBOUND",
    agentId: "",
    durationSeconds: 0,
    state: "COMPLETED",
    subject: "",
    outcome: "",
  };
  const [form, setForm] = useState<ManualCallInput>(initial);
  const [contact, setContact] = useState("");
  const set = <K extends keyof ManualCallInput>(
    key: K,
    value: ManualCallInput[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  function selectContact(value: string) {
    setContact(value);
    const [kind, id] = value.split(":");
    const selected =
      kind === "client"
        ? clients.find((item) => item.id === id)
        : prospects.find((item) => item.id === id);
    setForm((current) => ({
      ...current,
      phone: selected?.phone || current.phone,
      clientId: kind === "client" ? id : undefined,
      prospectId: kind === "prospect" ? id : undefined,
    }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await callCenterApi.createManualCall({
        ...form,
        callAt: new Date(form.callAt).toISOString(),
        followUpAt: form.followUpAt
          ? new Date(form.followUpAt).toISOString()
          : undefined,
        dossierId: form.dossierId?.trim() || undefined,
      });
      setForm(initial);
      setContact("");
    });
  }
  return (
    <section className="card border-2 border-foreground/15">
      <PanelTitle icon={<Plus className="h-5 w-5" />} title="Nouvel appel manuel" />
      <p className="mb-4 text-sm text-muted">
        La date et l’heure ci-dessous sont la date métier de l’appel. Elles ne
        sont jamais remplacées par la date technique de création.
      </p>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label>
          <span className="field-label">Client / Lead</span>
          <select
            className="input w-full"
            value={contact}
            onChange={(event) => selectContact(event.target.value)}
          >
            <option value="">Détection automatique par téléphone</option>
            <optgroup label="Clients">
              {clients.map((item) => (
                <option key={item.id} value={`client:${item.id}`}>
                  {item.firstName} {item.lastName} · {item.phone || "sans téléphone"}
                </option>
              ))}
            </optgroup>
            <optgroup label="Leads">
              {prospects
                .filter((item) => !item.client)
                .map((item) => (
                  <option key={item.id} value={`prospect:${item.id}`}>
                    {item.firstName} {item.lastName} · {item.phone || "sans téléphone"}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        <Field label="Téléphone">
          <input
            required
            className="input w-full"
            value={form.phone}
            onChange={(event) => set("phone", event.target.value)}
          />
        </Field>
        <Field label="Date / heure de l’appel">
          <input
            required
            type="datetime-local"
            className="input w-full"
            value={form.callAt}
            onChange={(event) => set("callAt", event.target.value)}
          />
        </Field>
        <Field label="Direction">
          <select
            className="input w-full"
            value={form.direction}
            onChange={(event) =>
              set("direction", event.target.value as "INBOUND" | "OUTBOUND")
            }
          >
            <option value="INBOUND">Entrant</option>
            <option value="OUTBOUND">Sortant</option>
          </select>
        </Field>
        <Field label="Agent / Commercial">
          <select
            required
            className="input w-full"
            value={form.agentId}
            onChange={(event) => set("agentId", event.target.value)}
          >
            <option value="">Choisir</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.firstName} {agent.lastName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Durée (secondes)">
          <input
            required
            min={0}
            max={86400}
            type="number"
            className="input w-full"
            value={form.durationSeconds}
            onChange={(event) => set("durationSeconds", Number(event.target.value))}
          />
        </Field>
        <Field label="Statut">
          <select
            className="input w-full"
            value={form.state}
            onChange={(event) =>
              set("state", event.target.value as ManualCallInput["state"])
            }
          >
            <option value="COMPLETED">Terminé</option>
            <option value="MISSED">Sans réponse</option>
            <option value="FAILED">Échec</option>
          </select>
        </Field>
        <Field label="Objet">
          <input
            required
            className="input w-full"
            value={form.subject}
            onChange={(event) => set("subject", event.target.value)}
          />
        </Field>
        <Field label="Résultat">
          <input
            required
            className="input w-full"
            value={form.outcome}
            onChange={(event) => set("outcome", event.target.value)}
          />
        </Field>
        <Field label="Prochaine action">
          <input
            className="input w-full"
            value={form.nextAction || ""}
            onChange={(event) => set("nextAction", event.target.value)}
          />
        </Field>
        <Field label="Date / heure de relance">
          <input
            type="datetime-local"
            className="input w-full"
            value={form.followUpAt || ""}
            onChange={(event) => set("followUpAt", event.target.value)}
          />
        </Field>
        <Field label="Dossier lié (ID, optionnel)">
          <input
            className="input w-full"
            value={form.dossierId || ""}
            onChange={(event) => set("dossierId", event.target.value)}
          />
        </Field>
        <label className="md:col-span-2 xl:col-span-4">
          <span className="field-label">Notes</span>
          <textarea
            className="input min-h-20 w-full"
            value={form.notes || ""}
            onChange={(event) => set("notes", event.target.value)}
          />
        </label>
        <button
          disabled={busy}
          className="rounded-button bg-foreground px-4 py-2.5 text-sm font-semibold text-white md:col-span-2 xl:col-span-4 xl:justify-self-end"
        >
          Enregistrer l’appel manuel
        </button>
      </form>
    </section>
  );
}

function CallHistoryPanel({
  data,
  agents,
  onChange,
  onSelect,
}: {
  data: PaginatedData<ApiCall>;
  agents: AgentSummary[];
  onChange: (value: PaginatedData<ApiCall>) => void;
  onSelect: (value: ApiCall) => void;
}) {
  const [filters, setFilters] = useState({
    search: "",
    direction: "",
    state: "",
    agentId: "",
  });
  const loadPage = async (page: number) =>
    onChange(
      await callCenterApi.history({
        ...filters,
        page,
        pageSize: data.pagination.pageSize,
      }),
    );
  return (
    <section className="card">
      <PanelTitle icon={<Phone className="h-5 w-5" />} title="Historique des appels" />
      <form
        className="mb-4 grid gap-2 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          void loadPage(1);
        }}
      >
        <input
          className="input"
          placeholder="Téléphone, contact, objet, résultat"
          value={filters.search}
          onChange={(event) =>
            setFilters((current) => ({ ...current, search: event.target.value }))
          }
        />
        <select
          className="input"
          value={filters.direction}
          onChange={(event) =>
            setFilters((current) => ({ ...current, direction: event.target.value }))
          }
        >
          <option value="">Toutes directions</option>
          <option value="INBOUND">Entrants</option>
          <option value="OUTBOUND">Sortants</option>
        </select>
        <select
          className="input"
          value={filters.state}
          onChange={(event) =>
            setFilters((current) => ({ ...current, state: event.target.value }))
          }
        >
          <option value="">Tous statuts</option>
          {Object.values(CallState).map((state) => (
            <option key={state} value={state}>{state}</option>
          ))}
        </select>
        <select
          className="input"
          value={filters.agentId}
          onChange={(event) =>
            setFilters((current) => ({ ...current, agentId: event.target.value }))
          }
        >
          <option value="">Tous les agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.firstName} {agent.lastName}
            </option>
          ))}
        </select>
        <button className="rounded-button bg-foreground px-3 py-2 text-sm text-white md:col-span-4 md:justify-self-end">
          Rechercher
        </button>
      </form>
      <div className="space-y-2">
        {data.items.map((call) => (
          <button
            key={call.id}
            onClick={() => onSelect(call)}
            className="grid w-full gap-1 rounded-card border border-border p-3 text-left md:grid-cols-4"
          >
            <span className="font-medium">{call.subject || "Appel"}</span>
            <span>{call.externalNumber}</span>
            <span>{call.direction} · {call.state}</span>
            <span>{new Date(call.receivedAt).toLocaleString(getRuntimeLocale())}</span>
          </button>
        ))}
        {data.items.length === 0 && <Empty text="Aucun appel pour ces filtres." />}
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          type="button"
          disabled={!data.pagination.hasPreviousPage}
          onClick={() => void loadPage(data.pagination.page - 1)}
          className="rounded-button border border-border px-3 py-2 disabled:opacity-40"
        >
          Précédent
        </button>
        <span>
          Page {data.pagination.page} / {data.pagination.totalPages} · {data.pagination.totalItems} appel(s)
        </span>
        <button
          type="button"
          disabled={!data.pagination.hasNextPage}
          onClick={() => void loadPage(data.pagination.page + 1)}
          className="rounded-button border border-border px-3 py-2 disabled:opacity-40"
        >
          Suivant
        </button>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function CallScreen({
  call,
  agents,
  busy,
  run,
  onClose,
}: {
  call: ApiCall;
  agents: AgentSummary[];
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [agentId, setAgentId] = useState(call.handlingEmployee?.id || "");
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [qualification, setQualification] = useState(
    LeadQualification.UNCLASSIFIED,
  );
  const [nextAction, setNextAction] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [manualEdit, setManualEdit] = useState<ManualCallInput>({
    phone: call.externalNumber,
    callAt: toLocalDateTimeInput(call.receivedAt),
    direction: call.direction,
    agentId: call.handlingEmployee?.id || "",
    durationSeconds: call.durationSeconds || 0,
    state: (["COMPLETED", "MISSED", "FAILED"].includes(call.state)
      ? call.state
      : "COMPLETED") as ManualCallInput["state"],
    subject: call.subject || "",
    outcome: call.outcome || "",
    notes: call.notes || undefined,
    nextAction: call.nextAction || undefined,
    followUpAt: call.nextActionAt
      ? toLocalDateTimeInput(call.nextActionAt)
      : undefined,
    dossierId: call.dossier?.id,
  });
  const contact = call.client || call.prospect;
  const answerableStates: ApiCall["state"][] = [
    CallState.ASSIGNED,
    CallState.FORWARDED,
  ];
  return (
    <section className="card border-2 border-status-blue-text">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-status-blue-text">
            Screen pop · {call.state}
          </p>
          <h2 className="text-xl font-bold">
            {contact
              ? `${contact.firstName} ${contact.lastName}`
              : "Contact en résolution"}
          </h2>
          <p className="text-sm text-muted">
            {call.externalNumber} · {call.client ? "Client" : "Lead"}
          </p>
        </div>
        <button onClick={onClose}>Fermer</button>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {call.providerKey === "manual" && (
          <form
            className="grid gap-2 rounded-card border border-border p-4 lg:col-span-2 md:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() =>
                callCenterApi.updateManualCall(call.id, {
                  ...manualEdit,
                  callAt: new Date(manualEdit.callAt).toISOString(),
                  followUpAt: manualEdit.followUpAt
                    ? new Date(manualEdit.followUpAt).toISOString()
                    : undefined,
                  dossierId: manualEdit.dossierId?.trim() || undefined,
                }),
              );
            }}
          >
            <h3 className="font-semibold md:col-span-3">Modifier l’appel manuel</h3>
            <input
              required
              className="input"
              aria-label="Téléphone"
              value={manualEdit.phone}
              onChange={(event) =>
                setManualEdit((current) => ({ ...current, phone: event.target.value }))
              }
            />
            <input
              required
              type="datetime-local"
              className="input"
              aria-label="Date et heure de l’appel"
              value={manualEdit.callAt}
              onChange={(event) =>
                setManualEdit((current) => ({ ...current, callAt: event.target.value }))
              }
            />
            <select
              required
              className="input"
              aria-label="Agent"
              value={manualEdit.agentId}
              onChange={(event) =>
                setManualEdit((current) => ({ ...current, agentId: event.target.value }))
              }
            >
              <option value="">Agent / Commercial</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.firstName} {agent.lastName}
                </option>
              ))}
            </select>
            <input
              required
              className="input"
              aria-label="Objet"
              value={manualEdit.subject}
              onChange={(event) =>
                setManualEdit((current) => ({ ...current, subject: event.target.value }))
              }
            />
            <input
              required
              className="input"
              aria-label="Résultat"
              value={manualEdit.outcome}
              onChange={(event) =>
                setManualEdit((current) => ({ ...current, outcome: event.target.value }))
              }
            />
            <input
              required
              min={0}
              max={86400}
              type="number"
              className="input"
              aria-label="Durée en secondes"
              value={manualEdit.durationSeconds}
              onChange={(event) =>
                setManualEdit((current) => ({
                  ...current,
                  durationSeconds: Number(event.target.value),
                }))
              }
            />
            <textarea
              className="input md:col-span-2"
              aria-label="Notes"
              value={manualEdit.notes || ""}
              onChange={(event) =>
                setManualEdit((current) => ({ ...current, notes: event.target.value }))
              }
            />
            <button
              disabled={busy}
              className="rounded-button bg-foreground px-3 py-2 text-sm text-white"
            >
              Enregistrer les modifications
            </button>
          </form>
        )}
        <div className="space-y-3">
          <label className="block text-xs text-muted">
            Employé destinataire
            <select
              className="mt-1 w-full rounded-input border border-border bg-background px-3 py-2 text-sm"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
            >
              <option value="">Choisir</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.firstName} {agent.lastName}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy || !agentId}
              onClick={() =>
                void run(() =>
                  callCenterApi.assign(
                    call.id,
                    agentId,
                    call.handlingEmployee ? "Transfert simulé" : "Dispatch",
                  ),
                )
              }
              className="rounded-button bg-foreground px-3 py-2 text-sm text-white"
            >
              {call.handlingEmployee ? "Transférer" : "Assigner"}
            </button>
            {answerableStates.includes(call.state) && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    callCenterApi.transition(call.id, CallState.ANSWERED),
                  )
                }
                className="rounded-button border border-border px-3 py-2 text-sm"
              >
                Répondre
              </button>
            )}
            {call.state === CallState.ANSWERED && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    callCenterApi.transition(call.id, CallState.COMPLETED),
                  )
                }
                className="rounded-button border border-border px-3 py-2 text-sm"
              >
                Terminer
              </button>
            )}
          </div>
          <p className="text-xs text-muted">
            Dispatcher:{" "}
            {call.dispatcher
              ? `${call.dispatcher.firstName} ${call.dispatcher.lastName}`
              : "—"}
            <br />
            Traitant:{" "}
            {call.handlingEmployee
              ? `${call.handlingEmployee.firstName} ${call.handlingEmployee.lastName}`
              : "—"}
          </p>
        </div>
        <div className="space-y-2">
          <input
            className="w-full rounded-input border border-border bg-background px-3 py-2 text-sm"
            placeholder="Résultat de l’appel"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
          />
          <textarea
            className="w-full rounded-input border border-border bg-background px-3 py-2 text-sm"
            placeholder="Notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <div className="grid gap-2 md:grid-cols-2">
            <select
              className="rounded-input border border-border bg-background px-3 py-2 text-sm"
              value={qualification}
              onChange={(event) =>
                setQualification(event.target.value as typeof qualification)
              }
            >
              {Object.values(LeadQualification).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <input
              className="rounded-input border border-border bg-background px-3 py-2 text-sm"
              placeholder="Prochaine action"
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
            />
            <input
              type="datetime-local"
              className="rounded-input border border-border bg-background px-3 py-2 text-sm md:col-span-2"
              value={callbackAt}
              onChange={(event) => setCallbackAt(event.target.value)}
            />
          </div>
          <button
            disabled={busy || call.state !== CallState.COMPLETED || !outcome}
            onClick={() =>
              void run(() =>
                callCenterApi.disposition(call.id, {
                  outcome,
                  notes: notes || undefined,
                  qualification,
                  nextAction: nextAction || undefined,
                  nextActionAt: callbackAt || undefined,
                  callbackAt: callbackAt || undefined,
                }),
              )
            }
            className="w-full rounded-button bg-status-blue-text px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            Enregistrer le résultat et la prochaine action
          </button>
        </div>
      </div>
    </section>
  );
}

function ConversationPanel({
  conversation,
  busy,
  run,
  reload,
}: {
  conversation: ApiConversation | null;
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  if (!conversation) return <Empty text="Sélectionnez une conversation." />;
  return (
    <div className="flex flex-col">
      <div className="mb-3">
        <p className="font-semibold">{contactName(conversation)}</p>
        <p className="text-xs text-muted">
          Envoi simulé — aucune livraison externe
        </p>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {conversation.messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[85%] rounded-card p-2 text-sm ${message.direction === "OUTBOUND" ? "ml-auto bg-status-blue-bg" : "bg-surface"}`}
          >
            <p>{message.text}</p>
            <p className="mt-1 text-[10px] text-muted">{message.status}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-input border border-border bg-background px-3 py-2 text-sm"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Réponse simulée"
        />
        <button
          disabled={busy || !text.trim()}
          onClick={() =>
            void run(async () => {
              await callCenterApi.reply(
                conversation.id,
                text.trim(),
                crypto.randomUUID(),
              );
              setText("");
              await reload();
            })
          }
          className="rounded-button bg-foreground p-2 text-white"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
function SimulatorPanel({
  voiceNumber,
  whatsappNumber,
  run,
}: {
  voiceNumber?: string;
  whatsappNumber?: string;
  run: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const [phone, setPhone] = useState("0550000000");
  const [message, setMessage] = useState("Bonjour, je cherche un véhicule");
  return (
    <section className="card border-dashed">
      <div className="mb-3">
        <h2 className="font-semibold">Simulateurs de développement</h2>
        <p className="text-xs text-muted">
          Les actions ci-dessous sont locales, persistantes et explicitement
          simulées.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          className="rounded-input border border-border bg-background px-3 py-2 text-sm"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        <button
          disabled={!voiceNumber}
          onClick={() =>
            void run(() =>
              callCenterApi.simulateCall({
                providerEventId: crypto.randomUUID(),
                providerCallId: crypto.randomUUID(),
                companyNumber: voiceNumber,
                externalNumber: phone,
                state: CallState.QUEUED,
              }),
            )
          }
          className="rounded-button border border-border px-3 py-2 text-sm"
        >
          Simuler appel entrant
        </button>
        <input
          className="min-w-72 flex-1 rounded-input border border-border bg-background px-3 py-2 text-sm"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <button
          disabled={!whatsappNumber}
          onClick={() =>
            void run(() =>
              callCenterApi.simulateWhatsapp({
                providerEventId: crypto.randomUUID(),
                providerMessageId: crypto.randomUUID(),
                companyNumber: whatsappNumber,
                externalNumber: phone,
                text: message,
              }),
            )
          }
          className="rounded-button border border-border px-3 py-2 text-sm"
        >
          Simuler WhatsApp
        </button>
      </div>
    </section>
  );
}
function CallCard({ call, onSelect }: { call: ApiCall; onSelect: () => void }) {
  const contact = call.client || call.prospect;
  return (
    <button
      onClick={onSelect}
      className="rounded-card border border-border p-3 text-left hover:bg-surface"
    >
      <div className="flex items-center justify-between">
        <p className="font-medium">
          {contact
            ? `${contact.firstName} ${contact.lastName}`
            : call.externalNumber}
        </p>
        <span className="rounded-full bg-status-blue-bg px-2 py-1 text-xs text-status-blue-text">
          {call.state}
        </span>
      </div>
      <p className="text-xs text-muted">
        {call.externalNumber} ·{" "}
        {new Date(call.receivedAt).toLocaleTimeString(getRuntimeLocale())}
      </p>
    </button>
  );
}
function PresenceBadge({ status }: { status: string }) {
  const color =
    status === "AVAILABLE"
      ? "bg-status-green-bg text-status-green-text"
      : status === "BUSY"
        ? "bg-status-red-bg text-status-red-text"
        : "bg-status-amber-bg text-status-amber-text";
  return (
    <span className={`rounded-full px-2 py-1 text-xs ${color}`}>{status}</span>
  );
}
function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 mt-5 flex items-center gap-2 first:mt-0">
      {icon}
      <h2 className="font-semibold">{title}</h2>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-card border border-border bg-background p-3 text-center">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted">{text}</p>;
}
function contactName(conversation: ApiConversation) {
  const contact = conversation.client || conversation.prospect;
  return contact
    ? `${contact.firstName} ${contact.lastName}`
    : conversation.externalNumber;
}

function toLocalDateTimeInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
