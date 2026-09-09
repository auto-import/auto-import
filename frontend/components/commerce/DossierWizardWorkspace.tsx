"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CarFront,
  Check,
  CheckCircle2,
  PackageOpen,
  Ship,
  UserRound,
  UsersRound,
} from "lucide-react";
import Topbar from "@/components/Topbar";
import { DossierType, DOSSIER_TYPE_LABELS_API } from "@/lib/api-contract";
import { crmApi, type ApiClient } from "@/lib/crm-api";
import { adminApi, type User } from "@/lib/admin-api";
import {
  commerceApi,
  type ApiCatalogueItem,
  type ApiVehicle,
} from "@/lib/commerce-api";
import { ErrorState, LoadingState, inputClass } from "./common";

const steps = ["Type", "Client", "Véhicule", "Équipe", "Récapitulatif"];
const typeOptions = [
  {
    value: DossierType.VEHICLE_SALE_CIF,
    title: "Vente véhicule — CIF",
    badge: "Import maritime",
    description:
      "Véhicule livré au port algérien. Le client prend en charge le dédouanement.",
    icon: Ship,
  },
  {
    value: DossierType.VEHICLE_SALE_DDP,
    title: "Vente véhicule — DDP",
    badge: "Clé en main",
    description:
      "Import, dédouanement et livraison finale gérés par votre équipe.",
    icon: CarFront,
  },
  {
    value: DossierType.SHIPPING_ONLY,
    title: "Expédition seule",
    badge: "Logistique",
    description:
      "Transport d’un véhicule externe, sans achat ni vente par l’entreprise.",
    icon: PackageOpen,
  },
] as const;

async function loadAllSourcingCatalogueItems() {
  const first = await commerceApi.catalogue.list({
    status: "available",
    limit: 100,
    page: 1,
  });
  if (first.pagination.totalPages <= 1) return first.items;
  const remainingPages = await Promise.all(
    Array.from({ length: first.pagination.totalPages - 1 }, (_, index) =>
      commerceApi.catalogue.list({
        status: "available",
        limit: 100,
        page: index + 2,
      }),
    ),
  );
  return [first, ...remainingPages].flatMap((page) => page.items);
}

export default function DossierWizardWorkspace() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [vehicles, setVehicles] = useState<ApiVehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [vehiclesError, setVehiclesError] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehiclePage, setVehiclePage] = useState(1);
  const [vehiclePages, setVehiclePages] = useState(1);
  const [vehicleReload, setVehicleReload] = useState(0);
  const [catalogueItems, setCatalogueItems] = useState<ApiCatalogueItem[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
  const [catalogueItemId, setCatalogueItemId] = useState("");
  const [salesUserId, setSalesUserId] = useState("");
  const [opsUserId, setOpsUserId] = useState("");
  const [chinaResponsibleId, setChinaResponsibleId] = useState("");
  const [externalVehicle, setExternalVehicle] = useState({
    brand: "",
    model: "",
    lengthCm: "",
    widthCm: "",
    heightCm: "",
    weightKg: "",
  });
  const [externalPhotos, setExternalPhotos] = useState<File[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [clientPage, userPage] = await Promise.all([
          crmApi.listClients({ limit: 100 }),
          adminApi.listUsers({ status: "active", limit: 100 }),
        ]);
        setClients(clientPage.items);
        setUsers(userPage.items);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Chargement impossible",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  async function loadCatalogue() {
    setCatalogueLoading(true);
    setCatalogueError("");
    try {
      setCatalogueItems(await loadAllSourcingCatalogueItems());
    } catch (caught) {
      setCatalogueError(
        caught instanceof Error
          ? caught.message
          : "Impossible de charger le catalogue",
      );
    } finally {
      setCatalogueLoading(false);
    }
  }
  useEffect(() => {
    void loadCatalogue();
  }, []);

  useEffect(() => {
    let active = true;
    setVehiclesLoading(true);
    setVehiclesError("");
    const timer = window.setTimeout(() => {
      void commerceApi.vehicles
        .eligible({
          type,
          search: vehicleSearch || undefined,
          page: vehiclePage,
          limit: 50,
        })
        .then((result) => {
          if (!active) return;
          setVehicles(result.items);
          setVehiclePages(result.pagination.totalPages);
        })
        .catch((caught) => {
          if (active) {
            setVehicles([]);
            setVehiclesError(
              caught instanceof Error
                ? caught.message
                : "Impossible de charger les véhicules",
            );
          }
        })
        .finally(() => {
          if (active) setVehiclesLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [type, vehicleSearch, vehiclePage, vehicleReload]);

  const selectedClient = useMemo(
    () => clients.find((item) => item.id === client.id),
    [client.id, clients],
  );
  const selectedVehicle = useMemo(
    () => vehicles.find((item) => item.id === vehicleId),
    [vehicleId, vehicles],
  );
  const selectedCatalogueItem = useMemo(
    () => catalogueItems.find((item) => item.id === catalogueItemId),
    [catalogueItemId, catalogueItems],
  );
  const eligibleCatalogueItems = useMemo(
    () =>
      catalogueItems.filter((item) =>
        type === DossierType.VEHICLE_SALE_DDP
          ? item.dossierEligibility?.ddp === true
          : item.dossierEligibility?.cif === true,
      ),
    [catalogueItems, type],
  );

  function validateCurrentStep() {
    if (step === 1) {
      if (!newClient && !client.id) return "Sélectionnez un client existant.";
      if (newClient && (!client.firstName.trim() || !client.lastName.trim()))
        return "Renseignez le prénom et le nom du nouveau client.";
    }
    if (
      step === 2 &&
      type !== DossierType.SHIPPING_ONLY &&
      !vehicleId &&
      !catalogueItemId
    ) {
      return "Sélectionnez un véhicule disponible ou un véhicule commercialisé du Catalogue.";
    }
    if (step === 2 && type === DossierType.SHIPPING_ONLY) {
      if (vehicleId) return "";
      const hasBrand = externalVehicle.brand.trim() !== "";
      const hasModel = externalVehicle.model.trim() !== "";
      if (hasBrand !== hasModel)
        return "Renseignez la marque et le modèle du véhicule externe (ou laissez les deux vides).";
      if (hasBrand && externalPhotos.length !== 3)
        return "Ajoutez les trois photos du véhicule externe.";
    }
    return "";
  }

  function next() {
    const validation = validateCurrentStep();
    if (validation) return setError(validation);
    setError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step < steps.length - 1) return next();
    setSaving(true);
    setError("");
    try {
      let clientId = client.id;
      if (newClient) {
        const created = await crmApi.createClient({
          firstName: client.firstName.trim(),
          lastName: client.lastName.trim(),
          phone: client.phone || undefined,
          email: client.email || undefined,
        });
        clientId = created.id;
        setClient((current) => ({ ...current, id: created.id }));
        setNewClient(false);
      }
      let externalVehicleId: string | undefined;
      if (
        type === DossierType.SHIPPING_ONLY &&
        !vehicleId &&
        externalVehicle.brand.trim() &&
        externalVehicle.model.trim()
      ) {
        const created = await commerceApi.vehicles.createWithPhotos(
          {
            brand: externalVehicle.brand.trim(),
            model: externalVehicle.model.trim(),
            acquisitionType: "external",
            status: "available",
            lengthCm: externalVehicle.lengthCm
              ? Number(externalVehicle.lengthCm)
              : undefined,
            widthCm: externalVehicle.widthCm
              ? Number(externalVehicle.widthCm)
              : undefined,
            heightCm: externalVehicle.heightCm
              ? Number(externalVehicle.heightCm)
              : undefined,
            weightKg: externalVehicle.weightKg
              ? Number(externalVehicle.weightKg)
              : undefined,
          },
          externalPhotos,
        );
        externalVehicleId = created.id;
        setVehicleId(created.id);
      }
      const dossier = await commerceApi.dossiers.create({
        clientId,
        type,
        vehicleIds:
          vehicleId || externalVehicleId
            ? [vehicleId, externalVehicleId].filter((value): value is string =>
                Boolean(value),
              )
            : undefined,
        catalogueItemId: catalogueItemId || undefined,
        salesUserId: salesUserId || undefined,
        opsUserId: opsUserId || undefined,
        chinaResponsibleId: chinaResponsibleId || undefined,
      });
      router.push(`/dossiers/${dossier.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Création impossible",
      );
    } finally {
      setSaving(false);
    }
  }

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
        subtitle="Création d’un dossier d’importation"
      />
      <main className="min-h-[calc(100vh-77px)] bg-[#f7f8fa] px-4 py-8 sm:px-7 lg:px-10">
        <form onSubmit={submit} className="mx-auto max-w-5xl">
          <ol
            aria-label="Progression du dossier"
            className="mb-8 grid grid-cols-5"
          >
            {steps.map((label, index) => (
              <li
                key={label}
                className="relative flex flex-col items-center gap-2 text-center"
              >
                {index > 0 && (
                  <span
                    className={`absolute right-1/2 top-4 h-px w-full ${index <= step ? "bg-neutral-900" : "bg-neutral-300"}`}
                  />
                )}
                <span
                  aria-current={index === step ? "step" : undefined}
                  className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${index < step ? "border-neutral-900 bg-neutral-900 text-white" : index === step ? "border-neutral-900 bg-white text-neutral-900 ring-4 ring-neutral-200" : "border-neutral-300 bg-[#f7f8fa] text-neutral-400"}`}
                >
                  {index < step ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <span
                  className={`hidden text-xs font-medium sm:block ${index <= step ? "text-neutral-900" : "text-neutral-400"}`}
                >
                  {label}
                </span>
              </li>
            ))}
          </ol>

          {error && (
            <div className="mb-5">
              <ErrorState message={error} retry={() => setError("")} />
            </div>
          )}
          <section className="min-h-[390px] rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,.03)] sm:p-8">
            {step === 0 && (
              <div>
                <h2 className="text-xl font-bold">Type de dossier</h2>
                <p className="mt-1 text-sm text-muted">
                  Choisissez le service qui correspond à l’opération du client.
                </p>
                <div
                  role="radiogroup"
                  aria-label="Type de dossier"
                  className="mt-7 grid gap-4 md:grid-cols-3"
                >
                  {typeOptions.map((option) => {
                    const Icon = option.icon;
                    const selected = type === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          setType(option.value);
                          setVehicleId("");
                          setCatalogueItemId("");
                          setVehiclePage(1);
                          setVehicleSearch("");
                        }}
                        className={`group min-h-56 rounded-xl border-2 p-5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 ${selected ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:border-neutral-400"}`}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100">
                            <Icon className="h-5 w-5" />
                          </span>
                          {selected && <CheckCircle2 className="h-5 w-5" />}
                        </span>
                        <span className="mt-5 block font-semibold">
                          {option.title}
                        </span>
                        <span className="mt-2 inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
                          {option.badge}
                        </span>
                        <span className="mt-4 block text-sm leading-6 text-muted">
                          {option.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="mx-auto max-w-2xl">
                <h2 className="text-xl font-bold">Client</h2>
                <p className="mt-1 text-sm text-muted">
                  Associez un client existant ou créez sa fiche sans quitter le
                  parcours.
                </p>
                <div
                  className="mt-7 inline-flex rounded-lg bg-neutral-100 p-1"
                  role="group"
                  aria-label="Origine du client"
                >
                  <button
                    type="button"
                    onClick={() => setNewClient(false)}
                    className={`rounded-md px-4 py-2 text-sm font-medium ${!newClient ? "bg-white shadow-sm" : "text-muted"}`}
                  >
                    Client existant
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewClient(true)}
                    className={`rounded-md px-4 py-2 text-sm font-medium ${newClient ? "bg-white shadow-sm" : "text-muted"}`}
                  >
                    Nouveau client
                  </button>
                </div>
                {!newClient ? (
                  <label className="mt-6 block">
                    <span className="field-label">Client *</span>
                    <select
                      aria-label="Client existant"
                      className={inputClass}
                      value={client.id}
                      onChange={(event) =>
                        setClient((current) => ({
                          ...current,
                          id: event.target.value,
                        }))
                      }
                    >
                      <option value="">Sélectionner un client</option>
                      {clients.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.firstName} {item.lastName} —{" "}
                          {item.phone || item.email || "sans contact"}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {(["firstName", "lastName", "phone", "email"] as const).map(
                      (key) => (
                        <label key={key}>
                          <span className="field-label">
                            {
                              {
                                firstName: "Prénom *",
                                lastName: "Nom *",
                                phone: "Téléphone",
                                email: "E-mail",
                              }[key]
                            }
                          </span>
                          <input
                            type={key === "email" ? "email" : "text"}
                            className={inputClass}
                            value={client[key]}
                            onChange={(event) =>
                              setClient((current) => ({
                                ...current,
                                [key]: event.target.value,
                              }))
                            }
                          />
                        </label>
                      ),
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 2 && type === DossierType.SHIPPING_ONLY && (
              <div className="mx-auto max-w-2xl">
                <h2 className="text-xl font-bold">Véhicule externe</h2>
                <p className="mt-1 text-sm text-muted">
                  Décrivez le véhicule à expédier (texte libre). Il pourra aussi
                  être complété après la création du dossier.
                </p>
                <label className="mt-4 block">
                  <span className="field-label">
                    Véhicule externe déjà enregistré
                  </span>
                  <select
                    aria-label="Véhicule externe déjà enregistré"
                    className={inputClass}
                    value={vehicleId}
                    disabled={vehiclesLoading || Boolean(vehiclesError)}
                    onChange={(event) => setVehicleId(event.target.value)}
                  >
                    <option value="">
                      {vehiclesLoading
                        ? "Chargement..."
                        : vehicles.length
                          ? "Sélectionner ou enregistrer un véhicule ci-dessous"
                          : "Aucun véhicule disponible"}
                    </option>
                    {vehicles.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.brand} {item.model} ·{" "}
                        {item.vin || "VIN en attente"}
                      </option>
                    ))}
                  </select>
                </label>
                {vehiclesError && (
                  <ErrorState
                    message={vehiclesError}
                    retry={() => setVehicleReload((value) => value + 1)}
                  />
                )}
                {!vehicleId && (
                  <label className="mt-4 block">
                    <span className="field-label">
                      Trois photos du nouveau véhicule externe
                    </span>
                    <input
                      aria-label="Photos du véhicule externe"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={(event) =>
                        setExternalPhotos(Array.from(event.target.files ?? []))
                      }
                    />
                  </label>
                )}
                <div className="mt-7 grid gap-5 sm:grid-cols-2">
                  <label>
                    <span className="field-label">Marque</span>
                    <input
                      className={inputClass}
                      value={externalVehicle.brand}
                      onChange={(event) =>
                        setExternalVehicle((current) => ({
                          ...current,
                          brand: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span className="field-label">Modèle</span>
                    <input
                      className={inputClass}
                      value={externalVehicle.model}
                      onChange={(event) =>
                        setExternalVehicle((current) => ({
                          ...current,
                          model: event.target.value,
                        }))
                      }
                    />
                  </label>
                  {(
                    [
                      ["lengthCm", "Longueur (cm)"],
                      ["widthCm", "Largeur (cm)"],
                      ["heightCm", "Hauteur (cm)"],
                      ["weightKg", "Poids (kg)"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      <span className="field-label">{label}</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        className={inputClass}
                        value={externalVehicle[key]}
                        onChange={(event) =>
                          setExternalVehicle((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && type !== DossierType.SHIPPING_ONLY && (
              <div className="mx-auto max-w-2xl">
                <h2 className="text-xl font-bold">Véhicule et source</h2>
                <p className="mt-1 text-sm text-muted">
                  Sélectionnez un véhicule en stock ou une offre du catalogue.
                </p>
                <div className="mt-6 space-y-5">
                  <label className="block">
                    <span className="field-label">Véhicule disponible</span>
                    <input
                      aria-label="Rechercher un véhicule disponible"
                      className={inputClass}
                      placeholder="Marque, modèle ou VIN"
                      value={vehicleSearch}
                      onChange={(event) => {
                        setVehicleSearch(event.target.value);
                        setVehiclePage(1);
                        setVehicleId("");
                      }}
                    />
                    <select
                      aria-label="Véhicule disponible"
                      className={inputClass}
                      value={vehicleId}
                      disabled={vehiclesLoading || Boolean(vehiclesError)}
                      onChange={(event) => {
                        setVehicleId(event.target.value);
                        if (event.target.value) setCatalogueItemId("");
                      }}
                    >
                      <option value="">
                        {vehiclesLoading
                          ? "Chargement..."
                          : vehiclesError
                            ? "Chargement impossible"
                            : vehicles.length
                              ? "Sélectionner un véhicule"
                              : "Aucun véhicule disponible"}
                      </option>
                      {vehicles.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.brand} {item.model} ·{" "}
                          {item.vin || "VIN en attente"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {vehiclesError && (
                    <ErrorState
                      message={vehiclesError}
                      retry={() => setVehicleReload((value) => value + 1)}
                    />
                  )}
                  {vehicleId && (
                    <p role="status" className="text-sm text-green-700">
                      Véhicule sélectionné. Il sera réservé à l’enregistrement
                      du dossier.
                    </p>
                  )}
                  {vehiclePages > 1 && (
                    <div className="flex gap-3 text-sm">
                      <button
                        type="button"
                        disabled={vehiclePage <= 1 || vehiclesLoading}
                        onClick={() => {
                          setVehiclePage((page) => page - 1);
                          setVehicleId("");
                        }}
                      >
                        Précédent
                      </button>
                      <span>
                        {vehiclePage} / {vehiclePages}
                      </span>
                      <button
                        type="button"
                        disabled={
                          vehiclePage >= vehiclePages || vehiclesLoading
                        }
                        onClick={() => {
                          setVehiclePage((page) => page + 1);
                          setVehicleId("");
                        }}
                      >
                        Suivant
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted">
                    <span className="h-px flex-1 bg-neutral-200" />
                    ou
                    <span className="h-px flex-1 bg-neutral-200" />
                  </div>
                  <label className="block">
                    <span className="field-label">Demande de sourcing</span>
                    <select
                      aria-label="Demande de sourcing"
                      disabled={catalogueLoading || Boolean(catalogueError)}
                      className={inputClass}
                      value={catalogueItemId}
                      onChange={(event) => {
                        setCatalogueItemId(event.target.value);
                        if (event.target.value) setVehicleId("");
                      }}
                    >
                      <option value="">
                        {catalogueLoading
                          ? "Chargement..."
                          : catalogueError
                            ? "Chargement impossible"
                            : "Aucun véhicule catalogue sélectionné"}
                      </option>
                      {eligibleCatalogueItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.brand} {item.model} {item.version || ""} ·{" "}
                          {type === DossierType.VEHICLE_SALE_DDP
                            ? `${Number(item.ddpPrice).toLocaleString()} DZD DDP`
                            : `${Number(item.cifPrice).toLocaleString()} DZD CIF`}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs text-muted">
                      Uniquement les véhicules issus d’un devis commercial
                      publié.
                    </span>
                  </label>
                  {catalogueError && (
                    <ErrorState
                      message={catalogueError}
                      retry={() => void loadCatalogue()}
                    />
                  )}
                  {!catalogueLoading &&
                    !catalogueError &&
                    !eligibleCatalogueItems.length && (
                      <p className="rounded-card border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        Aucun véhicule catalogue disponible avec un devis{" "}
                        {type === DossierType.VEHICLE_SALE_DDP ? "DDP" : "CIF"}{" "}
                        publié.
                      </p>
                    )}
                  {selectedCatalogueItem && (
                    <dl className="grid gap-3 rounded-card border bg-neutral-50 p-4 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-muted">Véhicule</dt>
                        <dd className="font-semibold">
                          {selectedCatalogueItem.brand}{" "}
                          {selectedCatalogueItem.model}{" "}
                          {selectedCatalogueItem.version ?? ""}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Année / motorisation</dt>
                        <dd className="font-semibold">
                          {selectedCatalogueItem.year ?? "—"} ·{" "}
                          {selectedCatalogueItem.fuel ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Offre Chine</dt>
                        <dd className="font-semibold">
                          {selectedCatalogueItem.offer.reference}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Devis</dt>
                        <dd className="font-semibold">
                          {type === DossierType.VEHICLE_SALE_DDP
                            ? selectedCatalogueItem.pricing.ddp?.quotationNumber
                            : selectedCatalogueItem.pricing.cif
                                ?.quotationNumber}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Prix CIF</dt>
                        <dd className="font-semibold">
                          {selectedCatalogueItem.cifPrice
                            ? `${Number(selectedCatalogueItem.cifPrice).toLocaleString()} DZD`
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Prix DDP</dt>
                        <dd className="font-semibold">
                          {selectedCatalogueItem.ddpPrice
                            ? `${Number(selectedCatalogueItem.ddpPrice).toLocaleString()} DZD`
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="mx-auto max-w-2xl">
                <h2 className="text-xl font-bold">Équipe responsable</h2>
                <p className="mt-1 text-sm text-muted">
                  Assignez les responsables commercial et opérations.
                </p>
                <div className="mt-7 grid gap-5 sm:grid-cols-2">
                  <label>
                    <span className="field-label">Responsable commercial</span>
                    <select
                      aria-label="Responsable commercial"
                      className={inputClass}
                      value={salesUserId}
                      onChange={(event) => setSalesUserId(event.target.value)}
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
                    <span className="field-label">Responsable opérations</span>
                    <select
                      aria-label="Responsable opérations"
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
                  <label>
                    <span className="field-label">Responsable Chine</span>
                    <select
                      aria-label="Responsable Chine"
                      className={inputClass}
                      value={chinaResponsibleId}
                      onChange={(event) =>
                        setChinaResponsibleId(event.target.value)
                      }
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
              </div>
            )}

            {step === 4 && (
              <div>
                <h2 className="text-xl font-bold">Récapitulatif</h2>
                <p className="mt-1 text-sm text-muted">
                  Vérifiez les informations avant de créer le dossier.
                </p>
                <div className="mt-7 grid gap-4 sm:grid-cols-2">
                  <Summary
                    icon={PackageOpen}
                    label="Type"
                    value={
                      DOSSIER_TYPE_LABELS_API[
                        type as keyof typeof DOSSIER_TYPE_LABELS_API
                      ]
                    }
                  />
                  <Summary
                    icon={UserRound}
                    label="Client"
                    value={
                      newClient
                        ? `${client.firstName} ${client.lastName}`
                        : selectedClient
                          ? `${selectedClient.firstName} ${selectedClient.lastName}`
                          : "—"
                    }
                  />
                  <Summary
                    icon={CarFront}
                    label="Source"
                    value={
                      selectedVehicle
                        ? `${selectedVehicle.brand} ${selectedVehicle.model}`
                        : selectedCatalogueItem
                          ? `${selectedCatalogueItem.brand} ${selectedCatalogueItem.model} · Catalogue`
                          : type === DossierType.SHIPPING_ONLY &&
                              externalVehicle.brand.trim()
                            ? `${externalVehicle.brand} ${externalVehicle.model}`.trim()
                            : "Véhicule externe à renseigner"
                    }
                  />
                  <Summary
                    icon={UsersRound}
                    label="Équipe"
                    value={`${users.find((item) => item.id === salesUserId)?.firstName ?? "Utilisateur courant"} · ${users.find((item) => item.id === opsUserId)?.firstName ?? "Opérations non assignées"}${users.find((item) => item.id === chinaResponsibleId)?.firstName ? ` · Chine · ${users.find((item) => item.id === chinaResponsibleId)?.firstName}` : ""}`}
                  />
                </div>
              </div>
            )}
          </section>

          <footer className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                step === 0
                  ? router.push("/dossiers")
                  : setStep((current) => current - 1)
              }
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            >
              <ArrowLeft className="h-4 w-4" />
              {step === 0 ? "Annuler" : "Précédent"}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
            >
              {step === steps.length - 1
                ? saving
                  ? "Création…"
                  : "Créer le dossier"
                : "Continuer"}
              {step < steps.length - 1 && <ArrowRight className="h-4 w-4" />}
            </button>
          </footer>
        </form>
      </main>
    </>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CarFront;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 p-5">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <p className="mt-3 font-semibold">{value}</p>
    </div>
  );
}
