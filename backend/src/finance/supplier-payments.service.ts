import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import {
  ConfirmFinanceEntryDto,
  CreateSupplierPaymentDto,
  FilterSupplierPaymentsDto,
  ReverseSupplierPaymentDto,
} from './dto/finance.dto';
import { FinanceProjectionService } from './finance-projection.service';

@Injectable()
export class SupplierPaymentsService {
  private readonly financeProjection: FinanceProjectionService;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() financeProjection?: FinanceProjectionService,
  ) {
    this.financeProjection =
      financeProjection ?? new FinanceProjectionService(prisma);
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateSupplierPaymentDto,
  ) {
    if (dto.amount <= 0) {
      throw new BadRequestException('Supplier payment amount must be positive');
    }

    const purchase = await this.prisma.purchase.findFirst({
      where: { id: dto.purchaseId, organizationId },
      include: {
        payments: { where: { status: { not: 'REVERSED' } } },
      },
    });
    if (!purchase) {
      throw new NotFoundException('Purchase not found in your organization');
    }

    const supplier = await this.prisma.partner.findFirst({
      where: { id: dto.supplierId, organizationId, type: 'supplier' },
    });
    if (!supplier) {
      throw new NotFoundException('Supplier not found in your organization');
    }
    if (purchase.supplierId !== supplier.id) {
      throw new BadRequestException(
        'Purchase does not belong to the selected supplier',
      );
    }
    if (dto.currency.toUpperCase() !== purchase.currency.toUpperCase()) {
      throw new BadRequestException(
        'Supplier payment currency must match the purchase currency',
      );
    }

    if (dto.idempotencyKey) {
      const existing = await this.prisma.supplierPayment.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });
      if (existing) {
        if (!existing.amount.equals(new Prisma.Decimal(dto.amount))) {
          throw new ConflictException(
            'Supplier payment already exists with a different amount for this idempotency key',
          );
        }
        return existing;
      }
    }

    const amount = new Prisma.Decimal(dto.amount);
    const alreadyCommitted = purchase.payments.reduce(
      (sum, item) => sum.add(item.amount),
      new Prisma.Decimal(0),
    );
    const remaining = Prisma.Decimal.max(
      purchase.purchasePrice.minus(alreadyCommitted),
      0,
    );
    if (amount.greaterThan(remaining)) {
      throw new ConflictException({
        code: 'SUPPLIER_PAYMENT_EXCEEDS_REMAINING',
        message: 'Supplier payment exceeds the remaining purchase amount',
        remainingAmount: remaining.toFixed(2),
      });
    }
    if (dto.paymentKind === 'BALANCE' && !amount.equals(remaining)) {
      throw new BadRequestException({
        code: 'SUPPLIER_BALANCE_AMOUNT_MISMATCH',
        message: 'A balance payment must equal the remaining purchase amount',
        remainingAmount: remaining.toFixed(2),
      });
    }
    const paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();

    const payment = await this.prisma.supplierPayment.create({
      data: {
        organizationId,
        supplierId: dto.supplierId,
        purchaseId: dto.purchaseId,
        amount,
        paymentKind: dto.paymentKind,
        currency: dto.currency || 'CNY',
        paymentMethod: dto.paymentMethod,
        reference: dto.reference,
        idempotencyKey: dto.idempotencyKey,
        status: 'PENDING',
        paymentDate,
        exchangeRateId: dto.exchangeRateId,
        notes: dto.notes,
      },
      include: {
        supplier: true,
        purchase: {
          include: {
            vehicle: true,
          },
        },
      },
    });

    return {
      ...payment,
      remainingAmount: remaining.minus(amount).toFixed(2),
    };
  }

  async confirm(
    id: string,
    organizationId: string,
    userId: string,
    dto: ConfirmFinanceEntryDto = {},
  ) {
    const payment = await this.prisma.supplierPayment.findFirst({
      where: { id, organizationId },
    });
    if (!payment) throw new NotFoundException('Supplier payment not found');

    if (payment.status === 'CONFIRMED') {
      return payment;
    }

    if (payment.status === 'REVERSED') {
      throw new ConflictException('Cannot confirm a reversed supplier payment');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.treasuryAccountId) {
        const account = await tx.treasuryAccount.findFirst({
          where: {
            id: dto.treasuryAccountId,
            organizationId,
            status: 'ACTIVE',
            archivedAt: null,
            currency: payment.currency,
          },
          select: { id: true },
        });
        if (!account)
          throw new NotFoundException(
            'Active treasury account in the payment currency not found',
          );
      }
      if (dto.supportingDocumentId) {
        const document = await tx.gedDocument.findFirst({
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
      const confirmed = await tx.supplierPayment.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          paidAt: new Date(),
          actorUserId: userId,
        },
        include: {
          supplier: true,
          purchase: true,
          actorUser: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      await this.financeProjection.projectSupplierPayment(
        tx,
        organizationId,
        userId,
        confirmed,
        dto,
      );
      return confirmed;
    });
  }

  async reverse(
    id: string,
    organizationId: string,
    userId: string,
    dto: ReverseSupplierPaymentDto,
  ) {
    const payment = await this.prisma.supplierPayment.findFirst({
      where: { id, organizationId },
    });
    if (!payment) throw new NotFoundException('Supplier payment not found');

    if (payment.status === 'REVERSED') {
      return payment;
    }

    return this.prisma.$transaction(async (tx) => {
      const reversed = await tx.supplierPayment.update({
        where: { id },
        data: {
          status: 'REVERSED',
          reversedAt: new Date(),
          reversalReason: dto.reason,
        },
        include: { supplier: true, purchase: true },
      });
      await tx.financeTransaction.updateMany({
        where: { organizationId, supplierPaymentId: id, status: 'VALIDATED' },
        data: { status: 'REVERSED' },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'SUPPLIER_PAYMENT_REVERSED',
          entityType: 'SupplierPayment',
          entityId: id,
          newValues: { reasonRecorded: true },
        },
      });
      return reversed;
    });
  }

  async findAll(organizationId: string, filter: FilterSupplierPaymentsDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const where: Prisma.SupplierPaymentWhereInput = {
      organizationId,
      ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
      ...(filter.purchaseId ? { purchaseId: filter.purchaseId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.fromDate || filter.toDate
        ? {
            paymentDate: {
              ...(filter.fromDate ? { gte: new Date(filter.fromDate) } : {}),
              ...(filter.toDate ? { lte: new Date(filter.toDate) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.supplierPayment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: {
            select: { id: true, name: true, country: true },
          },
          purchase: {
            select: {
              id: true,
              purchaseNumber: true,
              status: true,
              purchasePrice: true,
              currency: true,
              payments: {
                where: { status: 'CONFIRMED' },
                select: { amount: true },
              },
            },
          },
          actorUser: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.supplierPayment.count({ where }),
    ]);

    return paginate(
      items.map((item) => {
        const paid = item.purchase.payments.reduce(
          (sum, payment) => sum.add(payment.amount),
          new Prisma.Decimal(0),
        );
        return {
          ...item,
          purchase: { ...item.purchase, payments: undefined },
          purchasePaid: paid.toFixed(2),
          purchaseRemaining: Prisma.Decimal.max(
            item.purchase.purchasePrice.minus(paid),
            0,
          ).toFixed(2),
        };
      }),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string, organizationId: string) {
    const payment = await this.prisma.supplierPayment.findFirst({
      where: { id, organizationId },
      include: {
        supplier: true,
        purchase: {
          include: {
            vehicle: true,
            dossier: true,
          },
        },
        actorUser: {
          select: { id: true, firstName: true, lastName: true },
        },
        exchangeRate: true,
      },
    });

    if (!payment) throw new NotFoundException('Supplier payment not found');
    const confirmedPaid = await this.prisma.supplierPayment.aggregate({
      where: {
        organizationId,
        purchaseId: payment.purchaseId,
        status: 'CONFIRMED',
      },
      _sum: { amount: true },
    });
    const paid = confirmedPaid._sum.amount ?? new Prisma.Decimal(0);
    return {
      ...payment,
      purchasePaid: paid.toFixed(2),
      purchaseRemaining: Prisma.Decimal.max(
        payment.purchase.purchasePrice.minus(paid),
        0,
      ).toFixed(2),
    };
  }
}
