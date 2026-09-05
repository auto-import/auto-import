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
  FilterPaymentsDto,
  RecordPaymentDto,
  ReversePaymentDto,
} from './dto/finance.dto';
import { ReconciliationService } from './reconciliation.service';
import { NotificationsGateway } from '../phase3/notifications.gateway';
import { FinanceProjectionService } from './finance-projection.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: ReconciliationService,
    @Optional() private readonly realtime?: NotificationsGateway,
    @Optional() financeProjection?: FinanceProjectionService,
  ) {
    this.financeProjection =
      financeProjection ?? new FinanceProjectionService(prisma);
  }

  private readonly financeProjection: FinanceProjectionService;

  async record(organizationId: string, userId: string, dto: RecordPaymentDto) {
    if (dto.amount <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }

    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, organizationId },
    });
    if (!client) {
      throw new NotFoundException('Client not found in your organization');
    }

    if (dto.idempotencyKey) {
      const existing = await this.prisma.payment.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
        include: {
          allocations: true,
          client: true,
        },
      });

      if (existing) {
        if (!existing.amount.equals(new Prisma.Decimal(dto.amount))) {
          throw new ConflictException(
            'Payment already exists with a different amount for this idempotency key',
          );
        }
        return existing;
      }
    }

    const paymentAmount = new Prisma.Decimal(dto.amount);
    const paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          organizationId,
          clientId: dto.clientId,
          dossierId: dto.dossierId,
          orderId: dto.orderId,
          invoiceId: dto.invoiceId,
          installmentId: dto.installmentId,
          amount: paymentAmount,
          allocatedAmount: new Prisma.Decimal(0),
          unallocatedAmount: paymentAmount,
          currency: dto.currency || 'DZD',
          paymentMethod: dto.paymentMethod,
          reference: dto.reference,
          idempotencyKey: dto.idempotencyKey,
          status: 'PENDING',
          paymentDate,
          receivedAt: new Date(),
          exchangeRateId: dto.exchangeRateId,
          notes: dto.notes,
        },
      });

      // Handle allocations if passed on record
      let totalAllocated = new Prisma.Decimal(0);
      if (dto.allocations && dto.allocations.length > 0) {
        for (const alloc of dto.allocations) {
          const allocAmount = new Prisma.Decimal(alloc.amount);
          if (allocAmount.lessThanOrEqualTo(0)) {
            throw new BadRequestException('Allocation amount must be positive');
          }
          totalAllocated = totalAllocated.add(allocAmount);

          await tx.paymentAllocation.create({
            data: {
              organizationId,
              paymentId: payment.id,
              invoiceId: alloc.invoiceId,
              installmentId: alloc.installmentId,
              amount: allocAmount,
              status: 'ACTIVE',
            },
          });
        }

        if (totalAllocated.greaterThan(paymentAmount)) {
          throw new BadRequestException(
            'Total allocation exceeds payment amount',
          );
        }
      } else if (dto.invoiceId || dto.installmentId) {
        // Direct allocation if invoiceId or installmentId is provided
        await tx.paymentAllocation.create({
          data: {
            organizationId,
            paymentId: payment.id,
            invoiceId: dto.invoiceId,
            installmentId: dto.installmentId,
            amount: paymentAmount,
            status: 'ACTIVE',
          },
        });
        totalAllocated = paymentAmount;
      }

      return tx.payment.findUnique({
        where: { id: payment.id },
        include: {
          allocations: true,
          client: true,
          dossier: true,
        },
      });
    });
  }

  async confirm(
    id: string,
    organizationId: string,
    userId: string,
    dto: ConfirmFinanceEntryDto = {},
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, organizationId },
      include: { allocations: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === 'CONFIRMED') {
      return payment;
    }

    if (payment.status === 'REVERSED') {
      throw new ConflictException('Cannot confirm a reversed payment');
    }

    const notification = await this.prisma.$transaction(async (tx) => {
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
        if (!account) {
          throw new NotFoundException(
            'Active treasury account in the payment currency not found',
          );
        }
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
      const confirmed = await tx.payment.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          actorUserId: userId,
        },
        include: {
          allocations: true,
        },
      });

      await this.financeProjection.projectCustomerPayment(
        tx,
        organizationId,
        userId,
        confirmed,
        dto,
      );

      await this.reconciliation.reconcilePayment(tx, id);

      // If there is an unallocated amount, create / update customer deposit
      const updatedPayment = await tx.payment.findUnique({
        where: { id },
      });

      if (updatedPayment && updatedPayment.unallocatedAmount.greaterThan(0)) {
        const existingDeposit = await tx.customerDeposit.findUnique({
          where: { paymentId: id },
        });

        if (!existingDeposit) {
          await tx.customerDeposit.create({
            data: {
              organizationId,
              clientId: updatedPayment.clientId,
              dossierId: updatedPayment.dossierId,
              orderId: updatedPayment.orderId,
              paymentId: id,
              amount: updatedPayment.unallocatedAmount,
              appliedAmount: new Prisma.Decimal(0),
              unappliedAmount: updatedPayment.unallocatedAmount,
              currency: updatedPayment.currency,
              paymentMethod: updatedPayment.paymentMethod,
              reference: updatedPayment.reference,
              status: 'CONFIRMED',
              paymentDate: updatedPayment.paymentDate,
            },
          });
        }
      }

      if (confirmed.dossierId) {
        const dossier = await tx.dossier.findFirst({
          where: { id: confirmed.dossierId, organizationId },
          select: {
            id: true,
            reference: true,
            salesUserId: true,
            opsUserId: true,
          },
        });
        const recipients = [dossier?.salesUserId, dossier?.opsUserId].filter(
          (recipient, index, values): recipient is string =>
            Boolean(recipient) && values.indexOf(recipient) === index,
        );
        if (dossier && recipients.length > 0) {
          await tx.notification.createMany({
            data: recipients.map((recipient) => ({
              organizationId,
              userId: recipient,
              type: 'PAYMENT_CONFIRMED',
              category: 'payment',
              severity: 'success',
              title: `Paiement confirmé pour ${dossier.reference}`,
              content: `${confirmed.amount.toFixed(2)} ${confirmed.currency}`,
              relatedType: 'payment',
              relatedId: confirmed.id,
              entityUrl: `/dossiers/${dossier.id}`,
              dedupeKey: `payment-confirmed:${confirmed.id}:${recipient}`,
            })),
            skipDuplicates: true,
          });
          return {
            recipients,
            dossierId: dossier.id,
            paymentId: confirmed.id,
          };
        }
      }

      return null;
    });
    if (notification) {
      for (const recipient of notification.recipients) {
        this.realtime?.emitUser(recipient, {
          type: 'PAYMENT_CONFIRMED',
          dossierId: notification.dossierId,
          paymentId: notification.paymentId,
        });
      }
    }
    return this.findOne(id, organizationId);
  }

  async reverse(
    id: string,
    organizationId: string,
    dto?: ReversePaymentDto,
    userId?: string,
  ) {
    const payment = await this.findOne(id, organizationId);
    if (payment.status === 'REVERSED') {
      return payment;
    }
    const recipients = [
      payment.dossier?.salesUserId,
      payment.dossier?.opsUserId,
    ].filter(
      (recipient, index, values): recipient is string =>
        Boolean(recipient) && values.indexOf(recipient) === index,
    );

    await this.prisma.$transaction(async (tx) => {
      // Mark all allocations as REVERSED
      await tx.paymentAllocation.updateMany({
        where: { paymentId: id, status: 'ACTIVE' },
        data: {
          status: 'REVERSED',
          reversedAt: new Date(),
        },
      });

      // If deposit was created from this payment, mark it REVERSED
      await tx.customerDeposit.updateMany({
        where: { paymentId: id },
        data: { status: 'REVERSED' },
      });

      await tx.payment.update({
        where: { id },
        data: {
          status: 'REVERSED',
          reversedAt: new Date(),
          reversalReason: dto?.reason,
        },
      });
      await tx.financeTransaction.updateMany({
        where: { organizationId, customerPaymentId: id, status: 'VALIDATED' },
        data: { status: 'REVERSED' },
      });

      // Reconcile affected invoices and installments
      for (const alloc of payment.allocations) {
        if (alloc.invoiceId) {
          await this.reconciliation.reconcileInvoice(tx, alloc.invoiceId);
        }
        if (alloc.installmentId) {
          await this.reconciliation.reconcileInstallment(
            tx,
            alloc.installmentId,
          );
        }
      }
      if (userId) {
        await tx.auditLog.create({
          data: {
            organizationId,
            userId,
            action: 'PAYMENT_REVERSED',
            entityType: 'Payment',
            entityId: id,
            newValues: {
              status: 'REVERSED',
              reasonRecorded: Boolean(dto?.reason),
            },
          },
        });
      }
      if (payment.dossier && recipients.length > 0) {
        await tx.notification.createMany({
          data: recipients.map((recipient) => ({
            organizationId,
            userId: recipient,
            type: 'PAYMENT_REVERSED',
            category: 'payment',
            severity: 'warning',
            title: `Paiement annulé pour ${payment.dossier?.reference}`,
            content:
              'Les soldes et les autorisations financières ont été recalculés.',
            relatedType: 'payment',
            relatedId: payment.id,
            entityUrl: `/dossiers/${payment.dossierId}`,
            dedupeKey: `payment-reversed:${payment.id}:${recipient}`,
          })),
          skipDuplicates: true,
        });
      }
    });
    for (const recipient of recipients) {
      this.realtime?.emitUser(recipient, {
        type: 'PAYMENT_REVERSED',
        dossierId: payment.dossierId,
        paymentId: payment.id,
      });
    }
    return this.findOne(id, organizationId);
  }

  async findAll(organizationId: string, filter: FilterPaymentsDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const where: Prisma.PaymentWhereInput = {
      organizationId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.clientId ? { clientId: filter.clientId } : {}),
      ...(filter.dossierId ? { dossierId: filter.dossierId } : {}),
      ...(filter.orderId ? { orderId: filter.orderId } : {}),
      ...(filter.search
        ? {
            OR: [
              { reference: { contains: filter.search, mode: 'insensitive' } },
              { notes: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
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
      this.prisma.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          client: {
            select: { id: true, firstName: true, lastName: true },
          },
          dossier: {
            select: { id: true, reference: true, status: true },
          },
          allocations: {
            where: { status: 'ACTIVE' },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, organizationId },
      include: {
        client: true,
        dossier: true,
        order: true,
        invoice: true,
        installment: true,
        actorUser: {
          select: { id: true, firstName: true, lastName: true },
        },
        allocations: {
          include: {
            invoice: true,
            installment: true,
          },
        },
        deposit: true,
      },
    });

    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }
}
