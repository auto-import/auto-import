'use client';

import { useRouter } from 'next/navigation';
import { Topbar, KPICard, StatusBadge, DataTable } from '@/components';
import { dossiers, vehicules, factures } from '@/lib/mockData';
import {
  DOSSIER_STATUT_LABELS,
  DOSSIER_STATUT_VARIANTS,
  DOSSIER_STATUTS,
  formatMontant,
  formatDate,
} from '@/lib/constants';
import type { Dossier, Column } from '@/types';
import {
  FolderOpen,
  Car,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';

// ─── Compute KPI data ────────────────────────────────────────────────

const totalDossiers = dossiers.length;
const vehiculesDisponibles = vehicules.filter((v) => v.statut === 'disponible').length;
const vehiculesReserves = vehicules.filter((v) => v.statut === 'reserve').length;
const totalVehiculesStock = vehiculesDisponibles + vehiculesReserves;
const facturesEnRetard = factures.filter((f) => f.statut === 'en_retard').length;
const caTotal = factures
  .filter((f) => f.statut === 'payee')
  .reduce((sum, f) => sum + f.montant_dzd, 0);

// ─── Chart data ──────────────────────────────────────────────────────

const dossiersByStatut = DOSSIER_STATUTS.map((statut) => ({
  name: DOSSIER_STATUT_LABELS[statut],
  count: dossiers.filter((d) => d.statut === statut).length,
}));

const revenueData = [
  { mois: 'Jan', montant: 0 },
  { mois: 'Fév', montant: 0 },
  { mois: 'Mar', montant: 0 },
  { mois: 'Avr', montant: 0 },
  { mois: 'Mai', montant: 2000000 },
  { mois: 'Jun', montant: 5800000 },
  { mois: 'Jul', montant: 3000000 },
  { mois: 'Aoû', montant: 4100000 },
];

// ─── Recent dossiers table ──────────────────────────────────────────

const recentDossiers = [...dossiers]
  .sort((a, b) => new Date(b.date_mise_a_jour).getTime() - new Date(a.date_mise_a_jour).getTime())
  .slice(0, 5);

const RECENT_COLUMNS: Column<Dossier>[] = [
  {
    key: 'reference',
    header: 'Référence',
    render: (row) => <span className="font-semibold">{row.reference}</span>,
  },
  {
    key: 'client_nom',
    header: 'Client',
  },
  {
    key: 'vehicule_desc',
    header: 'Véhicule',
    render: (row) => row.vehicule_desc ?? <span className="text-muted">—</span>,
  },
  {
    key: 'statut',
    header: 'Statut',
    render: (row) => (
      <StatusBadge
        variant={DOSSIER_STATUT_VARIANTS[row.statut]}
        label={DOSSIER_STATUT_LABELS[row.statut]}
        size="sm"
      />
    ),
  },
  {
    key: 'date_mise_a_jour',
    header: 'Dernière MAJ',
    render: (row) => formatDate(row.date_mise_a_jour),
  },
];

// ─── Alertes ─────────────────────────────────────────────────────────

const alertes = [
  ...factures
    .filter((f) => f.statut === 'en_retard')
    .map((f) => ({
      id: f.id,
      type: 'warning' as const,
      message: `Facture ${f.reference} en retard — ${formatMontant(f.montant_dzd)}`,
    })),
  ...dossiers
    .filter((d) => d.expedition && new Date(d.expedition.eta) <= new Date('2026-08-25'))
    .filter((d) => d.expedition?.statut === 'en_mer')
    .map((d) => ({
      id: d.id,
      type: 'info' as const,
      message: `${d.reference} — ETA ${formatDate(d.expedition!.eta)} (${d.vehicule_desc})`,
    })),
];

export default function DashboardPage() {
  const router = useRouter();

  return (
    <>
      <Topbar title="Dashboard" subtitle="Vue d'ensemble de l'activité" />
      <div className="p-8 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Total dossiers"
            value={totalDossiers}
            icon={<FolderOpen className="w-5 h-5" />}
          />
          <KPICard
            label="Véhicules en stock"
            value={totalVehiculesStock}
            subItems={[
              { label: 'Disponible', value: vehiculesDisponibles },
              { label: 'Réservé', value: vehiculesReserves },
            ]}
            icon={<Car className="w-5 h-5" />}
          />
          <KPICard
            label="CA encaissé"
            value={formatMontant(caTotal)}
            icon={<DollarSign className="w-5 h-5" />}
          />
          <KPICard
            label="Factures en retard"
            value={facturesEnRetard}
            icon={<AlertTriangle className="w-5 h-5" />}
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Dossiers par statut */}
          <div className="card">
            <h3 className="section-title">Dossiers par statut</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dossiersByStatut} margin={{ top: 8, right: 8, bottom: 24, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#737373' }}
                    angle={-30}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#737373' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e5e5',
                      fontSize: '13px',
                    }}
                  />
                  <Bar dataKey="count" fill="#171717" radius={[4, 4, 0, 0]} name="Dossiers" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Revenue mensuel */}
          <div className="card">
            <h3 className="section-title">Revenue mensuel (DA)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="mois" tick={{ fontSize: 11, fill: '#737373' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#737373' }}
                    tickFormatter={(v: number) => `${(v / 1000000).toFixed(1)}M`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e5e5',
                      fontSize: '13px',
                    }}
                    formatter={(value) => [formatMontant(Number(value)), 'Montant']}
                  />
                  <Line
                    type="monotone"
                    dataKey="montant"
                    stroke="#171717"
                    strokeWidth={2}
                    dot={{ fill: '#171717', r: 4 }}
                    name="Revenue"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Bottom row: recent dossiers + alertes */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent dossiers */}
          <div className="lg:col-span-2 card p-0 overflow-hidden">
            <div className="px-6 pt-5 pb-3">
              <h3 className="section-title mb-0">Dossiers récents</h3>
            </div>
            <DataTable
              columns={RECENT_COLUMNS}
              data={recentDossiers}
              onRowClick={(row) => router.push(`/dossiers/${row.id}`)}
            />
          </div>

          {/* Alertes */}
          <div className="card">
            <h3 className="section-title">Alertes</h3>
            {alertes.length === 0 ? (
              <p className="text-sm text-muted">Aucune alerte</p>
            ) : (
              <div className="space-y-3">
                {alertes.map((alerte) => (
                  <div
                    key={alerte.id}
                    className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
                      alerte.type === 'warning'
                        ? 'bg-status-red-bg text-status-red-text'
                        : 'bg-status-blue-bg text-status-blue-text'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{alerte.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
