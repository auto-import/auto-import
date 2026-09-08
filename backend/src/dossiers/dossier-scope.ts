import { DossierStatus } from '@auto-import/contracts';
import { Prisma } from '@prisma/client';

export const TERMINAL_DOSSIER_STATUSES = [
  DossierStatus.CLOSED,
  DossierStatus.SERVICE_COMPLETED,
  DossierStatus.CANCELLED,
] as const;

export function activeDossierWhere(
  organizationId: string,
): Prisma.DossierWhereInput {
  return {
    organizationId,
    archivedAt: null,
    status: { notIn: [...TERMINAL_DOSSIER_STATUSES] },
  };
}
