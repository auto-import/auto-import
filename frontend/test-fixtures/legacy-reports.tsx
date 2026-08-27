'use client';

import { Topbar } from '@/components';
import { dossiers, vehicules, factures } from '@/lib/mockData';
import { DOSSIER_STATUT_LABELS, DOSSIER_STATUTS, formatMontant } from '@/lib/constants';
import { BarChart3, Download, TrendingUp, FolderOpen } from 'lucide-react';

// ─── Computed metrics ────────────────────────────────────────────────

const totalCA = factures.filter((f) => f.statut === 'payee').reduce((s, f) => s + f.montant_dzd, 0);
const totalFactures = factures.reduce((s, f) => s + f.montant_dzd, 0);
const tauxRecouvrement = totalFactures > 0 ? Math.round((totalCA / totalFactures) * 100) : 0;

const dossiersByStatut = DOSSIER_STATUTS.map((statut) => ({
  statut,
  label: DOSSIER_STATUT_LABELS[statut],
  count: dossiers.filter((d) => d.statut === statut).length,
}));

const vehiculesByStatut = [
  { label: 'Disponible', count: vehicules.filter((v) => v.statut === 'disponible').length },
  { label: 'Réservé', count: vehicules.filter((v) => v.statut === 'reserve').length },
  { label: 'En mer', count: vehicules.filter((v) => v.statut === 'en_mer').length },
  { label: 'En douane', count: vehicules.filter((v) => v.statut === 'en_douane').length },
  { label: 'Livré', count: vehicules.filter((v) => v.statut === 'livre').length },
  { label: 'Vendu', count: vehicules.filter((v) => v.statut === 'vendu').length },
];

export default function LegacyReportsPage() {
  return (
    <>
      <Topbar title="Rapports" subtitle="Rapports et analyses" />
      <div className="p-8 space-y-6">
        {/* Summary KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-status-green-bg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-status-green-text" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">CA encaissé</p>
                <p className="text-xl font-bold">{formatMontant(totalCA)}</p>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-status-blue-bg flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-status-blue-text" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Taux de recouvrement</p>
                <p className="text-xl font-bold">{tauxRecouvrement}%</p>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-status-amber-bg flex items-center justify-center">
                <FolderOpen className="w-5 h-5 text-status-amber-text" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Dossiers actifs</p>
                <p className="text-xl font-bold">{dossiers.filter((d) => d.statut !== 'cloture').length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Distribution tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title mb-0">Répartition des dossiers</h3>
              <button className="flex items-center gap-1.5 text-xs font-medium text-status-blue-text hover:underline">
                <Download className="w-3.5 h-3.5" />
                Exporter
              </button>
            </div>
            <div className="space-y-3">
              {dossiersByStatut.map((item) => (
                <div key={item.statut} className="flex items-center justify-between">
                  <span className="text-sm">{item.label}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 bg-surface rounded-full overflow-hidden">
                      <div
                        className="h-full bg-foreground rounded-full"
                        style={{ width: `${(item.count / dossiers.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold w-6 text-end">{item.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title mb-0">Répartition des véhicules</h3>
              <button className="flex items-center gap-1.5 text-xs font-medium text-status-blue-text hover:underline">
                <Download className="w-3.5 h-3.5" />
                Exporter
              </button>
            </div>
            <div className="space-y-3">
              {vehiculesByStatut.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-sm">{item.label}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 bg-surface rounded-full overflow-hidden">
                      <div
                        className="h-full bg-foreground rounded-full"
                        style={{ width: `${(item.count / vehicules.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold w-6 text-end">{item.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
