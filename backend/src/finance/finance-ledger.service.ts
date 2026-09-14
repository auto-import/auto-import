import { randomUUID } from 'node:crypto';
import { requireTreasuryAccount } from './treasury-account';
import { ExchangeRatesService } from './exchange-rates.service';
import { reverseFinanceEntry } from './finance-reversal';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type FinanceTransaction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTreasuryAccountDto,
  TransferTreasuryDto,
  UpdateTreasuryAccountDto,
  ReverseFinanceTransactionDto,
} from './dto/contracts-v2.dto';

@Injectable()
export class FinanceLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  paymentAccounts(organizationId: string) {
    return this.prisma.treasuryAccount.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        archivedAt: null,
        office: { organizationId, status: 'active' },
      },
      select: {
        id: true,
        code: true,
        name: true,
        currency: true,
        officeId: true,
        office: { select: { id: true, name: true } },
      },
      orderBy: { code: 'asc' },
    });
  }
  async accounts(organizationId: string) {
    const accounts = await this.prisma.treasuryAccount.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { code: 'asc' },
      include: { office: { select: { id: true, name: true } } },
    });
    const balances = await this.prisma.financeTransaction.groupBy({
      by: ['treasuryAccountId', 'direction'],
      where: {
        organizationId,
        OR: [
          { status: 'VALIDATED' },
          { status: 'REVERSED', reversals: { some: { status: 'VALIDATED' } } },
        ],
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
        inflows: credits.toString(),
        outflows: debits.toString(),
        balance: account.openingBalance.add(credits).minus(debits).toString(),
      };
    });
  }

  async createAccount(
    organizationId: string,
    dto: CreateTreasuryAccountDto,
    userId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const office = await tx.office.findFirst({
        where: { id: dto.officeId, organizationId, status: 'active' },
      });
      if (!office) throw new NotFoundException('Bureau actif introuvable.');
      const account = await tx.treasuryAccount.create({
        data: {
          organizationId,
          officeId: office.id,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          type: dto.type,
          currency: dto.currency.toUpperCase(),
          openingBalance: dto.openingBalance ?? 0,
        },
      });
      if (userId)
        await tx.auditLog.create({
          data: {
            organizationId,
            userId,
            action: 'TREASURY_ACCOUNT_CREATED',
            entityType: 'TreasuryAccount',
            entityId: account.id,
            newValues: {
              openingBalance: account.openingBalance.toString(),
              officeId: office.id,
            },
          },
        });
      return account;
    });
  }

  async updateAccount(
    id: string,
    organizationId: string,
    userId: string,
    dto: UpdateTreasuryAccountDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.treasuryAccount.findFirst({
        where: { id, organizationId, archivedAt: null },
      });
      if (!account) throw new NotFoundException('Compte introuvable.');
      if (
        dto.officeId &&
        !(await tx.office.findFirst({
          where: { id: dto.officeId, organizationId, status: 'active' },
        }))
      )
        throw new NotFoundException('Bureau actif introuvable.');
      const updated = await tx.treasuryAccount.update({
        where: { id },
        data: dto,
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'TREASURY_ACCOUNT_UPDATED',
          entityType: 'TreasuryAccount',
          entityId: id,
          oldValues: { officeId: account.officeId, status: account.status },
          newValues: { ...dto },
        },
      });
      return updated;
    });
  }

  async transfer(
    organizationId: string,
    userId: string,
    dto: TransferTreasuryDto,
  ) {
    if (dto.sourceAccountId === dto.destinationAccountId)
      throw new ConflictException('Choisissez deux comptes différents.');
    return this.prisma.$transaction(
      async (tx) => {
        const previous = await tx.financeTransaction.findFirst({
          where: {
            organizationId,
            idempotencyKey: `transfer:${dto.idempotencyKey}:out`,
          },
        });
        if (previous) {
          const entries = await tx.financeTransaction.findMany({
            where: {
              organizationId,
              transferGroupId: previous.transferGroupId,
              reversalOfId: null,
            },
          });
          if (
            !previous.originalAmount.equals(dto.amount) ||
            previous.treasuryAccountId !== dto.sourceAccountId ||
            !entries.some(
              (e) =>
                e.treasuryAccountId === dto.destinationAccountId &&
                e.direction === 'CREDIT' &&
                e.originalAmount.equals(dto.destinationAmount ?? dto.amount),
            )
          )
            throw new ConflictException(
              'Cette référence de transfert désigne une autre opération.',
            );
          return entries;
        }
        const source = await tx.treasuryAccount.findFirst({
          where: { id: dto.sourceAccountId, organizationId },
        });
        const destination = await tx.treasuryAccount.findFirst({
          where: { id: dto.destinationAccountId, organizationId },
        });
        if (!source || !destination)
          throw new NotFoundException('Compte introuvable.');
        await requireTreasuryAccount(
          tx,
          organizationId,
          source.currency,
          source.id,
        );
        await requireTreasuryAccount(
          tx,
          organizationId,
          destination.currency,
          destination.id,
        );
        if (
          source.currency === destination.currency &&
          dto.destinationAmount != null &&
          !new Prisma.Decimal(dto.amount).equals(dto.destinationAmount)
        )
          throw new ConflictException(
            'Les montants doivent être identiques pour un transfert dans la même devise.',
          );
        if (source.currency !== destination.currency && !dto.destinationAmount)
          throw new ConflictException(
            'Renseignez le montant réellement reçu dans la devise du compte destinataire.',
          );
        const transferGroupId = randomUUID();
        const occurredAt = dto.occurredAt
          ? new Date(dto.occurredAt)
          : new Date();
        const entries: FinanceTransaction[] = [];
        for (const [account, direction, amount, suffix] of [
          [source, 'DEBIT', dto.amount, 'out'],
          [destination, 'CREDIT', dto.destinationAmount ?? dto.amount, 'in'],
        ] as const) {
          const snapshot = await new ExchangeRatesService(
            this.prisma,
          ).findActiveDzdRateSnapshot(
            tx,
            organizationId,
            account.currency,
            occurredAt,
            dto.rateType,
          );
          entries.push(
            await tx.financeTransaction.create({
              data: {
                organizationId,
                type: 'TREASURY_TRANSFER',
                direction,
                sourceModule: `TREASURY_TRANSFER_${suffix.toUpperCase()}`,
                sourceRecordId: transferGroupId,
                transferGroupId,
                idempotencyKey: `transfer:${dto.idempotencyKey}:${suffix}`,
                originalAmount: amount,
                currency: account.currency,
                exchangeRateSnapshot: snapshot.rate,
                amountDzd: new Prisma.Decimal(amount)
                  .mul(snapshot.rate)
                  .toDecimalPlaces(2),
                rateType: dto.rateType ?? 'COMMERCIAL',
                treasuryAccountId: account.id,
                officeId: account.officeId,
                reference: dto.reference,
                status: 'VALIDATED',
                createdBy: userId,
                validatedBy: userId,
                validatedAt: new Date(),
                occurredAt,
              },
            }),
          );
        }
        await tx.auditLog.create({
          data: {
            organizationId,
            userId,
            action: 'TREASURY_TRANSFER',
            entityType: 'FinanceTransaction',
            entityId: transferGroupId,
            newValues: {
              sourceAccountId: source.id,
              destinationAccountId: destination.id,
            },
          },
        });
        return entries;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async transactions(organizationId: string, status?: string) {
    return this.prisma.financeTransaction.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 200,
      include: {
        office: { select: { id: true, name: true } },
        purchase: {
          include: {
            vehicle: {
              select: { id: true, brand: true, model: true, vin: true },
            },
          },
        },
        treasuryAccount: { select: { id: true, code: true, name: true } },
        dossier: {
          select: {
            id: true,
            reference: true,
            dossierVehicles: {
              select: {
                vehicle: {
                  select: { id: true, brand: true, model: true, vin: true },
                },
              },
            },
          },
        },
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
      if (!original) throw new NotFoundException('Écriture introuvable.');
      if (original.transferGroupId && !original.reversalOfId) {
        const entries = await tx.financeTransaction.findMany({
          where: {
            organizationId,
            transferGroupId: original.transferGroupId,
            reversalOfId: null,
          },
        });
        const reversed: FinanceTransaction[] = [];
        for (const entry of entries)
          reversed.push(
            await reverseFinanceEntry(
              tx,
              entry.id,
              organizationId,
              userId,
              dto.reason,
              true,
              entry,
            ),
          );
        return reversed;
      }
      return reverseFinanceEntry(
        tx,
        id,
        organizationId,
        userId,
        dto.reason,
        true,
        original,
      );
    });
  }
}
