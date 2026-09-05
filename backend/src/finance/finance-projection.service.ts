import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
      supportingDocumentId?: string;
    } = {},
  ) {
    const currency = payment.currency.toUpperCase();
    const occurredAt = payment.paymentDate ?? new Date();
    const rate = await this.resolveDzdRate(
      tx,
      organizationId,
      currency,
      occurredAt,
      payment.exchangeRateId,
    );
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
        treasuryAccountId: links.treasuryAccountId,
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
      supportingDocumentId?: string;
    } = {},
  ) {
    const currency = payment.currency.toUpperCase();
    const occurredAt = payment.paymentDate ?? new Date();
    const rate = await this.resolveDzdRate(
      tx,
      organizationId,
      currency,
      occurredAt,
      payment.exchangeRateId,
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
        treasuryAccountId: links.treasuryAccountId,
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
  ): Promise<Prisma.Decimal> {
    if (currency === 'DZD') return new Prisma.Decimal(1);

    const selected = exchangeRateId
      ? await tx.exchangeRate.findFirst({
          where: {
            id: exchangeRateId,
            organizationId,
            effectiveAt: { lte: occurredAt },
            OR: [
              { baseCurrency: 'DZD', quoteCurrency: currency },
              { baseCurrency: currency, quoteCurrency: 'DZD' },
            ],
          },
        })
      : await tx.exchangeRate.findFirst({
          where: {
            organizationId,
            baseCurrency: 'DZD',
            quoteCurrency: currency,
            effectiveAt: { lte: occurredAt },
          },
          orderBy: { effectiveAt: 'desc' },
        });

    if (!selected || selected.rate.isZero()) {
      throw new ConflictException({
        code: 'HISTORICAL_EXCHANGE_RATE_REQUIRED',
        message: `A historical DZD/${currency} exchange rate is required before validation`,
      });
    }
    return selected.baseCurrency === 'DZD'
      ? selected.rate
      : new Prisma.Decimal(1).dividedBy(selected.rate);
  }
}
