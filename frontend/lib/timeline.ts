import type { TimelineEntry, TypeTimeline } from '@/types';

export function creerEntreeTimeline(
  dossierId: string,
  action: string,
  type: TypeTimeline,
  utilisateur: string,
  details: string,
): TimelineEntry {
  return {
    id: `tim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dossier_id: dossierId,
    date: new Date().toISOString(),
    utilisateur,
    action,
    type,
    details,
  };
}