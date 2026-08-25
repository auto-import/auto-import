import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reconcile an Invoice's paidAmount and status based on active allocations
   */
  async reconcileInvoice(
    tx: Prisma.TransactionClient,
    invoiceId: string,
  ): Promise<void> {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        allocations: {
          where: { status: 'ACTIVE' },
        },
      },
    });

    if (!invoice || invoice.status === 'VOIDED') {
      return;
    }

    const totalAllocated = invoice.allocations.reduce(
      (sum, alloc) => sum.add(alloc.amount),
      new Prisma.Decimal(0),
    );

    let nextStatus = invoice.status;
    if (invoice.status !== 'DRAFT') {
      if (totalAllocated.greaterThanOrEqualTo(invoice.total)) {
        nextStatus = 'PAID';
      } else if (totalAllocated.greaterThan(0)) {
        nextStatus = 'PARTIALLY_PAID';
      } else if (invoice.dueDate && invoice.dueDate < new Date()) {
        nextStatus = 'OVERDUE';
      } else {
        nextStatus = 'ISSUED';
      }
    }

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: totalAllocated,
        status: nextStatus,
      },
    });
  }

  /**
   * Reconcile a PaymentInstallment and its parent PaymentPlan
   */
  async reconcileInstallment(
    tx: Prisma.TransactionClient,
    installmentId: string,
  ): Promise<void> {
    const installment = await tx.paymentInstallment.findUnique({
      where: { id: installmentId },
      include: {
        allocations: {
          where: { status: 'ACTIVE' },
        },
        paymentPlan: {
          include: {
            installments: true,
          },
        },
      },
    });

    if (!installment || installment.status === 'CANCELLED') {
      return;
    }

    const totalAllocated = installment.allocations.reduce(
      (sum, alloc) => sum.add(alloc.amount),
      new Prisma.Decimal(0),
    );

    let nextStatus = installment.status;
    if (totalAllocated.greaterThanOrEqualTo(installment.amount)) {
      nextStatus = 'PAID';
    } else if (totalAllocated.greaterThan(0)) {
      nextStatus = 'PARTIALLY_PAID';
    } else if (installment.dueDate && installment.dueDate < new Date()) {
      nextStatus = 'OVERDUE';
    } else {
      nextStatus = 'PENDING';
    }

    await tx.paymentInstallment.update({
      where: { id: installmentId },
      data: {
        paidAmount: totalAllocated,
        status: nextStatus,
      },
    });

    // Reconcile parent plan status
    const allInstallments = await tx.paymentInstallment.findMany({
      where: { paymentPlanId: installment.paymentPlanId },
    });

    const allPaid = allInstallments.every((inst) =>
      inst.id === installmentId
        ? nextStatus === 'PAID'
        : inst.status === 'PAID',
    );

    await tx.paymentPlan.update({
      where: { id: installment.paymentPlanId },
      data: {
        status: allPaid ? 'completed' : 'active',
      },
    });
  }

  /**
   * Reconcile payment allocations and targets when a payment changes
   */
  async reconcilePayment(
    tx: Prisma.TransactionClient,
    paymentId: string,
  ): Promise<void> {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: {
        allocations: {
          where: { status: 'ACTIVE' },
        },
      },
    });

    if (!payment) return;

    const totalAllocated = payment.allocations.reduce(
      (sum, alloc) => sum.add(alloc.amount),
      new Prisma.Decimal(0),
    );

    const unallocated = payment.amount.minus(totalAllocated);

    await tx.payment.update({
      where: { id: paymentId },
      data: {
        allocatedAmount: totalAllocated,
        unallocatedAmount: unallocated.greaterThan(0) ? unallocated : new Prisma.Decimal(0),
      },
    });

    for (const alloc of payment.allocations) {
      if (alloc.invoiceId) {
        await this.reconcileInvoice(tx, alloc.invoiceId);
      }
      if (alloc.installmentId) {
        await this.reconcileInstallment(tx, alloc.installmentId);
      }
    }
  }
}
