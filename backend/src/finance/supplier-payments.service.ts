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
  CreateSupplierPaymentDto,
  FilterSupplierPaymentsDto,
  ReverseSupplierPaymentDto,
} from './dto/finance.dto';

@Injectable()
export class SupplierPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();

    const payment = await this.prisma.supplierPayment.create({
      data: {
        organizationId,
        supplierId: dto.supplierId,
        purchaseId: dto.purchaseId,
        amount,
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

    return payment;
  }

  async confirm(id: string, organizationId: string, userId: string) {
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

    return this.prisma.supplierPayment.update({
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
        actorUser: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
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

    return this.prisma.supplierPayment.update({
      where: { id },
      data: {
        status: 'REVERSED',
        reversedAt: new Date(),
        reversalReason: dto.reason,
      },
      include: {
        supplier: true,
        purchase: true,
      },
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
            select: { id: true, purchaseNumber: true, status: true },
          },
          actorUser: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.supplierPayment.count({ where }),
    ]);

    return paginate(items, total, page, limit);
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
    return payment;
  }
}
