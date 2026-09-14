"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Topbar, StatusBadge, DataTable } from "@/components";
import { amountDzd, type FinanceDzdRate } from "@/lib/dossier-money";
import {
  financeEntryLabel,
  reverseFinanceTransaction,
  fetchOrganizationFinancialOverview,
  fetchSupplierPayments,
  confirmSupplierPayment,
  fetchCosts,
  createCost,
  fetchExchangeRates,
  fetchCurrentDzdRates,
  createExchangeRate,
  setExchangeRateActive,
  type OrganizationFinancialOverview,
  type ApiSupplierPayment,
  type ApiCost,
  type ApiExchangeRate,
  fetchFinanceTransactions,
  fetchTreasuryAccounts,
  createSupplierPayment,
  fetchPurchasesForPayment,
  type ApiPurchaseForPayment,
  type ApiFinanceTransaction,
  type ApiTreasuryAccount,
} from "@/lib/finance-api";
import { formatDate } from "@/lib/constants";
import { commerceApi, type ApiDossier } from "@/lib/commerce-api";
import TreasuryControls from "@/components/commerce/TreasuryControls";
import PaymentAccountDialog from "@/components/commerce/PaymentAccountDialog";
import { useAuth } from "@/components/AuthProvider";
import { Permission } from "@/lib/api-contract";
const formatMontant = (value: number) =>
  new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 2 }).format(value);
import type { Column } from "@/types";
import {
  TrendingUp,
  CreditCard,
  Plus,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  Landmark,
  CircleDollarSign,
  Layers,
  Search,
} from "lucide-react";

type FinanceTab =
  "overview" | "transactions" | "treasury" | "supplier" | "costs" | "rates";

export default function FinanceDashboardPage() {
  const { hasPermission } = useAuth();
  const [loadError, setLoadError] = useState("");
  const [confirmingPayment, setConfirmingPayment] = useState<{
    id: string;
    currency: string;
  } | null>(null);
  const [newRateType, setNewRateType] = useState("COMMERCIAL");
  const [newRateDate, setNewRateDate] = useState("");
  const [activeTab, setActiveTab] = useState<FinanceTab>("overview");
  const [overview, setOverview] =
    useState<OrganizationFinancialOverview | null>(null);

  // Transactions state
  const [transactions, setTransactions] = useState<ApiFinanceTransaction[]>([]);
  const [txSearch, setTxSearch] = useState("");
  const [txLoading, setTxLoading] = useState(false);

  // Treasury Accounts state
  const [treasuryAccounts, setTreasuryAccounts] = useState<
    ApiTreasuryAccount[]
  >([]);
  const [treasuryLoading, setTreasuryLoading] = useState(false);

  // Supplier payments
  const [supplierPayments, setSupplierPayments] = useState<
    ApiSupplierPayment[]
  >([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [purchases, setPurchases] = useState<ApiPurchaseForPayment[]>([]);

  // Costs
  const [costs, setCosts] = useState<ApiCost[]>([]);
  const [costLoading, setCostLoading] = useState(false);

  // Exchange rates
  const [exchangeRates, setExchangeRates] = useState<ApiExchangeRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const configuredCurrencies = ["USD", "CNY"];

  // Modals
  const [showCostModal, setShowCostModal] = useState(false);
  const [costDossiers, setCostDossiers] = useState<ApiDossier[]>([]);
  const [costDossierId, setCostDossierId] = useState("");
  const [costScope, setCostScope] = useState<"DIRECT" | "OPERATING">(
    "OPERATING",
  );
  useEffect(() => {
    if (showCostModal)
      commerceApi.dossiers
        .list({ limit: 100 })
        .then((r) => setCostDossiers(r.items))
        .catch((e) => setLoadError(e.message));
  }, [showCostModal]);
  const [newCostType, setNewCostType] = useState("RENT");
  const [newCostAmount, setNewCostAmount] = useState("");
  const [newCostCurrency, setNewCostCurrency] = useState("USD");
  const [activeCostRates, setActiveCostRates] = useState<FinanceDzdRate[]>([]);
  const [costRateError, setCostRateError] = useState("");
  const activeCostRate = activeCostRates.find(
    (rate) => rate.currency === newCostCurrency,
  );
  const costEquivalent = amountDzd(
    newCostAmount,
    activeCostRate?.exchangeRateUsed,
  );
  useEffect(() => {
    if (!showCostModal) return;
    let active = true;
    const refresh = () => {
      void fetchCurrentDzdRates()
        .then((result) => {
          if (active) {
            setActiveCostRates(result.rates);
            setCostRateError("");
          }
        })
        .catch((error) => {
          if (active) {
            setActiveCostRates([]);
            setCostRateError(
              error instanceof Error
                ? error.message
                : "Taux Finance indisponibles.",
            );
          }
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, [showCostModal]);
  const [newCostDesc, setNewCostDesc] = useState("");
  const [newCostTreasuryId, setNewCostTreasuryId] = useState("");

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierPurchaseId, setSupplierPurchaseId] = useState("");
  const [supplierPaymentKind, setSupplierPaymentKind] = useState<
    "DEPOSIT" | "COMPLEMENT" | "BALANCE"
  >("DEPOSIT");
  const [supplierAmount, setSupplierAmount] = useState("");
  const [supplierMethod, setSupplierMethod] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [supplierIdempotencyKey, setSupplierIdempotencyKey] = useState("");

  const [showRateModal, setShowRateModal] = useState(false);
  const quotationReferenceCurrency = "DZD";
  const [newRateCurrency, setNewRateCurrency] = useState("USD");
  const [newRateValue, setNewRateValue] = useState("");

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const reportLoadError = useCallback((cause: unknown) => {
    setLoadError(
      cause instanceof Error
        ? cause.message
        : "Chargement financier impossible",
    );
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      const data = await fetchOrganizationFinancialOverview();
      setOverview(data);
    } catch (cause) {
      reportLoadError(cause);
    }
  }, [reportLoadError]);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const res = await fetchFinanceTransactions();
      setTransactions(res || []);
    } catch (cause) {
      reportLoadError(cause);
    } finally {
      setTxLoading(false);
    }
  }, [reportLoadError]);

  const loadTreasury = useCallback(async () => {
    setTreasuryLoading(true);
    try {
      const res = await fetchTreasuryAccounts();
      setTreasuryAccounts(res || []);
    } catch (cause) {
      reportLoadError(cause);
    } finally {
      setTreasuryLoading(false);
    }
  }, [reportLoadError]);

  const loadSupplierPayments = useCallback(async () => {
    setSupplierLoading(true);
    try {
      const [res, purchasePage] = await Promise.all([
        fetchSupplierPayments({ page: 1, limit: 50 }),
        fetchPurchasesForPayment(),
      ]);
      setSupplierPayments(res.items || []);
      setPurchases(purchasePage.items || []);
    } catch (cause) {
      reportLoadError(cause);
    } finally {
      setSupplierLoading(false);
    }
  }, [reportLoadError]);

  const loadCosts = useCallback(async () => {
    setCostLoading(true);
    try {
      const res = await fetchCosts({ page: 1, limit: 50 });
      setCosts(res.items || []);
    } catch (cause) {
      reportLoadError(cause);
    } finally {
      setCostLoading(false);
    }
  }, [reportLoadError]);

  const loadRates = useCallback(async () => {
    setRatesLoading(true);
    try {
      const res = await fetchExchangeRates({ page: 1, limit: 50 });
      setExchangeRates(res.items || []);
    } catch (cause) {
      reportLoadError(cause);
    } finally {
      setRatesLoading(false);
    }
  }, [reportLoadError]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOverview();
      void loadTransactions();
      void loadTreasury();
      void loadSupplierPayments();
      void loadCosts();
      void loadRates();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    loadOverview,
    loadTransactions,
    loadTreasury,
    loadSupplierPayments,
    loadCosts,
    loadRates,
  ]);

  useEffect(() => {
    const refresh = () => {
      void loadOverview();
      void loadTransactions();
      void loadTreasury();
      void loadSupplierPayments();
      void loadCosts();
      void loadRates();
    };
    window.addEventListener("auto-import:notification", refresh);
    return () =>
      window.removeEventListener("auto-import:notification", refresh);
  }, [
    loadOverview,
    loadTransactions,
    loadTreasury,
    loadSupplierPayments,
    loadCosts,
    loadRates,
  ]);

  const handleConfirmSupplier = async (id: string) => {
    const payment = supplierPayments.find((p) => p.id === id);
    if (payment) setConfirmingPayment({ id, currency: payment.currency });
  };

  const handleCreateSupplierPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    const purchase = purchases.find((item) => item.id === supplierPurchaseId);
    if (!purchase || Number(supplierAmount) <= 0) return;
    setActionLoading("supplier-create");
    try {
      await createSupplierPayment({
        purchaseId: purchase.id,
        supplierId: purchase.supplierId,
        paymentKind: supplierPaymentKind,
        amount: Number(supplierAmount),
        currency: purchase.currency,
        paymentMethod: supplierMethod || undefined,
        reference: supplierReference || undefined,
        idempotencyKey: supplierIdempotencyKey,
      });
      setShowSupplierModal(false);
      setSupplierPurchaseId("");
      setSupplierAmount("");
      setSupplierReference("");
      await loadSupplierPayments();
    } catch (err) {
      alert(
        (err instanceof Error ? err.message : "") ||
          "Erreur lors de l’enregistrement du paiement fournisseur",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !newCostAmount ||
      Number(newCostAmount) <= 0 ||
      costEquivalent === null ||
      !activeCostRate
    )
      return;
    try {
      await createCost({
        type: newCostType,
        costScope,
        dossierId: costScope === "DIRECT" ? costDossierId : undefined,
        amount: Number(newCostAmount),
        currency: newCostCurrency,
        exchangeRateId: activeCostRate.exchangeRateId ?? undefined,
        description: newCostDesc,
        treasuryAccountId: newCostTreasuryId || undefined,
      });
      setShowCostModal(false);
      setNewCostAmount("");
      setNewCostDesc("");
      setNewCostTreasuryId("");
      await Promise.all([
        loadCosts(),
        loadOverview(),
        loadTreasury(),
        loadTransactions(),
      ]);
      await loadTreasury();
    } catch (err) {
      alert(
        (err instanceof Error ? err.message : "") ||
          "Erreur lors de la création du coût",
      );
    }
  };

  const handleCreateRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRateValue || Number(newRateValue) <= 0) return;
    try {
      await createExchangeRate({
        baseCurrency: newRateCurrency,
        quoteCurrency: quotationReferenceCurrency,
        rate: Number(newRateValue),
        rateType: newRateType,
        effectiveAt: newRateDate
          ? new Date(newRateDate).toISOString()
          : undefined,
      });
      setShowRateModal(false);
      setNewRateValue("");
      await loadRates();
    } catch (err) {
      alert(
        (err instanceof Error ? err.message : "") ||
          "Erreur lors de l’enregistrement du taux",
      );
    }
  };

  const handleSetRateActive = async (rate: ApiExchangeRate) => {
    setActionLoading(`rate-${rate.id}`);
    try {
      await setExchangeRateActive(rate.id, !rate.isActive);
      await loadRates();
    } catch (err) {
      alert(
        (err instanceof Error ? err.message : "") ||
          "Erreur lors de la mise à jour du taux",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    if (!txSearch) return true;
    const term = txSearch.toLowerCase();
    return (
      t.type?.toLowerCase().includes(term) ||
      t.sourceModule?.toLowerCase().includes(term) ||
      t.currency?.toLowerCase().includes(term)
    );
  });

  const TRANSACTION_COLUMNS: Column<ApiFinanceTransaction>[] = [
    {
      key: "origin",
      header: "Dossier / tiers",
      render: (row) => (
        <div>
          {row.dossier?.reference ?? "Société"}
          <p className="text-xs">
            {row.supplier?.name ??
              (row.client
                ? `${row.client.firstName} ${row.client.lastName}`
                : "—")}
          </p>
          {row.purchase?.vehicle && (
            <p>
              {row.purchase.vehicle.brand} {row.purchase.vehicle.model}
            </p>
          )}
          <p className="text-xs">{row.reference}</p>
        </div>
      ),
    },
    {
      key: "treasury",
      header: "Bureau / compte",
      render: (row) => (
        <div>
          {row.office?.name ?? "Non renseigné"}
          <p>{row.treasuryAccount?.name ?? "Sans mouvement de trésorerie"}</p>
        </div>
      ),
    },
    {
      key: "rate",
      header: "Taux figé",
      render: (row) => String(row.exchangeRateSnapshot),
    },
    {
      key: "reversal",
      header: "Correction",
      render: (row) =>
        row.status === "VALIDATED" &&
        !row.reversalOfId &&
        hasPermission(Permission.FINANCE_REVERSE) ? (
          <button
            className="underline"
            onClick={async () => {
              const reason = window.prompt("Motif de l’extourne");
              if (!reason?.trim()) return;
              try {
                await reverseFinanceTransaction(row.id, reason.trim());
                await Promise.all([
                  loadTransactions(),
                  loadOverview(),
                  loadTreasury(),
                  loadSupplierPayments(),
                  loadCosts(),
                ]);
              } catch (e) {
                reportLoadError(e);
              }
            }}
          >
            Extourner
          </button>
        ) : (
          <span>{row.reversalReason ?? "—"}</span>
        ),
    },
    {
      key: "type",
      header: "Type & Module Source",
      render: (row) => (
        <div>
          <span className="font-semibold text-foreground">
            {financeEntryLabel(row.type)}
          </span>
          <p className="text-xs text-muted">
            {financeEntryLabel(row.sourceModule)}
          </p>
        </div>
      ),
    },
    {
      key: "direction",
      header: "Sens",
      render: (row) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
            row.direction === "CREDIT"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {row.direction === "CREDIT" ? "+ CRÉDIT" : "− DÉBIT"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Montant Original",
      render: (row) => (
        <span
          className={`font-semibold ${
            row.direction === "CREDIT"
              ? "text-status-green-text"
              : "text-status-yellow-text"
          }`}
        >
          {row.direction === "CREDIT" ? "+" : "−"}
          {formatMontant(Number(row.originalAmount))} {row.currency}
        </span>
      ),
    },
    {
      key: "baseAmount",
      header: "Contre-valeur Base",
      render: (row) => (
        <span className="font-mono text-sm text-foreground">
          {formatMontant(Number(row.amountDzd || row.originalAmount))} DZD
        </span>
      ),
    },
    {
      key: "occurredAt",
      header: "Date d'écriture",
      render: (row) => formatDate(row.occurredAt),
    },
    {
      key: "status",
      header: "Statut",
      render: (row) => (
        <StatusBadge
          variant={row.status === "VALIDATED" ? "green" : "gray"}
          label={
            (
              {
                VALIDATED: "Validé",
                REVERSED: "Extourné",
                PENDING: "En attente",
                CANCELLED: "Annulé",
              } as Record<string, string>
            )[row.status] ?? row.status
          }
          size="sm"
        />
      ),
    },
  ];

  const TREASURY_COLUMNS: Column<ApiTreasuryAccount>[] = [
    {
      key: "office",
      header: "Bureau",
      render: (row) => row.office?.name ?? "À renseigner",
    },
    {
      key: "openingBalance",
      header: "Solde initial",
      render: (row) => formatMontant(Number(row.openingBalance ?? 0)),
    },
    {
      key: "inflows",
      header: "Entrées",
      render: (row) => formatMontant(Number(row.inflows ?? 0)),
    },
    {
      key: "outflows",
      header: "Sorties",
      render: (row) => formatMontant(Number(row.outflows ?? 0)),
    },
    {
      key: "code",
      header: "Code Compte",
      render: (row) => (
        <span className="font-mono font-bold text-foreground">{row.code}</span>
      ),
    },
    {
      key: "name",
      header: "Intitulé du Compte",
      render: (row) => (
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-muted" />
          <span className="font-medium">{row.name}</span>
        </div>
      ),
    },
    {
      key: "currency",
      header: "Devise",
      render: (row) => (
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-bold">
          {row.currency}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Solde Actuel",
      render: (row) => (
        <span className="text-base font-bold text-foreground">
          {formatMontant(Number(row.balance))} {row.currency}
        </span>
      ),
    },
    {
      key: "status",
      header: "Statut",
      render: (row) => (
        <StatusBadge
          variant={row.status === "ACTIVE" ? "green" : "gray"}
          label={row.status === "ACTIVE" ? "Actif" : row.status}
          size="sm"
        />
      ),
    },
  ];

  const SUPPLIER_COLUMNS: Column<ApiSupplierPayment>[] = [
    {
      key: "purchase",
      header: "Achat lié",
      render: (row) => (
        <span className="font-semibold text-foreground">
          {row.purchase?.purchaseNumber || "—"}
        </span>
      ),
    },
    {
      key: "supplier",
      header: "Fournisseur",
      render: (row) => (
        <div>
          <span className="font-medium text-foreground">
            {row.supplier?.name || "Fournisseur"}
          </span>
          {row.supplier?.country && (
            <p className="text-xs text-muted">{row.supplier.country}</p>
          )}
        </div>
      ),
    },
    {
      key: "paymentKind",
      header: "Échéance",
      render: (row) =>
        ({
          DEPOSIT: "Acompte",
          COMPLEMENT: "Complément",
          BALANCE: "Solde",
        })[row.paymentKind] ?? row.paymentKind,
    },
    {
      key: "amount",
      header: "Montant déboursé",
      render: (row) => (
        <span className="font-semibold text-status-yellow-text">
          {formatMontant(Number(row.amount))} {row.currency}
        </span>
      ),
    },
    {
      key: "purchaseRemaining",
      header: "Reste achat",
      render: (row) =>
        row.purchaseRemaining == null
          ? "—"
          : `${formatMontant(Number(row.purchaseRemaining))} ${row.currency}`,
    },
    {
      key: "paymentDate",
      header: "Date",
      render: (row) => formatDate(row.paymentDate || row.createdAt),
    },
    {
      key: "status",
      header: "Statut",
      render: (row) => (
        <StatusBadge
          variant={row.status === "CONFIRMED" ? "green" : "yellow"}
          label={row.status === "CONFIRMED" ? "Payé" : "En attente"}
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
              onClick={() => handleConfirmSupplier(row.id)}
              disabled={actionLoading === row.id}
              className="px-2.5 py-1 text-xs font-medium rounded-button bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Confirmer paiement
            </button>
          )}
        </div>
      ),
    },
  ];

  const COST_COLUMNS: Column<ApiCost>[] = [
    {
      key: "type",
      header: "Nature du coût",
      render: (row) => (
        <span className="font-semibold uppercase text-xs">
          {financeEntryLabel(row.type)}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      render: (row) => (
        <span className="text-sm">{row.description || "—"}</span>
      ),
    },
    {
      key: "amount",
      header: "Montant Original",
      render: (row) => (
        <span className="font-medium">
          {formatMontant(Number(row.amount))} {row.currency}
        </span>
      ),
    },
    {
      key: "amountInBaseCurrency",
      header: "Contre-valeur DZD",
      render: (row) => (
        <span className="font-semibold text-foreground">
          {formatMontant(Number(row.amountInBaseCurrency ?? row.amount))} DZD
        </span>
      ),
    },
    {
      key: "occurredAt",
      header: "Date",
      render: (row) => formatDate(row.occurredAt),
    },
    {
      key: "status",
      header: "Statut",
      render: (row) => (
        <StatusBadge
          variant={row.status === "POSTED" ? "green" : "gray"}
          label={
            (
              {
                VALIDATED: "Validé",
                REVERSED: "Extourné",
                PENDING: "En attente",
                CANCELLED: "Annulé",
              } as Record<string, string>
            )[row.status] ?? row.status
          }
          size="sm"
        />
      ),
    },
  ];

  const RATE_COLUMNS: Column<ApiExchangeRate>[] = [
    {
      key: "pair",
      header: "Paire",
      render: (row) => (
        <span className="font-bold text-foreground">
          1 {row.baseCurrency} = {Number(row.rate).toFixed(4)}{" "}
          {row.quoteCurrency}
        </span>
      ),
    },
    {
      key: "rate",
      header: "Taux direct",
      render: (row) => <span className="font-mono text-sm">{row.rate}</span>,
    },
    {
      key: "source",
      header: "Source",
      render: (row) => (
        <span className="text-xs uppercase text-muted">
          {row.source || "Banque Centrale"}
        </span>
      ),
    },
    {
      key: "effectiveAt",
      header: "Date d’effet",
      render: (row) => formatDate(row.effectiveAt),
    },
    {
      key: "isActive",
      header: "Utilisation",
      render: (row) => (
        <div className="flex items-center gap-2">
          <StatusBadge
            variant={row.isActive ? "green" : "gray"}
            label={row.isActive ? "Actif" : "Inactif"}
            size="sm"
          />
          <button
            type="button"
            disabled={actionLoading === `rate-${row.id}`}
            onClick={() => void handleSetRateActive(row)}
            className="rounded-button border border-border px-2 py-1 text-xs disabled:opacity-50"
          >
            {row.isActive ? "Désactiver" : "Activer"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Topbar
        title="Finance & Contrôle de Gestion"
        subtitle="Journal des écritures, trésorerie, rentabilité, débours et cours de change"
      />

      {confirmingPayment && (
        <PaymentAccountDialog
          currency={confirmingPayment.currency}
          onClose={() => setConfirmingPayment(null)}
          onConfirm={async (treasuryAccountId, rateType) => {
            await confirmSupplierPayment(confirmingPayment.id, {
              treasuryAccountId,
              rateType,
            });
            await Promise.all([
              loadSupplierPayments(),
              loadOverview(),
              loadTreasury(),
              loadTransactions(),
            ]);
          }}
        />
      )}
      <div className="p-8 space-y-6">
        {loadError && (
          <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {loadError}
            <button className="ml-3 underline" onClick={() => setLoadError("")}>
              Fermer
            </button>
          </div>
        )}
        {/* Metric Cards */}
        {overview && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5 border-l-4 border-l-status-green-text flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted uppercase">
                  Chiffre d’affaires encaissé
                </p>
                <p className="text-2xl font-bold text-status-green-text mt-1">
                  {formatMontant(Number(overview.totalCollected))}{" "}
                  {overview.baseCurrency}
                </p>
                <p className="text-xs text-muted mt-1">
                  Sur {overview.paymentCount} paiements
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-status-green-bg flex items-center justify-center text-status-green-text">
                <ArrowDownRight className="w-5 h-5" />
              </div>
            </div>

            <div className="card p-5 border-l-4 border-l-status-yellow-text flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted uppercase">
                  Total des Coûts & Débours
                </p>
                <p className="text-2xl font-bold text-status-yellow-text mt-1">
                  {formatMontant(Number(overview.totalCosts))}{" "}
                  {overview.baseCurrency}
                </p>
                <p className="text-xs text-muted mt-1">
                  Achats, fret, douane & logistique
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-status-yellow-bg flex items-center justify-center text-status-yellow-text">
                <ArrowUpRight className="w-5 h-5" />
              </div>
            </div>

            <div className="card p-5 border-l-4 border-l-primary flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted uppercase">
                  Marge Brute Consolidée
                </p>
                <p className="text-2xl font-bold text-primary mt-1">
                  {formatMontant(Number(overview.grossProfit))}{" "}
                  {overview.baseCurrency}
                </p>
                <p className="text-xs text-muted mt-1">
                  Revenus reconnus − coûts directs réels
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            <div className="card p-5 border-l-4 border-l-purple-500 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted uppercase">
                  Créances Ouvertes
                </p>
                <p className="text-2xl font-bold text-purple-600 mt-1">
                  {formatMontant(Number(overview.totalOutstanding))}{" "}
                  {overview.baseCurrency}
                </p>
                <p className="text-xs text-muted mt-1">
                  Soldes clients des contrats et échéanciers
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600">
                <CreditCard className="w-5 h-5" />
              </div>
            </div>
          </div>
        )}

        {overview && (
          <p className="text-sm text-muted">
            Marge estimée :{" "}
            {formatMontant(Number(overview.estimatedMargin ?? 0))} DZD · Coûts
            directs réels : {formatMontant(Number(overview.directCosts ?? 0))}{" "}
            DZD · Charges générales :{" "}
            {formatMontant(Number(overview.operatingCosts ?? 0))} DZD
          </p>
        )}
        {overview?.dataQuality?.warnings.map((warning) => (
          <p key={warning} role="status" className="text-sm text-amber-800">
            {warning}
          </p>
        ))}
        {/* Navigation Tabs (6 tabs) */}
        <div className="flex border-b border-border gap-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab("overview")}
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === "overview"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Vue d’ensemble & Synthèse
          </button>
          <button
            onClick={() => setActiveTab("transactions")}
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === "transactions"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <Layers className="w-4 h-4" />
            Journal des Écritures ({transactions.length})
          </button>
          <button
            onClick={() => setActiveTab("treasury")}
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === "treasury"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <Landmark className="w-4 h-4" />
            Comptes & Trésorerie ({treasuryAccounts.length})
          </button>
          <button
            onClick={() => setActiveTab("supplier")}
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === "supplier"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Règlements Fournisseurs ({supplierPayments.length})
          </button>
          <button
            onClick={() => setActiveTab("costs")}
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === "costs"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <Receipt className="w-4 h-4" />
            Charges & Débours ({costs.length})
          </button>
          <button
            onClick={() => setActiveTab("rates")}
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${
              activeTab === "rates"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <CircleDollarSign className="w-4 h-4" />
            Cours de Change ({exchangeRates.length})
          </button>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <section className="grid gap-5 lg:grid-cols-2">
              <div className="card p-5 space-y-3">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  Dernières écritures financières
                </h3>
                <p className="text-xs text-muted">
                  Mouvements source-liés; écritures validées uniquement
                  modifiables par extourne.
                </p>
                <div className="max-h-60 divide-y overflow-auto text-sm">
                  {transactions.slice(0, 10).map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex justify-between py-2.5"
                    >
                      <div>
                        <span className="font-semibold">
                          {financeEntryLabel(transaction.type)}
                        </span>
                        <p className="text-xs text-muted">
                          {transaction.sourceModule}
                        </p>
                      </div>
                      <b
                        className={
                          transaction.direction === "CREDIT"
                            ? "text-status-green-text"
                            : "text-status-yellow-text"
                        }
                      >
                        {transaction.direction === "CREDIT" ? "+" : "−"}
                        {formatMontant(Number(transaction.originalAmount))}{" "}
                        {transaction.currency}
                      </b>
                    </div>
                  ))}
                  {!transactions.length && (
                    <p className="text-sm text-muted py-4 text-center">
                      Aucune transaction enregistrée.
                    </p>
                  )}
                </div>
              </div>

              <div className="card p-5 space-y-3">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-primary" />
                  Soldes de Trésorerie
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 pt-2">
                  {treasuryAccounts.map((account) => (
                    <div key={account.id} className="rounded-card border p-3">
                      <p className="text-xs text-muted">
                        {account.code} · {account.name}
                      </p>
                      <p className="text-xl font-bold mt-1">
                        {formatMontant(Number(account.balance))}{" "}
                        {account.currency}
                      </p>
                    </div>
                  ))}
                  {!treasuryAccounts.length && (
                    <p className="text-sm text-muted py-4 text-center sm:col-span-2">
                      Aucun compte de trésorerie configuré.
                    </p>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: TRANSACTIONS */}
        {activeTab === "transactions" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="relative min-w-64 flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-muted" />
                <input
                  type="text"
                  placeholder="Filtrer les écritures par type, module, devise..."
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-input bg-background"
                />
              </div>
              <button
                onClick={() => loadTransactions()}
                className="p-2 border border-border rounded-button text-muted hover:text-foreground"
                title="Actualiser"
              >
                <RefreshCw
                  className={`w-4 h-4 ${txLoading ? "animate-spin" : ""}`}
                />
              </button>
            </div>

            <div className="card p-0 overflow-hidden">
              <DataTable
                columns={TRANSACTION_COLUMNS}
                data={filteredTransactions}
              />
            </div>
          </div>
        )}

        {/* TAB 3: TREASURY ACCOUNTS */}
        {activeTab === "treasury" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-foreground">
                Comptes Bancaires & Caisses de Trésorerie
              </h3>
              <button
                onClick={() => loadTreasury()}
                className="p-2 border border-border rounded-button text-muted hover:text-foreground"
                title="Actualiser"
              >
                <RefreshCw
                  className={`w-4 h-4 ${treasuryLoading ? "animate-spin" : ""}`}
                />
              </button>
            </div>

            <div className="card p-0 overflow-hidden">
              {hasPermission(Permission.TREASURY_WRITE) && (
                <div className="p-4">
                  <TreasuryControls
                    accounts={treasuryAccounts}
                    onSaved={async () => {
                      await Promise.all([
                        loadTreasury(),
                        loadTransactions(),
                        loadOverview(),
                      ]);
                    }}
                  />
                </div>
              )}
              <DataTable columns={TREASURY_COLUMNS} data={treasuryAccounts} />
            </div>
          </div>
        )}

        {/* TAB 4: SUPPLIER PAYMENTS */}
        {activeTab === "supplier" && (
          <div className="space-y-4">
            <div className="card overflow-x-auto p-4">
              <h3 className="mb-3 font-bold">
                Situation fournisseur par achat
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th>Achat / fournisseur</th>
                    <th>Total</th>
                    <th>Payé</th>
                    <th>Reste</th>
                    <th>Échéance</th>
                    <th>Compte</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td>
                        {p.purchaseNumber} · {p.supplier?.name}
                      </td>
                      <td>
                        {formatMontant(
                          Number(p.settlement?.total ?? p.purchasePrice),
                        )}{" "}
                        {p.currency}
                      </td>
                      <td>
                        {formatMontant(Number(p.settlement?.paid ?? 0))}{" "}
                        {p.currency}
                      </td>
                      <td>
                        {formatMontant(
                          Number(p.settlement?.remaining ?? p.purchasePrice),
                        )}{" "}
                        {p.currency}
                      </td>
                      <td>
                        {p.settlement?.dueDate
                          ? formatDate(p.settlement.dueDate)
                          : "Non renseignée"}
                      </td>
                      <td>
                        {p.settlement?.accounts.map((a) => a.name).join(", ") ||
                          "—"}
                      </td>
                      <td>
                        {
                          (
                            {
                              UNPAID: "Non payé",
                              PARTIALLY_PAID: "Partiellement payé",
                              PAID: "Payé",
                              OVERDUE: "En retard",
                              CANCELLED: "Annulé",
                            } as Record<string, string>
                          )[p.settlement?.status ?? "UNPAID"]
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-foreground">
                Règlements Fournisseurs & Achats Véhicules
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSupplierIdempotencyKey(crypto.randomUUID());
                    setShowSupplierModal(true);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-button bg-primary text-primary-foreground"
                >
                  <Plus className="h-4 w-4" />
                  Enregistrer un paiement
                </button>
                <button
                  onClick={() => loadSupplierPayments()}
                  className="p-2 border border-border rounded-button text-muted hover:text-foreground"
                  title="Actualiser"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${supplierLoading ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
            </div>

            <div className="card p-0 overflow-hidden">
              <DataTable columns={SUPPLIER_COLUMNS} data={supplierPayments} />
            </div>
          </div>
        )}

        {/* TAB 5: OPERATIONAL COSTS */}
        {activeTab === "costs" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-foreground">
                Charges d&apos;exploitation & Débours
              </h3>
              <button
                onClick={() => setShowCostModal(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-button bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" />
                Enregistrer une charge
              </button>
            </div>

            <div className="card p-0 overflow-hidden" aria-busy={costLoading}>
              <DataTable columns={COST_COLUMNS} data={costs} />
            </div>
          </div>
        )}

        {/* TAB 6: EXCHANGE RATES */}
        {activeTab === "rates" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-foreground">
                Table des cours de change historiques
              </h3>
              <button
                onClick={() => setShowRateModal(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-button bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" />
                Nouveau cours de change
              </button>
            </div>

            <div className="card p-0 overflow-hidden" aria-busy={ratesLoading}>
              <DataTable columns={RATE_COLUMNS} data={exchangeRates} />
            </div>
          </div>
        )}
      </div>

      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="card max-w-lg w-full p-6 space-y-4">
            <h3 className="font-bold text-lg text-foreground">
              Enregistrer un paiement fournisseur
            </h3>
            <form onSubmit={handleCreateSupplierPayment} className="space-y-4">
              <label className="block">
                <span className="block text-xs font-semibold text-muted uppercase mb-1">
                  Achat concerné
                </span>
                <select
                  required
                  value={supplierPurchaseId}
                  onChange={(event) => {
                    setSupplierPurchaseId(event.target.value);
                  }}
                  className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                >
                  <option value="">Sélectionner</option>
                  {purchases
                    .filter((purchase) => purchase.status !== "cancelled")
                    .map((purchase) => (
                      <option key={purchase.id} value={purchase.id}>
                        {purchase.purchaseNumber} · {purchase.supplier.name} ·{" "}
                        {formatMontant(Number(purchase.purchasePrice))}{" "}
                        {purchase.currency}
                      </option>
                    ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="block text-xs font-semibold text-muted uppercase mb-1">
                    Nature
                  </span>
                  <select
                    value={supplierPaymentKind}
                    onChange={(event) =>
                      setSupplierPaymentKind(
                        event.target.value as
                          "DEPOSIT" | "COMPLEMENT" | "BALANCE",
                      )
                    }
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                  >
                    <option value="DEPOSIT">Acompte</option>
                    <option value="COMPLEMENT">Complément</option>
                    <option value="BALANCE">Solde</option>
                  </select>
                </label>
                <label>
                  <span className="block text-xs font-semibold text-muted uppercase mb-1">
                    Montant
                  </span>
                  <input
                    required
                    min="0.01"
                    step="0.01"
                    type="number"
                    value={supplierAmount}
                    onChange={(event) => setSupplierAmount(event.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                  />
                </label>
                <label>
                  <span className="block text-xs font-semibold text-muted uppercase mb-1">
                    Moyen de paiement
                  </span>
                  <input
                    value={supplierMethod}
                    onChange={(event) => setSupplierMethod(event.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                  />
                </label>
                <label>
                  <span className="block text-xs font-semibold text-muted uppercase mb-1">
                    Référence
                  </span>
                  <input
                    value={supplierReference}
                    onChange={(event) =>
                      setSupplierReference(event.target.value)
                    }
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="px-4 py-2 text-sm border border-border rounded-button"
                >
                  Annuler
                </button>
                <button
                  disabled={actionLoading === "supplier-create"}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-button disabled:opacity-50"
                >
                  Enregistrer en attente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cost Modal */}
      {showCostModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg text-foreground">
              Enregistrer un coût opérationnel
            </h3>
            <form onSubmit={handleCreateCost} className="space-y-4">
              <label className="block">
                Affectation
                <select
                  className="w-full rounded border p-2"
                  value={costScope}
                  onChange={(e) => {
                    setCostScope(e.target.value as "DIRECT" | "OPERATING");
                    setNewCostType(
                      e.target.value === "DIRECT" ? "SHIPPING" : "RENT",
                    );
                  }}
                >
                  <option value="OPERATING">Charge générale société</option>
                  <option value="DIRECT">
                    Dossier spécifique / véhicule du dossier
                  </option>
                </select>
              </label>
              {costScope === "DIRECT" && (
                <label className="block">
                  Dossier
                  <select
                    required
                    className="w-full rounded border p-2"
                    value={costDossierId}
                    onChange={(e) => setCostDossierId(e.target.value)}
                  >
                    <option value="">Sélectionner un dossier</option>
                    {costDossiers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.reference} ·{" "}
                        {d.vehicles
                          ?.map((v) => `${v.brand} ${v.model}`)
                          .join(", ")}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">
                  Catégorie / Nature
                </label>
                <select
                  value={newCostType}
                  onChange={(e) => setNewCostType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                >
                  {costScope === "DIRECT" && (
                    <>
                      <option value="SHIPPING">Fret maritime</option>
                      <option value="INSURANCE">Assurance</option>
                      <option value="CUSTOMS">Douane</option>
                      <option value="TRANSIT">Transit</option>
                      <option value="PORT">Port</option>
                      <option value="LOCAL_TRANSPORT">Transport local</option>
                      <option value="INSPECTION">Inspection</option>
                    </>
                  )}
                  {costScope === "OPERATING" && (
                    <>
                      <option value="RENT">Loyer</option>
                      <option value="SALARY">Salaires</option>
                      <option value="ADVERTISING">Publicité</option>
                      <option value="GENERAL">Frais généraux</option>
                    </>
                  )}
                  <option value="OTHER">
                    {costScope === "DIRECT"
                      ? "Autres coûts directs"
                      : "Autre charge d’exploitation"}
                  </option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">
                    Montant
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={newCostAmount}
                    onChange={(e) => setNewCostAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">
                    Devise
                  </label>
                  <select
                    value={newCostCurrency}
                    onChange={(e) => setNewCostCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                  >
                    {["DZD", ...configuredCurrencies].map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">
                  Description / Réf.
                </label>
                <input
                  type="text"
                  value={newCostDesc}
                  onChange={(e) => setNewCostDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                  placeholder="Ex: Frais de manutention portuaire"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">
                  Compte de trésorerie
                </label>
                <select
                  value={newCostTreasuryId}
                  onChange={(event) => setNewCostTreasuryId(event.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                >
                  <option value="">Aucun mouvement de trésorerie</option>
                  {treasuryAccounts
                    .filter(
                      (account) =>
                        account.status === "ACTIVE" &&
                        account.currency === newCostCurrency,
                    )
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} · {account.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCostModal(false)}
                  className="px-4 py-2 text-sm font-medium border border-border rounded-button text-muted hover:text-foreground"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={costEquivalent === null || !activeCostRate}
                  className="px-4 py-2 text-sm font-medium rounded-button bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Enregistrer
                </button>
              </div>
              <div aria-live="polite" className="text-sm">
                <p>
                  Taux Finance utilisé :{" "}
                  {activeCostRate
                    ? `1 ${newCostCurrency} = ${activeCostRate.exchangeRateUsed} DZD`
                    : `Aucun taux ${newCostCurrency} → DZD actif n'est configuré dans Finance.`}
                </p>
                <p>
                  Équivalent :{" "}
                  {costEquivalent === null ? "—" : `${costEquivalent} DZD`}
                </p>
                {costRateError && <p role="alert">{costRateError}</p>}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Exchange Rate Modal */}
      {showRateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg text-foreground">
              Ajouter un cours de change
            </h3>
            <form onSubmit={handleCreateRate} className="space-y-4">
              <label className="block">
                Type de taux
                <select
                  className="w-full rounded border p-2"
                  value={newRateType}
                  onChange={(e) => setNewRateType(e.target.value)}
                >
                  <option value="COMMERCIAL">Commercial</option>
                  <option value="BANK">Banque</option>
                  <option value="INTERNAL">Interne</option>
                  <option value="MANUAL">Manuel</option>
                </select>
              </label>
              <label className="block">
                Date d’effet
                <input
                  type="datetime-local"
                  className="w-full rounded border p-2"
                  value={newRateDate}
                  onChange={(e) => setNewRateDate(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">
                    Devise étrangère
                  </label>
                  <select
                    value={newRateCurrency}
                    onChange={(e) => setNewRateCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                    required
                  >
                    <option value="USD">USD</option>
                    <option value="CNY">CNY</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">
                    Devise de référence
                  </label>
                  <input
                    type="text"
                    disabled
                    value="DZD"
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-muted/20 text-muted"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">
                  Taux direct (1 {newRateCurrency} = ? DZD)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={newRateValue}
                  onChange={(e) => setNewRateValue(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background font-mono"
                  placeholder="Ex: 135.50"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRateModal(false)}
                  className="px-4 py-2 text-sm font-medium border border-border rounded-button text-muted hover:text-foreground"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium rounded-button bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Enregistrer le cours
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
