import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginate } from '../common/helpers/pagination.helper';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateQuotationDto,
  FilterQuotationDto,
  QuotationAmountsDto,
  ReviseQuotationDto,
  TransitionQuotationDto,
} from './dto/quotation.dto';
import { QuotationPricingService } from './quotation-pricing.service';

const TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ['SENT', 'REJECTED', 'EXPIRED'],
  SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
};

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: QuotationPricingService,
  ) {}

  async preview(
    organizationId: string,
    dto: CreateQuotationDto,
  ) {
    const calculated = this.pricing.calculate(dto.priceBasis, dto);
    const exchange = await this.prisma.$transaction((tx) =>
      this.pricing.usdToDzdSnapshot(tx, organizationId, new Date()),
    );
    return {
      ...Object.fromEntries(
        Object.entries(calculated).map(([key, value]) => [
          key,
          value instanceof Prisma.Decimal ? value.toString() : value,
        ]),
      ),
      currency: 'USD',
      exchangeRateId: exchange.exchangeRateId,
      exchangeRateSnapshot: exchange.rate.toString(),
      finalCustomerPriceDzd: calculated.finalCustomerPrice
        .mul(exchange.rate)
        .toDecimalPlaces(2)
        .toString(),
    };
  }

  private async nextNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const year = new Date().getUTCFullYear();
    const row = await tx.commerceSequence.upsert({
      where: {
        organizationId_key: { organizationId, key: `quotation:${year}` },
      },
      create: { organizationId, key: `quotation:${year}`, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `DEV-${year}-${String(row.value).padStart(5, '0')}`;
  }

  private snapshot(
    dto: QuotationAmountsDto,
    calculated: ReturnType<QuotationPricingService['calculate']>,
    exchangeRateSnapshot: Prisma.Decimal,
  ): Prisma.InputJsonObject {
    return {
      formula:
        'CIF=base+fret+assurance+transit+autres+marge; DDP=CIF+douane',
      containerPrice: calculated.containerPrice.toString(),
      containerAllocation: `1/${calculated.containerAllocation}`,
      freightAmount: calculated.freightAmount.toString(),
      customsIncluded: false,
      exchangeRatePair: 'USD/DZD',
      exchangeRateSnapshot: exchangeRateSnapshot.toString(),
      paymentConditions: dto.paymentConditions ?? null,
      validityNote: dto.validityNote ?? null,
      notes: dto.notes ?? null,
    };
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateQuotationDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const offer = await tx.chinaOffer.findFirst({
        where: {
          id: dto.sourceOfferId,
          organizationId,
          archivedAt: null,
          validUntil: { gte: now },
        },
        include: { vehicles: { orderBy: { lineNumber: 'asc' } } },
      });
      if (!offer) throw new NotFoundException('Offre Chine active introuvable.');
      if (!offer.currentRevisionId) {
        throw new ConflictException(
          "L'offre ne possède pas de révision tarifaire exploitable.",
        );
      }
      const sourceVehicle = dto.sourceOfferVehicleId
        ? offer.vehicles.find((vehicle) => vehicle.id === dto.sourceOfferVehicleId)
        : offer.vehicles[0];
      if (!sourceVehicle) {
        throw new NotFoundException("Véhicule de l'offre introuvable.");
      }
      if (
        ['PURCHASED', 'LOST_DEAL', 'EXPIRED'].includes(sourceVehicle.status) ||
        sourceVehicle.purchasedQuantity >= sourceVehicle.quantity
      ) {
        throw new ConflictException(
          "Ce véhicule de l'offre n'est plus commercialisable.",
        );
      }
      const calculated = this.pricing.calculate(dto.priceBasis, dto);
      const rate = await this.pricing.usdToDzdSnapshot(
        tx,
        organizationId,
        now,
      );
      const finalCustomerPriceDzd = calculated.finalCustomerPrice
        .mul(rate.rate)
        .toDecimalPlaces(2);

      const quotation = await tx.customerQuotation.create({
        data: {
          organizationId,
          quotationNumber: await this.nextNumber(tx, organizationId),
          sourceOfferId: offer.id,
          sourceOfferRevisionId: offer.currentRevisionId,
          sourceOfferVehicleId: sourceVehicle.id,
          priceBasis: dto.priceBasis,
          currency: 'USD',
          cataloguePublished: true,
          publishedAt: now,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
          createdBy: userId,
        },
      });
      const revision = await tx.customerQuotationRevision.create({
        data: {
          organizationId,
          quotationId: quotation.id,
          revisionNumber: 1,
          ...calculated,
          exchangeRateId: rate.exchangeRateId,
          exchangeRateSnapshot: rate.rate,
          finalCustomerPriceDzd,
          paymentConditions: dto.paymentConditions,
          validityNote: dto.validityNote,
          notes: dto.notes,
          reason: 'Création du devis',
          snapshot: {
            ...this.snapshot(dto, calculated, rate.rate),
            customsIncluded: dto.priceBasis === 'DDP',
            sourceOfferPrice: String(sourceVehicle.supplierPrice),
            sourceOfferCurrency: sourceVehicle.currency,
          },
          createdBy: userId,
          otherCosts: {
            create: (dto.otherCosts ?? []).map((cost, index) => ({
              organizationId,
              description: cost.description.trim(),
              amount: cost.amount,
              currency: 'USD',
              sortOrder: index + 1,
            })),
          },
        },
      });
      const updated = await tx.customerQuotation.update({
        where: { id: quotation.id },
        data: { currentRevisionId: revision.id },
        include: { currentRevision: { include: { otherCosts: true } } },
      });
      const existingCatalogueItem = await tx.catalogueItem.findUnique({
        where: { sourceOfferVehicleId: sourceVehicle.id },
      });
      const availableQuantity = Math.max(
        existingCatalogueItem?.reservedQuantity ?? 0,
        sourceVehicle.quantity - sourceVehicle.purchasedQuantity,
      );
      await tx.catalogueItem.upsert({
        where: { sourceOfferVehicleId: sourceVehicle.id },
        create: {
          organizationId,
          sourceOfferVehicleId: sourceVehicle.id,
          availableQuantity,
          publishedAt: now,
          ...(dto.priceBasis === 'CIF'
            ? { activeCifQuotationId: quotation.id }
            : { activeDdpQuotationId: quotation.id }),
        },
        update: {
          availableQuantity,
          archivedAt: null,
          publishedAt: now,
          ...(dto.priceBasis === 'CIF'
            ? { activeCifQuotationId: quotation.id }
            : { activeDdpQuotationId: quotation.id }),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'CUSTOMER_QUOTATION_CREATED',
          entityType: 'CustomerQuotation',
          entityId: updated.id,
          newValues: {
            sourceOfferId: offer.id,
            sourceOfferVehicleId: sourceVehicle.id,
            priceBasis: dto.priceBasis,
            finalCustomerPriceDzd: finalCustomerPriceDzd.toString(),
          },
        },
      });
      return updated;
    });
  }

  async revise(
    id: string,
    organizationId: string,
    userId: string,
    dto: ReviseQuotationDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const quotation = await tx.customerQuotation.findFirst({
        where: { id, organizationId },
        include: { _count: { select: { revisions: true } } },
      });
      if (!quotation) throw new NotFoundException('Devis introuvable.');
      if (!['DRAFT', 'SENT'].includes(quotation.status)) {
        throw new ConflictException(
          'Un devis accepté ou clôturé ne peut plus être modifié.',
        );
      }
      const priceBasis = quotation.priceBasis as 'CIF' | 'DDP';
      const calculated = this.pricing.calculate(priceBasis, dto);
      const rate = await this.pricing.usdToDzdSnapshot(
        tx,
        organizationId,
        new Date(),
      );
      const finalCustomerPriceDzd = calculated.finalCustomerPrice
        .mul(rate.rate)
        .toDecimalPlaces(2);
      const revision = await tx.customerQuotationRevision.create({
        data: {
          organizationId,
          quotationId: id,
          revisionNumber: quotation._count.revisions + 1,
          ...calculated,
          exchangeRateId: rate.exchangeRateId,
          exchangeRateSnapshot: rate.rate,
          finalCustomerPriceDzd,
          paymentConditions: dto.paymentConditions,
          validityNote: dto.validityNote,
          notes: dto.notes,
          reason: dto.reason.trim(),
          snapshot: {
            ...this.snapshot(dto, calculated, rate.rate),
            customsIncluded: priceBasis === 'DDP',
          },
          createdBy: userId,
          otherCosts: {
            create: (dto.otherCosts ?? []).map((cost, index) => ({
              organizationId,
              description: cost.description.trim(),
              amount: cost.amount,
              currency: 'USD',
              sortOrder: index + 1,
            })),
          },
        },
      });
      const updated = await tx.customerQuotation.update({
        where: { id },
        data: {
          currentRevisionId: revision.id,
          status: 'DRAFT',
          sentAt: null,
          ...(dto.expiresAt ? { expiresAt: new Date(dto.expiresAt) } : {}),
        },
        include: { currentRevision: { include: { otherCosts: true } } },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'CUSTOMER_QUOTATION_REVISED',
          entityType: 'CustomerQuotation',
          entityId: id,
          newValues: { revisionNumber: revision.revisionNumber },
        },
      });
      return updated;
    });
  }

  async transition(
    id: string,
    organizationId: string,
    userId: string,
    dto: TransitionQuotationDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const quotation = await tx.customerQuotation.findFirst({
        where: { id, organizationId },
      });
      if (!quotation) throw new NotFoundException('Devis introuvable.');
      if (quotation.status === dto.status) return quotation;
      if (!TRANSITIONS[quotation.status]?.includes(dto.status)) {
        throw new ConflictException(
          'Cette transition de statut du devis n’est pas autorisée.',
        );
      }
      const updated = await tx.customerQuotation.update({
        where: { id },
        data: {
          status: dto.status,
          cataloguePublished: !['REJECTED', 'EXPIRED'].includes(dto.status),
          sentAt: dto.status === 'SENT' ? new Date() : quotation.sentAt,
          acceptedAt:
            dto.status === 'ACCEPTED' ? new Date() : quotation.acceptedAt,
        },
      });
      if (['REJECTED', 'EXPIRED'].includes(dto.status)) {
        const fallback = quotation.sourceOfferVehicleId
          ? await tx.customerQuotation.findFirst({
              where: {
                organizationId,
                id: { not: id },
                sourceOfferVehicleId: quotation.sourceOfferVehicleId,
                priceBasis: quotation.priceBasis,
                cataloguePublished: true,
                status: { notIn: ['REJECTED', 'EXPIRED'] },
              },
              orderBy: { createdAt: 'desc' },
              select: { id: true },
            })
          : null;
        await tx.catalogueItem.updateMany({
          where: { activeCifQuotationId: id },
          data: { activeCifQuotationId: fallback?.id ?? null },
        });
        await tx.catalogueItem.updateMany({
          where: { activeDdpQuotationId: id },
          data: { activeDdpQuotationId: fallback?.id ?? null },
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'CUSTOMER_QUOTATION_STATUS_CHANGED',
          entityType: 'CustomerQuotation',
          entityId: id,
          oldValues: { status: quotation.status },
          newValues: { status: dto.status, hasReason: Boolean(dto.reason) },
        },
      });
      return updated;
    });
  }

  async findAll(organizationId: string, filter: FilterQuotationDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const where: Prisma.CustomerQuotationWhereInput = {
      organizationId,
      ...(filter.dossierId ? { dossierId: filter.dossierId } : {}),
      ...(filter.clientId ? { clientId: filter.clientId } : {}),
      ...(filter.sourceOfferId ? { sourceOfferId: filter.sourceOfferId } : {}),
      ...(filter.sourceOfferVehicleId
        ? { sourceOfferVehicleId: filter.sourceOfferVehicleId }
        : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.customerQuotation.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          currentRevision: { include: { otherCosts: true } },
          dossier: { select: { id: true, reference: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
          sourceOffer: { select: { id: true, reference: true, brand: true, model: true } },
          sourceOfferVehicle: {
            select: { id: true, lineNumber: true, brand: true, model: true, version: true },
          },
        },
      }),
      this.prisma.customerQuotation.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const quotation = await this.prisma.customerQuotation.findFirst({
      where: { id, organizationId },
      include: {
        currentRevision: { include: { otherCosts: true, exchangeRate: true } },
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          include: {
            otherCosts: { orderBy: { sortOrder: 'asc' } },
            creator: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        dossier: { select: { id: true, reference: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
        sourceOffer: { select: { id: true, reference: true, brand: true, model: true } },
        sourceOfferVehicle: true,
      },
    });
    if (!quotation) throw new NotFoundException('Devis introuvable.');
    return quotation;
  }
}
