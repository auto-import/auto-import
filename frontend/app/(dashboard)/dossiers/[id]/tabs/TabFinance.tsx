import { DataTable, KPICard } from '@/components';
import {
  BASE_DEVISE,
  TYPE_COUT_LABELS,
  TYPE_PAIEMENT_CLIENT_LABELS,
  formatDate,
  formatMontantDevise,
  computeDossierFinance,
} from '@/lib/constants';
import type { Column, Cout, Dossier, PaiementClient } from '@/types';
import { getFournisseurById } from '@/lib/mockData';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

interface TabFinanceProps {
  dossier: Dossier;
}

const ENCAISSEMENT_COLUMNS: Column<PaiementClient>[] = [
  {
    key: 'type',
    header: 'Type',
    render: (row) => (
      <span className="font-medium">{TYPE_PAIEMENT_CLIENT_LABELS[row.type]}</span>
    ),
  },
  {
    key: 'montant',
    header: 'Montant',
    render: (row) => (
      <span className="font-semibold">
        {formatMontantDevise(row.montant, row.devise)}
      </span>
    ),
  },
  {
    key: 'date',
    header: 'Date',
    render: (row) => (row.date ? formatDate(row.date) : '—'),
  },
  {
    key: 'methode',
    header: 'Méthode',
  },
];

const COUT_COLUMNS: Column<Cout>[] = [
  {
    key: 'type',
    header: 'Type',
    render: (row) => <span className="font-medium">{TYPE_COUT_LABELS[row.type]}</span>,
  },
  {
    key: 'montant',
    header: 'Montant',
    render: (row) => (
      <span className="font-semibold">{formatMontantDevise(row.montant, row.devise)}</span>
    ),
  },
  {
    key: 'date',
    header: 'Date',
    render: (row) => (row.date ? formatDate(row.date) : '—'),
  },
  {
    key: 'fournisseur_id',
    header: 'Fournisseur',
    render: (row) => {
      if (!row.fournisseur_id) return '—';
      return getFournisseurById(row.fournisseur_id)?.nom ?? '—';
    },
  },
];

export default function DossierTabFinance({ dossier }: TabFinanceProps) {
  const finance = computeDossierFinance(dossier);

  return (
    <div className="space-y-6">
      {/* Résumé */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          label="Revenu (client)"
          value={formatMontantDevise(finance.revenu, BASE_DEVISE)}
          icon={<ArrowDownLeft className="w-4 h-4" />}
        />
        <KPICard
          label="Coût total"
          value={formatMontantDevise(finance.cout_total, BASE_DEVISE)}
          icon={<ArrowUpRight className="w-4 h-4" />}
        />
        <KPICard
          label="Marge"
          value={formatMontantDevise(finance.marge, BASE_DEVISE)}
          subItems={[{ label: 'Taux', value: `${finance.marge_pct}%` }]}
        />
      </div>

      {/* Encaisse (Money In) */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <h3 className="section-title mb-0">Paiements client ({dossier.paiements_client.length})</h3>
        </div>
        <DataTable
          columns={ENCAISSEMENT_COLUMNS}
          data={dossier.paiements_client}
          emptyMessage="Aucun paiement client enregistré"
        />
      </div>

      {/* Décaissé (Money Out) */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <h3 className="section-title mb-0">Coûts du dossier ({dossier.couts.length})</h3>
        </div>
        <DataTable
          columns={COUT_COLUMNS}
          data={dossier.couts}
          emptyMessage="Aucun coût enregistré"
        />
      </div>
    </div>
  );
}