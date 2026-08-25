'use client';

import { useState, useEffect, useCallback } from 'react';
import { Topbar, StatusBadge, DataTable } from '@/components';
import {
  fetchOrganizationFinancialOverview,
  fetchSupplierPayments,
  confirmSupplierPayment,
  fetchCosts,
  createCost,
  fetchExchangeRates,
  createExchangeRate,
  type OrganizationFinancialOverview,
  type ApiSupplierPayment,
  type ApiCost,
  type ApiExchangeRate,
} from '@/lib/finance-api';
import { formatMontant, formatDate } from '@/lib/constants';
import type { Column } from '@/types';
import {
  DollarSign,
  TrendingUp,
  FileCheck,
  CreditCard,
  Plus,
  RefreshCw,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Sliders,
} from 'lucide-react';

export default function FinanceDashboardPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'supplier' | 'costs' | 'rates'>('overview');
  const [overview, setOverview] = useState<OrganizationFinancialOverview | null>(null);

  // Supplier payments
  const [supplierPayments, setSupplierPayments] = useState<ApiSupplierPayment[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);

  // Costs
  const [costs, setCosts] = useState<ApiCost[]>([]);
  const [costsLoading, setCostsLoading] = useState(false);

  // Exchange rates
  const [exchangeRates, setExchangeRates] = useState<ApiExchangeRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);

  // New Cost Form Modal state
  const [showCostModal, setShowCostModal] = useState(false);
  const [newCostType, setNewCostType] = useState('SHIPPING');
  const [newCostAmount, setNewCostAmount] = useState('');
  const [newCostCurrency, setNewCostCurrency] = useState('DZD');
  const [newCostDesc, setNewCostDesc] = useState('');

  // New Exchange Rate Modal state
  const [showRateModal, setShowRateModal] = useState(false);
  const [newRateBase, setNewRateBase] = useState('DZD');
  const [newRateQuote, setNewRateQuote] = useState('USD');
  const [newRateValue, setNewRateValue] = useState('');

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const data = await fetchOrganizationFinancialOverview();
      setOverview(data);
    } catch {
      // ignore
    }
  }, []);

  const loadSupplierPayments = useCallback(async () => {
    setSupplierLoading(true);
    try {
      const res = await fetchSupplierPayments({ page: 1, limit: 20 });
      setSupplierPayments(res.items || []);
    } catch {
      // ignore
    } finally {
      setSupplierLoading(false);
    }
  }, []);

  const loadCosts = useCallback(async () => {
    setCostsLoading(true);
    try {
      const res = await fetchCosts({ page: 1, limit: 20 });
      setCosts(res.items || []);
    } catch {
      // ignore
    } finally {
      setCostsLoading(false);
    }
  }, []);

  const loadRates = useCallback(async () => {
    setRatesLoading(true);
    try {
      const res = await fetchExchangeRates({ page: 1, limit: 20 });
      setExchangeRates(res.items || []);
    } catch {
      // ignore
    } finally {
      setRatesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    loadSupplierPayments();
    loadCosts();
    loadRates();
  }, [loadOverview, loadSupplierPayments, loadCosts, loadRates]);

  const handleConfirmSupplier = async (id: string) => {
    setActionLoading(id);
    try {
      await confirmSupplierPayment(id);
      await loadSupplierPayments();
      await loadOverview();
    } catch (err) {
      alert((err instanceof Error ? err.message : '') || 'Erreur lors de la confirmation du paiement fournisseur');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCostAmount || Number(newCostAmount) <= 0) return;
    try {
      await createCost({
        type: newCostType,
        amount: Number(newCostAmount),
        currency: newCostCurrency,
        description: newCostDesc,
      });
      setShowCostModal(false);
      setNewCostAmount('');
      setNewCostDesc('');
      await loadCosts();
      await loadOverview();
    } catch (err) {
      alert((err instanceof Error ? err.message : '') || 'Erreur lors de la création du coût');
    }
  };

  const handleCreateRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRateValue || Number(newRateValue) <= 0) return;
    try {
      await createExchangeRate({
        baseCurrency: newRateBase,
        quoteCurrency: newRateQuote,
        rate: Number(newRateValue),
      });
      setShowRateModal(false);
      setNewRateValue('');
      await loadRates();
    } catch (err) {
      alert((err instanceof Error ? err.message : '') || 'Erreur lors de l’enregistrement du taux');
    }
  };

  const SUPPLIER_COLUMNS: Column<ApiSupplierPayment>[] = [
    {
      key: 'purchase',
      header: 'Achat lié',
      render: (row) => (
        <span className="font-semibold text-foreground">{row.purchase?.purchaseNumber || '—'}</span>
      ),
    },
    {
      key: 'supplier',
      header: 'Fournisseur',
      render: (row) => (
        <div>
          <span className="font-medium text-foreground">{row.supplier?.name || 'Fournisseur'}</span>
          {row.supplier?.country && <p className="text-xs text-muted">{row.supplier.country}</p>}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Montant déboursé',
      render: (row) => (
        <span className="font-semibold text-status-yellow-text">
          {formatMontant(Number(row.amount))} {row.currency}
        </span>
      ),
    },
    {
      key: 'paymentDate',
      header: 'Date',
      render: (row) => formatDate(row.paymentDate || row.createdAt),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row) => (
        <StatusBadge
          variant={row.status === 'CONFIRMED' ? 'green' : 'yellow'}
          label={row.status === 'CONFIRMED' ? 'Payé' : 'En attente'}
          size="sm"
        />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div>
          {row.status === 'PENDING' && (
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
      key: 'type',
      header: 'Nature du coût',
      render: (row) => <span className="font-semibold uppercase text-xs">{row.type}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      render: (row) => <span className="text-sm">{row.description || '—'}</span>,
    },
    {
      key: 'amount',
      header: 'Montant Original',
      render: (row) => (
        <span className="font-medium">
          {formatMontant(Number(row.amount))} {row.currency}
        </span>
      ),
    },
    {
      key: 'amountInBaseCurrency',
      header: 'Contre-valeur DZD',
      render: (row) => (
        <span className="font-semibold text-foreground">
          {formatMontant(Number(row.amountInBaseCurrency || row.amount))} DZD
        </span>
      ),
    },
    {
      key: 'occurredAt',
      header: 'Date',
      render: (row) => formatDate(row.occurredAt),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row) => (
        <StatusBadge
          variant={row.status === 'POSTED' ? 'green' : 'gray'}
          label={row.status === 'POSTED' ? 'Comptabilisé' : 'Extourné'}
          size="sm"
        />
      ),
    },
  ];

  const RATE_COLUMNS: Column<ApiExchangeRate>[] = [
    {
      key: 'pair',
      header: 'Paire',
      render: (row) => (
        <span className="font-bold text-foreground">
          1 {row.quoteCurrency} = {Number(row.rate).toFixed(4)} {row.baseCurrency}
        </span>
      ),
    },
    {
      key: 'rate',
      header: 'Taux direct (Decimal)',
      render: (row) => <span className="font-mono text-sm">{row.rate}</span>,
    },
    {
      key: 'source',
      header: 'Source',
      render: (row) => <span className="text-xs uppercase text-muted">{row.source || 'Banque'}</span>,
    },
    {
      key: 'effectiveAt',
      header: 'Date d’effet',
      render: (row) => formatDate(row.effectiveAt),
    },
  ];

  return (
    <>
      <Topbar
        title="Finance & Rentabilité Opérationnelle"
        subtitle="Contrôle de gestion, règlements fournisseurs, charges et cours de change"
      />

      <div className="p-8 space-y-6">
        {/* Metric Cards */}
        {overview && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5 border-l-4 border-l-status-green-text flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted uppercase">Chiffre d’affaires encaissé</p>
                <p className="text-2xl font-bold text-status-green-text mt-1">
                  {formatMontant(Number(overview.totalCollected))} {overview.baseCurrency}
                </p>
                <p className="text-xs text-muted mt-1">Sur {overview.paymentCount} paiements</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-status-green-bg flex items-center justify-center text-status-green-text">
                <ArrowDownRight className="w-5 h-5" />
              </div>
            </div>

            <div className="card p-5 border-l-4 border-l-status-yellow-text flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted uppercase">Total des Coûts & Débours</p>
                <p className="text-2xl font-bold text-status-yellow-text mt-1">
                  {formatMontant(Number(overview.totalCosts))} {overview.baseCurrency}
                </p>
                <p className="text-xs text-muted mt-1">Achats, transit, douane & fret</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-status-yellow-bg flex items-center justify-center text-status-yellow-text">
                <ArrowUpRight className="w-5 h-5" />
              </div>
            </div>

            <div className="card p-5 border-l-4 border-l-primary flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted uppercase">Marge Brute Consolidée</p>
                <p className="text-2xl font-bold text-primary mt-1">
                  {formatMontant(Number(overview.grossProfit))} {overview.baseCurrency}
                </p>
                <p className="text-xs text-muted mt-1">Bénéfice opérationnel brut</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            <div className="card p-5 border-l-4 border-l-purple-500 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted uppercase">Créances à percevoir</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatMontant(Number(overview.totalOutstanding))} {overview.baseCurrency}
                </p>
                <p className="text-xs text-muted mt-1">Factures en attente de solde</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600">
                <CreditCard className="w-5 h-5" />
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-border gap-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 ${
              activeTab === 'overview'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            Vue d’ensemble & Coûts
          </button>
          <button
            onClick={() => setActiveTab('supplier')}
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 ${
              activeTab === 'supplier'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            Paiements Fournisseurs ({supplierPayments.length})
          </button>
          <button
            onClick={() => setActiveTab('rates')}
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 ${
              activeTab === 'rates'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            Taux de Change & Devises ({exchangeRates.length})
          </button>
        </div>

        {/* Tab 1: Overview & Operational Costs */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-foreground">Dépenses & Coûts d’exploitation enregistrés</h3>
              <button
                onClick={() => setShowCostModal(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-button bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" />
                Enregistrer une charge / coût
              </button>
            </div>

            <div className="card p-0 overflow-hidden">
              <DataTable columns={COST_COLUMNS} data={costs} />
            </div>
          </div>
        )}

        {/* Tab 2: Supplier Payments */}
        {activeTab === 'supplier' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-foreground">Règlements Fournisseurs & Achats Véhicules</h3>
              <button
                onClick={() => loadSupplierPayments()}
                className="p-2 border border-border rounded-button text-muted hover:text-foreground"
                title="Actualiser"
              >
                <RefreshCw className={`w-4 h-4 ${supplierLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="card p-0 overflow-hidden">
              <DataTable columns={SUPPLIER_COLUMNS} data={supplierPayments} />
            </div>
          </div>
        )}

        {/* Tab 3: Exchange Rates */}
        {activeTab === 'rates' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-foreground">Table des cours de change historiques</h3>
              <button
                onClick={() => setShowRateModal(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-button bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" />
                Nouveau cours de change
              </button>
            </div>

            <div className="card p-0 overflow-hidden">
              <DataTable columns={RATE_COLUMNS} data={exchangeRates} />
            </div>
          </div>
        )}
      </div>

      {/* Cost Modal */}
      {showCostModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg text-foreground">Enregistrer un coût opérationnel</h3>
            <form onSubmit={handleCreateCost} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">Catégorie / Nature</label>
                <select
                  value={newCostType}
                  onChange={(e) => setNewCostType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                >
                  <option value="SHIPPING">Fret maritime / Transport</option>
                  <option value="CUSTOMS">Droits & Frais de Douane</option>
                  <option value="INSURANCE">Assurance</option>
                  <option value="STORAGE">Frais d’entreposage / Port</option>
                  <option value="SUPPLIER">Paiement / Acompte Fournisseur</option>
                  <option value="OTHER">Autre charge</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">Montant</label>
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
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">Devise</label>
                  <select
                    value={newCostCurrency}
                    onChange={(e) => setNewCostCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                  >
                    <option value="DZD">DZD</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="CNY">CNY</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">Description / Réf.</label>
                <input
                  type="text"
                  value={newCostDesc}
                  onChange={(e) => setNewCostDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                  placeholder="Ex: Frais de manutention portuaire"
                />
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
                  className="px-4 py-2 text-sm font-medium rounded-button bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Exchange Rate Modal */}
      {showRateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg text-foreground">Ajouter un cours de change</h3>
            <form onSubmit={handleCreateRate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">Devise de Cotation</label>
                  <select
                    value={newRateQuote}
                    onChange={(e) => setNewRateQuote(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="CNY">CNY (¥)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase mb-1">Devise de Base</label>
                  <input
                    type="text"
                    disabled
                    value="DZD"
                    className="w-full px-3 py-2 text-sm border border-border rounded-input bg-muted/20 text-muted"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">Taux (1 {newRateQuote} = ? DZD)</label>
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
