"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CalendarDays,
  CarFront,
  Check,
  ChevronRight,
  Circle,
  FileText,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  Ship,
  UserRound,
  UsersRound,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import { useAuth } from "@/components/AuthProvider";
import {
  Permission,
  DOSSIER_STATUS_LABELS_API,
  DOSSIER_TYPE_LABELS_API,
  type ApiDossierStatus,
} from "@/lib/api-contract";
import { adminApi, type User } from "@/lib/admin-api";
import { commerceApi, type ApiDossier } from "@/lib/commerce-api";
import { ErrorState, LoadingState, inputClass } from "./common";

const workflows: Record<string, ApiDossierStatus[]> = {
  VEHICLE_SALE_CIF: [
    "offerSelected",
    "clientConfirmed",
    "contractSigned",
    "depositReceived",
    "purchaseConfirmed",
    "supplierPaid",
    "inspection",
    "booking",
    "loading",
    "billOfLadingIssued",
    "inTransit",
    "arrivedAtPort",
    "documentsDelivered",
    "closed",
  ],
  VEHICLE_SALE_DDP: [
    "offerSelected",
    "clientConfirmed",
    "contractSigned",
    "depositReceived",
    "purchaseConfirmed",
    "supplierPaid",
    "inspection",
    "booking",
    "loading",
    "billOfLadingIssued",
    "inTransit",
    "arrivedAtPort",
    "customsClearance",
    "customsReleased",
    "portExit",
    "localTransport",
    "deliveredToClient",
    "closed",
  ],
  SHIPPING_ONLY: [
    "clientRegistered",
    "externalVehicleRecorded",
    "externalSupplierRecorded",
    "pickupReceived",
    "shippingQuoted",
    "paymentReceived",
    "booking",
    "loading",
    "containerBillOfLading",
    "inTransit",
    "arrived",
    "serviceCompleted",
  ],
};

type Tab = "overview" | "finance" | "shipping" | "documents" | "history";

export default function DossierDetailExperience({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const { hasPermission } = useAuth();
  const [dossier, setDossier] = useState<ApiDossier | null>(null);
  const [allowed, setAllowed] = useState<ApiDossierStatus[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [salesUserId, setSalesUserId] = useState("");
  const [opsUserId, setOpsUserId] = useState("");
  const [comment, setComment] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const canWrite = hasPermission(Permission.DOSSIERS_WRITE);

  const load = useCallback(async () => {
    setError("");
    try {
      const [record, transitions, userPage] = await Promise.all([
        commerceApi.dossiers.get(id),
        commerceApi.dossiers.allowed(id),
        adminApi.listUsers({ status: "active", limit: 100 }),
      ]);
      setDossier(record);
      setAllowed(transitions.allowedTransitions);
      setUsers(userPage.items);
      setSalesUserId(record.salesUserId ?? "");
      setOpsUserId(record.opsUserId ?? "");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement impossible",
      );
    }
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function transition(status: ApiDossierStatus) {
    setWorking(true);
    setError("");
    try {
      await commerceApi.dossiers.transition(id, status, comment || undefined);
      setComment("");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Transition impossible",
      );
    } finally {
      setWorking(false);
    }
  }

  async function saveTeam() {
    setWorking(true);
    setError("");
    try {
      await commerceApi.dossiers.update(id, {
        salesUserId,
        opsUserId: opsUserId || undefined,
      });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Mise à jour impossible",
      );
    } finally {
      setWorking(false);
    }
  }

  const workflow = dossier ? (workflows[dossier.type] ?? []) : [];
  const currentIndex = dossier ? workflow.indexOf(dossier.status) : -1;
  const salesUser = users.find((user) => user.id === dossier?.salesUserId);
  const opsUser = users.find((user) => user.id === dossier?.opsUserId);
  const upfront = dossier?.sections?.finance?.paymentPlan?.installments?.find(
    (item) => item.installmentNumber === 1,
  );
  const gateBlocked =
    dossier?.status === "depositReceived" &&
    upfront &&
    Number(upfront.paidAmount) < Number(upfront.amount);

  if (!dossier)
    return (
      <>
        <Topbar title="Dossier" subtitle="Chargement…" />
        <main className="p-8">
          {error ? (
            <ErrorState message={error} retry={() => void load()} />
          ) : (
            <LoadingState />
          )}
        </main>
      </>
    );

  return (
    <>
      <Topbar
        title={dossier.reference}
        subtitle={DOSSIER_TYPE_LABELS_API[dossier.type]}
      />
      <main className="min-h-[calc(100vh-77px)] bg-[#f7f8fa] px-4 py-6 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-7xl space-y-5">
          <Link
            href="/dossiers"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour aux dossiers
          </Link>
          {error && <ErrorState message={error} retry={() => void load()} />}

          <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,.03)]">
            <div className="flex flex-wrap items-start justify-between gap-5 border-b border-neutral-100 p-6 sm:p-7">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight">
                    {dossier.reference}
                  </h1>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    {DOSSIER_TYPE_LABELS_API[dossier.type]}
                  </span>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    {DOSSIER_STATUS_LABELS_API[dossier.status]}
                  </span>
                </div>
                <p className="mt-2 flex items-center gap-2 text-sm text-muted">
                  <CalendarDays className="h-4 w-4" />
                  Ouvert le{" "}
                  {new Date(dossier.openedAt).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              {canWrite && (
                <div className="flex flex-wrap gap-2">
                  {allowed
                    .filter((status) => status !== "cancelled")
                    .map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={working}
                        onClick={() => void transition(status)}
                        className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
                      >
                        {DOSSIER_STATUS_LABELS_API[status]}
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    ))}
                  {allowed.includes("cancelled") && (
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => void transition("cancelled")}
                      className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                    >
                      Annuler
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="grid gap-px bg-neutral-100 sm:grid-cols-2 lg:grid-cols-4">
              <Info
                icon={UserRound}
                label="Client"
                value={`${dossier.client.firstName} ${dossier.client.lastName}`}
                subvalue={
                  dossier.client.phone ||
                  dossier.client.email ||
                  "Contact non renseigné"
                }
              />
              <Info
                icon={CarFront}
                label="Véhicule"
                value={
                  dossier.vehicles[0]
                    ? `${dossier.vehicles[0].brand} ${dossier.vehicles[0].model}`
                    : "À renseigner"
                }
                subvalue={dossier.vehicles[0]?.vin || "VIN en attente"}
              />
              <Info
                icon={Ship}
                label="Fournisseur / offre"
                value={
                  dossier.offerReservation?.offer.supplier.name ||
                  dossier.vehicles[0]?.supplier?.name ||
                  "Non lié"
                }
                subvalue={dossier.offerReservation?.offer.reference || "—"}
              />
              <Info
                icon={UsersRound}
                label="Responsables"
                value={
                  salesUser
                    ? `${salesUser.firstName} ${salesUser.lastName}`
                    : "Commercial non assigné"
                }
                subvalue={
                  opsUser
                    ? `Opérations · ${opsUser.firstName} ${opsUser.lastName}`
                    : "Opérations non assignées"
                }
              />
            </div>
          </section>

          {gateBlocked && (
            <section
              role="alert"
              className="flex items-start gap-4 rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-bold">
                  Action requise avant l’achat fournisseur
                </h2>
                <p className="mt-1 text-sm leading-6">
                  L’acompte initial de{" "}
                  {Number(upfront.amount).toLocaleString("fr-FR")}{" "}
                  {dossier.sections?.finance?.paymentPlan?.currency} doit être
                  confirmé. La transition restera bloquée tant que cette
                  condition financière n’est pas satisfaite.
                </p>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-neutral-200 bg-white p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-bold">Progression du dossier</h2>
                <p className="text-sm text-muted">
                  Étapes contractuelles et opérationnelles persistées
                </p>
              </div>
              <span className="text-sm font-semibold">
                {Math.max(currentIndex + 1, 1)} / {workflow.length}
              </span>
            </div>
            <ol className="flex gap-0 overflow-x-auto pb-2">
              {workflow.map((status, index) => (
                <li key={status} className="relative min-w-36 flex-1 pr-4">
                  <span
                    className={`absolute left-4 top-4 h-px w-full ${index < currentIndex ? "bg-emerald-500" : "bg-neutral-200"}`}
                  />
                  <span
                    className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${index < currentIndex ? "border-emerald-600 bg-emerald-600 text-white" : index === currentIndex ? "border-neutral-900 bg-white text-neutral-900" : "border-neutral-300 bg-white text-neutral-400"}`}
                  >
                    {index < currentIndex ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Circle className="h-3 w-3 fill-current" />
                    )}
                  </span>
                  <p
                    className={`mt-3 text-xs font-semibold leading-5 ${index === currentIndex ? "text-neutral-950" : "text-muted"}`}
                  >
                    {DOSSIER_STATUS_LABELS_API[status]}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <div
              role="tablist"
              aria-label="Sections du dossier"
              className="flex overflow-x-auto border-b border-neutral-200 px-4 sm:px-6"
            >
              {(
                [
                  ["overview", "Vue d’ensemble"],
                  ["finance", "Finance"],
                  ["shipping", "Logistique"],
                  ["documents", "Documents"],
                  ["history", "Historique"],
                ] as Array<[Tab, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={`whitespace-nowrap border-b-2 px-4 py-4 text-sm font-semibold ${tab === value ? "border-neutral-900 text-neutral-950" : "border-transparent text-muted hover:text-neutral-950"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="p-6 sm:p-7">
              {tab === "overview" && (
                <Overview
                  dossier={dossier}
                  users={users}
                  salesUserId={salesUserId}
                  opsUserId={opsUserId}
                  setSalesUserId={setSalesUserId}
                  setOpsUserId={setOpsUserId}
                  comment={comment}
                  setComment={setComment}
                  canWrite={canWrite}
                  working={working}
                  saveTeam={saveTeam}
                />
              )}
              {tab === "finance" && <Finance dossier={dossier} />}
              {tab === "shipping" && <Logistics dossier={dossier} />}
              {tab === "documents" && <Documents dossier={dossier} />}
              {tab === "history" && <History dossier={dossier} />}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function Info({
  icon: Icon,
  label,
  value,
  subvalue,
}: {
  icon: typeof CarFront;
  label: string;
  value: string;
  subvalue: string;
}) {
  return (
    <div className="flex gap-3 bg-white p-5">
      <Icon className="mt-0.5 h-5 w-5 text-neutral-500" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </p>
        <p className="mt-1 truncate text-sm font-semibold">{value}</p>
        <p className="truncate text-xs text-muted">{subvalue}</p>
      </div>
    </div>
  );
}

function Overview({
  dossier,
  users,
  salesUserId,
  opsUserId,
  setSalesUserId,
  setOpsUserId,
  comment,
  setComment,
  canWrite,
  working,
  saveTeam,
}: {
  dossier: ApiDossier;
  users: User[];
  salesUserId: string;
  opsUserId: string;
  setSalesUserId: (value: string) => void;
  setOpsUserId: (value: string) => void;
  comment: string;
  setComment: (value: string) => void;
  canWrite: boolean;
  working: boolean;
  saveTeam: () => Promise<void>;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <div>
          <h2 className="font-bold">Informations générales</h2>
          <div className="mt-4 grid gap-4 rounded-xl border border-neutral-200 p-5 sm:grid-cols-2">
            <Data label="Référence" value={dossier.reference} />
            <Data
              label="Type de dossier"
              value={DOSSIER_TYPE_LABELS_API[dossier.type]}
            />
            <Data
              label="Client"
              value={`${dossier.client.firstName} ${dossier.client.lastName}`}
            />
            <Data
              label="Statut"
              value={DOSSIER_STATUS_LABELS_API[dossier.status]}
            />
          </div>
        </div>
        <div>
          <h2 className="font-bold">Contact client</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {dossier.client.phone && (
              <span className="inline-flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-sm">
                <Phone className="h-4 w-4" />
                {dossier.client.phone}
              </span>
            )}
            {dossier.client.email && (
              <span className="inline-flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-sm">
                <Mail className="h-4 w-4" />
                {dossier.client.email}
              </span>
            )}
          </div>
        </div>
      </div>
      <aside className="rounded-xl border border-neutral-200 p-5">
        <h2 className="font-bold">Équipe</h2>
        <div className="mt-4 space-y-4">
          <label>
            <span className="field-label">Responsable commercial</span>
            <select
              disabled={!canWrite}
              className={inputClass}
              value={salesUserId}
              onChange={(event) => setSalesUserId(event.target.value)}
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.firstName} {user.lastName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Responsable opérations</span>
            <select
              disabled={!canWrite}
              className={inputClass}
              value={opsUserId}
              onChange={(event) => setOpsUserId(event.target.value)}
            >
              <option value="">Non assigné</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.firstName} {user.lastName}
                </option>
              ))}
            </select>
          </label>
          {canWrite && (
            <>
              <label>
                <span className="field-label">Commentaire de transition</span>
                <input
                  className={inputClass}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Justification ou note"
                />
              </label>
              <button
                type="button"
                disabled={working}
                onClick={() => void saveTeam()}
                className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Enregistrer l’équipe
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Finance({ dossier }: { dossier: ApiDossier }) {
  const plan = dossier.sections?.finance?.paymentPlan;
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric
          icon={Banknote}
          label="Total encaissé"
          value={`${(dossier.stats?.totalPayments ?? 0).toLocaleString("fr-FR")} DZD`}
        />
        <Metric
          icon={ReceiptText}
          label="Facturation"
          value={`${(dossier.stats?.totalInvoiceAmount ?? 0).toLocaleString("fr-FR")} DZD`}
        />
        <Metric
          icon={Check}
          label="Situation"
          value={
            dossier.stats?.isFullyPaid ? "Dossier soldé" : "Solde à percevoir"
          }
        />
      </div>
      <h2 className="mt-7 font-bold">Échéancier</h2>
      {plan?.installments?.length ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200">
          {plan.installments.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between border-b border-neutral-100 p-4 last:border-0"
            >
              <div>
                <p className="font-semibold">{item.label}</p>
                <p className="text-xs text-muted">
                  Échéance {item.installmentNumber}
                </p>
              </div>
              <p className="text-sm font-bold">
                {Number(item.paidAmount).toLocaleString("fr-FR")} /{" "}
                {Number(item.amount).toLocaleString("fr-FR")} {plan.currency}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">Aucun échéancier associé.</p>
      )}
    </div>
  );
}

function Logistics({ dossier }: { dossier: ApiDossier }) {
  const shipment = dossier.sections?.shipping;
  const customs = dossier.sections?.customs?.[0];
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <article className="rounded-xl border border-neutral-200 p-5">
        <h2 className="flex items-center gap-2 font-bold">
          <Ship className="h-5 w-5" />
          Expédition
        </h2>
        {shipment ? (
          <div className="mt-4 grid gap-3 text-sm">
            <Data label="Référence" value={shipment.shipmentNumber} />
            <Data label="Conteneur" value={shipment.containerNumber || "—"} />
            <Data label="Navire" value={shipment.vesselName || "—"} />
            <Data label="Statut" value={shipment.status} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">Aucune expédition liée.</p>
        )}
      </article>
      <article className="rounded-xl border border-neutral-200 p-5">
        <h2 className="flex items-center gap-2 font-bold">
          <MapPin className="h-5 w-5" />
          Douane
        </h2>
        {customs ? (
          <div className="mt-4 grid gap-3 text-sm">
            <Data label="Référence" value={customs.reference} />
            <Data
              label="Déclaration"
              value={customs.declarationNumber || "En cours"}
            />
            <Data label="Statut" value={customs.status} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">Aucun dossier douanier lié.</p>
        )}
      </article>
    </div>
  );
}

function Documents({ dossier }: { dossier: ApiDossier }) {
  const documents = dossier.sections?.documents ?? [];
  return (
    <div>
      <h2 className="font-bold">Documents du dossier</h2>
      <p className="mt-1 text-sm text-muted">
        Pièces persistées dans le stockage privé de l’organisation.
      </p>
      {documents.length ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {documents.map((document) => (
            <article
              key={document.id}
              className="flex items-center gap-3 rounded-xl border border-neutral-200 p-4"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {document.title || document.file?.originalName}
                </p>
                <p className="text-xs uppercase tracking-wide text-muted">
                  {document.documentType || document.kind} · {document.status}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-muted">
          Aucun document déposé.
        </p>
      )}
    </div>
  );
}

function History({ dossier }: { dossier: ApiDossier }) {
  const entries = dossier.history ?? [];
  return (
    <div>
      <h2 className="font-bold">Historique du dossier</h2>
      {entries.length ? (
        <ol className="mt-5 space-y-0">
          {entries.map((entry, index) => (
            <li key={entry.id} className="relative flex gap-4 pb-6">
              <span className="absolute left-[7px] top-4 h-full w-px bg-neutral-200" />
              <span
                className={`relative z-10 mt-1 h-4 w-4 rounded-full border-4 border-white ${index === 0 ? "bg-neutral-900" : "bg-neutral-300"}`}
              />
              <div>
                <p className="text-sm font-semibold">
                  {DOSSIER_STATUS_LABELS_API[
                    entry.toStatus as ApiDossierStatus
                  ] ?? entry.toStatus}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {new Date(entry.createdAt).toLocaleString("fr-FR")}
                  {entry.user
                    ? ` · ${entry.user.firstName} ${entry.user.lastName}`
                    : ""}
                </p>
                {entry.comment && (
                  <p className="mt-2 text-sm text-neutral-600">
                    {entry.comment}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-muted">Aucun événement enregistré.</p>
      )}
    </div>
  );
}

function Data({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Banknote;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 p-5">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <p className="mt-3 text-xl font-bold">{value}</p>
    </div>
  );
}
