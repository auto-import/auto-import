"use client";

import { useState, useEffect, useCallback } from "react";
import { Topbar, StatusBadge, DataTable } from "@/components";
import {
  fetchInvoices,
  issueInvoice,
  voidInvoice,
  fetchPayments,
  confirmPayment,
  fetchOrganizationFinancialOverview,
  type ApiInvoice,
  type ApiPayment,
  type OrganizationFinancialOverview,
  fetchContracts,
  type ApiContract,
} from "@/lib/finance-api";
import { formatMontant, formatDate } from "@/lib/constants";
import type { Column } from "@/types";
import {
  Search,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  DollarSign,
  FileText,
  FileSignature,
  CreditCard,
  Building2,
  Calendar,
  Layers,
} from "lucide-react";

type FacturationTab = "contracts" | "payments" | "invoices";

export default function FacturationPage() {
  const [activeTab, setActiveTab] = useState<FacturationTab>("contracts");
  const [overview, setOverview] =
    useState<OrganizationFinancialOverview | null>(null);

  // Contracts state
  const [contracts, setContracts] = useState<ApiContract[]>([]);
  const [contractLoading, setContractLoading] = useState(true);
  const [contractSearch, setContractSearch] = useState("");

  // Invoices state
  const [invoices, setInvoices] = useState<ApiInvoice[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(true);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState<string>("tous");
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceTotal, setInvoiceTotal] = useState(0);

  // Payments state
  const [payments, setPayments] = useState<ApiPayment[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<string>("tous");
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentTotal, setPaymentTotal] = useState(0);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load Overview
  const loadOverview = useCallback(async () => {
    try {
      const data = await fetchOrganizationFinancialOverview();
      setOverview(data);
    } catch {
      // ignore
    }
  }, []);

  // Load Contracts
  const loadContracts = useCallback(async () => {
    setContractLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchContracts();
      setContracts(res || []);
    } catch (err) {
      setErrorMsg(
        (err instanceof Error ? err.message : "") ||
          "Erreur lors du chargement des contrats",
      );
    } finally {
      setContractLoading(false);
    }
  }, []);

  // Load Invoices
  const loadInvoices = useCallback(async () => {
    setInvoiceLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchInvoices({
        page: invoicePage,
        limit: 15,
        search: invoiceSearch || undefined,
        status: invoiceStatus !== "tous" ? invoiceStatus : undefined,
      });
      setInvoices(res.items || []);
      setInvoiceTotal(res.pagination?.totalItems || 0);
    } catch (err) {
      setErrorMsg(
        (err instanceof Error ? err.message : "") ||
          "Erreur lors du chargement des factures",
      );
    } finally {
      setInvoiceLoading(false);
    }
  }, [invoicePage, invoiceSearch, invoiceStatus]);

  // Load Payments
  const loadPayments = useCallback(async () => {
    setPaymentLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchPayments({
        page: paymentPage,
        limit: 15,
        search: paymentSearch || undefined,
        status: paymentStatus !== "tous" ? paymentStatus : undefined,
      });
      setPayments(res.items || []);
      setPaymentTotal(res.pagination?.totalItems || 0);
    } catch (err) {
      setErrorMsg(
        (err instanceof Error ? err.message : "") ||
          "Erreur lors du chargement des encaissements",
      );
    } finally {
      setPaymentLoading(false);
    }
  }, [paymentPage, paymentSearch, paymentStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOverview();
      void loadContracts();
      void loadInvoices();
      void loadPayments();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview, loadContracts, loadInvoices, loadPayments]);

  useEffect(() => {
    const refresh = () => {
      void loadOverview();
      void loadContracts();
      void loadInvoices();
      void loadPayments();
    };
    window.addEventListener("auto-import:notification", refresh);
    return () =>
      window.removeEventListener("auto-import:notification", refresh);
  }, [loadOverview, loadContracts, loadInvoices, loadPayments]);

  // Handle invoice actions
  const handleIssueInvoice = async (id: string) => {
    setActionLoading(id);
    try {
      await issueInvoice(id);
      await loadInvoices();
      await loadOverview();
    } catch (err) {
      alert(
        (err instanceof Error ? err.message : "") ||
          "Erreur lors de l’émission de la facture",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleVoidInvoice = async (id: string) => {
    if (!confirm("Êtes-vous sûr de vouloir annuler cette facture ?")) return;
    setActionLoading(id);
    try {
      await voidInvoice(id, "Annulation par l'utilisateur");
      await loadInvoices();
      await loadOverview();
    } catch (err) {
      alert(
        (err instanceof Error ? err.message : "") ||
          "Erreur lors de l’annulation de la facture",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmPayment = async (id: string) => {
    setActionLoading(id);
    try {
      await confirmPayment(id);
      await loadPayments();
      await loadOverview();
    } catch (err) {
      alert(
        (err instanceof Error ? err.message : "") ||
          "Erreur lors de la confirmation du paiement",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const filteredContracts = contracts.filter((c) => {
    if (!contractSearch) return true;
    const term = contractSearch.toLowerCase();
    return (
      c.contractNumber?.toLowerCase().includes(term) ||
      c.client?.firstName?.toLowerCase().includes(term) ||
      c.client?.lastName?.toLowerCase().includes(term) ||
      c.dossier?.reference?.toLowerCase().includes(term)
    );
  });

  const CONTRACT_COLUMNS: Column<ApiContract>[] = [
    {
      key: "contractNumber",
      header: "N° Contrat",
      render: (row) => (
        <div className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground">
            {row.contractNumber}
          </span>
        </div>
      ),
    },
    {
      key: "client",
      header: "Client",
      render: (row) => (
        <div>
          <span className="font-medium text-foreground">
            {row.client
              ? `${row.client.firstName} ${row.client.lastName}`
              : "Client non spécifié"}
          </span>
        </div>
      ),
    },
    {
      key: "dossier",
      header: "Dossier lié",
      render: (row) => (
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-mono">
          {row.dossier?.reference || "—"}
        </span>
      ),
    },
    {
      key: "totalAmount",
      header: "Montant total",
      render: (row) => (
        <span className="font-bold text-foreground">
          {formatMontant(Number(row.totalAmount))} {row.currency}
        </span>
      ),
    },
    {
      key: "signedAt",
      header: "Signé le",
      render: (row) => (row.signedAt ? formatDate(row.signedAt) : "En attente"),
    },
    {
      key: "status",
      header: "Statut",
      render: (row) => (
        <StatusBadge
          variant={
            row.status === "SIGNED" || row.status === "ACTIVE"
              ? "green"
              : row.status === "DRAFT"
                ? "gray"
                : "yellow"
          }
          label={
            row.status === "SIGNED"
              ? "Signé"
              : row.status === "ACTIVE"
                ? "Actif"
                : row.status === "DRAFT"
                  ? "Brouillon"
                  : row.status
          }
          size="sm"
        />
      ),
    },
  ];

  const INVOICE_COLUMNS: Column<ApiInvoice>[] = [
    {
      key: "invoiceNumber",
      header: "N° Facture",
      render: (row) => (
        <span className="font-semibold text-foreground">
          {row.invoiceNumber}
        </span>
      ),
    },
    {
      key: "client",
      header: "Client",
      render: (row) => (
        <div>
          <span className="font-medium text-foreground">
            {row.client
              ? `${row.client.firstName} ${row.client.lastName}`
              : "Client"}
          </span>
          {row.dossier && (
            <p className="text-xs text-muted">Dossier: {row.dossier.reference}</p>
          )}
        </div>
      ),
    },
    {
      key: "issueDate",
      header: "Date d’émission",
      render: (row) => (row.issueDate ? formatDate(row.issueDate) : "—"),
    },
    {
      key: "dueDate",
      header: "Échéance",
      render: (row) => (row.dueDate ? formatDate(row.dueDate) : "—"),
    },
    {
      key: "total",
      header: "Montant TTC",
      render: (row) => (
        <span className="font-semibold text-foreground">
          {formatMontant(Number(row.total))} {row.currency}
        </span>
      ),
    },
    {
      key: "paidAmount",
      header: "Payé",
      render: (row) => (
        <span className="font-medium text-status-green-text">
          {formatMontant(Number(row.paidAmount))} {row.currency}
        </span>
      ),
    },
    {
      key: "status",
      header: "Statut",
      render: (row) => (
        <StatusBadge
          variant={
            row.status === "PAID"
              ? "green"
              : row.status === "ISSUED"
                ? "blue"
                : row.status === "VOIDED"
                  ? "red"
                  : "gray"
          }
          label={
            row.status === "PAID"
              ? "Soldée"
              : row.status === "ISSUED"
                ? "Émise"
                : row.status === "VOIDED"
                  ? "Annulée"
                  : "Brouillon"
          }
          size="sm"
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.status === "DRAFT" && (
            <button
              onClick={() => handleIssueInvoice(row.id)}
              disabled={actionLoading === row.id}
              className="px-2.5 py-1 text-xs font-medium rounded-button bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Émettre
            </button>
          )}
          {row.status === "ISSUED" && (
            <button
              onClick={() => handleVoidInvoice(row.id)}
              disabled={actionLoading === row.id}
              className="px-2.5 py-1 text-xs font-medium rounded-button border border-border text-muted hover:text-foreground disabled:opacity-50"
            >
              Annuler
            </button>
          )}
        </div>
      ),
    },
  ];

  const PAYMENT_COLUMNS: Column<ApiPayment>[] = [
    {
      key: "reference",
      header: "Réf. Encaissement",
      render: (row) => (
        <span className="font-semibold text-foreground">
          {row.reference || row.id.slice(0, 8)}
        </span>
      ),
    },
    {
      key: "client",
      header: "Client & Dossier",
      render: (row) => (
        <div>
          <span className="font-medium text-foreground">
            {row.client
              ? `${row.client.firstName} ${row.client.lastName}`
              : "Client"}
          </span>
          {row.dossier && (
            <p className="text-xs text-muted">Dossier: {row.dossier.reference}</p>
          )}
        </div>
      ),
    },
    {
      key: "paymentMethod",
      header: "Mode de règlement",
      render: (row) => (
        <span className="text-xs font-medium uppercase text-muted">
          {row.paymentMethod || "Virement"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Montant",
      render: (row) => (
        <span className="font-semibold text-status-green-text">
          {formatMontant(Number(row.amount))} {row.currency}
        </span>
      ),
    },
    {
      key: "paymentDate",
      header: "Date de versement",
      render: (row) =>
        row.paymentDate ? formatDate(row.paymentDate) : formatDate(row.createdAt),
    },
    {
      key: "status",
      header: "Statut",
      render: (row) => (
        <StatusBadge
          variant={
            row.status === "CONFIRMED"
              ? "green"
              : row.status === "PENDING"
                ? "yellow"
                : "red"
          }
          label={
            row.status === "CONFIRMED"
              ? "Encaissé"
              : row.status === "PENDING"
                ? "En attente"
                : "Rejeté"
          }
          size="sm"
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div>
          {row.status === "PENDING" && (
            <button
              onClick={() => handleConfirmPayment(row.id)}
              disabled={actionLoading === row.id}
              className="px-2.5 py-1 text-xs font-medium rounded-button bg-status-green-text text-white hover:bg-status-green-text/90 disabled:opacity-50"
            >
              Valider encaissement
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <Topbar
        title="Contrats & Encaissements Clients"
        subtitle="Engagements contractuels, échéanciers, facturation et règlements clients"
      />

      <div className="p-8 space-y-6">
        {/* Metric Cards */}
        {overview && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5 border-l-4 border-l-status-green-text">
              <p className="text-xs font-medium text-muted uppercase">
                Total Encaissé
              </p>
              <p className="text-2xl font-bold text-status-green-text mt-1">
                {formatMontant(Number(overview.totalCollected))}{" "}
                {overview.baseCurrency}
              </p>
              <p className="text-xs text-muted mt-1">
                {overview.paymentCount} encaissement(s) confirmé(s)
              </p>
            </div>

            <div className="card p-5 border-l-4 border-l-primary">
              <p className="text-xs font-medium text-muted uppercase">
                Total Facturé
              </p>
              <p className="text-2xl font-bold text-primary mt-1">
                {formatMontant(Number(overview.totalInvoiced))}{" "}
                {overview.baseCurrency}
              </p>
              <p className="text-xs text-muted mt-1">
                {overview.invoiceCount} facture(s) émise(s)
              </p>
            </div>

            <div className="card p-5 border-l-4 border-l-status-yellow-text">
              <p className="text-xs font-medium text-muted uppercase">
                Créances Clients Ouvertes
              </p>
              <p className="text-2xl font-bold text-status-yellow-text mt-1">
                {formatMontant(Number(overview.totalOutstanding))}{" "}
                {overview.baseCurrency}
              </p>
              <p className="text-xs text-muted mt-1">
                En attente de règlement
              </p>
            </div>

            <div className="card p-5 border-l-4 border-l-purple-500">
              <p className="text-xs font-medium text-muted uppercase">
                Contrats Actifs
              </p>
              <p className="text-2xl font-bold text-purple-600 mt-1">
                {contracts.length}
              </p>
              <p className="text-xs text-muted mt-1">
                Engagements clients enregistrés
              </p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-4 bg-status-red-bg text-status-red-text border border-status-red-border rounded-card flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{errorMsg}</p>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-border gap-6">
          <button
            onClick={() => setActiveTab("contracts")}
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === "contracts"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <FileSignature className="w-4 h-4" />
            Contrats Clients ({contracts.length})
          </button>
          <button
            onClick={() => setActiveTab("payments")}
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === "payments"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Encaissements & Paiements ({paymentTotal || payments.length})
          </button>
          <button
            onClick={() => setActiveTab("invoices")}
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === "invoices"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <FileText className="w-4 h-4" />
            Factures ({invoiceTotal || invoices.length})
          </button>
        </div>

        {/* TAB 1: CONTRACTS */}
        {activeTab === "contracts" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="relative min-w-64 flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-muted" />
                <input
                  type="text"
                  placeholder="Rechercher un contrat, client, dossier..."
                  value={contractSearch}
                  onChange={(e) => setContractSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-input bg-background"
                />
              </div>
              <button
                onClick={() => loadContracts()}
                className="p-2 border border-border rounded-button text-muted hover:text-foreground"
                title="Actualiser"
              >
                <RefreshCw
                  className={`w-4 h-4 ${contractLoading ? "animate-spin" : ""}`}
                />
              </button>
            </div>

            <div className="card p-0 overflow-hidden">
              <DataTable columns={CONTRACT_COLUMNS} data={filteredContracts} />
            </div>
          </div>
        )}

        {/* TAB 2: PAYMENTS */}
        {activeTab === "payments" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="relative min-w-64 flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-muted" />
                  <input
                    type="text"
                    placeholder="Rechercher par référence, client..."
                    value={paymentSearch}
                    onChange={(e) => {
                      setPaymentSearch(e.target.value);
                      setPaymentPage(1);
                    }}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-input bg-background"
                  />
                </div>
                <select
                  value={paymentStatus}
                  onChange={(e) => {
                    setPaymentStatus(e.target.value);
                    setPaymentPage(1);
                  }}
                  className="px-3 py-2 text-sm border border-border rounded-input bg-background"
                >
                  <option value="tous">Tous les statuts</option>
                  <option value="CONFIRMED">Encaissé</option>
                  <option value="PENDING">En attente</option>
                  <option value="REJECTED">Rejeté</option>
                </select>
              </div>
              <button
                onClick={() => loadPayments()}
                className="p-2 border border-border rounded-button text-muted hover:text-foreground"
                title="Actualiser"
              >
                <RefreshCw
                  className={`w-4 h-4 ${paymentLoading ? "animate-spin" : ""}`}
                />
              </button>
            </div>

            <div className="card p-0 overflow-hidden">
              <DataTable columns={PAYMENT_COLUMNS} data={payments} />
            </div>
          </div>
        )}

        {/* TAB 3: INVOICES */}
        {activeTab === "invoices" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="relative min-w-64 flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-muted" />
                  <input
                    type="text"
                    placeholder="Rechercher par numéro, client..."
                    value={invoiceSearch}
                    onChange={(e) => {
                      setInvoiceSearch(e.target.value);
                      setInvoicePage(1);
                    }}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-input bg-background"
                  />
                </div>
                <select
                  value={invoiceStatus}
                  onChange={(e) => {
                    setInvoiceStatus(e.target.value);
                    setInvoicePage(1);
                  }}
                  className="px-3 py-2 text-sm border border-border rounded-input bg-background"
                >
                  <option value="tous">Tous les statuts</option>
                  <option value="DRAFT">Brouillon</option>
                  <option value="ISSUED">Émise</option>
                  <option value="PAID">Soldée</option>
                  <option value="VOIDED">Annulée</option>
                </select>
              </div>
              <button
                onClick={() => loadInvoices()}
                className="p-2 border border-border rounded-button text-muted hover:text-foreground"
                title="Actualiser"
              >
                <RefreshCw
                  className={`w-4 h-4 ${invoiceLoading ? "animate-spin" : ""}`}
                />
              </button>
            </div>

            <div className="card p-0 overflow-hidden">
              <DataTable columns={INVOICE_COLUMNS} data={invoices} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
