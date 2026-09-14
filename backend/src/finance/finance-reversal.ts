import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationService } from './reconciliation.service';

/** Original and counter-entry remain in the ledger; operational source is reconciled atomically. */
export async function reverseFinanceEntry(
  tx: Prisma.TransactionClient,
  id: string,
  organizationId: string,
  userId: string,
  reason: string,
  synchronizeSource = true,
  originalRecord?: Prisma.FinanceTransactionGetPayload<object>,
) {
  const original =
    originalRecord ??
    (await tx.financeTransaction.findFirst({
      where: { id, organizationId },
    }));
  if (!original) throw new NotFoundException('Finance transaction not found');
  if (
    !['VALIDATED', 'REVERSED'].includes(original.status) ||
    original.reversalOfId
  )
    throw new ConflictException(
      'Seule une écriture validée originale peut être extournée.',
    );
  const existing = await tx.financeTransaction.findFirst({
    where: { organizationId, reversalOfId: id },
  });
  if (existing) return existing;
  if (original.status !== 'VALIDATED' || original.reversalOfId)
    throw new ConflictException(
      'Seule une écriture validée originale peut être extournée.',
    );
  if (!reason.trim())
    throw new ConflictException('Le motif d’extourne est requis.');

  const reversal = await tx.financeTransaction.create({
    data: {
      organizationId,
      type: `${original.type}_REVERSAL`,
      direction: original.direction === 'CREDIT' ? 'DEBIT' : 'CREDIT',
      sourceModule: 'FINANCE_REVERSAL',
      sourceRecordId: original.id,
      idempotencyKey: `reversal:${original.id}`,
      originalAmount: original.originalAmount,
      currency: original.currency,
      exchangeRateSnapshot: original.exchangeRateSnapshot,
      amountDzd: original.amountDzd,
      dossierId: original.dossierId,
      purchaseId: original.purchaseId,
      clientId: original.clientId,
      supplierId: original.supplierId,
      treasuryAccountId: original.treasuryAccountId,
      officeId: original.officeId,
      rateType: original.rateType,
      transferGroupId: original.transferGroupId,
      paymentMode: original.paymentMode,
      reference: original.reference,
      status: 'VALIDATED',
      createdBy: userId,
      validatedBy: userId,
      validatedAt: new Date(),
      occurredAt: new Date(),
      reversalOfId: original.id,
      reversalReason: reason,
    },
  });
  await tx.financeTransaction.update({
    where: { id },
    data: { status: 'REVERSED' },
  });

  if (synchronizeSource && original.customerPaymentId) {
    const allocations = await tx.paymentAllocation.findMany({
      where: { paymentId: original.customerPaymentId, status: 'ACTIVE' },
    });
    await tx.paymentAllocation.updateMany({
      where: { paymentId: original.customerPaymentId, status: 'ACTIVE' },
      data: { status: 'REVERSED', reversedAt: new Date() },
    });
    await tx.customerDeposit.updateMany({
      where: { paymentId: original.customerPaymentId },
      data: { status: 'REVERSED' },
    });
    await tx.payment.update({
      where: { id: original.customerPaymentId },
      data: {
        status: 'REVERSED',
        reversedAt: new Date(),
        reversalReason: reason,
      },
    });
    const reconciliation = new ReconciliationService(
      tx as unknown as PrismaService,
    );
    for (const allocation of allocations) {
      if (allocation.invoiceId)
        await reconciliation.reconcileInvoice(tx, allocation.invoiceId);
      if (allocation.installmentId)
        await reconciliation.reconcileInstallment(tx, allocation.installmentId);
    }
  }
  if (synchronizeSource && original.supplierPaymentId)
    await tx.supplierPayment.update({
      where: { id: original.supplierPaymentId },
      data: {
        status: 'REVERSED',
        reversedAt: new Date(),
        reversalReason: reason,
      },
    });
  if (synchronizeSource && original.costId)
    await tx.cost.update({
      where: { id: original.costId },
      data: {
        status: 'REVERSED',
        reversedAt: new Date(),
        reversalReason: reason,
      },
    });
  await tx.auditLog.create({
    data: {
      organizationId,
      userId,
      action: 'FINANCE_TRANSACTION_REVERSED',
      entityType: 'FinanceTransaction',
      entityId: id,
      newValues: { reversalId: reversal.id, reasonRecorded: true },
    },
  });
  return reversal;
}
