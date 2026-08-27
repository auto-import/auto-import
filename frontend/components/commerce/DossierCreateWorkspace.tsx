"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import { DossierType, DOSSIER_TYPE_LABELS_API } from "@/lib/api-contract";
import { crmApi, type ApiClient } from "@/lib/crm-api";
import { adminApi, type User } from "@/lib/admin-api";
import {
  commerceApi,
  type ApiOffer,
  type ApiVehicle,
  type ApiVehicleRequest,
} from "@/lib/commerce-api";
import { buttonClass, ErrorState, inputClass, LoadingState } from "./common";

export default function DossierCreateWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const offerId = searchParams.get("offerId") ?? "";
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [vehicles, setVehicles] = useState<ApiVehicle[]>([]);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehiclePage, setVehiclePage] = useState(1);
  const [vehiclePages, setVehiclePages] = useState(1);
  const [requests, setRequests] = useState<ApiVehicleRequest[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [offer, setOffer] = useState<ApiOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [newClient, setNewClient] = useState(false);
  const [client, setClient] = useState({
    id: "",
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  });
  const [type, setType] = useState<string>(DossierType.VEHICLE_SALE_CIF);
  const [vehicleId, setVehicleId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [salesUserId, setSalesUserId] = useState("");
  const [opsUserId, setOpsUserId] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [clientPage, requestPage, userPage, selectedOffer] =
          await Promise.all([
            crmApi.listClients({ limit: 100 }),
            commerceApi.vehicleRequests.list({ limit: 100 }),
            adminApi.listUsers({ status: "active", limit: 100 }),
            offerId ? commerceApi.offers.get(offerId) : Promise.resolve(null),
          ]);
        setClients(clientPage.items);
        setRequests(requestPage.items);
        setUsers(userPage.items);
        setOffer(selectedOffer);
        if (selectedOffer) setType(DossierType.VEHICLE_SALE_CIF);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Chargement impossible",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [offerId]);

  useEffect(() => {
    if (offer) return;
    const timer = window.setTimeout(() => {
      void commerceApi.vehicles
        .eligible({
          type,
          search: vehicleSearch || undefined,
          page: vehiclePage,
          limit: 12,
          includeExcluded: true,
        })
        .then((result) => {
          setVehicles(result.items);
          setVehiclePages(Math.max(result.pagination.totalPages, 1));
        })
        .catch((cause: unknown) =>
          setError(
            cause instanceof Error ? cause.message : "Sélecteur indisponible",
          ),
        );
    }, 180);
    return () => window.clearTimeout(timer);
  }, [offer, type, vehiclePage, vehicleSearch]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      let clientId = client.id;
      if (newClient) {
        const created = await crmApi.createClient({
          firstName: client.firstName,
          lastName: client.lastName,
          phone: client.phone || undefined,
          email: client.email || undefined,
        });
        clientId = created.id;
      }
      if (!clientId) throw new Error("Sélectionnez ou créez un client.");
      let offerReservationId: string | undefined;
      if (offer) {
        const reservation = await commerceApi.offers.reserve(offer.id, {
          clientId,
          quantity: 1,
        });
        offerReservationId = reservation.id;
      }
      const dossier = await commerceApi.dossiers.create({
        clientId,
        type,
        vehicleIds: vehicleId ? [vehicleId] : undefined,
        vehicleRequestId: requestId || undefined,
        offerReservationId,
        salesUserId: salesUserId || undefined,
        opsUserId: opsUserId || undefined,
      });
      router.push(`/dossiers/${dossier.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Création impossible",
      );
    } finally {
      setSaving(false);
    }
  };
  if (loading)
    return (
      <>
        <Topbar title="Nouveau dossier" />
        <main className="p-8">
          <LoadingState />
        </main>
      </>
    );
  return (
    <>
      <Topbar
        title="Nouveau dossier"
        subtitle="Client, source, véhicule et équipe"
      />
      <main className="p-8">
        <form onSubmit={submit} className="mx-auto max-w-4xl space-y-6">
          {error && <ErrorState message={error} retry={() => setError("")} />}
          {offer && (
            <section className="card p-5">
              <p className="text-xs text-muted">Offre Chine sélectionnée</p>
              <p className="font-semibold">
                {offer.reference} · {offer.brand} {offer.model} ·{" "}
                {offer.supplier.name}
              </p>
              <p className="text-sm text-muted">
                La quantité sera réservée transactionnellement lors de la
                création.
              </p>
            </section>
          )}
          <section className="card space-y-4 p-5">
            <div className="flex justify-between">
              <h2 className="font-semibold">1. Client</h2>
              <label className="text-sm">
                <input
                  type="checkbox"
                  checked={newClient}
                  onChange={(e) => setNewClient(e.target.checked)}
                />{" "}
                Nouveau client
              </label>
            </div>
            {newClient ? (
              <div className="grid gap-3 md:grid-cols-2">
                {(["firstName", "lastName", "phone", "email"] as const).map(
                  (key) => (
                    <label key={key}>
                      <span className="field-label">
                        {
                          {
                            firstName: "Prénom *",
                            lastName: "Nom *",
                            phone: "Téléphone",
                            email: "Email",
                          }[key]
                        }
                      </span>
                      <input
                        required={key === "firstName" || key === "lastName"}
                        className={inputClass}
                        value={client[key]}
                        onChange={(e) =>
                          setClient((current) => ({
                            ...current,
                            [key]: e.target.value,
                          }))
                        }
                      />
                    </label>
                  ),
                )}
              </div>
            ) : (
              <select
                required
                className={inputClass}
                value={client.id}
                onChange={(e) =>
                  setClient((current) => ({ ...current, id: e.target.value }))
                }
              >
                <option value="">Sélectionner un client</option>
                {clients.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.firstName} {item.lastName}
                  </option>
                ))}
              </select>
            )}
          </section>
          <section className="card space-y-4 p-5">
            <h2 className="font-semibold">2. Type et source</h2>
            <select
              className={inputClass}
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setVehicleId("");
                setVehiclePage(1);
              }}
            >
              {Object.values(DossierType).map((value) => (
                <option key={value} value={value}>
                  {DOSSIER_TYPE_LABELS_API[value]}
                </option>
              ))}
            </select>
            {!offer && (
              <div className="grid gap-3 md:grid-cols-2">
                <label>
                  <span className="field-label">
                    Demande externe / sourcing
                  </span>
                  <select
                    className={inputClass}
                    value={requestId}
                    onChange={(e) => setRequestId(e.target.value)}
                  >
                    <option value="">Aucune</option>
                    {requests.map((request) => (
                      <option key={request.id} value={request.id}>
                        {request.brand || "Toutes marques"} {request.model} ·{" "}
                        {request.status}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="field-label">Véhicule en stock</span>
                  <input
                    aria-label="Rechercher un véhicule éligible"
                    className={`${inputClass} mb-2`}
                    placeholder="VIN, marque ou modèle"
                    value={vehicleSearch}
                    onChange={(event) => {
                      setVehicleSearch(event.target.value);
                      setVehiclePage(1);
                    }}
                  />
                  <select
                    className={inputClass}
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                  >
                    <option value="">Aucun</option>
                    {vehicles.map((vehicle) => (
                      <option
                        key={vehicle.id}
                        value={vehicle.id}
                        disabled={!vehicle.eligibility?.eligible}
                      >
                        {vehicle.brand} {vehicle.model} ·{" "}
                        {vehicle.vin ?? "VIN en attente"}
                        {vehicle.eligibility?.reason
                          ? ` — ${vehicle.eligibility.reason}`
                          : ""}
                      </option>
                    ))}
                  </select>
                  <span className="mt-2 flex items-center justify-between text-xs text-muted">
                    <button
                      type="button"
                      disabled={vehiclePage <= 1}
                      onClick={() => setVehiclePage((page) => page - 1)}
                    >
                      Précédent
                    </button>
                    Page {vehiclePage}/{vehiclePages}
                    <button
                      type="button"
                      disabled={vehiclePage >= vehiclePages}
                      onClick={() => setVehiclePage((page) => page + 1)}
                    >
                      Suivant
                    </button>
                  </span>
                </label>
              </div>
            )}
          </section>
          <section className="card space-y-4 p-5">
            <h2 className="font-semibold">3. Équipe</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <label>
                <span className="field-label">Commercial</span>
                <select
                  className={inputClass}
                  value={salesUserId}
                  onChange={(e) => setSalesUserId(e.target.value)}
                >
                  <option value="">Utilisateur courant</option>
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
            </div>
          </section>
          <div className="flex justify-end">
            <button disabled={saving} className={buttonClass}>
              {saving ? "Création…" : "Créer le dossier"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
