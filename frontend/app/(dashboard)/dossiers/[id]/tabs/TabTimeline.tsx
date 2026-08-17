import { StatusBadge } from '@/components';
import {
  TIMELINE_TYPE_LABELS,
  TIMELINE_TYPE_VARIANTS,
  formatDate,
} from '@/lib/constants';
import type { Dossier } from '@/types';
import { Clock, User } from 'lucide-react';

interface TabTimelineProps {
  dossier: Dossier;
}

export default function DossierTabTimeline({ dossier }: TabTimelineProps) {
  const timeline = dossier.timeline;

  if (timeline.length === 0) {
    return (
      <div className="card">
        <h3 className="section-title">Timeline</h3>
        <p className="text-sm text-muted">Aucun événement enregistré.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="section-title">Timeline</h3>
      <div className="space-y-0">
        {timeline.map((entry, index) => (
          <div key={entry.id} className="flex gap-4 relative">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-foreground border-2 border-foreground mt-1.5 shrink-0 z-10" />
              {index < timeline.length - 1 && <div className="w-px flex-1 bg-border" />}
            </div>

            {/* Content */}
            <div className="pb-6 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground">{entry.action}</p>
                <StatusBadge
                  variant={TIMELINE_TYPE_VARIANTS[entry.type]}
                  label={TIMELINE_TYPE_LABELS[entry.type]}
                  size="sm"
                />
              </div>
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