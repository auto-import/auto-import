import { StatusBadge } from '@/components';
import { CONTRAT_STATUT_LABELS, CONTRAT_STATUT_VARIANTS } from '@/lib/constants';
import type { Dossier } from '@/types';
import { FileText, Download } from 'lucide-react';

interface TabClientProps {
  dossier: Dossier;
}

export default function DossierTabClient({ dossier }: TabClientProps) {
  const client = dossier.client;

  return (
    <div className="space-y-6">
      {/* Client information */}
      <div className="card">
        <h3 className="section-title">Informations client</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="field-label">Nom complet</p>
            <p className="field-value">
              {client ? `${client.prenom} ${client.nom}`.trim() : dossier.client_nom}
            </p>
          </div>
          <div>
            <p className="field-label">Téléphone</p>
            <p className="field-value">{client?.telephone ?? '—'}</p>
          </div>
          <div>
            <p className="field-label">Numéro de passeport</p>
            <p className="field-value">{client?.numero_passeport ?? '—'}</p>
          </div>
          <div>
            <p className="field-label">Statut du contrat</p>
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
        </div>
      </div>

      {/* Contract file */}
      {dossier.contrat_statut === 'signe' && (
        <div className="card">
          <h3 className="section-title">Fichier contrat</h3>
          <div className="flex items-center gap-4 p-4 border border-border rounded-card bg-surface">
            <div className="w-10 h-10 rounded-lg bg-status-gray-bg flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">contrat_{dossier.reference}.pdf</p>
              <p className="text-xs text-muted">PDF · 1.2 Mo · 10 Août 2026</p>
            </div>
            <button className="flex items-center gap-1.5 text-sm font-medium text-status-blue-text hover:underline shrink-0">
              <Download className="w-4 h-4" />
              Télécharger
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
