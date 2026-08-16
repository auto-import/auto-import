import { StatusBadge, DataTable, KPICard } from '@/components';
import { FACTURE_STATUT_LABELS, FACTURE_STATUT_VARIANTS, formatMontant, formatDate } from '@/lib/constants';
import type { Dossier, Facture, Column } from '@/types';

interface TabPaiementsProps {
  dossier: Dossier;
}

const FACTURE_COLUMNS: Column<Facture>[] = [
  {
    key: 'reference',
    header: 'Référence',
    render: (row) => <span className="font-medium">{row.reference}</span>,
  },
  {
    key: 'libelle',
    header: 'Libellé',
  },
  {
    key: 'montant_dzd',
    header: 'Montant',
    render: (row) => <span className="font-medium">{formatMontant(row.montant_dzd)}</span>,
  },
  {
    key: 'date',
    header: 'Date',
    render: (row) => formatDate(row.date),
  },
  {
    key: 'statut',
    header: 'Statut',
    render: (row) => (
      <StatusBadge
        variant={FACTURE_STATUT_VARIANTS[row.statut]}
        label={FACTURE_STATUT_LABELS[row.statut]}
        size="sm"
      />
    ),
  },
];

export default function DossierTabPaiements({ dossier }: TabPaiementsProps) {
  return (
    <div className="space-y-6">
      {/* KPI summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <KPICard
          label="Acompte reçu"
          value={formatMontant(dossier.acompte_recu_dzd ?? 0)}
        />
        <KPICard
          label="Solde restant"
          value={formatMontant(dossier.solde_restant_dzd ?? 0)}
        />
      </div>

      {/* Factures table */}
      <div className="card">
        <h3 className="section-title">Factures liées</h3>
        <DataTable
          columns={FACTURE_COLUMNS}
          data={dossier.factures ?? []}
          emptyMessage="Aucune facture liée à ce dossier"
        />
      </div>
    </div>
  );
}
