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

  async create(organizationId: string, dto: CreateCustomerDepositDto) {
    if (dto.amount <= 0) {
      throw new BadRequestException('Deposit amount must be positive');
    }

    const amount = new Prisma.Decimal(dto.amount);
    const paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();

    return this.prisma.customerDeposit.create({
      data: {
        organizationId,
        clientId: dto.clientId,
        prospectId: dto.prospectId,
        dossierId: dto.dossierId,
        orderId: dto.orderId,
        amount,
        appliedAmount: new Prisma.Decimal(0),
        unappliedAmount: amount,
        currency: dto.currency || 'DZD',
        paymentMethod: dto.paymentMethod,
        reference: dto.reference,
        status: 'CONFIRMED',
        paymentDate,
        notes: dto.notes,
      },
      include: {
        client: true,
        dossier: true,
        prospect: true,
      },
    });
  }

  async apply(
    id: string,
    organizationId: string,
    dto: ApplyCustomerDepositDto,
  ) {
    const deposit = await this.prisma.customerDeposit.findFirst({
      where: { id, organizationId },
      include: { payment: true },
    });

    if (!deposit) throw new NotFoundException('Customer deposit not found');

    const applyAmount = new Prisma.Decimal(dto.amount);
    if (applyAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Apply amount must be positive');
    }

    if (applyAmount.greaterThan(deposit.unappliedAmount)) {
      throw new BadRequestException(
        `Cannot apply ${applyAmount.toString()}; unapplied deposit balance is ${deposit.unappliedAmount.toString()}`,
      );
    }

    if (!dto.invoiceId && !dto.installmentId) {
      throw new BadRequestException(
        'Must specify an invoiceId or installmentId to apply deposit to',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Find or create a underlying Payment entity to hold the allocation if standalone
      let paymentId = deposit.paymentId;
      if (!paymentId) {
        const payment = await tx.payment.create({
          data: {
            organizationId,
            clientId: deposit.clientId || '',
            dossierId: deposit.dossierId,
            orderId: deposit.orderId,
            amount: deposit.amount,
            allocatedAmount: applyAmount,
            unallocatedAmount: deposit.amount.minus(applyAmount),
            currency: deposit.currency,
            paymentMethod: deposit.paymentMethod,
            reference: deposit.reference,
            status: 'CONFIRMED',
            paymentDate: deposit.paymentDate,
            notes: 'Created from standalone deposit',
          },
        });
        paymentId = payment.id;
        await tx.customerDeposit.update({
          where: { id },
          data: { paymentId },
        });
      }

      await tx.paymentAllocation.create({
        data: {
          organizationId,
          paymentId,
          invoiceId: dto.invoiceId,
          installmentId: dto.installmentId,
          amount: applyAmount,
          status: 'ACTIVE',
        },
      });

      const newApplied = deposit.appliedAmount.add(applyAmount);
      const newUnapplied = deposit.amount.minus(newApplied);

      const updatedDeposit = await tx.customerDeposit.update({
        where: { id },
        data: {
          appliedAmount: newApplied,
          unappliedAmount: newUnapplied,
          status: newUnapplied.isZero() ? 'FULLY_APPLIED' : 'PARTIALLY_APPLIED',
        },
        include: {
          client: true,
          dossier: true,
          payment: {
            include: {
              allocations: true,
            },
          },
        },
      });

      if (dto.invoiceId) {
        await this.reconciliation.reconcileInvoice(tx, dto.invoiceId);
      }
      if (dto.installmentId) {
        await this.reconciliation.reconcileInstallment(tx, dto.installmentId);
      }

      return updatedDeposit;
    });
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
