import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  getDossierCommerceAction,
  getTargetOrderStatus,
} from './dossier-commerce-status.map';
import type { VehicleStatusSyncInput } from './vehicle-status-sync.service';

type OfferCounterRow = {
  id: string;
  offerStatus: string | null;
  availableQuantity: number;
  reservedQuantity: number;
};

/** Synchronizes the dossier-owned commercial reservation and purchase state. */
@Injectable()
export class DossierCommerceSyncService {
  async syncForTransition(
    tx: Prisma.TransactionClient,
    input: VehicleStatusSyncInput,
  ): Promise<void> {
    const action = getDossierCommerceAction(input.toStatus);
    const orderTarget = getTargetOrderStatus(input.toStatus);
    if (!action && !orderTarget) return;

    const dossier = await tx.dossier.findFirst({
      where: { id: input.dossierId, organizationId: input.organizationId },
      select: {
        order: { select: { id: true, status: true } },
        catalogueItem: {
          select: {
            id: true,
            availableQuantity: true,
            reservedQuantity: true,
            sourceVehicleId: true,
            sourceOfferVehicle: {
              select: {
                id: true,
                status: true,
                quantity: true,
                reservedQuantity: true,
                purchasedQuantity: true,
                offer: {
                  select: {
                    id: true,
                    offerStatus: true,
                    availableQuantity: true,
                    reservedQuantity: true,
                  },
                },
              },
            },
          },
        },
        offerReservation: {
          select: {
            id: true,
            status: true,
            quantity: true,
            offer: {
              select: {
                id: true,
                offerStatus: true,
                availableQuantity: true,
                reservedQuantity: true,
              },
            },
          },
        },
        purchases: {
          select: {
            id: true,
            status: true,
            purchaseNumber: true,
            sourceOfferVehicleId: true,
          },
        },
      },
    });
    if (!dossier) {
      throw new ConflictException('Dossier changed during lifecycle sync');
    }
    if (dossier.order && orderTarget) {
      await this.syncOrder(tx, dossier.order, orderTarget, input);
    }
    if (!action) return;

    if (action === 'reserve') {
      await this.markOfferReserved(tx, dossier.catalogueItem, input);
      return;
    }
    if (action === 'purchase') {
      await tx.purchase.updateMany({
        where: {
          dossierId: input.dossierId,
          organizationId: input.organizationId,
          status: 'pending',
        },
        data: { status: 'confirmed', confirmedBy: input.userId },
      });
      if (dossier.order) {
        await tx.reservation.updateMany({
          where: {
            orderId: dossier.order.id,
            organizationId: input.organizationId,
            status: 'active',
          },
          data: { status: 'consumed' },
        });
      }
      await this.consumeCatalogueReservation(tx, dossier, input);
      await this.consumeOfferReservation(tx, dossier.offerReservation, input);
      return;
    }

    await tx.purchase.updateMany({
      where: {
        dossierId: input.dossierId,
        organizationId: input.organizationId,
        status: 'pending',
      },
      data: { status: 'cancelled' },
    });
    if (dossier.order) {
      await tx.reservation.updateMany({
        where: {
          orderId: dossier.order.id,
          organizationId: input.organizationId,
          status: 'active',
        },
        data: {
          status: 'released',
          releasedAt: new Date(),
          releaseReason: 'dossierCancelled',
        },
      });
    }
    await this.releaseCatalogueReservation(tx, dossier, input);
    await this.releaseOfferReservation(tx, dossier.offerReservation, input);
  }

  private async syncOrder(
    tx: Prisma.TransactionClient,
    order: { id: string; status: string },
    target: string,
    input: VehicleStatusSyncInput,
  ) {
    if (
      order.status === target ||
      ['completed', 'cancelled'].includes(order.status)
    )
      return;
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: target,
        confirmedAt: target === 'confirmed' ? new Date() : undefined,
      },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: target,
        changedBy: input.userId,
        comment: `Dossier ${input.dossierReference}: ${input.fromStatus} -> ${input.toStatus}`,
      },
    });
  }

  private async markOfferReserved(
    tx: Prisma.TransactionClient,
    item: {
      reservedQuantity: number;
      sourceOfferVehicle: {
        id: string;
        status: string;
        reservedQuantity: number;
        offer: OfferCounterRow;
      } | null;
    } | null,
    input: VehicleStatusSyncInput,
  ) {
    const source = item?.sourceOfferVehicle;
    if (!source || item.reservedQuantity <= 0 || source.reservedQuantity <= 0)
      return;
    if (
      ['RECEIVED', 'UNDER_VERIFICATION', 'VALIDATED'].includes(source.status)
    ) {
      await tx.chinaOfferVehicle.update({
        where: { id: source.id },
        data: { status: 'RESERVED' },
      });
    }
    await this.setOfferStatus(
      tx,
      source.offer,
      'RESERVED',
      input,
      `Reserved by dossier ${input.dossierReference}`,
    );
  }

  private async consumeCatalogueReservation(
    tx: Prisma.TransactionClient,
    dossier: {
      catalogueItem: {
        id: string;
        reservedQuantity: number;
        sourceOfferVehicle: {
          id: string;
          status: string;
          quantity: number;
          reservedQuantity: number;
          purchasedQuantity: number;
          offer: OfferCounterRow;
        } | null;
      } | null;
      purchases: Array<{
        status: string;
        purchaseNumber: string;
        sourceOfferVehicleId: string | null;
      }>;
    },
    input: VehicleStatusSyncInput,
  ) {
    const item = dossier.catalogueItem;
    const source = item?.sourceOfferVehicle;
    if (!item || !source || item.reservedQuantity <= 0) return;
    const purchase = dossier.purchases.find(
      (candidate) =>
        candidate.status !== 'cancelled' &&
        candidate.sourceOfferVehicleId === source.id,
    );
    if (!purchase) return;

    const catalogueCount = await tx.$executeRaw`
      UPDATE "CatalogueItem"
      SET "reservedQuantity" = "reservedQuantity" - 1,
          "availableQuantity" = "availableQuantity" - 1,
          "updatedAt" = NOW()
      WHERE "id" = ${item.id}
        AND "organizationId" = ${input.organizationId}
        AND "reservedQuantity" > 0
        AND "availableQuantity" > 0`;
    if (catalogueCount !== 1) {
      throw new ConflictException(
        'Catalogue reservation changed during purchase synchronization',
      );
    }

    const lineRows = await tx.$queryRaw<Array<{ status: string }>>`
      UPDATE "ChinaOfferVehicle"
      SET "reservedQuantity" = "reservedQuantity" - 1,
          "purchasedQuantity" = "purchasedQuantity" + 1,
          "status" = CASE
            WHEN "purchasedQuantity" + 1 >= "quantity" THEN 'PURCHASED'
            WHEN "reservedQuantity" - 1 > 0 THEN 'RESERVED'
            ELSE 'VALIDATED'
          END,
          "purchasedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE "id" = ${source.id}
        AND "organizationId" = ${input.organizationId}
        AND "reservedQuantity" > 0
        AND "purchasedQuantity" < "quantity"
      RETURNING "status"`;
    if (lineRows.length !== 1) {
      throw new ConflictException(
        'China offer vehicle reservation changed during purchase synchronization',
      );
    }
    await this.consumeOfferCounters(
      tx,
      source.offer,
      1,
      input,
      `Dossier ${input.dossierReference} consumed offered vehicle with purchase ${purchase.purchaseNumber}`,
    );
  }

  private async consumeOfferReservation(
    tx: Prisma.TransactionClient,
    reservation: {
      id: string;
      status: string;
      quantity: number;
      offer: OfferCounterRow;
    } | null,
    input: VehicleStatusSyncInput,
  ) {
    if (!reservation || reservation.status !== 'active') return;
    await tx.offerReservation.update({
      where: { id: reservation.id },
      data: { status: 'consumed' },
    });
    await this.consumeOfferCounters(
      tx,
      reservation.offer,
      reservation.quantity,
      input,
      `Offer consumed by dossier ${input.dossierReference}`,
    );
  }

  private async consumeOfferCounters(
    tx: Prisma.TransactionClient,
    offer: OfferCounterRow,
    quantity: number,
    input: VehicleStatusSyncInput,
    reason: string,
  ) {
    const rows = await tx.$queryRaw<OfferCounterRow[]>`
      UPDATE "ChinaOffer"
      SET "reservedQuantity" = "reservedQuantity" - ${quantity},
          "availableQuantity" = "availableQuantity" - ${quantity},
          "offerStatus" = CASE
            WHEN "availableQuantity" - ${quantity} = 0 THEN 'PURCHASED'
            WHEN "reservedQuantity" - ${quantity} > 0 THEN 'RESERVED'
            ELSE 'VALIDATED'
          END,
          "status" = CASE
            WHEN "availableQuantity" - ${quantity} = 0 THEN 'purchased'
            ELSE "status"
          END,
          "updatedAt" = NOW()
      WHERE "id" = ${offer.id}
        AND "organizationId" = ${input.organizationId}
        AND "reservedQuantity" >= ${quantity}
        AND "availableQuantity" >= ${quantity}
      RETURNING "id", "offerStatus", "availableQuantity", "reservedQuantity"`;
    if (rows.length !== 1) {
      throw new ConflictException(
        'China offer counters changed during purchase synchronization',
      );
    }
    await this.recordOfferStatusChange(
      tx,
      offer,
      rows[0].offerStatus,
      input,
      reason,
    );
  }

  private async releaseCatalogueReservation(
    tx: Prisma.TransactionClient,
    dossier: {
      catalogueItem: {
        id: string;
        reservedQuantity: number;
        sourceVehicleId: string | null;
        sourceOfferVehicle: {
          id: string;
          status: string;
          reservedQuantity: number;
          offer: OfferCounterRow;
        } | null;
      } | null;
      purchases: Array<{ status: string; sourceOfferVehicleId: string | null }>;
    },
    input: VehicleStatusSyncInput,
  ) {
    const item = dossier.catalogueItem;
    if (!item || item.reservedQuantity <= 0) return;
    const source = item.sourceOfferVehicle;
    if (
      source &&
      dossier.purchases.some(
        (purchase) =>
          purchase.status === 'confirmed' &&
          purchase.sourceOfferVehicleId === source.id,
      )
    ) {
      return;
    }
    const catalogueCount = await tx.$executeRaw`
      UPDATE "CatalogueItem"
      SET "reservedQuantity" = "reservedQuantity" - 1, "updatedAt" = NOW()
      WHERE "id" = ${item.id}
        AND "organizationId" = ${input.organizationId}
        AND "reservedQuantity" > 0`;
    if (catalogueCount !== 1) {
      throw new ConflictException(
        'Catalogue reservation changed during cancellation synchronization',
      );
    }
    if (!source) return;
    const lineRows = await tx.$queryRaw<Array<{ status: string }>>`
      UPDATE "ChinaOfferVehicle"
      SET "reservedQuantity" = "reservedQuantity" - 1,
          "status" = CASE
            WHEN "reservedQuantity" - 1 > 0 THEN 'RESERVED'
            ELSE 'VALIDATED'
          END,
          "updatedAt" = NOW()
      WHERE "id" = ${source.id}
        AND "organizationId" = ${input.organizationId}
        AND "reservedQuantity" > 0
      RETURNING "status"`;
    if (lineRows.length !== 1) {
      throw new ConflictException(
        'China offer vehicle reservation changed during cancellation synchronization',
      );
    }
    await this.releaseOfferCounters(tx, source.offer, 1, input);
  }

  private async releaseOfferReservation(
    tx: Prisma.TransactionClient,
    reservation: {
      id: string;
      status: string;
      quantity: number;
      offer: OfferCounterRow;
    } | null,
    input: VehicleStatusSyncInput,
  ) {
    if (!reservation || reservation.status !== 'active') return;
    await tx.offerReservation.update({
      where: { id: reservation.id },
      data: {
        status: 'released',
        releasedAt: new Date(),
        releaseReason: 'dossierCancelled',
      },
    });
    await this.releaseOfferCounters(
      tx,
      reservation.offer,
      reservation.quantity,
      input,
    );
  }

  private async releaseOfferCounters(
    tx: Prisma.TransactionClient,
    offer: OfferCounterRow,
    quantity: number,
    input: VehicleStatusSyncInput,
  ) {
    const rows = await tx.$queryRaw<OfferCounterRow[]>`
      UPDATE "ChinaOffer"
      SET "reservedQuantity" = "reservedQuantity" - ${quantity},
          "offerStatus" = CASE
            WHEN "reservedQuantity" - ${quantity} > 0 THEN 'RESERVED'
            ELSE 'VALIDATED'
          END,
          "updatedAt" = NOW()
      WHERE "id" = ${offer.id}
        AND "organizationId" = ${input.organizationId}
        AND "reservedQuantity" >= ${quantity}
      RETURNING "id", "offerStatus", "availableQuantity", "reservedQuantity"`;
    if (rows.length !== 1) {
      throw new ConflictException(
        'China offer counters changed during cancellation synchronization',
      );
    }
    await this.recordOfferStatusChange(
      tx,
      offer,
      rows[0].offerStatus,
      input,
      `Reservation released by cancelled dossier ${input.dossierReference}`,
    );
  }

  private async setOfferStatus(
    tx: Prisma.TransactionClient,
    offer: OfferCounterRow,
    target: string,
    input: VehicleStatusSyncInput,
    reason: string,
  ) {
    if (offer.offerStatus === target) return;
    await tx.chinaOffer.update({
      where: { id: offer.id },
      data: { offerStatus: target },
    });
    await this.recordOfferStatusChange(tx, offer, target, input, reason);
  }

  private async recordOfferStatusChange(
    tx: Prisma.TransactionClient,
    offer: Pick<OfferCounterRow, 'id' | 'offerStatus'>,
    target: string | null,
    input: VehicleStatusSyncInput,
    reason: string,
  ) {
    if (!target || offer.offerStatus === target) return;
    await tx.chinaOfferStatusHistory.create({
      data: {
        organizationId: input.organizationId,
        offerId: offer.id,
        fromStatus: offer.offerStatus,
        toStatus: target,
        reason,
        actorId: input.userId,
      },
    });
  }
}
