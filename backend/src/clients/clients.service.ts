import {
  Injectable,
  NotFoundException,
  Logger,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateClientDto } from './dto/update-client.dto';
import { paginate } from '../common/helpers/pagination.helper';
import { Prisma } from '@prisma/client';
import { ContactResolutionService } from '../crm/contact-resolution.service';
import { CreateClientDto } from './dto/create-client.dto';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private readonly contacts?: ContactResolutionService,
  ) {}

  async create(dto: CreateClientDto, organizationId: string, userId: string) {
    const assignedTo = dto.assignedTo ?? userId;
    return this.prisma.$transaction(
      async (tx) => {
        const assignee = await tx.user.findFirst({
          where: { id: assignedTo, organizationId, status: 'active' },
          select: { id: true },
        });
        if (!assignee) throw new NotFoundException('Assignee not found');
        const client = await tx.client.create({
          data: { ...dto, assignedTo, organizationId },
        });
        if (this.contacts) {
          await this.contacts.syncClientContacts(
            tx,
            organizationId,
            client.id,
            dto.phone,
            dto.email,
          );
        }
        return client;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findAll(
    organizationId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { search?: string },
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = { organizationId };
    if (filters?.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
        { passportNumber: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip,
        take: limit,
        include: {
          prospect: {
            include: {
              activities: {
                orderBy: { activityDate: 'desc' },
                take: 3,
              },
            },
          },
          dossiers: {
            where: { organizationId },
            select: {
              id: true,
              reference: true,
              status: true,
              createdAt: true,
            },
          },
          orders: {
            where: { organizationId },
            select: {
              id: true,
              orderNumber: true,
              status: true,
              total: true,
              createdAt: true,
            },
          },
          assignee: { select: { id: true, firstName: true, lastName: true } },
          contactPoints: true,
          tasks: {
            where: { status: { notIn: ['completed', 'cancelled'] } },
            orderBy: { dueDate: 'asc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.count({ where }),
    ]);

    return paginate(clients, total, page, limit);
  }

  async findOne(id: string, organizationId?: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, ...(organizationId && { organizationId }) },
      include: {
        prospect: {
          include: {
            activities: {
              orderBy: { activityDate: 'desc' },
            },
          },
        },
        dossiers: {
          where: organizationId ? { organizationId } : undefined,
          include: {
            dossierVehicles: {
              include: { vehicle: true },
            },
            order: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        orders: {
          where: organizationId ? { organizationId } : undefined,
          include: {
            items: true,
            invoices: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        contactPoints: true,
        tasks: { orderBy: { dueDate: 'asc' } },
      },
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    // Format dossiers with vehicles for backward compatibility
    const formattedDossiers = client.dossiers.map((d) => ({
      ...d,
      vehicles: d.dossierVehicles
        ? d.dossierVehicles.map((dv) => dv.vehicle)
        : [],
      vehicle:
        d.dossierVehicles && d.dossierVehicles.length > 0
          ? d.dossierVehicles[0].vehicle
          : null,
      vehicleId:
        d.dossierVehicles && d.dossierVehicles.length > 0
          ? d.dossierVehicles[0].vehicleId
          : null,
    }));

    // Add summary stats
    const stats = {
      totalDossiers: client.dossiers.length,
      totalOrders: client.orders.length,
      activeDossiers: client.dossiers.filter(
        (d) =>
          d.status !== 'closed' &&
          d.status !== 'serviceCompleted' &&
          d.status !== 'cancelled',
      ).length,
    };

    return { ...client, dossiers: formattedDossiers, stats };
  }

  async update(
    id: string,
    organizationId: string,
    updateClientDto: UpdateClientDto,
  ) {
    await this.findOne(id, organizationId);

    const client = await this.prisma.$transaction(async (tx) => {
      if (updateClientDto.assignedTo) {
        const assignee = await tx.user.findFirst({
          where: {
            id: updateClientDto.assignedTo,
            organizationId,
            status: 'active',
          },
          select: { id: true },
        });
        if (!assignee) throw new NotFoundException('Assignee not found');
      }
      const updated = await tx.client.update({
        where: { id },
        data: updateClientDto,
        include: { prospect: true, dossiers: true, orders: true },
      });
      if (
        updateClientDto.phone !== undefined ||
        updateClientDto.email !== undefined
      ) {
        if (this.contacts) {
          await this.contacts.syncClientContacts(
            tx,
            organizationId,
            id,
            updateClientDto.phone,
            updateClientDto.email,
          );
        }
      }
      return updated;
    });

    this.logger.log(
      `Client updated: ${client.firstName} ${client.lastName} (${id})`,
    );
    return client;
  }

  async remove(id: string, organizationId: string) {
    const client = await this.findOne(id, organizationId);

    if (
      (client?.dossiers?.length ?? 0) > 0 ||
      (client?.orders?.length ?? 0) > 0
    ) {
      throw new ConflictException(
        'Cannot delete client with existing dossiers or orders',
      );
    }

    await this.prisma.client.delete({
      where: { id },
    });

    this.logger.log(`Client deleted: ${id}`);
    return { message: 'Client deleted successfully' };
  }

  async getDossiers(clientId: string, organizationId: string) {
    await this.findOne(clientId, organizationId);

    const dossiers = await this.prisma.dossier.findMany({
      where: { clientId, organizationId },
      include: {
        dossierVehicles: {
          include: { vehicle: true },
        },
        order: true,
        history: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return dossiers.map((d) => ({
      ...d,
      vehicles: d.dossierVehicles
        ? d.dossierVehicles.map((dv) => dv.vehicle)
        : [],
      vehicle:
        d.dossierVehicles && d.dossierVehicles.length > 0
          ? d.dossierVehicles[0].vehicle
          : null,
      vehicleId:
        d.dossierVehicles && d.dossierVehicles.length > 0
          ? d.dossierVehicles[0].vehicleId
          : null,
    }));
  }

  async getOrders(clientId: string, organizationId: string) {
    await this.findOne(clientId, organizationId);

    return this.prisma.order.findMany({
      where: { clientId, organizationId },
      include: {
        items: true,
        invoices: true,
        dossier: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
