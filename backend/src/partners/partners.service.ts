import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { FilterPartnerDto } from './dto/filter-partner.dto';
import { paginate } from '../common/helpers/pagination.helper';

@Injectable()
export class PartnersService {
  private readonly logger = new Logger(PartnersService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePartnerDto, organizationId: string) {
    const partner = await this.prisma.partner.create({
      data: {
        ...dto,
        organizationId,
        status: dto.status || 'active',
      },
    });

    this.logger.log(
      `Partner created: ${partner.name} (${partner.id}) [${partner.type}] for org ${organizationId}`,
    );
    return partner;
  }

  async findAll(organizationId: string, filters?: FilterPartnerDto) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PartnerWhereInput = { organizationId };

    if (filters?.type) where.type = filters.type;
    if (filters?.status) where.status = filters.status;
    if (filters?.country) where.country = filters.country;

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { contactPerson: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [partners, total] = await Promise.all([
      this.prisma.partner.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.partner.count({ where }),
    ]);

    return paginate(partners, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { id, organizationId },
      include: {
        _count: {
          select: {
            suppliedVehicles: true,
            chinaOffers: true,
            purchases: true,
          },
        },
        suppliedVehicles: {
          select: {
            id: true,
            brand: true,
            model: true,
            status: true,
            vin: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        chinaOffers: {
          select: {
            id: true,
            reference: true,
            brand: true,
            model: true,
            status: true,
            validUntil: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!partner) {
      throw new NotFoundException(
        `Partner with ID ${id} not found in your organization`,
      );
    }

    return partner;
  }

  async update(id: string, organizationId: string, dto: UpdatePartnerDto) {
    await this.findOne(id, organizationId);

    const updated = await this.prisma.partner.update({
      where: { id },
      data: dto,
    });

    this.logger.log(`Partner updated: ${id} (${updated.name})`);
    return updated;
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    const archived = await this.prisma.partner.update({
      where: { id },
      data: { status: 'archived' },
    });

    this.logger.log(`Partner archived: ${id}`);
    return archived;
  }
}
