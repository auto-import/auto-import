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

  async recordPurchaseCommitment(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    purchase: {
      id: string;
      purchaseNumber: string;
      purchasePrice: Prisma.Decimal | number;
      currency: string;
      supplierId: string;
      dossierId?: string | null;
      purchaseDate?: Date | null;
      createdAt?: Date;
    },
  ) {
    const sourceModule = 'PURCHASE_COMMITMENT';
    const existing = await tx.financeTransaction.findUnique({
      where: {
        organizationId_sourceModule_sourceRecordId: {
          organizationId,
          sourceModule,
          sourceRecordId: purchase.id,
        },
      },
    });
    if (existing) return existing;

    const amount = new Prisma.Decimal(purchase.purchasePrice);
    if (!amount.isPositive()) {
      throw new BadRequestException('Purchase cost amount must be positive');
    }
    const currency = purchase.currency.toUpperCase();
    const occurredAt =
      purchase.purchaseDate ?? purchase.createdAt ?? new Date();
    const rate = await this.findEffectiveRateInTransaction(
      tx,
      organizationId,
      currency,
      occurredAt,
    );
    const amountDzd = amount.mul(rate).toDecimalPlaces(2);
    const cost = await tx.cost.create({
      data: {
        organizationId,
        type: 'PURCHASE',
        costScope: 'DIRECT',
        amount,
        currency,
        amountInBaseCurrency: amountDzd,
        dossierId: purchase.dossierId,
        purchaseId: purchase.id,
        occurredAt,
        description: `Supplier purchase ${purchase.purchaseNumber}`,
        actorUserId: userId,
        status: 'POSTED',
      },
    });

    return tx.financeTransaction.create({
      data: {
        organizationId,
        type: 'DIRECT_COST_PURCHASE',
        direction: 'DEBIT',
        sourceModule,
        sourceRecordId: purchase.id,
        idempotencyKey: `purchase-cost:${purchase.id}`,
        originalAmount: amount,
        currency,
        exchangeRateSnapshot: rate,
        amountDzd,
        dossierId: purchase.dossierId,
        supplierId: purchase.supplierId,
        purchaseId: purchase.id,
        costId: cost.id,
        status: 'VALIDATED',
        createdBy: userId,
        validatedBy: userId,
        validatedAt: occurredAt,
        occurredAt,
      },
    });
  }

  private async findEffectiveRateInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    currency: string,
    occurredAt: Date,
  ): Promise<Prisma.Decimal> {
    if (currency === 'DZD') return new Prisma.Decimal(1);

    const direct = await tx.exchangeRate.findFirst({
      where: {
        organizationId,
        baseCurrency: 'DZD',
        quoteCurrency: currency,
        effectiveAt: { lte: occurredAt },
      },
      orderBy: { effectiveAt: 'desc' },
    });
    if (direct) return direct.rate;

    const inverse = await tx.exchangeRate.findFirst({
      where: {
        organizationId,
        baseCurrency: currency,
        quoteCurrency: 'DZD',
        effectiveAt: { lte: occurredAt },
      },
      orderBy: { effectiveAt: 'desc' },
    });
    if (inverse && !inverse.rate.isZero()) {
      return new Prisma.Decimal(1).dividedBy(inverse.rate);
    }

    throw new BadRequestException(
      `No DZD/${currency} exchange rate exists at the purchase date`,
    );
  }

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

    const costScope = dto.costScope ?? (dto.dossierId ? 'DIRECT' : 'OPERATING');
    if (!['DIRECT', 'OPERATING'].includes(costScope)) {
      throw new BadRequestException('costScope must be DIRECT or OPERATING');
    }
    if (costScope === 'OPERATING' && dto.dossierId) {
      throw new BadRequestException(
        'Operating expenses cannot be dossier costs',
      );
    }
    if (costScope === 'DIRECT' && !dto.dossierId && !dto.purchaseId) {
      throw new BadRequestException(
        'Direct costs must be linked to a dossier or purchase',
      );
    }
    if (dto.treasuryAccountId) {
      const account = await this.prisma.treasuryAccount.findFirst({
        where: {
          id: dto.treasuryAccountId,
          organizationId,
          status: 'ACTIVE',
          archivedAt: null,
          currency,
        },
        select: { id: true },
      });
      if (!account)
        throw new NotFoundException(
          'Active treasury account in the cost currency not found',
        );
    }
    if (dto.supportingDocumentId) {
      const document = await this.prisma.gedDocument.findFirst({
        where: {
          id: dto.supportingDocumentId,
          organizationId,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (!document)
        throw new NotFoundException('Supporting document not found');
    }
    const cost = await this.prisma.$transaction(async (tx) => {
      const { treasuryAccountId, supportingDocumentId, ...costInput } = dto;
      const created = await tx.cost.create({
        data: {
          organizationId,
          type: costInput.type,
          costScope,
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
          description: costInput.description,
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
      const snapshot = amount.equals(0)
        ? new Prisma.Decimal(1)
        : amountInBaseCurrency.div(amount);
      await tx.financeTransaction.upsert({
        where: {
          organizationId_sourceModule_sourceRecordId: {
            organizationId,
            sourceModule: 'COST',
            sourceRecordId: created.id,
          },
        },
        create: {
          organizationId,
          type:
            costScope === 'OPERATING'
              ? 'OPERATING_EXPENSE'
              : `DIRECT_COST_${dto.type}`,
          direction: 'DEBIT',
          sourceModule: 'COST',
          sourceRecordId: created.id,
          idempotencyKey: `cost:${created.id}`,
          originalAmount: amount,
          currency,
          exchangeRateSnapshot: snapshot,
          amountDzd: amountInBaseCurrency,
          dossierId: dto.dossierId,
          purchaseId: dto.purchaseId,
          costId: created.id,
          treasuryAccountId,
          supportingDocumentId,
          status: 'VALIDATED',
          createdBy: userId,
          validatedBy: userId,
          validatedAt: new Date(),
          occurredAt,
        },
        update: {},
      });
      return created;
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

    return this.prisma.$transaction(async (tx) => {
      const reversed = await tx.cost.update({
        where: { id },
        data: {
          status: 'REVERSED',
          reversedAt: new Date(),
          reversalReason: dto.reason,
        },
      });
      await tx.financeTransaction.updateMany({
        where: { organizationId, costId: id, status: 'VALIDATED' },
        data: { status: 'REVERSED' },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'COST_REVERSED',
          entityType: 'Cost',
          entityId: id,
          newValues: { reasonRecorded: true },
        },
      });
      return reversed;
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
