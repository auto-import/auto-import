import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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
    const baseCurrency = dto.baseCurrency.trim().toUpperCase();
    const quoteCurrency = dto.quoteCurrency.trim().toUpperCase();
    if (!['USD', 'CNY'].includes(baseCurrency) || quoteCurrency !== 'DZD') {
      throw new BadRequestException(
        'Seuls les taux USD vers DZD et CNY vers DZD sont autorisés.',
      );
    }
    if (dto.rate <= 0) {
      throw new BadRequestException(
        'Le taux de change doit être strictement positif.',
      );
    }

    const effectiveAt = dto.effectiveAt
      ? new Date(dto.effectiveAt)
      : new Date();

    const rate = await this.prisma.exchangeRate.create({
      data: {
        organizationId,
        baseCurrency,
        quoteCurrency,
        rateType: dto.rateType ?? 'COMMERCIAL',
        rate: new Prisma.Decimal(dto.rate),
        isActive: dto.isActive ?? true,
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

  async setActive(
    organizationId: string,
    userId: string,
    id: string,
    isActive: boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.exchangeRate.findFirst({
        where: { id, organizationId },
      });
      if (!existing) throw new NotFoundException('Taux de change introuvable.');
      const updated = await tx.exchangeRate.update({
        where: { id },
        data: { isActive },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'EXCHANGE_RATE_STATUS_CHANGED',
          entityType: 'ExchangeRate',
          entityId: id,
          oldValues: { isActive: existing.isActive },
          newValues: { isActive },
        },
      });
      return updated;
    });
  }

  /**
   * Strict source-of-truth lookup for DZD profitability. Only an explicit,
   * active foreign-currency -> DZD row is accepted. Inverse rows are diagnosed
   * but never inverted, and the newest invalid row never falls back silently.
   */
  async findActiveDzdRateSnapshot(
    tx: Prisma.TransactionClient,
    organizationId: string,
    currencyValue: string,
    atDate = new Date(),
    rateType = 'COMMERCIAL',
  ): Promise<{ exchangeRateId: string | null; rate: Prisma.Decimal }> {
    const currency = currencyValue.trim().toUpperCase();
    if (currency === 'DZD') {
      return { exchangeRateId: null, rate: new Prisma.Decimal(1) };
    }
    if (!['USD', 'CNY'].includes(currency)) {
      throw new BadRequestException(
        `Devise non prise en charge : ${currency}. Utilisez USD ou CNY.`,
      );
    }

    const direct = await tx.exchangeRate.findFirst({
      where: {
        organizationId,
        baseCurrency: currency,
        quoteCurrency: 'DZD',
        rateType,
        isActive: true,
        effectiveAt: { lte: atDate },
      },
      orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (direct) {
      if (!direct.rate.isFinite() || !direct.rate.gt(0)) {
        throw new ConflictException(
          `Impossible de calculer le devis : le taux actif ${currency} vers DZD configuré dans Finance est invalide.`,
        );
      }
      return { exchangeRateId: direct.id, rate: direct.rate };
    }

    const inverse = await tx.exchangeRate.findFirst({
      where: {
        organizationId,
        baseCurrency: 'DZD',
        quoteCurrency: currency,
        isActive: true,
        effectiveAt: { lte: atDate },
      },
      orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });
    if (inverse) {
      throw new ConflictException(
        `Impossible de calculer le devis : le taux Finance est configuré dans le mauvais sens. Configurez ${currency} vers DZD (1 ${currency} = x DZD).`,
      );
    }
    throw new ConflictException(
      `Impossible de calculer le devis : aucun taux ${currency} vers DZD actif n'est configuré dans Finance.`,
    );
  }

  async currentActiveDzdRates(
    tx: Prisma.TransactionClient,
    organizationId: string,
    atDate = new Date(),
  ) {
    const rows = await tx.exchangeRate.findMany({
      where: {
        organizationId,
        baseCurrency: { in: ['USD', 'CNY'] },
        rateType: 'COMMERCIAL',
        quoteCurrency: 'DZD',
        isActive: true,
        effectiveAt: { lte: atDate },
      },
      orderBy: [
        { baseCurrency: 'asc' },
        { effectiveAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });
    const currencies = new Set<string>();
    const result: Array<{
      currency: string;
      exchangeRateId: string | null;
      exchangeRateUsed: Prisma.Decimal;
    }> = [
      {
        currency: 'DZD',
        exchangeRateId: null,
        exchangeRateUsed: new Prisma.Decimal(1),
      },
    ];
    for (const row of rows) {
      const currency = row.baseCurrency.trim().toUpperCase();
      if (currency === 'DZD' || currencies.has(currency)) continue;
      currencies.add(currency);
      if (!row.rate.isFinite() || !row.rate.gt(0)) continue;
      result.push({
        currency,
        exchangeRateId: row.id,
        exchangeRateUsed: row.rate,
      });
    }
    return result;
  }

  async findAll(organizationId: string, filter: FilterExchangeRatesDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const where: Prisma.ExchangeRateWhereInput = {
      organizationId,
      ...(filter.rateType ? { rateType: filter.rateType } : {}),
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
    if (quote === 'DZD') {
      return this.findActiveDzdRateSnapshot(
        this.prisma,
        organizationId,
        base,
        targetDate,
      );
    }

    // Direct lookup: base -> quote
    const directRate = await this.prisma.exchangeRate.findFirst({
      where: {
        organizationId,
        baseCurrency: base,
        quoteCurrency: quote,
        isActive: true,
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
        isActive: true,
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
    const snapshots = await this.prisma.$transaction((tx) =>
      this.currentActiveDzdRates(tx, organizationId, atDate),
    );
    return {
      referenceCurrency: 'DZD' as const,
      rates: snapshots.map((snapshot) => ({
        ...snapshot,
        exchangeRateUsed: snapshot.exchangeRateUsed.toString(),
        baseCurrency: snapshot.currency,
        quoteCurrency: 'DZD' as const,
      })),
    };
  }
}
