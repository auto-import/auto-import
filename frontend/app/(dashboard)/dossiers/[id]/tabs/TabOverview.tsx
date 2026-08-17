import { KPICard, StatusBadge } from '@/components';
import {
  BASE_DEVISE,
  CONTRAT_STATUT_LABELS,
  CONTRAT_STATUT_VARIANTS,
  DOSSIER_STATUT_LABELS,
  DOSSIER_STATUT_VARIANTS,
  DOSSIER_TYPE_LABELS,
  DOSSIER_TYPE_VARIANTS,
  formatDate,
  formatMontantDevise,
  formatOffrePrix,
  computeDossierFinance,
} from '@/lib/constants';
import { getOffreById, getUtilisateurById } from '@/lib/mockData';
import type { Dossier } from '@/types';
import { AlertTriangle, CalendarDays } from 'lucide-react';

interface TabOverviewProps {
  dossier: Dossier;
}

export default function DossierTabOverview({ dossier }: TabOverviewProps) {
  const finance = computeDossierFinance(dossier);
  const responsableChine = dossier.responsable_chine_id
    ? getUtilisateurById(dossier.responsable_chine_id)
    : undefined;
  const responsableAlgerie = dossier.responsable_algerie_id
    ? getUtilisateurById(dossier.responsable_algerie_id)
    : undefined;
  const offre = dossier.offre_id ? getOffreById(dossier.offre_id) : undefined;

  const documentsManquants = dossier.documents.filter((d) => d.statut === 'manquant').length;
  const tachesOuvertes = dossier.taches.filter((t) => t.statut !== 'terminee').length;

  const alerts: { label: string; variant: string }[] = [];
  if (documentsManquants > 0) {
    alerts.push({
      label: `${documentsManquants} document(s) manquant(s)`,
      variant: 'red',
    });
  }
  if (tachesOuvertes > 0) {
    alerts.push({
      label: `${tachesOuvertes} tâche(s) en cours`,
      variant: 'amber',
    });
  }

  return (
    <div className="space-y-6">
      {/* Informations clés */}
      <div className="card">
        <h3 className="section-title">Informations clés</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="field-label">Type de dossier</p>
            <div className="mt-1">
              <StatusBadge
                variant={DOSSIER_TYPE_VARIANTS[dossier.type]}
                label={DOSSIER_TYPE_LABELS[dossier.type]}
                size="sm"
              />
            </div>
          </div>
          <div>
            <p className="field-label">Statut</p>
            <div className="mt-1">
              <StatusBadge
                variant={DOSSIER_STATUT_VARIANTS[dossier.statut]}
                label={DOSSIER_STATUT_LABELS[dossier.statut]}
                size="sm"
              />
            </div>
          </div>
          <div>
            <p className="field-label">Contrat</p>
            <div className="mt-1">
              {dossier.contrat_statut ? (
                <StatusBadge
                  variant={CONTRAT_STATUT_VARIANTS[dossier.contrat_statut]}
                  label={CONTRAT_STATUT_LABELS[dossier.contrat_statut]}
                  size="sm"
                />
              ) : (
                <span className="text-sm text-muted">—</span>
              )}
            </div>
          </div>
          <div>
            <p className="field-label">Responsable Chine</p>
            <p className="field-value">
              {responsableChine
                ? `${responsableChine.prenom} ${responsableChine.nom}`
                : '—'}
            </p>
          </div>
          <div>
            <p className="field-label">Responsable Algérie</p>
            <p className="field-value">
              {responsableAlgerie
                ? `${responsableAlgerie.prenom} ${responsableAlgerie.nom}`
                : '—'}
            </p>
          </div>
          <div>
            <p className="field-label">Date de création</p>
            <p className="field-value flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-muted" />
              {formatDate(dossier.date_creation)}
            </p>
          </div>
          <div>
            <p className="field-label">Fournisseur</p>
            <p className="field-value">{dossier.fournisseur_nom ?? '—'}</p>
          </div>
          <div>
            <p className="field-label">Offre sélectionnée</p>
            {offre ? (
              <div>
                <p className="field-value">
                  {offre.marque} {offre.modele} {offre.annee}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  CIF {formatOffrePrix(offre.prix_cif, offre.devise)} · DDP{' '}
                  {formatOffrePrix(offre.prix_ddp, offre.devise)}
                </p>
              </div>
            ) : (
              <p className="field-value">—</p>
            )}
          </div>
          <div>
            <p className="field-label">Véhicules</p>
            <p className="field-value">{dossier.vehicles.length}</p>
          </div>
        </div>
      </div>

      {/* Résumé financier */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          label="Revenu (client)"
          value={formatMontantDevise(finance.revenu, BASE_DEVISE)}
        />
        <KPICard
          label="Coût total"
          value={formatMontantDevise(finance.cout_total, BASE_DEVISE)}
        />
        <KPICard
          label="Marge"
          value={formatMontantDevise(finance.marge, BASE_DEVISE)}
          subItems={[{ label: 'Marge', value: `${finance.marge_pct}%` }]}
        />
      </div>

      {/* Alertes */}
      <div className="card">
        <h3 className="section-title">Alertes</h3>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted">Aucune alerte sur ce dossier.</p>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.label}
                className="flex items-center gap-2.5 p-3 rounded-card border border-border bg-surface"
              >
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-sm font-medium">{alert.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}