import { requireTreasuryAccount } from './treasury-account';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExchangeRatesService } from './exchange-rates.service';

export interface ConfirmedCustomerPaymentProjection {
  id: string;
  amount: Prisma.Decimal;
  currency: string;
  paymentDate?: Date | null;
  exchangeRateId?: string | null;
  idempotencyKey?: string | null;
  dossierId?: string | null;
  clientId: string;
  paymentMethod?: string | null;
  reference?: string | null;
}

export interface ConfirmedSupplierPaymentProjection {
  id: string;
  amount: Prisma.Decimal;
  currency: string;
  paymentDate?: Date | null;
  exchangeRateId?: string | null;
  idempotencyKey?: string | null;
  supplierId: string;
  purchaseId: string;
  paymentMethod?: string | null;
  reference?: string | null;
  purchase: { dossierId?: string | null };
}

/**
 * Central projection from validated business events to the immutable finance
 * ledger. Callers keep ownership of their source row and invoke this service
 * inside the same database transaction.
 */
@Injectable()
export class FinanceProjectionService {
  constructor(private readonly prisma: PrismaService) {}

  async projectCustomerPayment(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    payment: ConfirmedCustomerPaymentProjection,
    links: {
      treasuryAccountId?: string;
      officeId?: string;
      rateType?: string;
      supportingDocumentId?: string;
    } = {},
    savedRate?: Prisma.Decimal,
  ) {
    const currency = payment.currency.toUpperCase();
    const occurredAt = payment.paymentDate ?? new Date();
    const account = await requireTreasuryAccount(
      tx,
      organizationId,
      currency,
      links.treasuryAccountId,
      links.officeId,
    );
    const rate =
      savedRate ??
      (await this.resolveDzdRate(
        tx,
        organizationId,
        currency,
        occurredAt,
        payment.exchangeRateId,
        links.rateType,
      ));
    return tx.financeTransaction.upsert({
      where: {
        organizationId_sourceModule_sourceRecordId: {
          organizationId,
          sourceModule: 'CUSTOMER_PAYMENT',
          sourceRecordId: payment.id,
        },
      },
      create: {
        organizationId,
        type: 'CUSTOMER_COLLECTION',
        direction: 'CREDIT',
        sourceModule: 'CUSTOMER_PAYMENT',
        sourceRecordId: payment.id,
        idempotencyKey: payment.idempotencyKey
          ? `payment:${payment.idempotencyKey}`
          : `payment:${payment.id}`,
        originalAmount: payment.amount,
        currency,
        exchangeRateSnapshot: rate,
        amountDzd: payment.amount.mul(rate).toDecimalPlaces(2),
        dossierId: payment.dossierId,
        clientId: payment.clientId,
        paymentMode: payment.paymentMethod,
        reference: payment.reference,
        customerPaymentId: payment.id,
        treasuryAccountId: account.id,
        officeId: account.officeId,
        rateType: links.rateType ?? 'COMMERCIAL',
        supportingDocumentId: links.supportingDocumentId,
        status: 'VALIDATED',
        createdBy: userId,
        validatedBy: userId,
        validatedAt: new Date(),
        occurredAt,
      },
      update: {},
    });
  }

  async projectSupplierPayment(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    payment: ConfirmedSupplierPaymentProjection,
    links: {
      treasuryAccountId?: string;
      officeId?: string;
      rateType?: string;
      supportingDocumentId?: string;
    } = {},
  ) {
    const currency = payment.currency.toUpperCase();
    const occurredAt = payment.paymentDate ?? new Date();
    const account = await requireTreasuryAccount(
      tx,
      organizationId,
      currency,
      links.treasuryAccountId,
      links.officeId,
    );
    const rate = await this.resolveDzdRate(
      tx,
      organizationId,
      currency,
      occurredAt,
      payment.exchangeRateId,
      links.rateType,
    );
    return tx.financeTransaction.upsert({
      where: {
        organizationId_sourceModule_sourceRecordId: {
          organizationId,
          sourceModule: 'SUPPLIER_PAYMENT',
          sourceRecordId: payment.id,
        },
      },
      create: {
        organizationId,
        type: 'SUPPLIER_PAYMENT',
        direction: 'DEBIT',
        sourceModule: 'SUPPLIER_PAYMENT',
        sourceRecordId: payment.id,
        idempotencyKey: payment.idempotencyKey
          ? `supplier-payment:${payment.idempotencyKey}`
          : `supplier-payment:${payment.id}`,
        originalAmount: payment.amount,
        currency,
        exchangeRateSnapshot: rate,
        amountDzd: payment.amount.mul(rate).toDecimalPlaces(2),
        dossierId: payment.purchase.dossierId,
        supplierId: payment.supplierId,
        paymentMode: payment.paymentMethod,
        reference: payment.reference,
        supplierPaymentId: payment.id,
        purchaseId: payment.purchaseId,
        treasuryAccountId: account.id,
        officeId: account.officeId,
        rateType: links.rateType ?? 'COMMERCIAL',
        supportingDocumentId: links.supportingDocumentId,
        status: 'VALIDATED',
        createdBy: userId,
        validatedBy: userId,
        validatedAt: new Date(),
        occurredAt,
      },
      update: {},
    });
  }

  private async resolveDzdRate(
    tx: Prisma.TransactionClient,
    organizationId: string,
    currency: string,
    occurredAt: Date,
    exchangeRateId?: string | null,
    rateType = 'COMMERCIAL',
  ): Promise<Prisma.Decimal> {
    const selected = await new ExchangeRatesService(
      this.prisma,
    ).findActiveDzdRateSnapshot(
      tx,
      organizationId,
      currency,
      occurredAt,
      rateType,
    );
    if (exchangeRateId && selected.exchangeRateId !== exchangeRateId) {
      throw new ConflictException(
        'Le taux Finance sélectionné ne correspond plus au taux actif.',
      );
    }
    return selected.rate;
  }
}
