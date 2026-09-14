import { DossierStatus } from '@auto-import/contracts';
import { LEGACY_STATUS_ALIASES } from './dossier-workflow.constants';

export const MARITIME_STATUSES = [
  'pending',
  'booked',
  'loading',
  'inTransit',
  'arrived',
] as const;
export type MaritimeStatus = (typeof MARITIME_STATUSES)[number];

/** A maritime milestone is shared; customs and delivery remain per dossier. */
export const DOSSIER_SHIPMENT_STATUS: Partial<
  Record<DossierStatus, MaritimeStatus>
> = {
  [DossierStatus.SHIPMENT_BOOKING]: 'booked',
  [DossierStatus.BOOKING]: 'booked',
  [DossierStatus.LOADING]: 'loading',
  [DossierStatus.BILL_OF_LADING_ISSUED]: 'inTransit',
  [DossierStatus.CONTAINER_BILL_OF_LADING]: 'inTransit',
  [DossierStatus.IN_TRANSIT]: 'inTransit',
  [DossierStatus.ARRIVED_AT_PORT]: 'arrived',
  [DossierStatus.ARRIVED]: 'arrived',
  [DossierStatus.CUSTOMS_CLEARANCE]: 'arrived',
  [DossierStatus.CUSTOMS_RELEASED]: 'arrived',
  [DossierStatus.PORT_EXIT]: 'arrived',
  [DossierStatus.LOCAL_TRANSPORT]: 'arrived',
  [DossierStatus.DELIVERED_TO_CLIENT]: 'arrived',
  [DossierStatus.DOCUMENTS_DELIVERED]: 'arrived',
  [DossierStatus.CLOSED]: 'arrived',
  [DossierStatus.SERVICE_COMPLETED]: 'arrived',
};

export function getTargetShipmentStatus(status: string): MaritimeStatus | null {
  const canonical = LEGACY_STATUS_ALIASES[status.toLowerCase()] ?? status;
  return DOSSIER_SHIPMENT_STATUS[canonical as DossierStatus] ?? null;
}

export function advancesShipment(
  current: string,
  target: MaritimeStatus,
): boolean {
  const currentRank = MARITIME_STATUSES.indexOf(current as MaritimeStatus);
  return currentRank >= 0 && currentRank < MARITIME_STATUSES.indexOf(target);
}
