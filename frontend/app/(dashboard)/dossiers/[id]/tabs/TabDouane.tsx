import { StatusBadge } from '@/components';
import { formatMontant, formatDate } from '@/lib/constants';
import type { Dossier } from '@/types';

interface TabDouaneProps {
  dossier: Dossier;
}

const DOUANE_STATUT_VARIANTS: Record<string, string> = {
  en_cours: 'blue',
  validee: 'green',
  en_attente: 'amber',
};

const DOUANE_STATUT_LABELS: Record<string, string> = {
  en_cours: 'En cours',
  validee: 'Validée',
  en_attente: 'En attente',
};

export default function DossierTabDouane({ dossier }: TabDouaneProps) {
  const douane = dossier.douane;

  if (!douane) {
    return (
      <div className="card">
        <h3 className="section-title">Déclaration en douane</h3>
        <p className="text-sm text-muted">Aucune déclaration en douane pour ce dossier.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Declaration info */}
      <div className="card">
        <h3 className="section-title">Déclaration en douane</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="field-label">Numéro de déclaration</p>
            <p className="field-value font-mono">{douane.numero_declaration}</p>
          </div>
          <div>
            <p className="field-label">Date de déclaration</p>
            <p className="field-value">{formatDate(douane.date_declaration)}</p>
          </div>
          <div>
            <p className="field-label">Bureau de douane</p>
            <p className="field-value">{douane.bureau_douane}</p>
          </div>
          <div>
            <p className="field-label">Statut</p>
            <div className="mt-1">
              <StatusBadge
                variant={DOUANE_STATUT_VARIANTS[douane.statut] ?? 'gray'}
                label={DOUANE_STATUT_LABELS[douane.statut] ?? douane.statut}
                size="sm"
              />
            </div>
          </div>
          {douane.date_dedouanement && (
            <div>
              <p className="field-label">Date de dédouanement</p>
              <p className="field-value">{formatDate(douane.date_dedouanement)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Frais */}
      <div className="card">
        <h3 className="section-title">Frais de douane</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="field-label">Valeur déclarée</p>
            <p className="field-value">{formatMontant(douane.valeur_declaree_dzd)}</p>
          </div>
          <div>
            <p className="field-label">Droits de douane</p>
            <p className="field-value">{formatMontant(douane.droits_douane_dzd)}</p>
          </div>
          <div>
            <p className="field-label">TVA</p>
            <p className="field-value">{formatMontant(douane.tva_dzd)}</p>
          </div>
          <div>
            <p className="field-label">Total frais</p>
            <p className="field-value text-lg font-bold">{formatMontant(douane.total_frais_dzd)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
