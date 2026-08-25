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
  CreatePaymentPlanDto,
  FilterPaymentPlansDto,
} from './dto/finance.dto';

@Injectable()
export class PaymentPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreatePaymentPlanDto) {
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, organizationId },
    });
    if (!client) {
      throw new NotFoundException('Client not found in your organization');
    }

    if (dto.dossierId) {
      const dossier = await this.prisma.dossier.findFirst({
        where: { id: dto.dossierId, organizationId },
      });
      if (!dossier) throw new NotFoundException('Dossier not found');

      // Idempotency: Check if an active plan already exists for this dossier
      const existingPlan = await this.prisma.paymentPlan.findFirst({
        where: { dossierId: dto.dossierId, organizationId, status: 'active' },
        include: {
          installments: {
            orderBy: { installmentNumber: 'asc' },
          },
        },
      });
      if (existingPlan) {
        return existingPlan;
      }
    }

    const totalAmount = new Prisma.Decimal(dto.totalAmount);
    const strategy = dto.strategy || 'THIRTY_SEVENTY';

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.paymentPlan.create({
        data: {
          organizationId,
          clientId: dto.clientId,
          dossierId: dto.dossierId,
          orderId: dto.orderId,
          strategy,
          totalAmount,
          currency: dto.currency || 'DZD',
          status: 'active',
        },
      });

      if (strategy === 'FULL_UPFRONT') {
        await tx.paymentInstallment.create({
          data: {
            paymentPlanId: plan.id,
            installmentNumber: 1,
            label: 'Paiement intégral 100%',
            percentage: new Prisma.Decimal(100),
            amount: totalAmount,
            paidAmount: new Prisma.Decimal(0),
            dueTrigger: 'ON_PLAN_CREATION',
            status: 'PENDING',
          },
        });
      } else {
        // THIRTY_SEVENTY
        const firstAmount = totalAmount.mul(30).dividedBy(100).toDecimalPlaces(2);
        const secondAmount = totalAmount.minus(firstAmount);

        await tx.paymentInstallment.createMany({
          data: [
            {
              paymentPlanId: plan.id,
              installmentNumber: 1,
              label: 'Acompte initial 30%',
              percentage: new Prisma.Decimal(30),
              amount: firstAmount,
              paidAmount: new Prisma.Decimal(0),
              dueTrigger: 'ON_PLAN_CREATION',
              status: 'PENDING',
            },
            {
              paymentPlanId: plan.id,
              installmentNumber: 2,
              label: 'Solde 70%',
              percentage: new Prisma.Decimal(70),
              amount: secondAmount,
              paidAmount: new Prisma.Decimal(0),
              dueTrigger: 'ON_VEHICLE_RECOVERY',
              status: 'PENDING',
            },
          ],
        });
      }

      return tx.paymentPlan.findUnique({
        where: { id: plan.id },
        include: {
          installments: {
            orderBy: { installmentNumber: 'asc' },
          },
          client: true,
          dossier: true,
        },
      });
    });
  }

  async findAll(organizationId: string, filter: FilterPaymentPlansDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const where: Prisma.PaymentPlanWhereInput = {
      organizationId,
      ...(filter.clientId ? { clientId: filter.clientId } : {}),
      ...(filter.dossierId ? { dossierId: filter.dossierId } : {}),
      ...(filter.orderId ? { orderId: filter.orderId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.paymentPlan.findMany({
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
          installments: {
            orderBy: { installmentNumber: 'asc' },
          },
        },
      }),
      this.prisma.paymentPlan.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const plan = await this.prisma.paymentPlan.findFirst({
      where: { id, organizationId },
      include: {
        client: true,
        dossier: true,
        order: true,
        installments: {
          orderBy: { installmentNumber: 'asc' },
          include: {
            allocations: {
              where: { status: 'ACTIVE' },
              include: { payment: true },
            },
          },
        },
      },
    });

    if (!plan) throw new NotFoundException('Payment plan not found');
    return plan;
  }
}
