import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import {
  CreateCostDto,
  FilterCostsDto,
  ReverseCostDto,
} from './dto/finance.dto';
import { ExchangeRatesService } from './exchange-rates.service';

@Injectable()
export class CostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  async create(organizationId: string, userId: string, dto: CreateCostDto) {
    if (dto.amount <= 0) {
      throw new BadRequestException('Cost amount must be positive');
    }

    if (dto.dossierId) {
      const dossier = await this.prisma.dossier.findFirst({
        where: { id: dto.dossierId, organizationId },
      });
      if (!dossier) throw new NotFoundException('Dossier not found');
    }

    if (dto.purchaseId) {
      const purchase = await this.prisma.purchase.findFirst({
        where: { id: dto.purchaseId, organizationId },
      });
      if (!purchase) throw new NotFoundException('Purchase not found');
    }

    if (dto.shipmentId) {
      const shipment = await this.prisma.shipment.findFirst({
        where: { id: dto.shipmentId, organizationId },
      });
      if (!shipment) throw new NotFoundException('Shipment not found');
    }

    if (dto.customsFileId) {
      const customs = await this.prisma.customsFile.findFirst({
        where: { id: dto.customsFileId, organizationId },
      });
      if (!customs) throw new NotFoundException('Customs file not found');
    }

    const amount = new Prisma.Decimal(dto.amount);
    const currency = dto.currency.toUpperCase();
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    // Convert to base currency (DZD)
    let amountInBaseCurrency = amount;
    if (currency !== 'DZD') {
      const rate = await this.exchangeRates.findEffectiveRate(
        organizationId,
        'DZD',
        currency,
        occurredAt,
      );
      amountInBaseCurrency = amount.mul(rate).toDecimalPlaces(2);
    }

    const cost = await this.prisma.cost.create({
      data: {
        organizationId,
        type: dto.type,
        amount,
        currency,
        exchangeRateId: dto.exchangeRateId,
        amountInBaseCurrency,
        dossierId: dto.dossierId,
        orderId: dto.orderId,
        purchaseId: dto.purchaseId,
        shipmentId: dto.shipmentId,
        customsFileId: dto.customsFileId,
        occurredAt,
        description: dto.description,
        actorUserId: userId,
        status: 'POSTED',
      },
      include: {
        dossier: { select: { id: true, reference: true } },
        purchase: { select: { id: true, purchaseNumber: true } },
        shipment: { select: { id: true, shipmentNumber: true } },
        customsFile: { select: { id: true, reference: true } },
      },
    });

    return cost;
  }

  async reverse(
    id: string,
    organizationId: string,
    userId: string,
    dto: ReverseCostDto,
  ) {
    const cost = await this.prisma.cost.findFirst({
      where: { id, organizationId },
    });
    if (!cost) throw new NotFoundException('Cost not found');

    if (cost.status === 'REVERSED') {
      return cost;
    }

    return this.prisma.cost.update({
      where: { id },
      data: {
        status: 'REVERSED',
        reversedAt: new Date(),
        reversalReason: dto.reason,
      },
    });
  }

  async findAll(organizationId: string, filter: FilterCostsDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const where: Prisma.CostWhereInput = {
      organizationId,
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.dossierId ? { dossierId: filter.dossierId } : {}),
      ...(filter.orderId ? { orderId: filter.orderId } : {}),
      ...(filter.purchaseId ? { purchaseId: filter.purchaseId } : {}),
      ...(filter.shipmentId ? { shipmentId: filter.shipmentId } : {}),
      ...(filter.customsFileId ? { customsFileId: filter.customsFileId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.cost.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { occurredAt: 'desc' },
        include: {
          dossier: { select: { id: true, reference: true } },
          purchase: { select: { id: true, purchaseNumber: true } },
          shipment: { select: { id: true, shipmentNumber: true } },
          customsFile: { select: { id: true, reference: true } },
          actorUser: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.cost.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const cost = await this.prisma.cost.findFirst({
      where: { id, organizationId },
      include: {
        dossier: true,
        order: true,
        purchase: true,
        shipment: true,
        customsFile: true,
        actorUser: { select: { id: true, firstName: true, lastName: true } },
        exchangeRate: true,
      },
    });

    if (!cost) throw new NotFoundException('Cost not found');
    return cost;
  }
}
