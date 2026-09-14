import { DossierStatus } from '@auto-import/contracts';
import { DossierCommerceSyncService } from './dossier-commerce-sync.service';
import {
  getDossierCommerceAction,
  getTargetOrderStatus,
} from './dossier-commerce-status.map';

describe('Dossier commerce lifecycle projection', () => {
  const input = {
    organizationId: 'org-1',
    dossierId: 'dossier-1',
    dossierReference: 'CA-2026-00001',
    fromStatus: DossierStatus.INSPECTION,
    toStatus: DossierStatus.PURCHASE_CONFIRMED,
    vehicles: [],
    userId: 'actor-1',
  };

  it.each([
    [DossierStatus.OFFER_SELECTED, 'reserve'],
    [DossierStatus.VEHICLE_BOOKING, 'reserve'],
    [DossierStatus.INSPECTION, 'reserve'],
    [DossierStatus.PURCHASE_CONFIRMED, 'purchase'],
    [DossierStatus.CANCELLED, 'release'],
    [DossierStatus.IN_TRANSIT, null],
    [DossierStatus.CLOSED, null],
  ])('maps %s to %s', (status, expected) => {
    expect(getDossierCommerceAction(status)).toBe(expected);
  });

  it.each([
    [DossierStatus.CLIENT_CONFIRMED, 'confirmed'],
    [DossierStatus.PURCHASE_CONFIRMED, 'processing'],
    [DossierStatus.CLOSED, 'completed'],
    [DossierStatus.CANCELLED, 'cancelled'],
    [DossierStatus.IN_TRANSIT, null],
  ])('maps dossier %s to order %s', (status, expected) => {
    expect(getTargetOrderStatus(status)).toBe(expected);
  });

  it('marks a catalogue-backed offer and line reserved once', async () => {
    const tx: any = {
      dossier: {
        findFirst: jest.fn().mockResolvedValue({
          order: null,
          purchases: [],
          offerReservation: null,
          catalogueItem: {
            reservedQuantity: 1,
            sourceOfferVehicle: {
              id: 'line-1',
              status: 'VALIDATED',
              reservedQuantity: 1,
              offer: {
                id: 'offer-1',
                offerStatus: 'VALIDATED',
                availableQuantity: 2,
                reservedQuantity: 1,
              },
            },
          },
        }),
      },
      chinaOfferVehicle: { update: jest.fn() },
      chinaOffer: { update: jest.fn() },
      chinaOfferStatusHistory: { create: jest.fn() },
    };
    await new DossierCommerceSyncService().syncForTransition(tx, {
      ...input,
      fromStatus: '',
      toStatus: DossierStatus.OFFER_SELECTED,
    });
    expect(tx.chinaOfferVehicle.update).toHaveBeenCalledWith({
      where: { id: 'line-1' },
      data: { status: 'RESERVED' },
    });
    expect(tx.chinaOffer.update).toHaveBeenCalledWith({
      where: { id: 'offer-1' },
      data: { offerStatus: 'RESERVED' },
    });
    expect(tx.chinaOfferStatusHistory.create).toHaveBeenCalledTimes(1);
  });

  it('atomically converts catalogue and offer reservations into a purchase', async () => {
    const tx: any = {
      dossier: {
        findFirst: jest.fn().mockResolvedValue({
          order: { id: 'order-1', status: 'confirmed' },
          offerReservation: null,
          purchases: [
            {
              id: 'purchase-1',
              status: 'confirmed',
              purchaseNumber: 'PUR-1',
              sourceOfferVehicleId: 'line-1',
            },
          ],
          catalogueItem: {
            id: 'item-1',
            availableQuantity: 1,
            reservedQuantity: 1,
            sourceVehicleId: null,
            sourceOfferVehicle: {
              id: 'line-1',
              status: 'RESERVED',
              quantity: 1,
              reservedQuantity: 1,
              purchasedQuantity: 0,
              offer: {
                id: 'offer-1',
                offerStatus: 'RESERVED',
                availableQuantity: 1,
                reservedQuantity: 1,
              },
            },
          },
        }),
      },
      purchase: { updateMany: jest.fn() },
      reservation: { updateMany: jest.fn() },
      order: { update: jest.fn() },
      orderStatusHistory: { create: jest.fn() },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'PURCHASED' }])
        .mockResolvedValueOnce([
          {
            id: 'offer-1',
            offerStatus: 'PURCHASED',
            availableQuantity: 0,
            reservedQuantity: 0,
          },
        ]),
      chinaOfferStatusHistory: { create: jest.fn() },
    };
    await new DossierCommerceSyncService().syncForTransition(tx, input);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.reservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'consumed' } }),
    );
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: 'processing', confirmedAt: undefined },
    });
    expect(tx.orderStatusHistory.create).toHaveBeenCalledTimes(1);
    expect(tx.chinaOfferStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        offerId: 'offer-1',
        fromStatus: 'RESERVED',
        toStatus: 'PURCHASED',
      }),
    });
  });
});
