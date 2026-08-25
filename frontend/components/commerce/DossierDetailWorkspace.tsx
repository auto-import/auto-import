"use client";

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
  const [purchasePrice, setPurchasePrice] = useState("");
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
        purchasePrice: purchasePrice ? Number(purchasePrice) : undefined,
      });
      setVin("");
      setPurchasePrice("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Confirmation impossible");
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
                    {new Date(dossier.openedAt).toLocaleDateString("fr-FR")}
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
                        {new Date(entry.createdAt).toLocaleString("fr-FR")}
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
                <p className="text-sm text-muted">Le véhicule n’est matérialisé qu’avec un VIN et un prix d’achat faisant autorité.</p>
                <div className="grid gap-3 md:grid-cols-2"><label><span className="field-label">VIN *</span><input className={inputClass} value={vin} onChange={(event) => setVin(event.target.value)} /></label><label><span className="field-label">Prix d’achat</span><input type="number" className={inputClass} value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} /></label></div>
                <button className={buttonClass} disabled={working || !vin.trim()} onClick={() => void confirmOfferPurchase()}>Confirmer et matérialiser le véhicule</button>
              </section>
            )}
            <section className="card p-5">
              <h2 className="font-semibold">Phase 2</h2>
              <p className="mt-2 text-sm text-muted">
                Finance, shipping, documents et preuves ne sont pas encore
                implémentés. Aucun montant ni statut n’est fabriqué.
              </p>
            </section>
          </>
        )}
      </main>
    </>
  );
}
