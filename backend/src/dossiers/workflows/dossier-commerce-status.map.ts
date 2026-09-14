import { DossierStatus } from '@auto-import/contracts';

export type DossierCommerceAction = 'reserve' | 'purchase' | 'release';

/**
 * Commerce projections are intentionally sparse. Shipping and delivery stages
 * do not rewrite offer, catalogue, purchase, or reservation state.
 */
export const DOSSIER_COMMERCE_ACTION: Partial<
  Record<DossierStatus, DossierCommerceAction>
> = {
  [DossierStatus.OFFER_SELECTED]: 'reserve',
  [DossierStatus.CLIENT_CONFIRMED]: 'reserve',
  [DossierStatus.CONTRACT_SIGNED]: 'reserve',
  [DossierStatus.DEPOSIT_RECEIVED]: 'reserve',
  [DossierStatus.VEHICLE_BOOKING]: 'reserve',
  [DossierStatus.INSPECTION]: 'reserve',
  [DossierStatus.PURCHASE_CONFIRMED]: 'purchase',
  [DossierStatus.CANCELLED]: 'release',
};

export function getDossierCommerceAction(
  status: string,
): DossierCommerceAction | null {
  return DOSSIER_COMMERCE_ACTION[status as DossierStatus] ?? null;
}

export const DOSSIER_ORDER_STATUS: Partial<Record<DossierStatus, string>> = {
  [DossierStatus.CLIENT_CONFIRMED]: 'confirmed',
  [DossierStatus.PURCHASE_CONFIRMED]: 'processing',
  [DossierStatus.CLOSED]: 'completed',
  [DossierStatus.CANCELLED]: 'cancelled',
};

export function getTargetOrderStatus(status: string): string | null {
  return DOSSIER_ORDER_STATUS[status as DossierStatus] ?? null;
}
