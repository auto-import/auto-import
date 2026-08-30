import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginate } from '../common/helpers/pagination.helper';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateQuotationDto,
  FilterQuotationDto,
  QuotationAmountsDto,
  ReviseQuotationDto,
  TransitionQuotationDto,
} from './dto/quotation.dto';

const TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ['SENT', 'REJECTED', 'EXPIRED'],
  SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
};

@Injectable()
export class QuotationsService {
  constructor(private readonly prisma: PrismaService) {}

  private amounts(dto: QuotationAmountsDto) {
    const values = {
      vehicleAmount: new Prisma.Decimal(dto.vehicleAmount ?? 0),
      freightAmount: new Prisma.Decimal(dto.freightAmount ?? 0),
      insuranceAmount: new Prisma.Decimal(dto.insuranceAmount ?? 0),
      customsAmount: new Prisma.Decimal(dto.customsAmount ?? 0),
      transitAmount: new Prisma.Decimal(dto.transitAmount ?? 0),
      otherCostsAmount: new Prisma.Decimal(dto.otherCostsAmount ?? 0),
      marginAmount: new Prisma.Decimal(dto.marginAmount ?? 0),
      finalCustomerPrice: new Prisma.Decimal(dto.finalCustomerPrice),
    };
    const calculated = Object.entries(values)
      .filter(([key]) => key !== 'finalCustomerPrice')
      .reduce((sum, [, value]) => sum.add(value), new Prisma.Decimal(0));
    if (!calculated.equals(values.finalCustomerPrice)) {
      throw new BadRequestException({
        code: 'QUOTATION_TOTAL_MISMATCH',
        message: 'Final customer price must equal all pricing components',
        calculatedTotal: calculated.toFixed(2),
      });
    }
    return values;
  }

  private async nextNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const year = new Date().getUTCFullYear();
    const row = await tx.commerceSequence.upsert({
      where: {
        organizationId_key: { organizationId, key: `quotation:${year}` },
      },
      create: { organizationId, key: `quotation:${year}`, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `DEV-${year}-${String(row.value).padStart(5, '0')}`;
  }

  private snapshot(dto: QuotationAmountsDto): Prisma.InputJsonObject {
    return {
      paymentConditions: dto.paymentConditions ?? null,
      validityNote: dto.validityNote ?? null,
      notes: dto.notes ?? null,
    };
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateQuotationDto,
  ) {
    const amounts = this.amounts(dto);
    return this.prisma.$transaction(async (tx) => {
      const dossier = await tx.dossier.findFirst({
        where: { id: dto.dossierId, organizationId },
        select: { id: true, clientId: true },
      });
      if (!dossier) throw new NotFoundException('Dossier not found');

      let sourceOfferRevisionId: string | undefined;
      if (dto.sourceOfferId) {
        const offer = await tx.chinaOffer.findFirst({
          where: { id: dto.sourceOfferId, organizationId, archivedAt: null },
          select: { id: true, currentRevisionId: true },
        });
        if (!offer) throw new NotFoundException('Supplier offer not found');
        sourceOfferRevisionId = offer.currentRevisionId ?? undefined;
      }

      const quotation = await tx.customerQuotation.create({
        data: {
          organizationId,
          quotationNumber: await this.nextNumber(tx, organizationId),
          dossierId: dossier.id,
          clientId: dossier.clientId,
          sourceOfferId: dto.sourceOfferId,
          sourceOfferRevisionId,
          priceBasis: dto.priceBasis,
          currency: dto.currency.toUpperCase(),
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
          createdBy: userId,
        },
      });
      const revision = await tx.customerQuotationRevision.create({
        data: {
          organizationId,
          quotationId: quotation.id,
          revisionNumber: 1,
          ...amounts,
          paymentConditions: dto.paymentConditions,
          validityNote: dto.validityNote,
          notes: dto.notes,
          reason: 'Création du devis',
          snapshot: this.snapshot(dto),
          createdBy: userId,
        },
      });
      const updated = await tx.customerQuotation.update({
        where: { id: quotation.id },
        data: { currentRevisionId: revision.id },
        include: { currentRevision: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'CUSTOMER_QUOTATION_CREATED',
          entityType: 'CustomerQuotation',
          entityId: updated.id,
          newValues: {
            dossierId: dossier.id,
            sourceOfferId: dto.sourceOfferId,
            priceBasis: dto.priceBasis,
          },
        },
      });
      return updated;
    });
  }

  async revise(
    id: string,
    organizationId: string,
    userId: string,
    dto: ReviseQuotationDto,
  ) {
    const amounts = this.amounts(dto);
    return this.prisma.$transaction(async (tx) => {
      const quotation = await tx.customerQuotation.findFirst({
        where: { id, organizationId },
        include: { _count: { select: { revisions: true } } },
      });
      if (!quotation) throw new NotFoundException('Quotation not found');
      if (!['DRAFT', 'SENT'].includes(quotation.status)) {
        throw new ConflictException('Accepted or closed quotations are immutable');
      }
      const revision = await tx.customerQuotationRevision.create({
        data: {
          organizationId,
          quotationId: id,
          revisionNumber: quotation._count.revisions + 1,
          ...amounts,
          paymentConditions: dto.paymentConditions,
          validityNote: dto.validityNote,
          notes: dto.notes,
          reason: dto.reason.trim(),
          snapshot: this.snapshot(dto),
          createdBy: userId,
        },
      });
      const updated = await tx.customerQuotation.update({
        where: { id },
        data: {
          currentRevisionId: revision.id,
          status: 'DRAFT',
          sentAt: null,
          ...(dto.expiresAt ? { expiresAt: new Date(dto.expiresAt) } : {}),
        },
        include: { currentRevision: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'CUSTOMER_QUOTATION_REVISED',
          entityType: 'CustomerQuotation',
          entityId: id,
          newValues: { revisionNumber: revision.revisionNumber },
        },
      });
      return updated;
    });
  }

  async transition(
    id: string,
    organizationId: string,
    userId: string,
    dto: TransitionQuotationDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const quotation = await tx.customerQuotation.findFirst({
        where: { id, organizationId },
      });
      if (!quotation) throw new NotFoundException('Quotation not found');
      if (quotation.status === dto.status) return quotation;
      if (!TRANSITIONS[quotation.status]?.includes(dto.status)) {
        throw new ConflictException(
          `${quotation.status} cannot transition to ${dto.status}`,
        );
      }
      const updated = await tx.customerQuotation.update({
        where: { id },
        data: {
          status: dto.status,
          sentAt: dto.status === 'SENT' ? new Date() : quotation.sentAt,
          acceptedAt:
            dto.status === 'ACCEPTED' ? new Date() : quotation.acceptedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'CUSTOMER_QUOTATION_STATUS_CHANGED',
          entityType: 'CustomerQuotation',
          entityId: id,
          oldValues: { status: quotation.status },
          newValues: { status: dto.status, hasReason: Boolean(dto.reason) },
        },
      });
      return updated;
    });
  }

  async findAll(organizationId: string, filter: FilterQuotationDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const where: Prisma.CustomerQuotationWhereInput = {
      organizationId,
      ...(filter.dossierId ? { dossierId: filter.dossierId } : {}),
      ...(filter.clientId ? { clientId: filter.clientId } : {}),
      ...(filter.sourceOfferId ? { sourceOfferId: filter.sourceOfferId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.customerQuotation.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          currentRevision: true,
          dossier: { select: { id: true, reference: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
          sourceOffer: { select: { id: true, reference: true, brand: true, model: true } },
        },
      }),
      this.prisma.customerQuotation.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const quotation = await this.prisma.customerQuotation.findFirst({
      where: { id, organizationId },
      include: {
        currentRevision: true,
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          include: { creator: { select: { id: true, firstName: true, lastName: true } } },
        },
        dossier: { select: { id: true, reference: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
        sourceOffer: { select: { id: true, reference: true, brand: true, model: true } },
      },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    return quotation;
  }
}
