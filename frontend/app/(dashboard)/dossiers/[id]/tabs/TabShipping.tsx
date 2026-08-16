import { StatusBadge, Stepper } from '@/components';
import { EXPEDITION_STATUT_LABELS, EXPEDITION_STATUT_VARIANTS, formatDate } from '@/lib/constants';
import type { Dossier } from '@/types';

interface TabShippingProps {
  dossier: Dossier;
}

export default function DossierTabShipping({ dossier }: TabShippingProps) {
  const expedition = dossier.expedition;

  if (!expedition) {
    return (
      <div className="card">
        <h3 className="section-title">Informations d&apos;expédition</h3>
        <p className="text-sm text-muted">Aucune expédition associée à ce dossier.</p>
      </div>
    );
  }

  // Shipping progression: 3-step mini stepper
  const shippingSteps = [expedition.port_depart.split(',')[0], 'En mer', expedition.port_arrivee.split(',')[0]];
  const shippingStepIndex =
    expedition.statut === 'planifiee' ? 0
    : expedition.statut === 'en_mer' ? 1
    : 2; // arrivee or dedouanee

  return (
    <div className="space-y-6">
      {/* Expedition info */}
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

      {/* Progression */}
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
    </div>
  );
}
