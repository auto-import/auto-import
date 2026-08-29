import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTreasuryAccountDto,
  ReverseFinanceTransactionDto,
} from './dto/contracts-v2.dto';

@Injectable()
export class FinanceLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async accounts(organizationId: string) {
    const accounts = await this.prisma.treasuryAccount.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { code: 'asc' },
    });
    const balances = await this.prisma.financeTransaction.groupBy({
      by: ['treasuryAccountId', 'direction'],
      where: {
        organizationId,
        status: 'VALIDATED',
        treasuryAccountId: { not: null },
      },
      _sum: { originalAmount: true },
    });
    return accounts.map((account) => {
      const credits = balances
        .filter(
          (row) =>
            row.treasuryAccountId === account.id && row.direction === 'CREDIT',
        )
        .reduce(
          (sum, row) => sum.add(row._sum.originalAmount ?? 0),
          new Prisma.Decimal(0),
        );
      const debits = balances
        .filter(
          (row) =>
            row.treasuryAccountId === account.id && row.direction === 'DEBIT',
        )
        .reduce(
          (sum, row) => sum.add(row._sum.originalAmount ?? 0),
          new Prisma.Decimal(0),
        );
      return {
        ...account,
        balance: account.openingBalance.add(credits).minus(debits).toString(),
      };
    });
  }

  createAccount(organizationId: string, dto: CreateTreasuryAccountDto) {
    return this.prisma.treasuryAccount.create({
      data: {
        organizationId,
        code: dto.code.toUpperCase(),
        name: dto.name,
        type: dto.type,
        currency: dto.currency.toUpperCase(),
        openingBalance: dto.openingBalance ?? 0,
      },
    });
  }

  async transactions(organizationId: string, status?: string) {
    return this.prisma.financeTransaction.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 200,
      include: {
        treasuryAccount: { select: { id: true, code: true, name: true } },
        dossier: { select: { id: true, reference: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
  }

  async reverse(
    id: string,
    organizationId: string,
    userId: string,
    dto: ReverseFinanceTransactionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const original = await tx.financeTransaction.findFirst({
        where: { id, organizationId },
      });
      if (!original)
        throw new NotFoundException('Finance transaction not found');
      if (original.status !== 'VALIDATED')
        throw new ConflictException(
          'Only validated transactions can be reversed',
        );
      const existing = await tx.financeTransaction.findFirst({
        where: { organizationId, reversalOfId: id },
      });
      if (existing) return existing;
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
          clientId: original.clientId,
          supplierId: original.supplierId,
          treasuryAccountId: original.treasuryAccountId,
          paymentMode: original.paymentMode,
          reference: original.reference,
          status: 'VALIDATED',
          createdBy: userId,
          validatedBy: userId,
          validatedAt: new Date(),
          occurredAt: new Date(),
          reversalOfId: original.id,
          reversalReason: dto.reason,
        },
      });
      await tx.financeTransaction.update({
        where: { id },
        data: { status: 'REVERSED' },
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
    });
  }
}
