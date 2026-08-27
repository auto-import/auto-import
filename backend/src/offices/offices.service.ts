import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';
import { FilterOfficeDto } from './dto/filter-office.dto';

@Injectable()
export class OfficesService {
  private readonly logger = new Logger(OfficesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOfficeDto, organizationId: string) {
    try {
      const office = await this.prisma.office.create({
        data: { ...dto, name: dto.name.trim(), organizationId },
      });
      this.logger.log(`Office created: ${office.name} (${office.id})`);
      return office;
    } catch (error: unknown) {
      this.rethrowNameConflict(error);
    }
  }

  async findAll(organizationId: string, filters: FilterOfficeDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const where: Prisma.OfficeWhereInput = {
      organizationId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { city: { contains: filters.search, mode: 'insensitive' } },
              { country: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [offices, total] = await Promise.all([
      this.prisma.office.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
        include: { _count: { select: { users: true } } },
      }),
      this.prisma.office.count({ where }),
    ]);
    return paginate(offices, total, page, limit);
  }

  async lookup(organizationId: string) {
    return this.prisma.office.findMany({
      where: { organizationId, status: 'active' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, city: true, country: true },
    });
  }

  async findOne(id: string, organizationId: string) {
    const office = await this.prisma.office.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { users: true } } },
    });
    if (!office) throw new NotFoundException('Office not found');
    return office;
  }

  async update(id: string, organizationId: string, dto: UpdateOfficeDto) {
    await this.findOne(id, organizationId);
    try {
      const office = await this.prisma.office.update({
        where: { id },
        data: { ...dto, ...(dto.name ? { name: dto.name.trim() } : {}) },
      });
      this.logger.log(`Office updated: ${office.name} (${office.id})`);
      return office;
    } catch (error: unknown) {
      this.rethrowNameConflict(error);
    }
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    const userCount = await this.prisma.user.count({ where: { officeId: id } });
    if (userCount > 0) {
      throw new ConflictException('Cannot delete an office assigned to users');
    }
    await this.prisma.office.delete({ where: { id } });
    this.logger.log(`Office deleted: ${id}`);
    return { message: 'Office deleted successfully' };
  }

  private rethrowNameConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'An office with this name already exists in the organization',
      );
    }
    throw error;
  }
}
