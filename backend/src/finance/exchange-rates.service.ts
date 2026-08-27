import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import {
  CreateExchangeRateDto,
  FilterExchangeRatesDto,
} from './dto/finance.dto';

@Injectable()
export class ExchangeRatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    userId: string,
    dto: CreateExchangeRateDto,
  ) {
    if (dto.rate <= 0) {
      throw new BadRequestException('Exchange rate must be positive');
    }

    const effectiveAt = dto.effectiveAt
      ? new Date(dto.effectiveAt)
      : new Date();

    const rate = await this.prisma.exchangeRate.create({
      data: {
        organizationId,
        baseCurrency: dto.baseCurrency.toUpperCase(),
        quoteCurrency: dto.quoteCurrency.toUpperCase(),
        rate: new Prisma.Decimal(dto.rate),
        effectiveAt,
        source: dto.source || 'manual',
        notes: dto.notes,
        createdById: userId,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return rate;
  }

  async findAll(organizationId: string, filter: FilterExchangeRatesDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const where: Prisma.ExchangeRateWhereInput = {
      organizationId,
      ...(filter.baseCurrency
        ? { baseCurrency: filter.baseCurrency.toUpperCase() }
        : {}),
      ...(filter.quoteCurrency
        ? { quoteCurrency: filter.quoteCurrency.toUpperCase() }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.exchangeRate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { effectiveAt: 'desc' },
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.exchangeRate.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  async findEffectiveRate(
    organizationId: string,
    baseCurrency: string,
    quoteCurrency: string,
    atDate?: Date,
  ): Promise<Prisma.Decimal> {
    const base = baseCurrency.toUpperCase();
    const quote = quoteCurrency.toUpperCase();

    if (base === quote) {
      return new Prisma.Decimal(1);
    }

    const targetDate = atDate || new Date();

    // Direct lookup: base -> quote
    const directRate = await this.prisma.exchangeRate.findFirst({
      where: {
        organizationId,
        baseCurrency: base,
        quoteCurrency: quote,
        effectiveAt: { lte: targetDate },
      },
      orderBy: { effectiveAt: 'desc' },
    });

    if (directRate) {
      return directRate.rate;
    }

    // Inverse lookup: quote -> base
    const inverseRate = await this.prisma.exchangeRate.findFirst({
      where: {
        organizationId,
        baseCurrency: quote,
        quoteCurrency: base,
        effectiveAt: { lte: targetDate },
      },
      orderBy: { effectiveAt: 'desc' },
    });

    if (inverseRate && !inverseRate.rate.isZero()) {
      return new Prisma.Decimal(1).dividedBy(inverseRate.rate);
    }

    // Fallback default official pegs if not yet seeded
    if (base === 'DZD' && quote === 'USD') return new Prisma.Decimal(135.0);
    if (base === 'DZD' && quote === 'EUR') return new Prisma.Decimal(145.0);
    if (base === 'DZD' && quote === 'CNY') return new Prisma.Decimal(18.5);
    if (base === 'USD' && quote === 'DZD')
      return new Prisma.Decimal(1).dividedBy(135.0);
    if (base === 'EUR' && quote === 'DZD')
      return new Prisma.Decimal(1).dividedBy(145.0);
    if (base === 'CNY' && quote === 'DZD')
      return new Prisma.Decimal(1).dividedBy(18.5);

    return new Prisma.Decimal(1);
  }
}
