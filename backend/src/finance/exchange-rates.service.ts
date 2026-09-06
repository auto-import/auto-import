import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
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
    return (
      await this.findEffectiveRateSnapshot(
        organizationId,
        baseCurrency,
        quoteCurrency,
        atDate,
      )
    ).rate;
  }

  async findEffectiveRateSnapshot(
    organizationId: string,
    baseCurrency: string,
    quoteCurrency: string,
    atDate?: Date,
  ): Promise<{ exchangeRateId: string | null; rate: Prisma.Decimal }> {
    const base = baseCurrency.toUpperCase();
    const quote = quoteCurrency.toUpperCase();

    if (base === quote) {
      return { exchangeRateId: null, rate: new Prisma.Decimal(1) };
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
      return { exchangeRateId: directRate.id, rate: directRate.rate };
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
      return {
        exchangeRateId: inverseRate.id,
        rate: new Prisma.Decimal(1).dividedBy(inverseRate.rate),
      };
    }

    throw new ConflictException({
      code: 'HISTORICAL_EXCHANGE_RATE_REQUIRED',
      message: `No ${base}/${quote} exchange rate exists at the transaction date`,
    });
  }

  async currentDzdRates(organizationId: string, atDate = new Date()) {
    const rows = await this.prisma.exchangeRate.findMany({
      where: {
        organizationId,
        effectiveAt: { lte: atDate },
        OR: [{ quoteCurrency: 'DZD' }, { baseCurrency: 'DZD' }],
      },
      orderBy: { effectiveAt: 'desc' },
    });
    const snapshots = new Map<
      string,
      {
        currency: string;
        exchangeRateId: string | null;
        exchangeRateUsed: string;
      }
    >();
    snapshots.set('DZD', {
      currency: 'DZD',
      exchangeRateId: null,
      exchangeRateUsed: '1',
    });
    for (const row of rows) {
      const currency = (
        row.quoteCurrency === 'DZD' ? row.baseCurrency : row.quoteCurrency
      ).toUpperCase();
      if (
        currency === 'DZD' ||
        snapshots.has(currency) ||
        !row.rate.isPositive()
      ) {
        continue;
      }
      snapshots.set(currency, {
        currency,
        exchangeRateId: row.id,
        exchangeRateUsed:
          row.quoteCurrency === 'DZD'
            ? row.rate.toString()
            : new Prisma.Decimal(1).div(row.rate).toString(),
      });
    }
    return {
      referenceCurrency: 'DZD' as const,
      rates: [...snapshots.values()],
    };
  }
}
