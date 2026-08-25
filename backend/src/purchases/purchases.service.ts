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
    return paginate(items, total, page, limit);
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
