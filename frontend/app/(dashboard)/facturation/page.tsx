'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Topbar, StatusBadge, DataTable } from '@/components';
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
} from '@/lib/finance-api';
import { formatMontant, formatDate } from '@/lib/constants';
import type { Column } from '@/types';
import { Search, Plus, CheckCircle, AlertTriangle, XCircle, RefreshCw, DollarSign, FileText, ArrowDownRight } from 'lucide-react';

export default function FacturationPage() {
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments'>('invoices');
  const [overview, setOverview] = useState<OrganizationFinancialOverview | null>(null);

  // Invoices state
  const [invoices, setInvoices] = useState<ApiInvoice[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(true);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState<string>('tous');
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceTotal, setInvoiceTotal] = useState(0);

  // Payments state
  const [payments, setPayments] = useState<ApiPayment[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<string>('tous');
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

  // Load Invoices
  const loadInvoices = useCallback(async () => {
    setInvoiceLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchInvoices({
        page: invoicePage,
        limit: 15,
        search: invoiceSearch || undefined,
        status: invoiceStatus !== 'tous' ? invoiceStatus : undefined,
      });
      setInvoices(res.items || []);
      setInvoiceTotal(res.pagination?.totalItems || 0);
    } catch (err) {
      setErrorMsg((err instanceof Error ? err.message : '') || 'Erreur lors du chargement des factures');
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
        status: paymentStatus !== 'tous' ? paymentStatus : undefined,
      });
      setPayments(res.items || []);
      setPaymentTotal(res.pagination?.totalItems || 0);
    } catch (err) {
      setErrorMsg((err instanceof Error ? err.message : '') || 'Erreur lors du chargement des paiements');
    } finally {
      setPaymentLoading(false);
    }
  }, [paymentPage, paymentSearch, paymentStatus]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (activeTab === 'invoices') {
      loadInvoices();
    } else {
      loadPayments();
    }
  }, [activeTab, loadInvoices, loadPayments]);

  const handleIssueInvoice = async (id: string) => {
    setActionLoading(id);
    try {
      await issueInvoice(id);
      await loadInvoices();
      await loadOverview();
    } catch (err) {
      alert((err instanceof Error ? err.message : '') || 'Erreur lors de l’émission');
    } finally {
      setActionLoading(null);
    }
  };

  const handleVoidInvoice = async (id: string) => {
    const reason = prompt('Motif de l’annulation de la facture :');
    if (!reason) return;
    setActionLoading(id);
    try {
      await voidInvoice(id, reason);
      await loadInvoices();
      await loadOverview();
    } catch (err) {
      alert((err instanceof Error ? err.message : '') || 'Erreur lors de l’annulation');
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
      alert((err instanceof Error ? err.message : '') || 'Erreur lors de la confirmation');
    } finally {
      setActionLoading(null);
    }
  };

  const getInvoiceStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return <StatusBadge variant="green" label="Payée" size="sm" />;
      case 'PARTIALLY_PAID':
        return <StatusBadge variant="yellow" label="Partiellement payée" size="sm" />;
      case 'ISSUED':
        return <StatusBadge variant="blue" label="Émise" size="sm" />;
      case 'OVERDUE':
        return <StatusBadge variant="red" label="En retard" size="sm" />;
      case 'VOIDED':
        return <StatusBadge variant="gray" label="Annulée" size="sm" />;
      case 'DRAFT':
      default:
        return <StatusBadge variant="purple" label="Brouillon" size="sm" />;
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return <StatusBadge variant="green" label="Confirmé" size="sm" />;
      case 'REVERSED':
        return <StatusBadge variant="gray" label="Extourné" size="sm" />;
      case 'FAILED':
        return <StatusBadge variant="red" label="Échoué" size="sm" />;
      case 'PENDING':
      default:
        return <StatusBadge variant="yellow" label="En attente" size="sm" />;
    }
  };

  const INVOICE_COLUMNS: Column<ApiInvoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Numéro',
      render: (row) => <span className="font-semibold text-foreground">{row.invoiceNumber}</span>,
    },
    {
      key: 'client',
      header: 'Client',
      render: (row) => (
        <div>
          <span className="font-medium text-foreground">
            {row.client ? `${row.client.firstName} ${row.client.lastName}` : 'Client N/A'}
          </span>
          {row.client?.email && <p className="text-xs text-muted">{row.client.email}</p>}
        </div>
      ),
    },
    {
      key: 'dossier',
      header: 'Dossier',
      render: (row) => (
        <span className="text-status-blue-text font-mono text-xs">
          {row.dossier?.reference || '—'}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Montant TTC',
      render: (row) => (
        <div>
          <span className="font-semibold">{formatMontant(Number(row.total))} {row.currency}</span>
          {Number(row.paidAmount) > 0 && (
            <p className="text-xs text-status-green-text">Payé: {formatMontant(Number(row.paidAmount))}</p>
          )}
        </div>
      ),
    },
    {
      key: 'issueDate',
      header: 'Date d’émission',
      render: (row) => formatDate(row.issueDate || row.createdAt),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row) => getInvoiceStatusBadge(row.status),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.status === 'DRAFT' && (
            <button
              onClick={() => handleIssueInvoice(row.id)}
              disabled={actionLoading === row.id}
              className="px-2.5 py-1 text-xs font-medium rounded-button bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Émettre
            </button>
          )}
          {row.status !== 'VOIDED' && (
            <button
              onClick={() => handleVoidInvoice(row.id)}
              disabled={actionLoading === row.id}
              className="px-2 py-1 text-xs font-medium rounded-button border border-border text-muted hover:text-danger hover:border-danger disabled:opacity-50"
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
      key: 'reference',
      header: 'Référence / Date',
      render: (row) => (
        <div>
          <span className="font-semibold font-mono text-xs text-foreground">
            {row.reference || `PAY-${row.id.slice(0, 8)}`}
          </span>
          <p className="text-xs text-muted">{formatDate(row.paymentDate || row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Client',
      render: (row) => (
        <span className="font-medium text-foreground">
          {row.client ? `${row.client.firstName} ${row.client.lastName}` : 'Client N/A'}
        </span>
      ),
    },
    {
      key: 'dossier',
      header: 'Dossier',
      render: (row) => (
        <span className="text-status-blue-text font-mono text-xs">
          {row.dossier?.reference || '—'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Montant encaissé',
      render: (row) => (
        <div>
          <span className="font-semibold text-status-green-text">
            +{formatMontant(Number(row.amount))} {row.currency}
          </span>
          {Number(row.unallocatedAmount) > 0 && (
            <p className="text-xs text-muted">Acompte/Dispo: {formatMontant(Number(row.unallocatedAmount))}</p>
          )}
        </div>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Mode',
      render: (row) => <span className="text-xs uppercase font-medium">{row.paymentMethod || 'Virement'}</span>,
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row) => getPaymentStatusBadge(row.status),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.status === 'PENDING' && (
            <button
              onClick={() => handleConfirmPayment(row.id)}
              disabled={actionLoading === row.id}
              className="px-2.5 py-1 text-xs font-medium rounded-button bg-status-green-bg text-status-green-text hover:bg-status-green-bg/80 disabled:opacity-50"
            >
              Confirmer
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <Topbar
        title="Facturation & Trésorerie Client"
        subtitle="Gestion des factures émises, encaissements et réconciliation"
      />

      <div className="p-8 space-y-6">
        {/* KPI Cards Header */}
        {overview && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5 border-l-4 border-l-primary flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted uppercase">Total Facturé</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatMontant(Number(overview.totalInvoiced))} {overview.baseCurrency}
                </p>
                <p className="text-xs text-muted mt-1">{overview.invoiceCount} factures émises</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <FileText className="w-5 h-5" />
              </div>
            </div>

            <div className="card p-5 border-l-4 border-l-status-green-text flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted uppercase">Total Encaissé</p>
                <p className="text-2xl font-bold text-status-green-text mt-1">
                  {formatMontant(Number(overview.totalCollected))} {overview.baseCurrency}
                </p>
                <p className="text-xs text-muted mt-1">{overview.paymentCount} règlements validés</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-status-green-bg flex items-center justify-center text-status-green-text">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>

            <div className="card p-5 border-l-4 border-l-status-yellow-text flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted uppercase">En attente / Reste dû</p>
                <p className="text-2xl font-bold text-status-yellow-text mt-1">
                  {formatMontant(Number(overview.totalOutstanding))} {overview.baseCurrency}
                </p>
                <p className="text-xs text-muted mt-1">Créances clients</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-status-yellow-bg flex items-center justify-center text-status-yellow-text">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>

            <div className="card p-5 border-l-4 border-l-purple-500 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted uppercase">Marge brute globale</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatMontant(Number(overview.grossProfit))} {overview.baseCurrency}
                </p>
                <p className="text-xs text-muted mt-1">Revenus - Charges réelles</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex border-b border-border gap-6">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 ${
              activeTab === 'invoices'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            Factures clients ({invoiceTotal})
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`pb-3 font-semibold text-sm transition-colors border-b-2 ${
              activeTab === 'payments'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            Encaissements & Paiements ({paymentTotal})
          </button>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-input bg-danger/10 text-danger border border-danger/20 text-sm">
            {errorMsg}
          </div>
        )}

        {activeTab === 'invoices' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 flex-1">
                <div className="relative flex-1 min-w-[240px] max-w-md">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="text"
                    value={invoiceSearch}
                    onChange={(e) => {
                      setInvoiceSearch(e.target.value);
                      setInvoicePage(1);
                    }}
                    placeholder="Rechercher par numéro de facture, client..."
                    className="w-full ps-10 pe-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
                  />
                </div>

                <select
                  value={invoiceStatus}
                  onChange={(e) => {
                    setInvoiceStatus(e.target.value);
                    setInvoicePage(1);
                  }}
                  className="px-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
                >
                  <option value="tous">Tous les statuts</option>
                  <option value="DRAFT">Brouillon</option>
                  <option value="ISSUED">Émise</option>
                  <option value="PARTIALLY_PAID">Partiellement payée</option>
                  <option value="PAID">Payée</option>
                  <option value="OVERDUE">En retard</option>
                  <option value="VOIDED">Annulée</option>
                </select>
              </div>

              <button
                onClick={() => loadInvoices()}
                className="p-2.5 border border-border rounded-button hover:bg-accent text-muted hover:text-foreground"
                title="Actualiser"
              >
                <RefreshCw className={`w-4 h-4 ${invoiceLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="card p-0 overflow-hidden">
              <DataTable columns={INVOICE_COLUMNS} data={invoices} />
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
                    value={paymentSearch}
                    onChange={(e) => {
                      setPaymentSearch(e.target.value);
                      setPaymentPage(1);
                    }}
                    placeholder="Rechercher par référence, client..."
                    className="w-full ps-10 pe-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
                  />
                </div>

                <select
                  value={paymentStatus}
                  onChange={(e) => {
                    setPaymentStatus(e.target.value);
                    setPaymentPage(1);
                  }}
                  className="px-4 py-2.5 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
                >
                  <option value="tous">Tous les statuts</option>
                  <option value="PENDING">En attente</option>
                  <option value="CONFIRMED">Confirmé</option>
                  <option value="REVERSED">Extourné</option>
                </select>
              </div>

              <button
                onClick={() => loadPayments()}
                className="p-2.5 border border-border rounded-button hover:bg-accent text-muted hover:text-foreground"
                title="Actualiser"
              >
                <RefreshCw className={`w-4 h-4 ${paymentLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="card p-0 overflow-hidden">
              <DataTable columns={PAYMENT_COLUMNS} data={payments} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
