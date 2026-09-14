import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string, page = 1, limit = 20, status?: string) {
    const where: Prisma.PurchaseWhereInput = {
      organizationId,
      ...(status ? { status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        include: {
          payments: {
            where: { status: 'CONFIRMED' },
            include: {
              financeTransaction: {
                include: {
                  treasuryAccount: {
                    select: { id: true, code: true, name: true },
                  },
                },
              },
            },
          },
          supplier: true,
          vehicle: { include: { specs: true } },
          vehicleRequest: true,
          dossier: true,
          order: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchase.count({ where }),
    ]);
    return paginate(
      items.map((purchase) => {
        const paid = purchase.payments.reduce(
          (sum, payment) => sum.add(payment.amount),
          new Prisma.Decimal(0),
        );
        const remaining = Prisma.Decimal.max(
          purchase.purchasePrice.sub(paid),
          0,
        );
        return {
          ...purchase,
          settlement: {
            total: purchase.purchasePrice.toString(),
            paid: paid.toString(),
            remaining: remaining.toString(),
            currency: purchase.currency,
            dueDate: purchase.dueDate,
            accounts: purchase.payments
              .map((p) => p.financeTransaction?.treasuryAccount)
              .filter(Boolean),
            status:
              purchase.status === 'cancelled'
                ? 'CANCELLED'
                : remaining.isZero()
                  ? 'PAID'
                  : purchase.dueDate && purchase.dueDate < new Date()
                    ? 'OVERDUE'
                    : paid.gt(0)
                      ? 'PARTIALLY_PAID'
                      : 'UNPAID',
          },
        };
      }),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string, organizationId: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, organizationId },
      include: {
        supplier: true,
        vehicle: { include: { specs: true } },
        vehicleRequest: true,
        candidate: true,
        dossier: true,
        order: true,
      },
    });
    if (!purchase) throw new NotFoundException('Purchase not found');
    return purchase;
  }

  async cancel(id: string, organizationId: string) {
    const purchase = await this.findOne(id, organizationId);
    if (purchase.status === 'cancelled') return purchase;
    if (purchase.dossier && purchase.dossier.status !== 'cancelled') {
      throw new ConflictException(
        'Cancel the linked dossier before cancelling this purchase',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const activeEntries = await tx.financeTransaction.count({
        where: {
          organizationId,
          purchaseId: id,
          status: 'VALIDATED',
          reversalOfId: null,
        },
      });
      if (activeEntries)
        throw new ConflictException(
          'Extournez les écritures et paiements de cet achat avant son annulation.',
        );
      const updated = await tx.purchase.update({
        where: { id },
        data: { status: 'cancelled' },
      });
      if (purchase.vehicleRequestId) {
        await tx.vehicleRequest.update({
          where: { id: purchase.vehicleRequestId },
          data: { status: 'candidateSelected' },
        });
      }
      await tx.vehicle.updateMany({
        where: { id: purchase.vehicleId, organizationId, status: 'reserved' },
        data: { status: 'available' },
      });
      return updated;
    });
  }
}
