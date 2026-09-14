import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import { FilterCatalogueDto } from './dto/filter-catalogue.dto';
import { calculateActualProfitability } from '../finance/profitability-calculation';

const catalogueItemInclude = {
  sourceVehicle: {
    include: {
      specs: true,
      supplier: { select: { id: true, name: true, country: true } },
      photos: { include: { file: true } },
    },
  },
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

  async suppliers(organizationId: string) {
    return this.prisma.partner.findMany({
      where: { organizationId, type: 'supplier' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  private where(
    organizationId: string,
    filters: FilterCatalogueDto,
  ): Prisma.CatalogueItemWhereInput {
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
      ...(filters.status === 'available'
        ? {
            reservedQuantity: {
              lt: this.prisma.catalogueItem.fields.availableQuantity,
            },
          }
        : filters.status === 'reserved'
          ? {
              reservedQuantity: {
                gte: this.prisma.catalogueItem.fields.availableQuantity,
              },
            }
          : {}),
      AND: [
        publishedPricing,
        {
          OR: [
            {
              sourceVehicle: {
                organizationId,
                archivedAt: null,
                status: { notIn: ['sold', 'delivered', 'rejected'] },
                ...(filters.supplierId
                  ? { supplierId: filters.supplierId }
                  : {}),
              },
            },
            {
              sourceOfferVehicle: {
                organizationId,
                status: {
                  notIn: ['PURCHASED', 'LOST_DEAL', 'EXPIRED', 'REJECTED'],
                },
                offer: {
                  organizationId,
                  archivedAt: null,
                  OR: [
                    { offerStatus: null },
                    {
                      offerStatus: {
                        notIn: [
                          'PURCHASED',
                          'LOST_DEAL',
                          'EXPIRED',
                          'REJECTED',
                        ],
                      },
                    },
                  ],
                  ...(filters.supplierId
                    ? { supplierId: filters.supplierId }
                    : {}),
                },
              },
            },
          ],
        },
        ...(filters.sourceType === 'VEHICLE'
          ? [{ sourceVehicleId: { not: null } }]
          : filters.sourceType === 'CHINA_OFFER'
            ? [{ sourceOfferVehicleId: { not: null } }]
            : []),
        ...(filters.search
          ? [
              {
                OR: [
                  ...['brand', 'model', 'trim', 'vin'].map(
                    (field) =>
                      ({
                        sourceVehicle: {
                          [field]: {
                            contains: filters.search,
                            mode: 'insensitive',
                          },
                        },
                      }) as Prisma.CatalogueItemWhereInput,
                  ),
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
    return where;
  }

  async findAll(organizationId: string, filters: FilterCatalogueDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const where = this.where(organizationId, filters);
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
      where: { ...this.where(organizationId, {}), id },
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
    if (
      !quotation ||
      !revision ||
      !quotation.cataloguePublished ||
      ['REJECTED', 'EXPIRED'].includes(quotation.status) ||
      (quotation.expiresAt && quotation.expiresAt < new Date())
    )
      return null;
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
    const materialized = item.sourceVehicle ?? source?.purchases[0]?.vehicle;
    const vehicle = item.sourceVehicle;
    const remainingQuantity = Math.max(
      0,
      item.availableQuantity - item.reservedQuantity,
    );
    const specification =
      source?.specification &&
      typeof source?.specification === 'object' &&
      !Array.isArray(source?.specification)
        ? source?.specification
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
      sourceVehicleId: item.sourceVehicleId,
      sourceType: vehicle ? ('VEHICLE' as const) : ('CHINA_OFFER' as const),
      sourceId: vehicle?.id ?? source?.offerId,
      brand: vehicle?.brand ?? source?.brand,
      model: vehicle?.model ?? source?.model,
      version: vehicle?.trim ?? source?.version,
      trim: materialized?.trim ?? vehicle?.trim ?? source?.version,
      year: vehicle?.year ?? source?.year,
      condition: vehicle?.condition ?? source?.condition,
      mileage: materialized?.mileage ?? vehicle?.mileage ?? source?.mileage,
      specification: source?.specification,
      vin: materialized?.vin ?? vehicle?.vin ?? source?.vin,
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
      dossierEligibility: {
        cif: this.dossierEligible(item, item.activeCifQuotation, 'CIF'),
        ddp: this.dossierEligible(item, item.activeDdpQuotation, 'DDP'),
      },
      currency: 'DZD' as const,
      cifPrice: cifPricing?.sellingPriceDzd ?? null,
      ddpPrice: ddpPricing?.sellingPriceDzd ?? null,
      activeCifQuotationId: item.activeCifQuotationId,
      activeDdpQuotationId: item.activeDdpQuotationId,
      pricing: { cif: cifPricing, ddp: ddpPricing },
      offer: source
        ? { id: source.offer.id, reference: source.offer.reference }
        : null,
      supplier: vehicle?.supplier ?? source?.offer.supplier ?? null,
      photos: vehicle?.photos ?? source?.offer.photos ?? [],
      publishedAt: item.publishedAt,
    };
  }

  private dossierEligible(
    item: CatalogueRecord,
    quote: CatalogueRecord['activeCifQuotation'],
    basis: string,
  ) {
    const source = item.sourceOfferVehicle;
    const revision = quote?.currentRevision;
    return Boolean(
      item.availableQuantity > item.reservedQuantity &&
      (item.sourceVehicle
        ? !item.sourceVehicle.archivedAt &&
          item.sourceVehicle.status === 'available'
        : source &&
          source.quantity >
            source.reservedQuantity + source.purchasedQuantity &&
          source.offer.availableQuantity > source.offer.reservedQuantity &&
          !source.offer.archivedAt &&
          !['PURCHASED', 'LOST_DEAL', 'EXPIRED', 'REJECTED'].includes(
            source.status,
          ) &&
          !['PURCHASED', 'LOST_DEAL', 'EXPIRED', 'REJECTED'].includes(
            source.offer.offerStatus ?? '',
          )) &&
      quote?.cataloguePublished &&
      revision &&
      quote.currency === 'DZD' &&
      quote.priceBasis === basis &&
      quote.organizationId === item.organizationId &&
      (item.sourceVehicleId
        ? quote.sourceVehicleId === item.sourceVehicleId
        : quote.sourceOfferVehicleId === source?.id) &&
      revision.organizationId === item.organizationId &&
      revision.quotationId === quote.id &&
      !['REJECTED', 'EXPIRED'].includes(quote.status) &&
      (!quote.expiresAt || quote.expiresAt >= new Date()) &&
      revision.finalCustomerPriceDzd.isFinite() &&
      revision.finalCustomerPriceDzd.gt(0),
    );
  }
}
