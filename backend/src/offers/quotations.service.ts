import {
  BadRequestException,
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

  async preview(organizationId: string, dto: CreateQuotationDto) {
    const calculated = await this.prisma.$transaction(async (tx) => {
      const sourceVehicle = await this.findSourceVehicle(
        tx,
        organizationId,
        dto,
      );
      const normalized = this.normalizeVehicleAmount(dto, sourceVehicle);
      const rates = await this.pricing.resolveRequiredRates(
        tx,
        organizationId,
        normalized,
        new Date(),
      );
      return this.pricing.calculate(dto.priceBasis, normalized, rates);
    });
    return this.serialize(calculated);
  }

  async currentUsdDzdRate(organizationId: string) {
    const exchange = await this.prisma.$transaction((tx) =>
      this.pricing.usdToDzdSnapshot(tx, organizationId, new Date()),
    );
    return {
      exchangeRateId: exchange.exchangeRateId,
      exchangeRateSnapshot: exchange.rate.toString(),
      baseCurrency: 'USD',
      quoteCurrency: 'DZD',
    };
  }

  async currentDzdRates(organizationId: string) {
    const rates = await this.prisma.$transaction((tx) =>
      this.pricing.currentDzdRates(tx, organizationId, new Date()),
    );
    return {
      baseCurrency: 'DZD',
      rates: rates.map((rate) => ({
        currency: rate.currency,
        exchangeRateId: rate.exchangeRateId,
        exchangeRateUsed: rate.exchangeRateUsed.toString(),
      })),
    };
  }

  private serialize(value: unknown): unknown {
    if (value instanceof Prisma.Decimal) return value.toString();
    if (Array.isArray(value)) return value.map((item) => this.serialize(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.serialize(item)]),
      );
    }
    return value;
  }

  private async findSourceVehicle(
    tx: Prisma.TransactionClient,
    organizationId: string,
    dto: Pick<CreateQuotationDto, 'sourceOfferId' | 'sourceOfferVehicleId'>,
  ) {
    const sourceVehicle = await tx.chinaOfferVehicle.findFirst({
      where: {
        organizationId,
        offerId: dto.sourceOfferId,
        ...(dto.sourceOfferVehicleId ? { id: dto.sourceOfferVehicleId } : {}),
        offer: { archivedAt: null },
      },
      orderBy: { lineNumber: 'asc' },
    });
    if (!sourceVehicle) {
      throw new NotFoundException("Véhicule de l'offre introuvable.");
    }
    return sourceVehicle;
  }

  private normalizeVehicleAmount<T extends QuotationAmountsDto>(
    dto: T,
    sourceVehicle: { supplierPrice: Prisma.Decimal; currency: string },
  ): T {
    const supplierPrice = sourceVehicle.supplierPrice;
    if (!new Prisma.Decimal(dto.vehicleAmount).equals(supplierPrice)) {
      throw new BadRequestException(
        'Le prix de base du devis doit correspondre au prix fournisseur du véhicule sélectionné.',
      );
    }
    const sourceCurrency = sourceVehicle.currency.trim().toUpperCase();
    if (dto.vehicleCurrency.trim().toUpperCase() !== sourceCurrency) {
      throw new BadRequestException(
        'La devise du coût véhicule doit correspondre à celle de l’offre.',
      );
    }
    return {
      ...dto,
      vehicleAmount: supplierPrice.toNumber(),
      vehicleCurrency: sourceCurrency,
      containerCurrency: dto.containerCurrency.trim().toUpperCase(),
      insuranceCurrency: dto.insuranceCurrency.trim().toUpperCase(),
      transitCurrency: dto.transitCurrency.trim().toUpperCase(),
      otherCosts: dto.otherCosts?.map((cost) => ({
        ...cost,
        currency: cost.currency.trim().toUpperCase(),
      })),
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
  ): Prisma.InputJsonObject {
    return {
      formula:
        'DZD: CIF=véhicule+fret+assurance+transit+autres; landed=CIF+douane; profit=vente-coût; marge=profit/vente*100',
      containerPrice: calculated.containerPrice.toString(),
      containerCurrency: calculated.containerCurrency,
      containerAllocation: `1/${calculated.containerAllocation}`,
      costs: calculated.costs.map((cost) => ({
        costType: cost.costType,
        description: cost.description,
        originalAmount: cost.originalAmount.toString(),
        currency: cost.currency,
        exchangeRateUsed: cost.exchangeRateUsed.toString(),
        amountDzd: cost.amountDzd.toString(),
      })),
      estimatedCifCostDzd: calculated.estimatedCifCostDzd.toString(),
      estimatedLandedCostDzd: calculated.estimatedLandedCostDzd.toString(),
      estimatedTotalCostDzd: calculated.estimatedTotalCostDzd.toString(),
      sellingPriceDzd: calculated.sellingPriceDzd.toString(),
      estimatedProfitDzd: calculated.estimatedProfitDzd.toString(),
      estimatedMarginPercent: calculated.estimatedMarginPercent.toString(),
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
      if (!offer)
        throw new NotFoundException('Offre Chine active introuvable.');
      const sourceVehicle = dto.sourceOfferVehicleId
        ? offer.vehicles.find(
            (vehicle) => vehicle.id === dto.sourceOfferVehicleId,
          )
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
      const normalized = this.normalizeVehicleAmount(dto, sourceVehicle);
      let sourceOfferRevisionId = offer.currentRevisionId;
      if (!sourceOfferRevisionId) {
        const latest = await tx.chinaOfferRevision.aggregate({
          where: { offerId: offer.id },
          _max: { revisionNumber: true },
        });
        const revision = await tx.chinaOfferRevision.create({
          data: {
            organizationId,
            offerId: offer.id,
            revisionNumber: (latest._max.revisionNumber ?? 0) + 1,
            supplierPrice:
              offer.supplierPrice ??
              offer.purchasePrice ??
              sourceVehicle.supplierPrice,
            currency: offer.currency,
            incoterm: offer.incoterm,
            localCost: offer.localCost,
            totalOfferPrice:
              offer.totalOfferPrice ??
              offer.supplierPrice ??
              offer.purchasePrice,
            location: offer.location,
            quantity: offer.availableQuantity,
            leadTimeDays: offer.leadTimeDays ?? offer.estimatedDelayDays,
            validFrom: offer.validFrom,
            validUntil: offer.validUntil,
            paymentConditions: offer.paymentConditions,
            snapshot: {
              brand: offer.brand,
              model: offer.model,
              version: offer.version,
              year: offer.year,
              condition: offer.condition,
              mileage: offer.mileage,
              specification: offer.specification,
            },
            reason: 'Base historique créée lors du premier devis',
            createdBy: userId,
          },
        });
        sourceOfferRevisionId = revision.id;
        await tx.chinaOffer.update({
          where: { id: offer.id },
          data: { currentRevisionId: sourceOfferRevisionId },
        });
      }
      const rates = await this.pricing.resolveRequiredRates(
        tx,
        organizationId,
        normalized,
        now,
      );
      const calculated = this.pricing.calculate(
        dto.priceBasis,
        normalized,
        rates,
      );

      const quotation = await tx.customerQuotation.create({
        data: {
          organizationId,
          quotationNumber: await this.nextNumber(tx, organizationId),
          sourceOfferId: offer.id,
          sourceOfferRevisionId,
          sourceOfferVehicleId: sourceVehicle.id,
          priceBasis: dto.priceBasis,
          currency: 'DZD',
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
          vehicleAmount: calculated.vehicle.originalAmount,
          freightAmount: calculated.freight.originalAmount,
          insuranceAmount: calculated.insurance.originalAmount,
          customsAmount: calculated.customs.originalAmount,
          transitAmount: calculated.transit.originalAmount,
          otherCostsAmount: calculated.otherCosts.reduce(
            (sum, cost) => sum.add(cost.amountDzd),
            new Prisma.Decimal(0),
          ),
          marginAmount: 0,
          finalCustomerPrice: calculated.sellingPriceDzd,
          containerPrice: calculated.containerPrice,
          containerAllocation: calculated.containerAllocation,
          exchangeRateId: calculated.vehicle.exchangeRateId,
          exchangeRateSnapshot: calculated.vehicle.exchangeRateUsed,
          finalCustomerPriceDzd: calculated.sellingPriceDzd,
          sellingPriceDzd: calculated.sellingPriceDzd,
          estimatedCifCostDzd: calculated.estimatedCifCostDzd,
          estimatedLandedCostDzd: calculated.estimatedLandedCostDzd,
          estimatedTotalCostDzd: calculated.estimatedTotalCostDzd,
          estimatedProfitDzd: calculated.estimatedProfitDzd,
          estimatedMarginPercent: calculated.estimatedMarginPercent,
          paymentConditions: dto.paymentConditions,
          validityNote: dto.validityNote,
          notes: dto.notes,
          reason: 'Création du devis',
          snapshot: {
            ...this.snapshot(dto, calculated),
            customsIncluded: dto.priceBasis === 'DDP',
            sourceOfferPrice: String(sourceVehicle.supplierPrice),
            sourceOfferCurrency: sourceVehicle.currency,
          },
          createdBy: userId,
          costItems: {
            create: calculated.costs.map((cost, index) => ({
              organizationId,
              costType: cost.costType,
              costStatus: 'ESTIMATED',
              description: cost.description,
              originalAmount: cost.originalAmount,
              currency: cost.currency,
              exchangeRateId: cost.exchangeRateId,
              exchangeRateUsed: cost.exchangeRateUsed,
              amountDzd: cost.amountDzd,
              sortOrder: index + 1,
            })),
          },
        },
      });
      const updated = await tx.customerQuotation.update({
        where: { id: quotation.id },
        data: { currentRevisionId: revision.id },
        include: { currentRevision: { include: { costItems: true } } },
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
            sellingPriceDzd: calculated.sellingPriceDzd.toString(),
            estimatedTotalCostDzd: calculated.estimatedTotalCostDzd.toString(),
            estimatedProfitDzd: calculated.estimatedProfitDzd.toString(),
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
        include: {
          _count: { select: { revisions: true } },
          sourceOfferVehicle: true,
        },
      });
      if (!quotation) throw new NotFoundException('Devis introuvable.');
      if (!['DRAFT', 'SENT'].includes(quotation.status)) {
        throw new ConflictException(
          'Un devis accepté ou clôturé ne peut plus être modifié.',
        );
      }
      const priceBasis = quotation.priceBasis as 'CIF' | 'DDP';
      const normalized = quotation.sourceOfferVehicle
        ? this.normalizeVehicleAmount(dto, quotation.sourceOfferVehicle)
        : dto;
      const rates = await this.pricing.resolveRequiredRates(
        tx,
        organizationId,
        normalized,
        new Date(),
      );
      const calculated = this.pricing.calculate(priceBasis, normalized, rates);
      const revision = await tx.customerQuotationRevision.create({
        data: {
          organizationId,
          quotationId: id,
          revisionNumber: quotation._count.revisions + 1,
          vehicleAmount: calculated.vehicle.originalAmount,
          freightAmount: calculated.freight.originalAmount,
          insuranceAmount: calculated.insurance.originalAmount,
          customsAmount: calculated.customs.originalAmount,
          transitAmount: calculated.transit.originalAmount,
          otherCostsAmount: calculated.otherCosts.reduce(
            (sum, cost) => sum.add(cost.amountDzd),
            new Prisma.Decimal(0),
          ),
          marginAmount: 0,
          finalCustomerPrice: calculated.sellingPriceDzd,
          containerPrice: calculated.containerPrice,
          containerAllocation: calculated.containerAllocation,
          exchangeRateId: calculated.vehicle.exchangeRateId,
          exchangeRateSnapshot: calculated.vehicle.exchangeRateUsed,
          finalCustomerPriceDzd: calculated.sellingPriceDzd,
          sellingPriceDzd: calculated.sellingPriceDzd,
          estimatedCifCostDzd: calculated.estimatedCifCostDzd,
          estimatedLandedCostDzd: calculated.estimatedLandedCostDzd,
          estimatedTotalCostDzd: calculated.estimatedTotalCostDzd,
          estimatedProfitDzd: calculated.estimatedProfitDzd,
          estimatedMarginPercent: calculated.estimatedMarginPercent,
          paymentConditions: dto.paymentConditions,
          validityNote: dto.validityNote,
          notes: dto.notes,
          reason: dto.reason.trim(),
          snapshot: {
            ...this.snapshot(dto, calculated),
            customsIncluded: priceBasis === 'DDP',
          },
          createdBy: userId,
          costItems: {
            create: calculated.costs.map((cost, index) => ({
              organizationId,
              costType: cost.costType,
              costStatus: 'ESTIMATED',
              description: cost.description,
              originalAmount: cost.originalAmount,
              currency: cost.currency,
              exchangeRateId: cost.exchangeRateId,
              exchangeRateUsed: cost.exchangeRateUsed,
              amountDzd: cost.amountDzd,
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
        include: { currentRevision: { include: { costItems: true } } },
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
          currentRevision: { include: { costItems: true } },
          dossier: { select: { id: true, reference: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
          sourceOffer: {
            select: { id: true, reference: true, brand: true, model: true },
          },
          sourceOfferVehicle: {
            select: {
              id: true,
              lineNumber: true,
              brand: true,
              model: true,
              version: true,
            },
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
        currentRevision: { include: { costItems: true, exchangeRate: true } },
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          include: {
            costItems: { orderBy: { sortOrder: 'asc' } },
            creator: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        dossier: { select: { id: true, reference: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
        sourceOffer: {
          select: { id: true, reference: true, brand: true, model: true },
        },
        sourceOfferVehicle: true,
      },
    });
    if (!quotation) throw new NotFoundException('Devis introuvable.');
    return quotation;
  }
}
