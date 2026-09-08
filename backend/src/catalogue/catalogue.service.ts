import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import { FilterCatalogueDto } from './dto/filter-catalogue.dto';
import { calculateActualProfitability } from '../finance/profitability-calculation';

const catalogueItemInclude = {
  sourceOfferVehicle: {
    include: {
      offer: {
        include: {
          supplier: { select: { id: true, name: true, country: true } },
          photos: {
            include: { file: true },
            orderBy: { sortOrder: 'asc' as const },
          },
        },
      },
      purchases: {
        include: { vehicle: { include: { specs: true } } },
        orderBy: { createdAt: 'desc' as const },
      },
    },
  },
  activeCifQuotation: {
    include: { currentRevision: { include: { costItems: true } } },
  },
  activeDdpQuotation: {
    include: { currentRevision: { include: { costItems: true } } },
  },
  dossiers: {
    where: { archivedAt: null },
    include: {
      costs: true,
      commercialQuotationRevision: { include: { costItems: true } },
    },
    orderBy: { openedAt: 'desc' as const },
  },
} satisfies Prisma.CatalogueItemInclude;

type CatalogueRecord = Prisma.CatalogueItemGetPayload<{
  include: typeof catalogueItemInclude;
}>;

@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters: FilterCatalogueDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const publishedPricing: Prisma.CatalogueItemWhereInput = {
      OR: [
        {
          activeCifQuotation: {
            is: {
              cataloguePublished: true,
              status: { notIn: ['REJECTED', 'EXPIRED'] },
              currentRevisionId: { not: null },
              OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
            },
          },
        },
        {
          activeDdpQuotation: {
            is: {
              cataloguePublished: true,
              status: { notIn: ['REJECTED', 'EXPIRED'] },
              currentRevisionId: { not: null },
              OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
            },
          },
        },
      ],
    };
    const where: Prisma.CatalogueItemWhereInput = {
      organizationId,
      archivedAt: null,
      AND: [
        publishedPricing,
        {
          sourceOfferVehicle: {
            offer: {
              archivedAt: null,
              OR: [
                { offerStatus: null },
                { offerStatus: { notIn: ['LOST_DEAL', 'EXPIRED'] } },
              ],
              ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
            },
          },
        },
        ...(filters.search
          ? [
              {
                OR: [
                  {
                    sourceOfferVehicle: {
                      brand: { contains: filters.search, mode: 'insensitive' },
                    },
                  },
                  {
                    sourceOfferVehicle: {
                      model: { contains: filters.search, mode: 'insensitive' },
                    },
                  },
                  {
                    sourceOfferVehicle: {
                      version: {
                        contains: filters.search,
                        mode: 'insensitive',
                      },
                    },
                  },
                  {
                    sourceOfferVehicle: {
                      vin: { contains: filters.search, mode: 'insensitive' },
                    },
                  },
                ],
              } satisfies Prisma.CatalogueItemWhereInput,
            ]
          : []),
      ],
    };
    const [items, total] = await Promise.all([
      this.prisma.catalogueItem.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: catalogueItemInclude,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.catalogueItem.count({ where }),
    ]);
    const presented = items
      .map((item) => this.present(item))
      .filter((item) => !filters.status || item.status === filters.status);
    return paginate(presented, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const item = await this.prisma.catalogueItem.findFirst({
      where: { id, organizationId, archivedAt: null },
      include: catalogueItemInclude,
    });
    if (!item) throw new NotFoundException('Véhicule catalogue introuvable.');
    return this.present(item);
  }

  private quotationPricing(
    item: CatalogueRecord,
    quotation:
      | CatalogueRecord['activeCifQuotation']
      | CatalogueRecord['activeDdpQuotation'],
  ) {
    const revision = quotation?.currentRevision;
    if (!quotation || !revision) return null;
    const operations = item.dossiers
      .filter((dossier) => dossier.commercialQuotationId === quotation.id)
      .map((dossier) => {
        const acceptedRevision =
          dossier.commercialQuotationRevision ?? revision;
        const lockedSellingPrice =
          dossier.type === 'VEHICLE_SALE_DDP'
            ? dossier.ddpPrice
            : dossier.cifPrice;
        return {
          dossierId: dossier.id,
          dossierReference: dossier.reference,
          estimatedTotalCostDzd:
            acceptedRevision.estimatedTotalCostDzd.toString(),
          estimatedProfitDzd: acceptedRevision.estimatedProfitDzd.toString(),
          estimatedMarginPercent:
            acceptedRevision.estimatedMarginPercent.toString(),
          ...calculateActualProfitability(
            lockedSellingPrice ?? acceptedRevision.sellingPriceDzd,
            dossier.costs,
            dossier.closedAt !== null,
          ),
        };
      });
    return {
      quotationId: quotation.id,
      quotationNumber: quotation.quotationNumber,
      priceBasis: quotation.priceBasis,
      sellingPriceDzd: revision.sellingPriceDzd.toString(),
      estimatedCifCostDzd: revision.estimatedCifCostDzd.toString(),
      estimatedLandedCostDzd: revision.estimatedLandedCostDzd.toString(),
      estimatedTotalCostDzd: revision.estimatedTotalCostDzd.toString(),
      estimatedProfitDzd: revision.estimatedProfitDzd.toString(),
      estimatedMarginPercent: revision.estimatedMarginPercent.toString(),
      estimatedCosts: revision.costItems.map((cost) => ({
        id: cost.id,
        costType: cost.costType,
        description: cost.description,
        status: cost.costStatus,
        originalAmount: cost.originalAmount.toString(),
        currency: cost.currency,
        exchangeRateUsed: cost.exchangeRateUsed.toString(),
        amountDzd: cost.amountDzd.toString(),
      })),
      actual: operations.find((operation) => operation.available) ?? null,
      actualOperations: operations,
    };
  }

  private present(item: CatalogueRecord) {
    const source = item.sourceOfferVehicle;
    const materialized = source.purchases[0]?.vehicle;
    const remainingQuantity = Math.max(
      0,
      item.availableQuantity - item.reservedQuantity,
    );
    const specification =
      source.specification &&
      typeof source.specification === 'object' &&
      !Array.isArray(source.specification)
        ? source.specification
        : {};
    const value = (key: string) => {
      const candidate = (specification as Record<string, unknown>)[key];
      return typeof candidate === 'string' ? candidate : null;
    };
    const cifPricing = this.quotationPricing(item, item.activeCifQuotation);
    const ddpPricing = this.quotationPricing(item, item.activeDdpQuotation);
    return {
      id: item.id,
      catalogueItemId: item.id,
      sourceOfferVehicleId: item.sourceOfferVehicleId,
      brand: source.brand,
      model: source.model,
      version: source.version,
      trim: materialized?.trim ?? source.version,
      year: source.year,
      condition: source.condition,
      mileage: materialized?.mileage ?? source.mileage,
      specification: source.specification,
      vin: materialized?.vin ?? source.vin,
      fuel: materialized?.specs?.fuelType ?? value('fuelType') ?? value('fuel'),
      transmission: materialized?.specs?.transmission ?? value('transmission'),
      color: materialized?.specs?.color ?? value('color'),
      // Catalogue availability is governed by its own atomic reservation
      // counters. A materialized purchased vehicle must not hide the remaining
      // units of a multi-vehicle offer from sourcing.
      status: remainingQuantity > 0 ? 'available' : 'reserved',
      availableQuantity: item.availableQuantity,
      reservedQuantity: item.reservedQuantity,
      remainingQuantity,
      currency: 'DZD' as const,
      cifPrice: cifPricing?.sellingPriceDzd ?? null,
      ddpPrice: ddpPricing?.sellingPriceDzd ?? null,
      activeCifQuotationId: item.activeCifQuotationId,
      activeDdpQuotationId: item.activeDdpQuotationId,
      pricing: { cif: cifPricing, ddp: ddpPricing },
      offer: { id: source.offer.id, reference: source.offer.reference },
      supplier: source.offer.supplier,
      photos: source.offer.photos,
      publishedAt: item.publishedAt,
    };
  }
}
