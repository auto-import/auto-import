import { FinanceProjectionService } from './finance-projection.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import {
  ApplyCustomerDepositDto,
  CreateCustomerDepositDto,
} from './dto/finance.dto';
import { ReconciliationService } from './reconciliation.service';

@Injectable()
export class CustomerDepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  async create(
    organizationId: string,
    dto: CreateCustomerDepositDto,
    userId?: string,
  ) {
    if (!userId || !dto.clientId || dto.amount <= 0)
      throw new BadRequestException(
        'Un client et un montant positif sont requis pour enregistrer cet acompte.',
      );
    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: dto.clientId, organizationId },
      });
      if (!client) throw new NotFoundException('Client introuvable.');
      if (
        dto.dossierId &&
        !(await tx.dossier.findFirst({
          where: { id: dto.dossierId, organizationId, clientId: dto.clientId },
        }))
      )
        throw new NotFoundException('Dossier du client introuvable.');
      if (
        dto.prospectId &&
        !(await tx.prospect.findFirst({
          where: { id: dto.prospectId, organizationId },
        }))
      )
        throw new NotFoundException('Prospect introuvable.');
      if (
        dto.orderId &&
        !(await tx.order.findFirst({
          where: { id: dto.orderId, organizationId, clientId: dto.clientId },
        }))
      )
        throw new NotFoundException('Commande du client introuvable.');
      const amount = new Prisma.Decimal(dto.amount);
      const payment = await tx.payment.create({
        data: {
          organizationId,
          clientId: dto.clientId!,
          dossierId: dto.dossierId,
          orderId: dto.orderId,
          amount,
          unallocatedAmount: amount,
          currency: dto.currency,
          paymentMethod: dto.paymentMethod,
          reference: dto.reference,
          status: 'CONFIRMED',
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          actorUserId: userId,
          confirmedAt: new Date(),
        },
      });
      const entry = await new FinanceProjectionService(
        this.prisma,
      ).projectCustomerPayment(tx, organizationId, userId, payment, dto);
      const deposit = await tx.customerDeposit.create({
        data: {
          organizationId,
          clientId: dto.clientId,
          prospectId: dto.prospectId,
          dossierId: dto.dossierId,
          orderId: dto.orderId,
          paymentId: payment.id,
          officeId: entry.officeId,
          amount,
          unappliedAmount: amount,
          currency: dto.currency,
          paymentMethod: dto.paymentMethod,
          reference: dto.reference,
          status: 'CONFIRMED',
          paymentDate: payment.paymentDate,
          notes: dto.notes,
        },
        include: { client: true, dossier: true, prospect: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'CUSTOMER_DEPOSIT_RECEIVED',
          entityType: 'CustomerDeposit',
          entityId: deposit.id,
          newValues: { paymentId: payment.id, financeTransactionId: entry.id },
        },
      });
      return deposit;
    });
  }

  async apply(
    id: string,
    organizationId: string,
    dto: ApplyCustomerDepositDto,
    userId?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const deposit = await tx.customerDeposit.findFirst({
          where: { id, organizationId },
          include: { payment: true },
        });
        if (!deposit) throw new NotFoundException('Acompte introuvable.');
        if (!deposit.clientId)
          throw new BadRequestException(
            'Rattachez cet acompte à un client avant son affectation.',
          );
        if (
          deposit.status === 'REVERSED' ||
          deposit.payment?.status === 'REVERSED'
        )
          throw new BadRequestException(
            'Un acompte extourné ne peut pas être affecté.',
          );
        const amount = new Prisma.Decimal(dto.amount);
        if (amount.lte(0) || amount.gt(deposit.unappliedAmount))
          throw new BadRequestException(
            'Le montant dépasse le solde disponible de cet acompte.',
          );
        if (
          (!dto.invoiceId && !dto.installmentId) ||
          (dto.invoiceId && dto.installmentId)
        )
          throw new BadRequestException(
            'Choisissez une facture ou une échéance.',
          );
        if (dto.invoiceId) {
          const invoice = await tx.invoice.findFirst({
            where: {
              id: dto.invoiceId,
              organizationId,
              clientId: deposit.clientId,
              currency: deposit.currency,
              status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
            },
          });
          if (
            !invoice ||
            (deposit.dossierId && invoice.dossierId !== deposit.dossierId)
          )
            throw new BadRequestException(
              'Facture incompatible avec cet acompte.',
            );
          if (amount.gt(invoice.total.sub(invoice.paidAmount)))
            throw new BadRequestException(
              'Le montant dépasse le solde de la facture.',
            );
        }
        if (dto.installmentId) {
          const installment = await tx.paymentInstallment.findFirst({
            where: {
              id: dto.installmentId,
              paymentPlan: {
                organizationId,
                clientId: deposit.clientId,
                currency: deposit.currency,
                ...(deposit.dossierId ? { dossierId: deposit.dossierId } : {}),
              },
              status: { not: 'CANCELLED' },
            },
          });
          if (
            !installment ||
            amount.gt(installment.amount.sub(installment.paidAmount))
          )
            throw new BadRequestException(
              'Échéance incompatible ou solde insuffisant.',
            );
        }
        let paymentId = deposit.paymentId;
        if (!paymentId) {
          // Reconcile legacy standalone deposits explicitly, without guessing their account or historical FX.
          if (
            !userId ||
            !deposit.clientId ||
            !dto.treasuryAccountId ||
            (deposit.currency !== 'DZD' && !dto.historicalRate)
          )
            throw new BadRequestException(
              'Rapprochement historique requis : client, compte et taux original pour les devises.',
            );
          const payment = await tx.payment.create({
            data: {
              organizationId,
              clientId: deposit.clientId,
              dossierId: deposit.dossierId,
              orderId: deposit.orderId,
              amount: deposit.amount,
              unallocatedAmount: deposit.amount,
              currency: deposit.currency,
              paymentMethod: deposit.paymentMethod,
              reference: deposit.reference,
              status: 'CONFIRMED',
              paymentDate: deposit.paymentDate,
              confirmedAt: new Date(),
              actorUserId: userId,
              notes: 'Rapprochement acompte historique',
            },
          });
          await new FinanceProjectionService(
            this.prisma,
          ).projectCustomerPayment(
            tx,
            organizationId,
            userId,
            payment,
            { treasuryAccountId: dto.treasuryAccountId, rateType: 'MANUAL' },
            new Prisma.Decimal(
              deposit.currency === 'DZD' ? 1 : dto.historicalRate!,
            ),
          );
          paymentId = payment.id;
          await tx.auditLog.create({
            data: {
              organizationId,
              userId,
              action: 'LEGACY_DEPOSIT_RECONCILED',
              entityType: 'CustomerDeposit',
              entityId: id,
              newValues: {
                paymentId,
                reason: dto.reason ?? 'Affectation et rapprochement historique',
              },
            },
          });
        }
        await tx.paymentAllocation.create({
          data: {
            organizationId,
            paymentId,
            invoiceId: dto.invoiceId,
            installmentId: dto.installmentId,
            amount,
            status: 'ACTIVE',
          },
        });
        await this.reconciliation.reconcilePayment(tx, paymentId);
        const newApplied = deposit.appliedAmount.add(amount);
        const newUnapplied = deposit.amount.sub(newApplied);
        return tx.customerDeposit.update({
          where: { id },
          data: {
            paymentId,
            appliedAmount: newApplied,
            unappliedAmount: newUnapplied,
            status: newUnapplied.isZero()
              ? 'FULLY_APPLIED'
              : 'PARTIALLY_APPLIED',
          },
          include: {
            client: true,
            dossier: true,
            payment: { include: { allocations: true } },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findAll(
    organizationId: string,
    page = 1,
    limit = 20,
    clientId?: string,
    dossierId?: string,
  ) {
    const where: Prisma.CustomerDepositWhereInput = {
      organizationId,
      ...(clientId ? { clientId } : {}),
      ...(dossierId ? { dossierId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.customerDeposit.findMany({
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
          prospect: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.customerDeposit.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const deposit = await this.prisma.customerDeposit.findFirst({
      where: { id, organizationId },
      include: {
        client: true,
        dossier: true,
        prospect: true,
        payment: {
          include: { allocations: true },
        },
      },
    });

    if (!deposit) throw new NotFoundException('Deposit not found');
    return deposit;
  }
}
