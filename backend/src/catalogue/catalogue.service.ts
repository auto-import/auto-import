import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import { FilterCatalogueDto } from './dto/filter-catalogue.dto';

@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, filters: FilterCatalogueDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const publishedPricing: Prisma.CatalogueItemWhereInput = {
      OR: [
        { activeCifQuotationId: { not: null } },
        { activeDdpQuotationId: { not: null } },
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
              validUntil: { gte: new Date() },
              OR: [
                { offerStatus: null },
                { offerStatus: { notIn: ['LOST_DEAL', 'EXPIRED'] } },
              ],
              ...(filters.supplierId
                ? { supplierId: filters.supplierId }
                : {}),
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
                      version: { contains: filters.search, mode: 'insensitive' },
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
        include: {
          sourceOfferVehicle: {
            include: {
              offer: {
                include: {
                  supplier: { select: { id: true, name: true, country: true } },
                  photos: {
                    include: { file: true },
                    orderBy: { sortOrder: 'asc' },
                  },
                },
              },
            },
          },
          activeCifQuotation: { include: { currentRevision: true } },
          activeDdpQuotation: { include: { currentRevision: true } },
        },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.catalogueItem.count({ where }),
    ]);
    const presented = items
      .map((item) => {
        const vehicle = item.sourceOfferVehicle;
        const remainingQuantity = Math.max(
          0,
          item.availableQuantity - item.reservedQuantity,
        );
        return {
          id: item.id,
          catalogueItemId: item.id,
          sourceOfferVehicleId: item.sourceOfferVehicleId,
          brand: vehicle.brand,
          model: vehicle.model,
          version: vehicle.version,
          trim: vehicle.version,
          year: vehicle.year,
          condition: vehicle.condition,
          mileage: vehicle.mileage,
          vin: vehicle.vin,
          status: remainingQuantity > 0 ? 'available' : 'reserved',
          availableQuantity: item.availableQuantity,
          reservedQuantity: item.reservedQuantity,
          remainingQuantity,
          currency: 'DZD',
          cifPrice:
            item.activeCifQuotation?.currentRevision?.finalCustomerPriceDzd ??
            null,
          ddpPrice:
            item.activeDdpQuotation?.currentRevision?.finalCustomerPriceDzd ??
            null,
          activeCifQuotationId: item.activeCifQuotationId,
          activeDdpQuotationId: item.activeDdpQuotationId,
          offer: {
            id: vehicle.offer.id,
            reference: vehicle.offer.reference,
          },
          supplier: vehicle.offer.supplier,
          photos: vehicle.offer.photos,
          publishedAt: item.publishedAt,
        };
      })
      .filter((item) => !filters.status || item.status === filters.status);
    return paginate(presented, total, page, limit);
  }
}
