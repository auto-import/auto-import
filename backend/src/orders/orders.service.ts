import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-status.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private prisma: PrismaService) {}

  private async generateOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const lastOrder = await this.prisma.order.findFirst({
      where: {
        orderNumber: {
          startsWith: `ORD-${year}-`,
        },
      },
      orderBy: {
        orderNumber: 'desc',
      },
    });

    let sequence = 1;
    if (lastOrder) {
      const parts = lastOrder.orderNumber.split('-');
      sequence = parseInt(parts[2]) + 1;
    }

    return `ORD-${year}-${String(sequence).padStart(6, '0')}`;
  }

  async create(createOrderDto: CreateOrderDto, userId: string) {
    const { clientId, prospectId, dossierId, items, currency, status } = createOrderDto;

    // Check if client exists
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${clientId} not found`);
    }

    // Check if dossier exists and link it
    if (dossierId) {
      const dossier = await this.prisma.dossier.findUnique({
        where: { id: dossierId },
      });

      if (!dossier) {
        throw new NotFoundException(`Dossier with ID ${dossierId} not found`);
      }

      if (dossier.orderId) {
        throw new ConflictException('Dossier already has an order');
      }
    }

    // Validate vehicles and calculate totals
    let subtotal = 0;
    const validatedItems: any[] = [];

    for (const item of items) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: item.vehicleId },
      });

      if (!vehicle) {
        throw new NotFoundException(`Vehicle with ID ${item.vehicleId} not found`);
      }

      if (vehicle.status === 'sold') {
        throw new ConflictException(`Vehicle ${vehicle.brand} ${vehicle.model} is already sold`);
      }

      const itemTotal = item.unitPrice - (item.discount || 0);
      subtotal += itemTotal;
      validatedItems.push(item);
    }

    const orderNumber = await this.generateOrderNumber();
    const total = subtotal;

    const order = await this.prisma.$transaction(async (prisma) => {
      // Create order (dossierId is on the Dossier model, not on Order)
      const newOrder = await prisma.order.create({
        data: {
          orderNumber,
          clientId,
          prospectId,
          createdBy: userId,
          status: status || 'draft',
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
        await prisma.vehicle.update({
          where: { id: item.vehicleId },
          data: { status: 'reserved' },
        });

        // Create reservation
        await prisma.reservation.create({
          data: {
            vehicleId: item.vehicleId,
            orderId: newOrder.id,
            reservedBy: userId,
            status: 'active',
            reservedAt: new Date(),
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

    this.logger.log(`Order created: ${orderNumber} (${order.id})`);
    return this.findOne(order.id);
  }

  async findAll(page: number = 1, limit: number = 10, filters?: any) {
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters?.status) where.status = filters.status;
    if (filters?.clientId) where.clientId = filters.clientId;
    if (filters?.orderNumber) where.orderNumber = { contains: filters.orderNumber, mode: 'insensitive' };
    if (filters?.fromDate) where.orderDate = { gte: new Date(filters.fromDate) };
    if (filters?.toDate) where.orderDate = { ...where.orderDate, lte: new Date(filters.toDate) };

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

    return {
      items: orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
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
            vehicle: true,
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
    const totalPaid = order.invoices?.reduce((sum, inv) => 
      sum + inv.payments.reduce((s, p) => s + p.amount.toNumber(), 0), 0
    ) || 0;

    const totalInvoiced = order.invoices?.reduce((sum, inv) => 
      sum + inv.total.toNumber(), 0
    ) || 0;

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

  async updateStatus(id: string, updateStatusDto: UpdateOrderStatusDto, userId: string) {
    const order = await this.findOne(id);
    const { status, comment } = updateStatusDto;

    // Status transition validation
    const validTransitions = {
      draft: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['shipped', 'cancelled'],
      shipped: ['delivered', 'cancelled'],
      delivered: ['completed'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[order.status]?.includes(status)) {
      throw new ConflictException(
        `Invalid status transition from ${order.status} to ${status}`
      );
    }

    const updatedOrder = await this.prisma.$transaction(async (prisma) => {
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
          where: { orderId: id, status: 'active' },
          data: {
            status: 'released',
            releasedAt: new Date(),
          },
        });

        await prisma.vehicle.updateMany({
          where: {
            id: {
              in: order.items.map(item => item.vehicleId),
            },
          },
          data: { status: status === 'completed' ? 'sold' : 'available' },
        });
      }

      return updated;
    });

    this.logger.log(`Order ${order.orderNumber} status updated: ${order.status} -> ${status}`);
    return this.findOne(id);
  }

  async getHistory(id: string) {
    await this.findOne(id);

    return this.prisma.orderStatusHistory.findMany({
      where: { orderId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getReservations(id: string) {
    await this.findOne(id);

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

  async remove(id: string) {
    const order = await this.findOne(id);

    if (order.status !== 'draft' && order.status !== 'cancelled') {
      throw new ConflictException(`Cannot delete order in ${order.status} status`);
    }

    await this.prisma.$transaction(async (prisma) => {
      // Release vehicle reservations
      await prisma.reservation.updateMany({
        where: { orderId: id },
        data: {
          status: 'released',
          releasedAt: new Date(),
        },
      });

      // Update vehicle statuses
      await prisma.vehicle.updateMany({
        where: {
          id: {
            in: order.items.map(item => item.vehicleId),
          },
        },
        data: { status: 'available' },
      });

      // Delete order items
      await prisma.orderItem.deleteMany({
        where: { orderId: id },
      });

      // Delete status history
      await prisma.orderStatusHistory.deleteMany({
        where: { orderId: id },
      });

      // Delete order
      await prisma.order.delete({
        where: { id },
      });
    });

    this.logger.log(`Order deleted: ${order.orderNumber} (${id})`);
    return { message: 'Order deleted successfully' };
  }
}
