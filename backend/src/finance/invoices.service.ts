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
  CreateInvoiceDto,
  FilterInvoicesDto,
  UpdateInvoiceDto,
  VoidInvoiceDto,
} from './dto/invoices.dto';
import { ReconciliationService } from './reconciliation.service';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  private async generateInvoiceNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string> {
    const year = new Date().getUTCFullYear();
    const sequence = await tx.commerceSequence.upsert({
      where: {
        organizationId_key: { organizationId, key: `invoice:${year}` },
      },
      create: { organizationId, key: `invoice:${year}`, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `INV-${year}-${String(sequence.value).padStart(5, '0')}`;
  }

  async create(organizationId: string, dto: CreateInvoiceDto) {
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
    }

    if (dto.orderId) {
      const order = await this.prisma.order.findFirst({
        where: { id: dto.orderId, organizationId },
      });
      if (!order) throw new NotFoundException('Order not found');
    }

    let subtotal = new Prisma.Decimal(0);
    let totalTax = new Prisma.Decimal(0);

    const itemsData = dto.items.map((item) => {
      const qty = new Prisma.Decimal(item.quantity);
      const unit = new Prisma.Decimal(item.unitPrice);
      const tax = new Prisma.Decimal(item.tax || 0);
      const itemTotal = qty.mul(unit).add(tax);
      subtotal = subtotal.add(qty.mul(unit));
      totalTax = totalTax.add(tax);

      return {
        description: item.description,
        quantity: qty,
        unitPrice: unit,
        tax,
        total: itemTotal,
        orderItemId: item.orderItemId,
        sourceEntity: item.sourceEntity,
      };
    });

    const total = subtotal.add(totalTax);

    return this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await this.generateInvoiceNumber(tx, organizationId);
      const invoice = await tx.invoice.create({
        data: {
          organizationId,
          invoiceNumber,
          clientId: dto.clientId,
          dossierId: dto.dossierId,
          orderId: dto.orderId,
          currency: dto.currency || 'DZD',
          status: 'DRAFT',
          subtotal,
          tax: totalTax,
          discount: new Prisma.Decimal(0),
          total,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          notes: dto.notes,
          items: {
            create: itemsData,
          },
        },
        include: {
          items: true,
          client: true,
          dossier: true,
          order: true,
        },
      });

      return invoice;
    });
  }

  async findAll(organizationId: string, filter: FilterInvoicesDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const where: Prisma.InvoiceWhereInput = {
      organizationId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.clientId ? { clientId: filter.clientId } : {}),
      ...(filter.dossierId ? { dossierId: filter.dossierId } : {}),
      ...(filter.orderId ? { orderId: filter.orderId } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
      ...(filter.search
        ? {
            OR: [
              { invoiceNumber: { contains: filter.search, mode: 'insensitive' } },
              { notes: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filter.fromDate || filter.toDate
        ? {
            createdAt: {
              ...(filter.fromDate ? { gte: new Date(filter.fromDate) } : {}),
              ...(filter.toDate ? { lte: new Date(filter.toDate) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          client: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          dossier: {
            select: { id: true, reference: true, type: true, status: true },
          },
          order: {
            select: { id: true, orderNumber: true, status: true },
          },
          allocations: {
            where: { status: 'ACTIVE' },
          },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
      include: {
        items: true,
        client: true,
        dossier: true,
        order: true,
        allocations: {
          include: {
            payment: true,
            installment: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  async update(id: string, organizationId: string, dto: UpdateInvoiceDto) {
    const invoice = await this.findOne(id, organizationId);
    if (invoice.status !== 'DRAFT') {
      throw new ConflictException('Only draft invoices can be edited');
    }

    return this.prisma.$transaction(async (tx) => {
      let subtotal = invoice.subtotal;
      let totalTax = invoice.tax;
      let total = invoice.total;

      if (dto.items && dto.items.length > 0) {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

        subtotal = new Prisma.Decimal(0);
        totalTax = new Prisma.Decimal(0);

        const itemsData = dto.items.map((item) => {
          const qty = new Prisma.Decimal(item.quantity);
          const unit = new Prisma.Decimal(item.unitPrice);
          const tax = new Prisma.Decimal(item.tax || 0);
          const itemTotal = qty.mul(unit).add(tax);
          subtotal = subtotal.add(qty.mul(unit));
          totalTax = totalTax.add(tax);

          return {
            invoiceId: id,
            description: item.description,
            quantity: qty,
            unitPrice: unit,
            tax,
            total: itemTotal,
            orderItemId: item.orderItemId,
            sourceEntity: item.sourceEntity,
          };
        });

        await tx.invoiceItem.createMany({ data: itemsData });
        total = subtotal.add(totalTax);
      }

      const updated = await tx.invoice.update({
        where: { id },
        data: {
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          notes: dto.notes !== undefined ? dto.notes : invoice.notes,
          subtotal,
          tax: totalTax,
          total,
          version: { increment: 1 },
        },
        include: {
          items: true,
          client: true,
        },
      });

      return updated;
    });
  }

  async issue(id: string, organizationId: string) {
    const invoice = await this.findOne(id, organizationId);
    if (invoice.status !== 'DRAFT') {
      throw new ConflictException('Invoice is already issued or finalized');
    }

    return this.prisma.$transaction(async (tx) => {
      // Re-calculate totals from persistent items to guarantee immutability
      const items = await tx.invoiceItem.findMany({ where: { invoiceId: id } });
      const subtotal = items.reduce(
        (sum, item) => sum.add(item.quantity.mul(item.unitPrice)),
        new Prisma.Decimal(0),
      );
      const tax = items.reduce((sum, item) => sum.add(item.tax), new Prisma.Decimal(0));
      const total = subtotal.add(tax);

      await tx.invoice.update({
        where: { id },
        data: {
          subtotal,
          tax,
          total,
          issueDate: new Date(),
          status: 'ISSUED',
        },
      });

      await this.reconciliation.reconcileInvoice(tx, id);
      return this.findOne(id, organizationId);
    });
  }

  async void(id: string, organizationId: string, dto: VoidInvoiceDto) {
    const invoice = await this.findOne(id, organizationId);
    if (invoice.status === 'VOIDED') {
      return invoice;
    }

    return this.prisma.$transaction(async (tx) => {
      // Mark active allocations reversed
      await tx.paymentAllocation.updateMany({
        where: { invoiceId: id, status: 'ACTIVE' },
        data: { status: 'REVERSED', reversedAt: new Date() },
      });

      const updated = await tx.invoice.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidReason: dto.reason,
        },
        include: {
          items: true,
          allocations: true,
        },
      });

      return updated;
    });
  }
}
