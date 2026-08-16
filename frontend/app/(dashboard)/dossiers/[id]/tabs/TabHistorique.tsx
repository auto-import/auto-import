import { formatDate } from '@/lib/constants';
import type { Dossier } from '@/types';
import { Clock, User } from 'lucide-react';

interface TabHistoriqueProps {
  dossier: Dossier;
}

export default function DossierTabHistorique({ dossier }: TabHistoriqueProps) {
  const historique = dossier.historique ?? [];

  if (historique.length === 0) {
    return (
      <div className="card">
        <h3 className="section-title">Historique</h3>
        <p className="text-sm text-muted">Aucun historique disponible.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="section-title">Historique</h3>
      <div className="space-y-0">
        {historique.map((entry, index) => (
          <div
            key={entry.id}
            className="flex gap-4 relative"
          >
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-foreground border-2 border-foreground mt-1.5 shrink-0 z-10" />
              {index < historique.length - 1 && (
                <div className="w-px flex-1 bg-border" />
              )}
            </div>

            {/* Content */}
            <div className="pb-6 flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{entry.action}</p>
              <p className="text-sm text-muted mt-0.5">{entry.details}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDate(entry.date)}
                </span>
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  {entry.utilisateur}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
