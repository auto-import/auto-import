"use client";

import { getRuntimeLocale } from "@/lib/i18n/runtime-locale";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, History, Users } from "lucide-react";
import Topbar from "@/components/Topbar";
import { adminApi, type User } from "@/lib/admin-api";
import {
  DOSSIER_STATUS_LABELS_API,
  DOSSIER_TYPE_LABELS_API,
  type ApiDossierStatus,
} from "@/lib/api-contract";
import { commerceApi, type ApiDossier } from "@/lib/commerce-api";
import { downloadDocument } from "@/lib/documents-api";
import {
  buttonClass,
  EmptyState,
  ErrorState,
  inputClass,
  LoadingState,
} from "./common";

export default function DossierDetailWorkspace({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const [dossier, setDossier] = useState<ApiDossier | null>(null);
  const [allowed, setAllowed] = useState<ApiDossierStatus[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [salesUserId, setSalesUserId] = useState("");
  const [opsUserId, setOpsUserId] = useState("");
  const [comment, setComment] = useState("");
  const [vin, setVin] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
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
      setSalesUserId(record.salesUserId);
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
  const transition = async (status: ApiDossierStatus) => {
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
  };
  const saveTeam = async () => {
    setWorking(true);
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
  };
  const confirmOfferPurchase = async () => {
    if (!dossier?.offerReservation || !vin.trim()) return;
    setWorking(true);
    setError("");
    try {
      await commerceApi.offers.materialize(dossier.offerReservation.id, {
        vin: vin.trim(),
      });
      setVin("");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Confirmation impossible",
      );
    } finally {
      setWorking(false);
    }
  };
  return (
    <>
      <Topbar
        title={dossier?.reference ?? "Dossier"}
        subtitle={
          dossier ? DOSSIER_TYPE_LABELS_API[dossier.type] : "Chargement…"
        }
      />
      <main className="space-y-5 p-8">
        <Link
          href="/dossiers"
          className="inline-flex items-center gap-2 text-sm text-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Link>
        {error && <ErrorState message={error} retry={() => void load()} />}
        {!dossier ? (
          <LoadingState />
        ) : (
          <>
            <section className="card p-6">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <p className="text-xs text-muted">Statut courant</p>
                  <h1 className="text-xl font-bold">
                    {DOSSIER_STATUS_LABELS_API[dossier.status]}
                  </h1>
                  <p className="text-sm text-muted">
                    {dossier.client.firstName} {dossier.client.lastName} ·
                    ouvert le{" "}
                    {new Date(dossier.openedAt).toLocaleDateString(getRuntimeLocale())}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {allowed.map((status) => (
                    <button
                      disabled={working}
                      key={status}
                      onClick={() => void transition(status)}
                      className={
                        status === "cancelled"
                          ? "rounded-button border border-red-200 px-3 py-2 text-sm text-red-700"
                          : buttonClass
                      }
                    >
                      {DOSSIER_STATUS_LABELS_API[status]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="mt-4 block">
                <span className="field-label">Commentaire de transition</span>
                <input
                  className={inputClass}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Justification ou information utile"
                />
              </label>
            </section>
            <div className="grid gap-5 lg:grid-cols-3">
              <section className="card space-y-3 p-5 lg:col-span-2">
                <h2 className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  Relations persistées
                </h2>
                <p className="text-sm">
                  <strong>Client :</strong> {dossier.client.firstName}{" "}
                  {dossier.client.lastName}
                </p>
                <p className="text-sm">
                  <strong>Offre :</strong>{" "}
                  {dossier.offerReservation?.offer
                    ? `${dossier.offerReservation.offer.reference} · ${dossier.offerReservation.offer.brand} ${dossier.offerReservation.offer.model}`
                    : "—"}
                </p>
                <p className="text-sm">
                  <strong>Demande :</strong>{" "}
                  {dossier.vehicleRequest ? "Liée" : "—"}
                </p>
                <p className="text-sm">
                  <strong>Commande :</strong> {dossier.order ? "Liée" : "—"}
                </p>
                <div>
                  <strong className="text-sm">Véhicules :</strong>
                  {dossier.vehicles.length === 0 ? (
                    <EmptyState label="Aucun véhicule matérialisé." />
                  ) : (
                    <div className="mt-2 divide-y">
                      {dossier.vehicles.map((vehicle) => (
                        <div key={vehicle.id} className="py-2 text-sm">
                          {vehicle.brand} {vehicle.model} ·{" "}
                          {vehicle.vin || "VIN en attente"} · {vehicle.status}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
              <section className="card space-y-3 p-5">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Users className="h-4 w-4" />
                  Équipe
                </h2>
                <label>
                  <span className="field-label">Commercial</span>
                  <select
                    className={inputClass}
                    value={salesUserId}
                    onChange={(e) => setSalesUserId(e.target.value)}
                  >
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.firstName} {user.lastName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="field-label">Opérations</span>
                  <select
                    className={inputClass}
                    value={opsUserId}
                    onChange={(e) => setOpsUserId(e.target.value)}
                  >
                    <option value="">Non assigné</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.firstName} {user.lastName}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className={buttonClass}
                  disabled={working}
                  onClick={() => void saveTeam()}
                >
                  Enregistrer l’équipe
                </button>
              </section>
            </div>
            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 font-semibold">
                <History className="h-4 w-4" />
                Historique
              </h2>
              {!dossier.history?.length ? (
                <p className="text-sm text-muted">Aucun événement.</p>
              ) : (
                <div className="divide-y">
                  {dossier.history.map((entry) => (
                    <div
                      key={entry.id}
                      className="grid gap-1 py-3 text-sm md:grid-cols-[180px_1fr]"
                    >
                      <span className="text-muted">
                        {new Date(entry.createdAt).toLocaleString(getRuntimeLocale())}
                      </span>
                      <span>
                        {DOSSIER_STATUS_LABELS_API[
                          entry.toStatus as ApiDossierStatus
                        ] ?? entry.toStatus}
                        {entry.comment ? ` · ${entry.comment}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {dossier.offerReservation?.status === "active" && (
              <section className="card space-y-3 p-5">
                <h2 className="font-semibold">Confirmer l’achat fournisseur</h2>
                <p className="text-sm text-muted">
                  Le prix fournisseur est repris depuis la révision exacte de
                  l’offre réservée. Saisissez uniquement le VIN.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <label>
                    <span className="field-label">VIN *</span>
                    <input
                      className={inputClass}
                      value={vin}
                      onChange={(event) => setVin(event.target.value)}
                    />
                  </label>
                </div>
                <button
                  className={buttonClass}
                  disabled={working || !vin.trim()}
                  onClick={() => void confirmOfferPurchase()}
                >
                  Confirmer et matérialiser le véhicule
                </button>
              </section>
            )}
            {/* Phase 2: Live Operational Sections */}
            <section className="card p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between border-b border-border pb-4 gap-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground">
                    Opérations, Finance & Documents
                  </h2>
                  <p className="text-xs text-muted">
                    Contrôle des paiements, statut logistique, transit douanier
                    et pièces justificatives
                  </p>
                </div>
              </div>

              {/* Financial Gating & Margin Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-input border border-border bg-surface/50 space-y-2">
                  <p className="text-xs font-semibold text-muted uppercase">
                    Porte 1 · Acompte 30%
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-foreground">
                      {dossier.sections?.finance?.paymentPlan?.installments?.[0]
                        ?.paidAmount ?? "0.00"}{" "}
                      /{" "}
                      {dossier.sections?.finance?.paymentPlan?.installments?.[0]
                        ?.amount ?? "30% requis"}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    Requis avant confirmation d&apos;achat fournisseur
                  </p>
                </div>

                <div className="p-4 rounded-input border border-border bg-surface/50 space-y-2">
                  <p className="text-xs font-semibold text-muted uppercase">
                    Porte 2 · Solde 70%
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-foreground">
                      {dossier.sections?.finance?.paymentPlan?.installments?.[1]
                        ?.paidAmount ?? "0.00"}{" "}
                      /{" "}
                      {dossier.sections?.finance?.paymentPlan?.installments?.[1]
                        ?.amount ?? "70% requis"}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    Requis avant remise des documents / livraison
                  </p>
                </div>

                <div className="p-4 rounded-input border border-border bg-surface/50 space-y-2">
                  <p className="text-xs font-semibold text-muted uppercase">
                    Total Encaissé
                  </p>
                  <span className="text-lg font-bold text-status-green-text">
                    {dossier.stats?.totalPayments
                      ? `${dossier.stats.totalPayments.toLocaleString()} DZD`
                      : "0 DZD"}
                  </span>
                  <p className="text-xs text-muted">
                    {dossier.stats?.isFullyPaid
                      ? "✅ Dossier intégralement soldé"
                      : "Solde restant à percevoir"}
                  </p>
                </div>
              </div>

              {/* Invoices and Payments Section */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-foreground">
                  Factures & Règlements associés
                </h3>
                {!dossier.sections?.finance?.invoices?.length ? (
                  <p className="text-xs text-muted">
                    Aucune facture enregistrée pour ce dossier.
                  </p>
                ) : (
                  <div className="divide-y border border-border rounded-input overflow-hidden text-sm">
                    {dossier.sections.finance.invoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="p-3 flex justify-between items-center bg-background"
                      >
                        <div>
                          <span className="font-mono font-bold text-foreground">
                            {inv.invoiceNumber}
                          </span>
                          <span className="ms-3 text-xs text-muted">
                            {new Date(inv.createdAt).toLocaleDateString(
                              getRuntimeLocale(),
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-semibold">
                            {Number(inv.total).toLocaleString()} {inv.currency}
                          </span>
                          <span className="text-xs uppercase px-2 py-0.5 rounded bg-muted/20">
                            {inv.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Customs & Shipping Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="border border-border rounded-input p-4 space-y-2">
                  <h3 className="font-semibold text-sm text-foreground">
                    Expédition & Conteneur
                  </h3>
                  {dossier.sections?.shipping ? (
                    <div className="text-xs space-y-1 text-muted">
                      <p>
                        Conteneur :{" "}
                        <strong className="text-foreground font-mono">
                          {dossier.sections.shipping.containerNumber || "N/A"}
                        </strong>
                      </p>
                      <p>
                        Navire :{" "}
                        <strong className="text-foreground">
                          {dossier.sections.shipping.vesselName || "N/A"}
                        </strong>{" "}
                        (BL: {dossier.sections.shipping.blNumber || "—"})
                      </p>
                      <p>
                        Statut :{" "}
                        <strong className="text-primary">
                          {dossier.sections.shipping.status}
                        </strong>
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted">
                      Aucune expédition maritime active liée.
                    </p>
                  )}
                </div>

                <div className="border border-border rounded-input p-4 space-y-2">
                  <h3 className="font-semibold text-sm text-foreground">
                    Dédouanement
                  </h3>
                  {dossier.sections?.customs?.length ? (
                    <div className="text-xs space-y-1 text-muted">
                      <p>
                        Dossier douane :{" "}
                        <strong className="text-foreground font-mono">
                          {dossier.sections.customs[0].reference}
                        </strong>
                      </p>
                      <p>
                        Déclaration (DUM) :{" "}
                        <strong className="text-foreground">
                          {dossier.sections.customs[0].declarationNumber ||
                            "En cours"}
                        </strong>
                      </p>
                      <p>
                        Statut :{" "}
                        <strong className="text-primary">
                          {dossier.sections.customs[0].status}
                        </strong>
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted">
                      Dossier de transit douanier non ouvert.
                    </p>
                  )}
                </div>
              </div>

              {/* Documents & Proofs Section */}
              <div className="space-y-3 pt-2">
                <h3 className="font-semibold text-sm text-foreground">
                  Pièces justificatives & Documents déposés (
                  {dossier.sections?.documents?.length || 0})
                </h3>
                {!dossier.sections?.documents?.length ? (
                  <p className="text-xs text-muted">
                    Aucune pièce déposée. Déposez les contrats, justificatifs de
                    paiement et mainlevées.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {dossier.sections.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-3 border border-border rounded-input bg-surface/30 flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-semibold text-foreground truncate max-w-[180px]">
                            {doc.title || doc.file?.originalName}
                          </p>
                          <p className="text-muted uppercase text-[10px]">
                            {doc.kind} · {doc.documentType || "general"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void downloadDocument(doc.id).catch(
                              (cause: unknown) =>
                                setError(
                                  cause instanceof Error
                                    ? cause.message
                                    : "Téléchargement impossible",
                                ),
                            )
                          }
                          className="px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20 font-medium"
                        >
                          Ouvrir
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
