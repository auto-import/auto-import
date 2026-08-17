import { StatusBadge, Stepper } from '@/components';
import {
  EXPEDITION_STATUT_LABELS,
  EXPEDITION_STATUT_VARIANTS,
  formatDate,
  formatMontant,
} from '@/lib/constants';
import type { Dossier } from '@/types';

interface TabShippingProps {
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

export default function DossierTabShipping({ dossier }: TabShippingProps) {
  const expedition = dossier.expedition;
  const douane = dossier.douane;

  if (!expedition && !douane) {
    return (
      <div className="card">
        <h3 className="section-title">Shipping & douane</h3>
        <p className="text-sm text-muted">
          Aucune information shipping ou douane pour ce dossier.
        </p>
      </div>
    );
  }

  // Shipping progression: 3-step mini stepper
  const shippingSteps = expedition
    ? [
        expedition.port_depart.split(',')[0],
        'En mer',
        expedition.port_arrivee.split(',')[0],
      ]
    : ['Port départ', 'En mer', 'Port arrivée'];
  const shippingStepIndex = expedition
    ? expedition.statut === 'planifiee'
      ? 0
      : expedition.statut === 'en_mer'
        ? 1
        : 2
    : 0;

  return (
    <div className="space-y-6">
      {/* Expedition info */}
      {expedition && (
        <div className="card">
          <h3 className="section-title">Informations d&apos;expédition</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="field-label">Numéro de conteneur</p>
              <p className="field-value font-mono">{expedition.numero_conteneur}</p>
            </div>
            <div>
              <p className="field-label">Navire</p>
              <p className="field-value">{expedition.navire}</p>
            </div>
            <div>
              <p className="field-label">Numéro B/L</p>
              <p className="field-value font-mono">{expedition.numero_bl}</p>
            </div>
            <div>
              <p className="field-label">Port de départ</p>
              <p className="field-value">{expedition.port_depart}</p>
            </div>
            <div>
              <p className="field-label">Port d&apos;arrivée</p>
              <p className="field-value">{expedition.port_arrivee}</p>
            </div>
            <div>
              <p className="field-label">Statut</p>
              <div className="mt-1">
                <StatusBadge
                  variant={EXPEDITION_STATUT_VARIANTS[expedition.statut]}
                  label={EXPEDITION_STATUT_LABELS[expedition.statut]}
                  size="sm"
                />
              </div>
            </div>
            <div>
              <p className="field-label">ETD (départ)</p>
              <p className="field-value">{formatDate(expedition.etd)}</p>
            </div>
            <div>
              <p className="field-label">ETA (arrivée)</p>
              <p className="field-value">{formatDate(expedition.eta)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Progression */}
      {expedition && (
        <div className="card">
          <h3 className="section-title">Progression</h3>
          <div className="max-w-md mx-auto">
            <Stepper steps={shippingSteps} currentIndex={shippingStepIndex} />
            <div className="flex justify-between text-xs text-muted mt-1 px-2">
              <span>{formatDate(expedition.etd)}</span>
              <span>En cours</span>
              <span>ETA {formatDate(expedition.eta)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Douane (DDP) */}
      {douane && (
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
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-border pt-5">
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
      )}
    </div>
  );
}