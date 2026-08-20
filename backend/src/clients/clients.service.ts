import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(page: number = 1, limit: number = 10, filters?: any) {
    const skip = (page - 1) * limit;

    const where: any = {};
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
            select: {
              id: true,
              reference: true,
              status: true,
              createdAt: true,
            },
          },
          orders: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              total: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      items: clients,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        prospect: {
          include: {
            activities: {
              orderBy: { activityDate: 'desc' },
            },
          },
        },
        dossiers: {
          include: {
            dossierVehicles: {
              include: { vehicle: true },
            },
            order: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        orders: {
          include: {
            items: true,
            invoices: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    // Format dossiers with vehicles for backward compatibility
    const formattedDossiers = client.dossiers.map((d: any) => ({
      ...d,
      vehicles: d.dossierVehicles ? d.dossierVehicles.map((dv: any) => dv.vehicle) : [],
      vehicle: d.dossierVehicles && d.dossierVehicles.length > 0 ? d.dossierVehicles[0].vehicle : null,
      vehicleId: d.dossierVehicles && d.dossierVehicles.length > 0 ? d.dossierVehicles[0].vehicleId : null,
    }));

    // Add summary stats
    const stats = {
      totalDossiers: client.dossiers.length,
      totalOrders: client.orders.length,
      activeDossiers: client.dossiers.filter(d => d.status !== 'cloture').length,
    };

    return { ...client, dossiers: formattedDossiers, stats };
  }

  async update(id: string, updateClientDto: UpdateClientDto) {
    await this.findOne(id);

    const client = await this.prisma.client.update({
      where: { id },
      data: updateClientDto,
      include: {
        prospect: true,
        dossiers: true,
        orders: true,
      },
    });

    this.logger.log(`Client updated: ${client.firstName} ${client.lastName} (${id})`);
    return client;
  }

  async remove(id: string) {
    await this.findOne(id);

    // Check if client has dossiers
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        dossiers: true,
        orders: true,
      },
    });

    if ((client?.dossiers?.length ?? 0) > 0 || (client?.orders?.length ?? 0) > 0) {
      throw new Error('Cannot delete client with existing dossiers or orders');
    }

    await this.prisma.client.delete({
      where: { id },
    });

    this.logger.log(`Client deleted: ${id}`);
    return { message: 'Client deleted successfully' };
  }

  async getDossiers(clientId: string) {
    await this.findOne(clientId);

    const dossiers = await this.prisma.dossier.findMany({
      where: { clientId },
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

    return dossiers.map((d: any) => ({
      ...d,
      vehicles: d.dossierVehicles ? d.dossierVehicles.map((dv: any) => dv.vehicle) : [],
      vehicle: d.dossierVehicles && d.dossierVehicles.length > 0 ? d.dossierVehicles[0].vehicle : null,
      vehicleId: d.dossierVehicles && d.dossierVehicles.length > 0 ? d.dossierVehicles[0].vehicleId : null,
    }));
  }

  async getOrders(clientId: string) {
    await this.findOne(clientId);

    return this.prisma.order.findMany({
      where: { clientId },
      include: {
        items: true,
        invoices: true,
        dossier: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
