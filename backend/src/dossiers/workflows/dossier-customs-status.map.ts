import { DossierStatus } from '@auto-import/contracts';

export const DOSSIER_CUSTOMS_STATUS: Partial<Record<DossierStatus, string>> = {
  [DossierStatus.CUSTOMS_CLEARANCE]: 'CLEARANCE_IN_PROGRESS',
  [DossierStatus.CUSTOMS_RELEASED]: 'RELEASE',
  [DossierStatus.PORT_EXIT]: 'PORT_EXIT',
  [DossierStatus.CLOSED]: 'CLOSED',
};

export function getTargetCustomsStatus(status: string): string | null {
  return DOSSIER_CUSTOMS_STATUS[status as DossierStatus] ?? null;
}
