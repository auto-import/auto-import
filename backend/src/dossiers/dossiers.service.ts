import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDossierDto } from './dto/create-dossier.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { FilterDossierDto } from './dto/filter-dossier.dto';

@Injectable()
export class DossiersService {
  private readonly logger = new Logger(DossiersService.name);

  constructor(private prisma: PrismaService) {}

  private async generateReference(): Promise<string> {
    const year = new Date().getFullYear();
    const lastDossier = await this.prisma.dossier.findFirst({
      where: {
        reference: {
          startsWith: `CA-${year}-`,
        },
      },
      orderBy: {
        reference: 'desc',
      },
    });

    let sequence = 1;
    if (lastDossier) {
      const parts = lastDossier.reference.split('-');
      sequence = parseInt(parts[2]) + 1;
    }

    return `CA-${year}-${String(sequence).padStart(4, '0')}`;
  }

  async create(createDossierDto: CreateDossierDto, salesUserId: string) {
    const { clientId, vehicleId, orderId, status } = createDossierDto;

    // Check if client exists
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${clientId} not found`);
    }

    // Check if vehicle exists and is available
    if (vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
      });

      if (!vehicle) {
        throw new NotFoundException(`Vehicle with ID ${vehicleId} not found`);
      }

      if (vehicle.status !== 'available') {
        throw new ConflictException('Vehicle is not available');
      }
    }

    // Generate reference
    const reference = await this.generateReference();

    const dossier = await this.prisma.$transaction(async (prisma) => {
      // Create dossier
      const newDossier = await prisma.dossier.create({
        data: {
          reference,
          clientId,
          vehicleRequestId: createDossierDto.vehicleRequestId,
          vehicleId,
          orderId,
          status: status || 'prospection',
          salesUserId,
          openedAt: new Date(),
        },
        include: {
          client: true,
          vehicle: true,
          order: true,
        },
      });

      // Create initial status history
      await prisma.dossierStatusHistory.create({
        data: {
          dossierId: newDossier.id,
          toStatus: newDossier.status,
          changedBy: salesUserId,
          comment: 'Dossier created',
        },
      });

      // If vehicle is assigned, update its status
      if (vehicleId) {
        await prisma.vehicle.update({
          where: { id: vehicleId },
          data: { status: 'reserved' },
        });
      }

      return newDossier;
    });

    this.logger.log(`Dossier created: ${reference} (${dossier.id})`);
    return dossier;
  }

  async findAll(page: number = 1, limit: number = 10, filters?: FilterDossierDto) {
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters?.status) where.status = filters.status;
    if (filters?.salesUserId) where.salesUserId = filters.salesUserId;
    if (filters?.opsUserId) where.opsUserId = filters.opsUserId;
    if (filters?.reference) where.reference = { contains: filters.reference, mode: 'insensitive' };

    if (filters?.fromDate || filters?.toDate) {
      where.openedAt = {};
      if (filters.fromDate) where.openedAt.gte = new Date(filters.fromDate);
      if (filters.toDate) where.openedAt.lte = new Date(filters.toDate);
    }

    const [dossiers, total] = await Promise.all([
      this.prisma.dossier.findMany({
        where,
        skip,
        take: limit,
        include: {
          client: {
            include: {
              prospect: true,
            },
          },
          vehicle: {
            include: {
              specs: true,
              photos: {
                where: { isPrimary: true },
                include: { file: true },
              },
            },
          },
          order: true,
          history: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.dossier.count({ where }),
    ]);

    return {
      items: dossiers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const dossier = await this.prisma.dossier.findUnique({
      where: { id },
      include: {
        client: {
          include: {
            prospect: true,
            orders: {
              where: { status: { not: 'draft' } },
            },
          },
        },
        vehicle: {
          include: {
            specs: true,
            photos: {
              include: { file: true },
            },
          },
        },
        vehicleRequest: {
          include: {
            candidates: {
              include: { vehicle: true },
            },
          },
        },
        order: {
          include: {
            items: true,
            invoices: {
              include: {
                payments: true,
              },
            },
          },
        },
        history: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!dossier) {
      throw new NotFoundException(`Dossier with ID ${id} not found`);
    }

    // Calculate additional stats
    const stats = {
      totalPayments: dossier.order?.invoices?.reduce((sum, inv) =>
        sum + inv.payments.reduce((s, p) => s + p.amount.toNumber(), 0), 0
      ) || 0,
      totalInvoiceAmount: dossier.order?.invoices?.reduce((sum, inv) =>
        sum + inv.total.toNumber(), 0
      ) || 0,
      isFullyPaid: false,
    };

    if (stats.totalInvoiceAmount > 0 && stats.totalPayments >= stats.totalInvoiceAmount) {
      stats.isFullyPaid = true;
    }

    return { ...dossier, stats };
  }

  async updateStatus(id: string, updateStatusDto: UpdateStatusDto, userId: string) {
    const dossier = await this.findOne(id);

    const { status, comment } = updateStatusDto;

    // Status transition validation
    const validTransitions: Record<string, string[]> = {
      prospection: ['contrat_signe', 'cloture'],
      contrat_signe: ['recherche_vehicule', 'cloture'],
      recherche_vehicule: ['achat', 'cloture'],
      achat: ['shipping', 'cloture'],
      shipping: ['douane', 'cloture'],
      douane: ['livraison', 'cloture'],
      livraison: ['cloture'],
      cloture: [],
    };

    const currentStatus = dossier.status;
    if (!validTransitions[currentStatus]?.includes(status)) {
      throw new ConflictException(
        `Invalid status transition from ${currentStatus} to ${status}`
      );
    }

    const updatedDossier = await this.prisma.$transaction(async (prisma) => {
      // Update dossier status
      const updated = await prisma.dossier.update({
        where: { id },
        data: {
          status,
          closedAt: status === 'cloture' ? new Date() : undefined,
        },
        include: {
          client: true,
          vehicle: true,
          order: true,
        },
      });

      // Create history entry
      await prisma.dossierStatusHistory.create({
        data: {
          dossierId: id,
          fromStatus: currentStatus,
          toStatus: status,
          changedBy: userId,
          comment: comment || `Status changed to ${status}`,
        },
      });

      // If closing dossier, update vehicle status
      if (status === 'cloture' && dossier.vehicleId) {
        await prisma.vehicle.update({
          where: { id: dossier.vehicleId },
          data: { status: 'sold' },
        });
      }

      return updated;
    });

    this.logger.log(`Dossier ${dossier.reference} status updated: ${currentStatus} -> ${status} (by ${userId})`);
    return updatedDossier;
  }

  async getHistory(id: string) {
    await this.findOne(id);

    return this.prisma.dossierStatusHistory.findMany({
      where: { dossierId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStatistics() {
    const stats = await this.prisma.$transaction([
      this.prisma.dossier.count(),
      this.prisma.dossier.count({
        where: { status: 'prospection' },
      }),
      this.prisma.dossier.count({
        where: { status: 'contrat_signe' },
      }),
      this.prisma.dossier.count({
        where: { status: 'recherche_vehicule' },
      }),
      this.prisma.dossier.count({
        where: { status: 'achat' },
      }),
      this.prisma.dossier.count({
        where: { status: 'shipping' },
      }),
      this.prisma.dossier.count({
        where: { status: 'douane' },
      }),
      this.prisma.dossier.count({
        where: { status: 'livraison' },
      }),
      this.prisma.dossier.count({
        where: { status: 'cloture' },
      }),
    ]);

    const [total, prospection, contrat_signe, recherche_vehicule, achat, shipping, douane, livraison, cloture] = stats;

    return {
      total,
      byStatus: {
        prospection,
        contrat_signe,
        recherche_vehicule,
        achat,
        shipping,
        douane,
        livraison,
        cloture,
      },
      completionRate: total > 0 ? (cloture / total) * 100 : 0,
    };
  }
}
