import { DossierType } from '../dossiers/dto/dossier-type.enum';
import { Prisma } from '@prisma/client';

export const TERMINAL_DOSSIER_STATUSES = [
  'closed',
  'serviceCompleted',
  'cancelled',
];

/** Direct inventory selection; sourcing reservations have a separate workflow. */
export function dossierAcquisitionTypes(type: string) {
  return type === DossierType.SHIPPING_ONLY
    ? ['external', 'clientRequest']
    : ['stock', 'chinaOffer', 'clientRequest'];
}

export function ownedInventoryWhere(
  organizationId: string,
): Prisma.VehicleWhereInput {
  return {
    OR: [
      { acquisitionType: 'stock' },
      {
        acquisitionType: { in: ['chinaOffer', 'clientRequest'] },
        purchases: { some: { organizationId, status: 'confirmed' } },
      },
    ],
  };
}

export function dossierInventoryWhere(
  type: string,
  organizationId: string,
): Prisma.VehicleWhereInput {
  return type === DossierType.SHIPPING_ONLY
    ? { acquisitionType: { in: dossierAcquisitionTypes(type) } }
    : ownedInventoryWhere(organizationId);
}
