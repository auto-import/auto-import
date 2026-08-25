import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-status.dto';
import { paginate } from '../common/helpers/pagination.helper';
import { Prisma } from '@prisma/client';
import type { OrderItemDto } from './dto/create-order.dto';

export interface OrderFilters {
  status?: string;
  clientId?: string;
  orderNumber?: string;
  fromDate?: string;
  toDate?: string;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private prisma: PrismaService) {}

  private async generateOrderNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string> {
    const year = new Date().getUTCFullYear();
    const sequence = await tx.commerceSequence.upsert({
      where: { organizationId_key: { organizationId, key: `order:${year}` } },
      create: { organizationId, key: `order:${year}`, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `ORD-${year}-${String(sequence.value).padStart(6, '0')}`;
  }

  async create(
    createOrderDto: CreateOrderDto,
    userId: string,
    organizationId: string,
  ) {
    const { clientId, prospectId, dossierId, items, currency } = createOrderDto;

    // Check if client exists and belongs to same organization
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId },
    });

    if (!client) {
      throw new NotFoundException(
        `Client with ID ${clientId} not found in your organization`,
      );
    }

    // Check if prospect exists and belongs to same organization if provided
    if (prospectId) {
      const prospect = await this.prisma.prospect.findFirst({
        where: { id: prospectId, organizationId },
      });

      if (!prospect) {
        throw new NotFoundException(
          `Prospect with ID ${prospectId} not found in your organization`,
        );
      }
    }

    // Check if dossier exists and belongs to same organization
    if (dossierId) {
      const dossier = await this.prisma.dossier.findFirst({
        where: { id: dossierId, organizationId },
      });

      if (!dossier) {
        throw new NotFoundException(
          `Dossier with ID ${dossierId} not found in your organization`,
        );
      }

      if (dossier.orderId) {
        throw new ConflictException('Dossier already has an order');
      }
      if (dossier.clientId !== clientId) {
        throw new ConflictException('Order and dossier client must match');
      }
    }

    // Validate vehicles belong to organization, are available/not sold, and calculate totals
    let subtotal = 0;
    const validatedItems: OrderItemDto[] = [];

    for (const item of items) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: item.vehicleId, organizationId },
      });

      if (!vehicle) {
        throw new NotFoundException(
          `Vehicle with ID ${item.vehicleId} not found in your organization`,
        );
      }

      if (vehicle.status !== 'available') {
        throw new ConflictException(
          `Vehicle ${vehicle.brand} ${vehicle.model} is not available`,
        );
      }

      const itemTotal = item.unitPrice - (item.discount || 0);
      subtotal += itemTotal;
      validatedItems.push(item);
    }

    const total = subtotal;

    const order = await this.prisma.$transaction(async (prisma) => {
      const orderNumber = await this.generateOrderNumber(
        prisma,
        organizationId,
      );
      // Create order with organizationId
      const newOrder = await prisma.order.create({
        data: {
          orderNumber,
          organizationId,
          clientId,
          prospectId,
          createdBy: userId,
          status: 'draft',
          subtotal,
          discount: 0,
          total,
          currency: currency || 'DZD',
          orderDate: new Date(),
        },
      });

      // Create order items and reservations
      for (const item of validatedItems) {
        const itemTotal = item.unitPrice - (item.discount || 0);
        await prisma.orderItem.create({
          data: {
            orderId: newOrder.id,
            vehicleId: item.vehicleId,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            total: itemTotal,
          },
        });

        // Reserve the vehicle
        const reserved = await prisma.vehicle.updateMany({
          where: { id: item.vehicleId, organizationId, status: 'available' },
          data: { status: 'reserved' },
        });
        if (reserved.count !== 1)
          throw new ConflictException('Vehicle was reserved concurrently');

        // Create reservation
        await prisma.reservation.create({
          data: {
            organizationId,
            vehicleId: item.vehicleId,
            orderId: newOrder.id,
            reservedBy: userId,
            status: 'active',
            reservedAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      }

      // Create status history
      await prisma.orderStatusHistory.create({
        data: {
          orderId: newOrder.id,
          changedBy: userId,
          toStatus: newOrder.status,
          comment: 'Order created',
        },
      });

      // Update dossier if linked (Dossier has orderId pointing to Order)
      if (dossierId) {
        await prisma.dossier.update({
          where: { id: dossierId },
          data: { orderId: newOrder.id },
        });
      }

      return newOrder;
    });

    this.logger.log(`Order created: ${order.orderNumber} (${order.id})`);
    return this.findOne(order.id, organizationId);
  }

  async findAll(
    organizationId: string,
    page: number = 1,
    limit: number = 20,
    filters?: OrderFilters,
  ) {
    await this.expireReservations(organizationId);
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = { organizationId };

    if (filters?.status) where.status = filters.status;
    if (filters?.clientId) where.clientId = filters.clientId;
    if (filters?.orderNumber)
      where.orderNumber = {
        contains: filters.orderNumber,
        mode: 'insensitive',
      };
    if (filters?.fromDate || filters?.toDate) {
      const orderDate: Prisma.DateTimeFilter = {};
      if (filters.fromDate) orderDate.gte = new Date(filters.fromDate);
      if (filters.toDate) orderDate.lte = new Date(filters.toDate);
      where.orderDate = orderDate;
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          client: {
            include: {
              prospect: true,
            },
          },
          items: {
            include: {
              vehicle: {
                include: {
                  specs: true,
                  photos: {
                    where: { isPrimary: true },
                    include: { file: true },
                  },
                },
              },
            },
          },
          dossier: true,
          invoices: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
              total: true,
            },
          },
          history: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          reservations: {
            where: { status: 'active' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);

    return paginate(orders, total, page, limit);
  }

  async findOne(id: string, organizationId?: string) {
    if (organizationId) await this.expireReservations(organizationId, id);
    const order = await this.prisma.order.findFirst({
      where: { id, ...(organizationId && { organizationId }) },
      include: {
        client: {
          include: {
            prospect: true,
          },
        },
        items: {
          include: {
            vehicle: {
              include: {
                specs: true,
                photos: {
                  include: { file: true },
                },
              },
            },
          },
        },
        dossier: {
          include: {
            dossierVehicles: {
              include: { vehicle: true },
            },
            history: {
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
          },
        },
        invoices: {
          include: {
            payments: true,
          },
        },
        reservations: {
          include: {
            vehicle: true,
          },
        },
        history: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    // Calculate payment status
    const totalPaid =
      order.invoices?.reduce(
        (sum, inv) =>
          sum + inv.payments.reduce((s, p) => s + p.amount.toNumber(), 0),
        0,
      ) || 0;

    const totalInvoiced =
      order.invoices?.reduce((sum, inv) => sum + inv.total.toNumber(), 0) || 0;

    return {
      ...order,
      paymentStatus: {
        totalPaid,
        totalInvoiced,
        balance: totalInvoiced - totalPaid,
        isFullyPaid: totalInvoiced > 0 && totalPaid >= totalInvoiced,
      },
    };
  }

  async update(
    id: string,
    dto: UpdateOrderDto,
    userId: string,
    organizationId: string,
  ) {
    const order = await this.findOne(id, organizationId);
    if (order.status !== 'draft') {
      throw new ConflictException('Only draft orders can be edited');
    }
    if (!dto.items) return order;
    const items = dto.items;
    return this.prisma.$transaction(async (tx) => {
      const oldVehicleIds = order.items.map((item) => item.vehicleId);
      await tx.reservation.updateMany({
        where: { orderId: id, organizationId, status: 'active' },
        data: {
          status: 'released',
          releasedAt: new Date(),
          releaseReason: 'orderEdited',
        },
      });
      await tx.vehicle.updateMany({
        where: {
          id: { in: oldVehicleIds },
          organizationId,
          status: 'reserved',
        },
        data: { status: 'available' },
      });
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      let subtotal = 0;
      for (const item of items) {
        const vehicle = await tx.vehicle.findFirst({
          where: { id: item.vehicleId, organizationId },
        });
        if (!vehicle) throw new NotFoundException('Vehicle not found');
        const reserved = await tx.vehicle.updateMany({
          where: { id: item.vehicleId, organizationId, status: 'available' },
          data: { status: 'reserved' },
        });
        if (reserved.count !== 1)
          throw new ConflictException('Vehicle is not available');
        const unitPrice =
          item.unitPrice ?? vehicle.sellingPrice?.toNumber() ?? 0;
        const discount = item.discount ?? 0;
        const total = unitPrice - discount;
        subtotal += total;
        await tx.orderItem.create({
          data: {
            orderId: id,
            vehicleId: item.vehicleId,
            unitPrice,
            discount,
            total,
          },
        });
        await tx.reservation.create({
          data: {
            organizationId,
            vehicleId: item.vehicleId,
            orderId: id,
            reservedBy: userId,
            status: 'active',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      }
      const updated = await tx.order.update({
        where: { id },
        data: { subtotal, total: subtotal },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          changedBy: userId,
          fromStatus: order.status,
          toStatus: order.status,
          comment: 'Order items updated',
        },
      });
      return updated;
    });
  }

  async updateStatus(
    id: string,
    updateStatusDto: UpdateOrderStatusDto,
    userId: string,
    organizationId?: string,
  ) {
    const order = await this.findOne(id, organizationId);
    const { status, comment } = updateStatusDto;

    // Status transition validation
    const validTransitions: Record<string, string[]> = {
      draft: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[order.status]?.includes(status)) {
      throw new ConflictException(
        `Invalid status transition from ${order.status} to ${status}`,
      );
    }

    await this.prisma.$transaction(async (prisma) => {
      const updated = await prisma.order.update({
        where: { id },
        data: {
          status,
          confirmedAt: status === 'confirmed' ? new Date() : undefined,
        },
      });

      await prisma.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: status,
          changedBy: userId,
          comment: comment || `Status changed to ${status}`,
        },
      });

      // If order is completed or cancelled, release vehicle reservations
      if (status === 'completed' || status === 'cancelled') {
        await prisma.reservation.updateMany({
          where: {
            orderId: id,
            organizationId: order.organizationId,
            status: 'active',
          },
          data: {
            status: status === 'completed' ? 'consumed' : 'released',
            releasedAt: status === 'cancelled' ? new Date() : undefined,
            releaseReason:
              status === 'cancelled' ? 'orderCancelled' : undefined,
          },
        });

        await prisma.vehicle.updateMany({
          where: {
            id: {
              in: order.items.map((item) => item.vehicleId),
            },
          },
          data: { status: status === 'completed' ? 'sold' : 'available' },
        });
      }

      return updated;
    });

    this.logger.log(
      `Order ${order.orderNumber} status updated: ${order.status} -> ${status}`,
    );
    return this.findOne(id, organizationId);
  }

  async getHistory(id: string, organizationId?: string) {
    await this.findOne(id, organizationId);

    return this.prisma.orderStatusHistory.findMany({
      where: { orderId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getReservations(id: string, organizationId?: string) {
    await this.findOne(id, organizationId);

    return this.prisma.reservation.findMany({
      where: { orderId: id },
      include: {
        vehicle: {
          include: {
            specs: true,
          },
        },
      },
      orderBy: { reservedAt: 'desc' },
    });
  }

  async remove(id: string, organizationId: string) {
    const order = await this.findOne(id, organizationId);

    if (order.status !== 'draft' && order.status !== 'cancelled') {
      throw new ConflictException(
        `Cannot delete order in ${order.status} status`,
      );
    }

    if (order.status === 'cancelled') return order;
    return this.updateStatus(
      id,
      { status: 'cancelled', comment: 'Order cancelled' },
      order.createdBy,
      organizationId,
    );
  }

  async expireReservations(
    organizationId: string,
    orderId?: string,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const expired = await tx.reservation.findMany({
        where: {
          organizationId,
          status: 'active',
          expiresAt: { lte: new Date() },
          ...(orderId ? { orderId } : {}),
        },
      });
      for (const reservation of expired) {
        await tx.reservation.update({
          where: { id: reservation.id },
          data: {
            status: 'expired',
            releasedAt: new Date(),
            releaseReason: 'expired',
          },
        });
        await tx.vehicle.updateMany({
          where: {
            id: reservation.vehicleId,
            organizationId,
            status: 'reserved',
          },
          data: { status: 'available' },
        });
      }
      return expired.length;
    });
  }
}
