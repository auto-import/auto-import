"use client";

import { useState, useEffect, useCallback } from "react";
import { Topbar, StatusBadge, DataTable } from "@/components";
import {
  fetchShipments,
  createShipment,
  transitionShipment,
  createCustomsFromShipment,
  fetchCustomsFiles,
  transitionCustomsFile,
  type ApiShipment,
  type ApiCustomsFile,
} from "@/lib/logistics-api";
import { formatDate, formatMontant } from "@/lib/constants";
import type { Column } from "@/types";
import { Search, Ship, Plus, RefreshCw } from "lucide-react";
import ShipmentDetailDialog from "@/components/commerce/ShipmentDetailDialog";
import { commerceApi } from "@/lib/commerce-api";

export default function ExpeditionsPage() {
  const [activeTab, setActiveTab] = useState<"shipments" | "customs">(
    "shipments",
  );

  // Shipments state
  const [shipments, setShipments] = useState<ApiShipment[]>([]);
  const [shipmentLoading, setShipmentLoading] = useState(true);
  const [shipmentSearch, setShipmentSearch] = useState("");
  const [shipmentStatus, setShipmentStatus] = useState<string>("tous");
  const [shipmentPage, setShipmentPage] = useState(1);
  const [shipmentTotal, setShipmentTotal] = useState(0);

  // Customs state
  const [customsFiles, setCustomsFiles] = useState<ApiCustomsFile[]>([]);
  const [customsLoading, setCustomsLoading] = useState(true);
  const [customsSearch, setCustomsSearch] = useState("");
  const [customsStatus, setCustomsStatus] = useState<string>("tous");
  const [customsPage, setCustomsPage] = useState(1);
  const [customsTotal, setCustomsTotal] = useState(0);

  // Create Shipment Modal state
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [newContainer, setNewContainer] = useState("");
  const [newVessel, setNewVessel] = useState("");
  const [newBl, setNewBl] = useState("");
  const [newDepPort, setNewDepPort] = useState("Shanghai (CNSHA)");
  const [newArrPort, setNewArrPort] = useState("Djen Djen (DZDJE)");
  const [newEtd, setNewEtd] = useState("");
  const [newEta, setNewEta] = useState("");
  const [containerPresets, setContainerPresets] = useState<Array<Record<string, string | number>>>([]);
  const [newContainerPresetId, setNewContainerPresetId] = useState("");
  const [newFreightCost, setNewFreightCost] = useState("");
  const [newFreightCurrency, setNewFreightCurrency] = useState("USD");
  const [detailId, setDetailId] = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadShipments = useCallback(async () => {
    setShipmentLoading(true);
    try {
      const res = await fetchShipments({
        page: shipmentPage,
        limit: 15,
        search: shipmentSearch || undefined,
        status: shipmentStatus !== "tous" ? shipmentStatus : undefined,
      });
      setShipments(res.items || []);
      setShipmentTotal(res.pagination?.totalItems || 0);
    } catch {
      // ignore
    } finally {
      setShipmentLoading(false);
    }
  }, [shipmentPage, shipmentSearch, shipmentStatus]);

  const loadCustoms = useCallback(async () => {
    setCustomsLoading(true);
    try {
      const res = await fetchCustomsFiles({
        page: customsPage,
        limit: 15,
        search: customsSearch || undefined,
        status: customsStatus !== "tous" ? customsStatus : undefined,
      });
      setCustomsFiles(res.items || []);
      setCustomsTotal(res.pagination?.totalItems || 0);
    } catch {
      // ignore
    } finally {
      setCustomsLoading(false);
    }
  }, [customsPage, customsSearch, customsStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (activeTab === "shipments") {
        void loadShipments();
      } else {
        void loadCustoms();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, loadShipments, loadCustoms]);
  useEffect(() => {
    void commerceApi.configuration.containerPresets().then(setContainerPresets);
  }, []);

  const handleTransitionShipment = async (id: string, nextStatus: string) => {
    setActionLoading(id);
    try {
      await transitionShipment(id, nextStatus);
      await loadShipments();
    } catch (err) {
      alert(
        (err instanceof Error ? err.message : "") ||
          "Erreur de transition d’expédition",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleTransitionCustoms = async (id: string, nextStatus: string) => {
    setActionLoading(id);
    try {
      await transitionCustomsFile(id, nextStatus);
      await loadCustoms();
    } catch (err) {
      alert(
        (err instanceof Error ? err.message : "") ||
          "Erreur de transition douane",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateCustoms = async (id: string) => {
    setActionLoading(id);
    try {
      const result = await createCustomsFromShipment(id);
      if (result.ambiguous.length) {
        alert(
          `${result.ambiguous.length} véhicule(s) nécessitent un rapprochement manuel de dossier.`,
        );
      }
      await Promise.all([loadShipments(), loadCustoms()]);
    } catch (err) {
      alert(
        (err instanceof Error ? err.message : "") ||
          "Création douanière impossible",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createShipment({
        containerNumber: newContainer || undefined,
        vesselName: newVessel || undefined,
        blNumber: newBl || undefined,
        departurePort: newDepPort || undefined,
        arrivalPort: newArrPort || undefined,
        etd: newEtd || undefined,
        eta: newEta || undefined,
        containerPresetId: newContainerPresetId || undefined,
        totalFreightCost: newFreightCost ? Number(newFreightCost) : undefined,
        freightCurrency: newFreightCost ? newFreightCurrency : undefined,
      });
      setShowShipmentModal(false);
      setNewContainer("");
      setNewVessel("");
      setNewBl("");
      await loadShipments();
    } catch (err) {
      alert(
        (err instanceof Error ? err.message : "") ||
          "Erreur de création d’expédition",
      );
    }
  };

  const getShipmentBadge = (status: string) => {
    switch (status) {
      case "inTransit":
        return (
          <StatusBadge variant="blue" label="En mer / Transit" size="sm" />
        );
      case "arrived":
        return (
          <StatusBadge variant="yellow" label="Arrivé au port" size="sm" />
        );
      case "delivered":
        return <StatusBadge variant="green" label="Livré" size="sm" />;
      case "cancelled":
        return <StatusBadge variant="red" label="Annulé" size="sm" />;
      case "loading":
        return <StatusBadge variant="purple" label="Chargement" size="sm" />;
      case "booked":
        return <StatusBadge variant="blue" label="Réservé" size="sm" />;
      case "pending":
      default:
        return <StatusBadge variant="gray" label="En attente" size="sm" />;
    }
  };

  const getCustomsBadge = (status: string) => {
    switch (status) {
      case "cleared":
        return <StatusBadge variant="green" label="Dédouané" size="sm" />;
      case "released":
        return (
          <StatusBadge variant="green" label="Mainlevée délivrée" size="sm" />
        );
      case "inInspection":
        return (
          <StatusBadge
            variant="yellow"
            label="Inspection / Scanner"
            size="sm"
          />
        );
      case "documentsRequired":
        return <StatusBadge variant="red" label="Documents requis" size="sm" />;
      case "rejected":
        return <StatusBadge variant="red" label="Rejeté" size="sm" />;
      case "closed":
        return <StatusBadge variant="gray" label="Clôturé" size="sm" />;
      case "open":
      default:
        return <StatusBadge variant="blue" label="Dossier ouvert" size="sm" />;
    }
  };

  const v2CustomsLabels: Record<string, string> = {
    TO_PREPARE: "À préparer",
    AWAITING_ARRIVAL: "En attente arrivée",
    ARRIVED_AT_PORT: "Arrivé au port",
    FILE_TRANSMITTED: "Dossier transmis",
    CLEARANCE_IN_PROGRESS: "Dédouanement en cours",
    INSPECTION: "Inspection",
    DUTIES_TAXES: "Droits / Taxes",
    RELEASE: "Mainlevée",
    PORT_EXIT: "Sortie du port",
    CLOSED: "Clôturé",
  };
  const v2Next: Record<string, string> = {
    TO_PREPARE: "AWAITING_ARRIVAL",
    AWAITING_ARRIVAL: "ARRIVED_AT_PORT",
    ARRIVED_AT_PORT: "FILE_TRANSMITTED",
    FILE_TRANSMITTED: "CLEARANCE_IN_PROGRESS",
    CLEARANCE_IN_PROGRESS: "INSPECTION",
    INSPECTION: "DUTIES_TAXES",
    DUTIES_TAXES: "RELEASE",
    RELEASE: "PORT_EXIT",
    PORT_EXIT: "CLOSED",
  };

  const SHIPMENT_COLUMNS: Column<ApiShipment>[] = [
    {
      key: "containerNumber",
      header: "Conteneur & Expédition",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary">
            <Ship className="w-4 h-4" />
          </div>
          <div>
            <span className="font-mono font-bold text-foreground">
              {row.containerNumber || "Conteneur N/A"}
            </span>
            <p className="text-xs text-muted font-mono">{row.shipmentNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: "vesselName",
      header: "Navire & B/L",
      render: (row) => (
        <div>
          <span className="font-medium text-foreground">
            {row.vesselName || "Navire N/A"}
          </span>
          {row.blNumber && (
            <p className="text-xs text-muted font-mono">BL: {row.blNumber}</p>
          )}
        </div>
      ),
    },
    {
      key: "route",
      header: "Trajet maritime",
      render: (row) => (
        <div className="text-xs space-y-0.5">
          <p className="text-muted">
            De :{" "}
            <span className="text-foreground font-medium">
              {row.departurePort || "Chine"}
            </span>
          </p>
          <p className="text-muted">
            Vers :{" "}
            <span className="text-foreground font-medium">
              {row.arrivalPort || "Algérie"}
            </span>
          </p>
        </div>
      ),
    },
    {
      key: "dates",
      header: "ETD / ETA",
      render: (row) => (
        <div className="text-xs space-y-0.5">
          <p className="text-muted">
            ETD : {row.etd ? formatDate(row.etd) : "—"}
          </p>
          <p className="text-muted font-medium text-foreground">
            ETA : {row.eta ? formatDate(row.eta) : "—"}
          </p>
        </div>
      ),
    },
    {
      key: "vehicles",
      header: "Véhicules",
      render: (row) => {
        const count = row.capacity?.vehicleCount ?? row.vehicles?.length ?? 0;
        const used = row.capacity?.usedVolumeM3;
        const total = row.capacity?.totalVolumeM3;
        const usedKg = row.capacity?.usedWeightKg;
        const totalKg = row.capacity?.totalWeightKg;
        return (
          <button type="button" onClick={() => setDetailId(row.id)} className="inline-flex flex-col items-start justify-center gap-0.5 px-2.5 py-1.5 rounded bg-surface border text-xs font-semibold">
            <span>{count} véhicule{count !== 1 ? "s" : ""}</span>
            <span className="font-normal text-muted">
              {total != null ? `${(used ?? 0).toFixed(1)} / ${Number(total).toFixed(1)} m³` : `${(used ?? 0).toFixed(1)} m³`}
              {totalKg != null ? ` · ${Math.round(usedKg ?? 0)} / ${Math.round(Number(totalKg))} kg` : ""}
            </span>
          </button>
        );
      },
    },
    {
      key: "status",
      header: "Statut",
      render: (row) => getShipmentBadge(row.status),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex items-center gap-2">
          <button onClick={() => setDetailId(row.id)} className="px-2 py-1 text-xs rounded-button border">Détails</button>
          {row.status === "pending" && (
            <button
              onClick={() => handleTransitionShipment(row.id, "booked")}
              disabled={actionLoading === row.id}
              className="px-2 py-1 text-xs rounded-button bg-primary text-primary-foreground"
            >
              Réserver
            </button>
          )}
          {row.status === "booked" && (
            <button
              onClick={() => handleTransitionShipment(row.id, "loading")}
              disabled={actionLoading === row.id}
              className="px-2 py-1 text-xs rounded-button bg-blue-600 text-white"
            >
              Chargement
            </button>
          )}
          {row.status === "loading" && (
            <button
              onClick={() => handleTransitionShipment(row.id, "inTransit")}
              disabled={actionLoading === row.id}
              className="px-2 py-1 text-xs rounded-button bg-blue-600 text-white"
            >
              Départ en mer
            </button>
          )}
          {row.status === "inTransit" && (
            <button
              onClick={() => handleTransitionShipment(row.id, "arrived")}
              disabled={actionLoading === row.id}
              className="px-2 py-1 text-xs rounded-button bg-status-yellow-bg text-status-yellow-text font-medium"
            >
              Arrivé au port
            </button>
          )}
          <button
            onClick={() => handleCreateCustoms(row.id)}
            disabled={actionLoading === row.id || !row.vehicles?.length}
            className="px-2 py-1 text-xs rounded-button border disabled:opacity-40"
          >
            Créer dossiers douane
          </button>
        </div>
      ),
    },
  ];

  const CUSTOMS_COLUMNS: Column<ApiCustomsFile>[] = [
    {
      key: "reference",
      header: "Réf. Douane",
      render: (row) => (
        <div>
          <span className="font-mono font-bold text-foreground">
            {row.reference}
          </span>
          {row.declarationNumber && (
            <p className="text-xs text-muted font-mono">
              DUM: {row.declarationNumber}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "vehicle",
      header: "VIN / Conteneur",
      render: (row) => (
        <div className="text-xs">
          <b className="font-mono">{row.vehicles?.length ? `${row.vehicles.length} véhicule(s)` : row.vehicle?.vin || "VIN manquant"}</b>
          <p>{row.containerSnapshot || row.shipment?.shipmentNumber || "—"}</p>
          <p className="text-muted">
            {row.arrivalPortSnapshot || "Port non renseigné"}
          </p>
        </div>
      ),
    },
    {
      key: "responsible",
      header: "Responsable",
      render: (row) =>
        row.responsibleUser
          ? `${row.responsibleUser.firstName} ${row.responsibleUser.lastName}`
          : "À assigner",
    },
    {
      key: "dossier",
      header: "Dossier lié",
      render: (row) => (
        <span className="text-status-blue-text font-mono text-xs">
          {row.dossier?.reference || "—"}
        </span>
      ),
    },
    {
      key: "broker",
      header: "Transitaire / Courtier",
      render: (row) => (
        <span className="text-sm font-medium">
          {row.brokerPartner?.name || "Transitaire assigné"}
        </span>
      ),
    },
    {
      key: "amounts",
      header: "Droits & Taxes",
      render: (row) => (
        <div className="text-xs">
          <span className="font-bold text-foreground">
            {formatMontant(Number(row.customsAmount || 0))}{" "}
            {row.currency || "DZD"}
          </span>
          {Number(row.dutyAmount) > 0 && (
            <p className="text-muted">
              Droits: {formatMontant(Number(row.dutyAmount))}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "openedAt",
      header: "Ouverture / Dédouanement",
      render: (row) => (
        <div className="text-xs">
          <p className="text-muted">Ouvert: {formatDate(row.openedAt)}</p>
          {row.clearedAt && (
            <p className="text-status-green-text font-medium">
              Dédouané: {formatDate(row.clearedAt)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Statut",
      render: (row) =>
        row.v2Status ? (
          <StatusBadge
            variant={row.v2Status === "CLOSED" ? "gray" : "blue"}
            label={v2CustomsLabels[row.v2Status] || row.v2Status}
            size="sm"
          />
        ) : (
          <div>
            {getCustomsBadge(row.status)}
            <p className="mt-1 text-[10px] text-red-700">À rapprocher V2</p>
          </div>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.v2Status && v2Next[row.v2Status] && (
            <button
              onClick={() =>
                handleTransitionCustoms(row.id, v2Next[row.v2Status!])
              }
              disabled={actionLoading === row.id}
              className="px-2 py-1 text-xs rounded-button bg-primary text-primary-foreground"
            >
              Étape suivante
            </button>
          )}
          {row.status === "open" && (
            <button
              onClick={() => handleTransitionCustoms(row.id, "inInspection")}
              disabled={actionLoading === row.id}
              className="px-2 py-1 text-xs rounded-button bg-status-yellow-bg text-status-yellow-text"
            >
              Inspection
            </button>
          )}
          {(row.status === "open" || row.status === "inInspection") && (
            <button
              onClick={() => handleTransitionCustoms(row.id, "cleared")}
              disabled={actionLoading === row.id}
              className="px-2 py-1 text-xs rounded-button bg-status-green-bg text-status-green-text"
            >
              Dédouaner
            </button>
          )}
          {row.status === "cleared" && (
            <button
              onClick={() => handleTransitionCustoms(row.id, "released")}
              disabled={actionLoading === row.id}
              className="px-2 py-1 text-xs rounded-button bg-primary text-primary-foreground"
            >
              Mainlevée
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <Topbar
        title="Expéditions Maritimes & Douane"
        subtitle="Suivi des conteneurs en mer, opérations portuaires et dédouanement"
      />

      <div className="p-8 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-border gap-6">
          <button
            onClick={() => setActiveTab("shipments")}
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 ${
              activeTab === "shipments"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            Expéditions maritimes ({shipmentTotal})
          </button>
          <button
            onClick={() => setActiveTab("customs")}
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 ${
              activeTab === "customs"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            Dossiers Douane & Transit ({customsTotal})
          </button>
        </div>

        {activeTab === "shipments" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 flex-1">
                <div className="relative flex-1 min-w-[240px] max-w-md">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="text"
                    value={shipmentSearch}
                    onChange={(e) => {
                      setShipmentSearch(e.target.value);
                      setShipmentPage(1);
                    }}
                    placeholder="Rechercher par conteneur, navire, B/L..."
                    className="w-full ps-10 pe-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
                  />
                </div>

                <select
                  value={shipmentStatus}
                  onChange={(e) => {
                    setShipmentStatus(e.target.value);
                    setShipmentPage(1);
                  }}
                  className="px-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
                >
                  <option value="tous">Tous les statuts</option>
                  <option value="pending">En attente</option>
                  <option value="booked">Réservé</option>
                  <option value="loading">Chargement</option>
                  <option value="inTransit">En mer / Transit</option>
                  <option value="arrived">Arrivé au port</option>
                  <option value="delivered">Livré</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowShipmentModal(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-button bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="w-4 h-4" />
                  Nouvelle expédition
                </button>
                <button
                  onClick={() => loadShipments()}
                  className="p-2 border border-border rounded-button text-muted hover:text-foreground"
                  title="Actualiser"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${shipmentLoading ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
            </div>

            <div className="card p-0 overflow-hidden">
              <DataTable columns={SHIPMENT_COLUMNS} data={shipments} />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 flex-1">
                <div className="relative flex-1 min-w-[240px] max-w-md">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="text"
                    value={customsSearch}
                    onChange={(e) => {
                      setCustomsSearch(e.target.value);
                      setCustomsPage(1);
                    }}
                    placeholder="Rechercher par référence, DUM..."
                    className="w-full ps-10 pe-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
                  />
                </div>

                <select
                  value={customsStatus}
                  onChange={(e) => {
                    setCustomsStatus(e.target.value);
                    setCustomsPage(1);
                  }}
                  className="px-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
                >
                  <option value="tous">Tous les statuts</option>
                  <option value="open">Ouvert</option>
                  <option value="inInspection">Inspection / Scanner</option>
                  <option value="cleared">Dédouané</option>
                  <option value="released">Mainlevée</option>
                </select>
              </div>

              <button
                onClick={() => loadCustoms()}
                className="p-2 border border-border rounded-button text-muted hover:text-foreground"
                title="Actualiser"
              >
                <RefreshCw
                  className={`w-4 h-4 ${customsLoading ? "animate-spin" : ""}`}
                />
              </button>
            </div>

            <div className="card p-0 overflow-hidden">
              <DataTable columns={CUSTOMS_COLUMNS} data={customsFiles} />
            </div>
          </div>
        )}
      </div>

      {/* Shipment Modal */}
      {showShipmentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg text-foreground">
              Créer une expédition maritime
            </h3>
            <form onSubmit={handleCreateShipment} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">Type conteneur</label>
                  <select required value={newContainerPresetId} onChange={(event) => setNewContainerPresetId(event.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background">
                    <option value="">Sélectionner</option>
                    {containerPresets.map((preset) => <option key={String(preset.id)} value={String(preset.id)}>{String(preset.label)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">Fret total</label>
                  <div className="flex gap-2"><input type="number" min="0.01" step="0.01" value={newFreightCost} onChange={(event) => setNewFreightCost(event.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background" placeholder="Non renseigné" /><input value={newFreightCurrency} onChange={(event) => setNewFreightCurrency(event.target.value)} className="w-20 px-2 py-2 text-sm border border-border rounded-input bg-background" /></div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">
                  Numéro de Conteneur
                </label>
                <input
                  type="text"
                  required
                  value={newContainer}
                  onChange={(e) => setNewContainer(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background font-mono"
                  placeholder="Ex: COSU6182941"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">
                    Nom du Navire
                  </label>
                  <input
                    type="text"
                    value={newVessel}
                    onChange={(e) => setNewVessel(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                    placeholder="Ex: COSCO TAURUS"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">
                    Numéro B/L
                  </label>
                  <input
                    type="text"
                    value={newBl}
                    onChange={(e) => setNewBl(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background font-mono"
                    placeholder="Ex: BL-89201"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">
                    Port de Départ
                  </label>
                  <input
                    type="text"
                    value={newDepPort}
                    onChange={(e) => setNewDepPort(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">
                    Port d’Arrivée
                  </label>
                  <input
                    type="text"
                    value={newArrPort}
                    onChange={(e) => setNewArrPort(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">
                    ETD (Départ estimé)
                  </label>
                  <input
                    type="date"
                    value={newEtd}
                    onChange={(e) => setNewEtd(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">
                    ETA (Arrivée estimée)
                  </label>
                  <input
                    type="date"
                    value={newEta}
                    onChange={(e) => setNewEta(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowShipmentModal(false)}
                  className="px-4 py-2 text-sm font-medium border border-border rounded-button text-muted hover:text-foreground"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium rounded-button bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Créer l’expédition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {detailId && (
        <ShipmentDetailDialog
          id={detailId}
          close={() => setDetailId(null)}
          changed={loadShipments}
        />
      )}
    </>
  );
}
