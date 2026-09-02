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
    const ownership: Prisma.VehicleWhereInput = {
      OR: [
        {
          purchases: {
            some: { organizationId, status: { not: 'cancelled' } },
          },
        },
        {
          acquisitionType: 'stock',
          acquiredAt: { not: null },
        },
      ],
    };
    const where: Prisma.VehicleWhereInput = {
      organizationId,
      archivedAt: null,
      ...ownership,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.acquisitionType
        ? { acquisitionType: filters.acquisitionType }
        : {}),
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters.search
        ? {
            AND: [
              ownership,
              {
                OR: [
                  {
                    brand: {
                      contains: filters.search,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    model: {
                      contains: filters.search,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    trim: {
                      contains: filters.search,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    vin: {
                      contains: filters.search,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          specs: true,
          supplier: { select: { id: true, name: true, country: true } },
          currentLocation: {
            include: { warehouse: { select: { id: true, name: true } } },
          },
          photos: {
            include: { file: true },
            orderBy: { sortOrder: 'asc' },
          },
          purchases: {
            where: { organizationId, status: { not: 'cancelled' } },
            include: {
              sourceOffer: {
                select: { id: true, reference: true, offerStatus: true },
              },
              sourceOfferVehicle: {
                select: { id: true, lineNumber: true, status: true },
              },
            },
            orderBy: { purchaseDate: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ acquiredAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }
}
