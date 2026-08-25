import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import {
  CreateOfferDto,
  FilterOfferDto,
  ReserveOfferDto,
  MaterializeOfferDto,
  UpdateOfferDto,
} from './dto/offer.dto';
import { DossierWorkflowService } from '../dossiers/workflows/dossier-workflow.service';
import { DossierStatus, DossierType } from '@auto-import/contracts';

type OfferRow = { id: string };

@Injectable()
export class OffersService {
  private readonly dossierWorkflow = new DossierWorkflowService();
  constructor(private readonly prisma: PrismaService) {}

  private derivedStatus(offer: {
    archivedAt: Date | null;
    validFrom: Date;
    validUntil: Date;
    availableQuantity: number;
    reservedQuantity: number;
  }): string {
    const now = new Date();
    if (offer.archivedAt) return 'archived';
    if (offer.validFrom > now) return 'upcoming';
    if (offer.validUntil < now) return 'expired';
    if (offer.reservedQuantity >= offer.availableQuantity) return 'reserved';
    return 'available';
  }

  private present<T extends Parameters<OffersService['derivedStatus']>[0]>(
    offer: T,
  ) {
    return {
      ...offer,
      status: this.derivedStatus(offer),
      remainingQuantity: Math.max(
        0,
        offer.availableQuantity - offer.reservedQuantity,
      ),
    };
  }

  private async nextReference(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string> {
    const year = new Date().getUTCFullYear();
    const sequence = await tx.commerceSequence.upsert({
      where: { organizationId_key: { organizationId, key: `offer:${year}` } },
      create: { organizationId, key: `offer:${year}`, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `OFF-${year}-${String(sequence.value).padStart(5, '0')}`;
  }

  private validateDates(validFrom: Date, validUntil: Date): void {
    if (validUntil < validFrom) {
      throw new BadRequestException('validUntil must be on or after validFrom');
    }
  }

  private async requireSupplier(
    tx: Prisma.TransactionClient,
    supplierId: string,
    organizationId: string,
  ): Promise<void> {
    const supplier = await tx.partner.findFirst({
      where: {
        id: supplierId,
        organizationId,
        type: 'supplier',
        status: 'active',
      },
      select: { id: true },
    });
    if (!supplier) throw new NotFoundException('Active supplier not found');
  }

  async create(dto: CreateOfferDto, organizationId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireSupplier(tx, dto.supplierId, organizationId);
      const validFrom = new Date(dto.validFrom);
      const validUntil = new Date(dto.validUntil);
      this.validateDates(validFrom, validUntil);
      const offer = await tx.chinaOffer.create({
        data: {
          ...dto,
          specification: dto.specification as Prisma.InputJsonValue,
          validFrom,
          validUntil,
          organizationId,
          reference: await this.nextReference(tx, organizationId),
        },
        include: { supplier: true },
      });
      return this.present(offer);
    });
  }

  async findAll(organizationId: string, filters: FilterOfferDto) {
    await this.expireReservations(organizationId);
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const validAt = filters.validAt ? new Date(filters.validAt) : undefined;
    const where: Prisma.ChinaOfferWhereInput = {
      organizationId,
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters.condition ? { condition: filters.condition } : {}),
      ...(filters.search
        ? {
            OR: ['reference', 'brand', 'model', 'version'].map((field) => ({
              [field]: { contains: filters.search, mode: 'insensitive' },
            })),
          }
        : {}),
      ...(validAt
        ? { validFrom: { lte: validAt }, validUntil: { gte: validAt } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.chinaOffer.findMany({
        where,
        include: { supplier: true, _count: { select: { reservations: true } } },
        orderBy: { createdAt: 'desc' },
        ...(filters.status ? {} : { skip: (page - 1) * limit, take: limit }),
      }),
      filters.status
        ? Promise.resolve(0)
        : this.prisma.chinaOffer.count({ where }),
    ]);
    const items = rows.map((row) => this.present(row));
    const filtered = filters.status
      ? items.filter((row) => row.status === filters.status)
      : items;
    const paged = filters.status
      ? filtered.slice((page - 1) * limit, page * limit)
      : filtered;
    return paginate(
      paged,
      filters.status ? filtered.length : total,
      page,
      limit,
    );
  }

  async findOne(id: string, organizationId: string) {
    await this.expireReservations(organizationId, id);
    const offer = await this.prisma.chinaOffer.findFirst({
      where: { id, organizationId },
      include: {
        supplier: true,
        reservations: {
          include: {
            client: true,
            dossier: { select: { id: true, reference: true, status: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    return this.present(offer);
  }

  async update(id: string, dto: UpdateOfferDto, organizationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.chinaOffer.findFirst({
        where: { id, organizationId },
      });
      if (!current) throw new NotFoundException('Offer not found');
      if (dto.supplierId)
        await this.requireSupplier(tx, dto.supplierId, organizationId);
      const validFrom = dto.validFrom
        ? new Date(dto.validFrom)
        : current.validFrom;
      const validUntil = dto.validUntil
        ? new Date(dto.validUntil)
        : current.validUntil;
      this.validateDates(validFrom, validUntil);
      if (
        dto.availableQuantity != null &&
        dto.availableQuantity < current.reservedQuantity
      ) {
        throw new ConflictException(
          'Quantity cannot be lower than active reservations',
        );
      }
      const offer = await tx.chinaOffer.update({
        where: { id },
        data: {
          ...dto,
          specification: dto.specification as Prisma.InputJsonValue | undefined,
          validFrom,
          validUntil,
          status: undefined,
        },
        include: { supplier: true },
      });
      return this.present(offer);
    });
  }

  async archive(id: string, organizationId: string) {
    const offer = await this.findOne(id, organizationId);
    if (
      offer.reservations.some((reservation) => reservation.status === 'active')
    ) {
      throw new ConflictException(
        'Release active reservations before archiving this offer',
      );
    }
    return this.prisma.chinaOffer.update({
      where: { id },
      data: { archivedAt: new Date(), status: 'archived' },
    });
  }

  async reserve(
    id: string,
    dto: ReserveOfferDto,
    userId: string,
    organizationId: string,
  ) {
    const run = async () =>
      this.prisma.$transaction(
        async (tx) => {
          const client = await tx.client.findFirst({
            where: { id: dto.clientId, organizationId },
          });
          if (!client) throw new NotFoundException('Client not found');
          const quantity = dto.quantity ?? 1;
          const rows = await tx.$queryRaw<OfferRow[]>`
          UPDATE "ChinaOffer"
          SET "reservedQuantity" = "reservedQuantity" + ${quantity}, "updatedAt" = NOW()
          WHERE "id" = ${id} AND "organizationId" = ${organizationId}
            AND "archivedAt" IS NULL AND "validFrom" <= NOW() AND "validUntil" >= NOW()
            AND "reservedQuantity" + ${quantity} <= "availableQuantity"
          RETURNING "id"`;
          if (rows.length !== 1)
            throw new ConflictException(
              'Offer is expired, archived, or has insufficient quantity',
            );
          return tx.offerReservation.create({
            data: {
              organizationId,
              offerId: id,
              clientId: dto.clientId,
              quantity,
              expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
              createdBy: userId,
            },
            include: { offer: true, client: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    try {
      return await run();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      )
        return run();
      throw error;
    }
  }

  async release(
    reservationId: string,
    reason: string | undefined,
    organizationId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.offerReservation.findFirst({
        where: { id: reservationId, organizationId },
      });
      if (!reservation)
        throw new NotFoundException('Offer reservation not found');
      if (reservation.status !== 'active') return reservation;
      await tx.chinaOffer.update({
        where: { id: reservation.offerId },
        data: { reservedQuantity: { decrement: reservation.quantity } },
      });
      return tx.offerReservation.update({
        where: { id: reservationId },
        data: {
          status: 'released',
          releasedAt: new Date(),
          releaseReason: reason ?? 'manual',
        },
      });
    });
  }

  async materialize(
    reservationId: string,
    dto: MaterializeOfferDto,
    userId: string,
    organizationId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.purchase.findUnique({
          where: { offerReservationId: reservationId },
        });
        if (existing) return existing;
        const reservation = await tx.offerReservation.findFirst({
          where: {
            id: reservationId,
            organizationId,
            status: 'active',
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: { offer: { include: { supplier: true } }, dossier: true },
        });
        if (!reservation || reservation.offer.validUntil < new Date()) {
          throw new ConflictException(
            'Offer reservation is invalid or expired',
          );
        }
        if (reservation.quantity !== 1) {
          throw new ConflictException(
            'Materialize quantity reservations one vehicle at a time',
          );
        }
        if (reservation.dossier) {
          if (reservation.dossier.type === DossierType.SHIPPING_ONLY) {
            throw new ConflictException(
              'Shipping-only dossiers cannot purchase China offers',
            );
          }
          this.dossierWorkflow.validateTransition(
            reservation.dossier.type,
            reservation.dossier.status,
            DossierStatus.PURCHASE_CONFIRMED,
          );
        }
        if (dto.currentLocationId) {
          const location = await tx.warehouseLocation.findFirst({
            where: { id: dto.currentLocationId, warehouse: { organizationId } },
          });
          if (!location)
            throw new NotFoundException('Warehouse location not found');
        }
        const purchasePrice =
          dto.purchasePrice ?? reservation.offer.purchasePrice?.toNumber();
        if (purchasePrice == null || purchasePrice <= 0) {
          throw new ConflictException('A positive purchase price is required');
        }
        const specification =
          typeof reservation.offer.specification === 'object' &&
          reservation.offer.specification !== null &&
          !Array.isArray(reservation.offer.specification)
            ? reservation.offer.specification
            : {};
        const vehicle = await tx.vehicle.create({
          data: {
            organizationId,
            vin: dto.vin,
            brand: reservation.offer.brand,
            model: reservation.offer.model,
            year: reservation.offer.year,
            mileage: reservation.offer.mileage,
            condition: reservation.offer.condition,
            purchasePrice,
            sellingPrice: dto.sellingPrice,
            currency: reservation.offer.currency,
            acquisitionType: 'chinaOffer',
            supplierId: reservation.offer.supplierId,
            currentLocationId: dto.currentLocationId,
            status: reservation.dossierId ? 'reserved' : 'available',
            acquiredAt: new Date(),
            specs: {
              create: {
                engine:
                  typeof specification.engine === 'string'
                    ? specification.engine
                    : undefined,
                fuelType:
                  typeof specification.fuelType === 'string'
                    ? specification.fuelType
                    : undefined,
                transmission:
                  typeof specification.transmission === 'string'
                    ? specification.transmission
                    : undefined,
                color:
                  typeof specification.color === 'string'
                    ? specification.color
                    : undefined,
                description:
                  typeof specification.description === 'string'
                    ? specification.description
                    : undefined,
              },
            },
          },
          include: { specs: true },
        });
        if (reservation.dossierId) {
          await tx.dossierVehicle.create({
            data: { dossierId: reservation.dossierId, vehicleId: vehicle.id },
          });
          await tx.dossier.update({
            where: { id: reservation.dossierId },
            data: { status: DossierStatus.PURCHASE_CONFIRMED },
          });
          await tx.dossierStatusHistory.create({
            data: {
              dossierId: reservation.dossierId,
              fromStatus: reservation.dossier?.status,
              toStatus: DossierStatus.PURCHASE_CONFIRMED,
              changedBy: userId,
              comment: `Offer ${reservation.offer.reference} materialized as vehicle ${dto.vin}`,
            },
          });
        }
        const year = new Date().getUTCFullYear();
        const sequence = await tx.commerceSequence.upsert({
          where: {
            organizationId_key: { organizationId, key: `purchase:${year}` },
          },
          create: { organizationId, key: `purchase:${year}`, value: 1 },
          update: { value: { increment: 1 } },
        });
        const purchase = await tx.purchase.create({
          data: {
            organizationId,
            purchaseNumber: `PUR-${year}-${String(sequence.value).padStart(5, '0')}`,
            supplierId: reservation.offer.supplierId,
            vehicleId: vehicle.id,
            purchasePrice,
            currency: reservation.offer.currency,
            status: 'confirmed',
            purchaseDate: new Date(),
            dossierId: reservation.dossierId,
            confirmedBy: userId,
            offerReservationId: reservation.id,
            supplierSnapshot: {
              id: reservation.offer.supplier.id,
              name: reservation.offer.supplier.name,
              country: reservation.offer.supplier.country,
            },
            vehicleSnapshot: {
              vin: dto.vin,
              brand: vehicle.brand,
              model: vehicle.model,
              year: vehicle.year,
              specification,
            },
          },
        });
        await tx.offerReservation.update({
          where: { id: reservation.id },
          data: { status: 'consumed' },
        });
        await tx.chinaOffer.update({
          where: { id: reservation.offerId },
          data: {
            reservedQuantity: { decrement: reservation.quantity },
            availableQuantity: { decrement: reservation.quantity },
          },
        });
        return purchase;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async expireReservations(
    organizationId: string,
    offerId?: string,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const expired = await tx.offerReservation.findMany({
        where: {
          organizationId,
          status: 'active',
          expiresAt: { lte: new Date() },
          ...(offerId ? { offerId } : {}),
        },
      });
      for (const reservation of expired) {
        await tx.offerReservation.update({
          where: { id: reservation.id },
          data: {
            status: 'expired',
            releasedAt: new Date(),
            releaseReason: 'expired',
          },
        });
        await tx.chinaOffer.update({
          where: { id: reservation.offerId },
          data: { reservedQuantity: { decrement: reservation.quantity } },
        });
      }
      return expired.length;
    });
  }

  async statistics(organizationId: string) {
    await this.expireReservations(organizationId);
    const offers = await this.prisma.chinaOffer.findMany({
      where: { organizationId },
    });
    const byStatus: Record<string, number> = {};
    for (const offer of offers) {
      const status = this.derivedStatus(offer);
      byStatus[status] = (byStatus[status] ?? 0) + 1;
    }
    return {
      total: offers.length,
      byStatus,
      availableQuantity: offers.reduce(
        (sum, row) => sum + row.availableQuantity,
        0,
      ),
      reservedQuantity: offers.reduce(
        (sum, row) => sum + row.reservedQuantity,
        0,
      ),
    };
  }
}
