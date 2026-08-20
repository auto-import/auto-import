import { Injectable, NotFoundException, ConflictException, Logger, BadRequestException } from '@nestjs/common';
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

  private mapDossierWithVehicles(dossier: any) {
    if (!dossier) return null;
    const vehicles = dossier.dossierVehicles
      ? dossier.dossierVehicles.map((dv: any) => ({
          ...dv.vehicle,
          assignedAt: dv.assignedAt,
        }))
      : [];
    return {
      ...dossier,
      vehicles,
      // Backward compatibility: vehicleId points to the first attached vehicle if any
      vehicleId: vehicles.length > 0 ? vehicles[0].id : null,
      vehicle: vehicles.length > 0 ? vehicles[0] : null,
    };
  }

  async create(createDossierDto: CreateDossierDto, salesUserId: string) {
    const { clientId, type, vehicleId, vehicleIds, orderId, status } = createDossierDto;

    // Check if client exists
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${clientId} not found`);
    }

    // Collect all requested vehicle IDs (support both vehicleId and vehicleIds)
    const rawVehicleIds: string[] = [];
    if (vehicleIds && Array.isArray(vehicleIds)) {
      rawVehicleIds.push(...vehicleIds);
    }
    if (vehicleId && !rawVehicleIds.includes(vehicleId)) {
      rawVehicleIds.push(vehicleId);
    }

    const uniqueVehicleIds = [...new Set(rawVehicleIds)];

    // Validate all vehicles exist and are available
    for (const vId of uniqueVehicleIds) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: vId },
      });

      if (!vehicle) {
        throw new NotFoundException(`Vehicle with ID ${vId} not found`);
      }

      if (vehicle.status !== 'available') {
        throw new ConflictException(`Vehicle ${vehicle.brand} ${vehicle.model} (${vId}) is not available (current status: ${vehicle.status})`);
      }
    }

    // Generate reference
    const reference = await this.generateReference();
    const dossierType = type || 'VEHICLE_SALE_CIF';

    const dossier = await this.prisma.$transaction(async (prisma) => {
      // Create dossier
      const newDossier = await prisma.dossier.create({
        data: {
          reference,
          type: dossierType,
          clientId,
          vehicleRequestId: createDossierDto.vehicleRequestId,
          orderId,
          status: status || 'prospection',
          salesUserId,
          openedAt: new Date(),
          dossierVehicles: uniqueVehicleIds.length > 0 ? {
            create: uniqueVehicleIds.map((vId) => ({
              vehicleId: vId,
              assignedAt: new Date(),
            })),
          } : undefined,
        },
        include: {
          client: true,
          dossierVehicles: {
            include: {
              vehicle: {
                include: {
                  specs: true,
                  photos: true,
                },
              },
            },
          },
          order: true,
        },
      });

      // Create initial status history
      await prisma.dossierStatusHistory.create({
        data: {
          dossierId: newDossier.id,
          toStatus: newDossier.status,
          changedBy: salesUserId,
          comment: uniqueVehicleIds.length > 0 
            ? `Dossier created with ${uniqueVehicleIds.length} vehicle(s)`
            : 'Dossier created',
        },
      });

      // Reserve all assigned vehicles
      if (uniqueVehicleIds.length > 0) {
        await prisma.vehicle.updateMany({
          where: { id: { in: uniqueVehicleIds } },
          data: { status: 'reserved' },
        });
      }

      return newDossier;
    });

    this.logger.log(`Dossier created: ${reference} (${dossier.id}) with ${uniqueVehicleIds.length} vehicle(s)`);
    return this.mapDossierWithVehicles(dossier);
  }

  async addVehicle(dossierId: string, vehicleId: string, userId?: string) {
    const dossier = await this.prisma.dossier.findUnique({
      where: { id: dossierId },
      include: { dossierVehicles: true },
    });

    if (!dossier) {
      throw new NotFoundException(`Dossier with ID ${dossierId} not found`);
    }

    if (dossier.status === 'cloture' || dossier.status === 'annule') {
      throw new ConflictException(`Cannot add vehicles to a dossier in '${dossier.status}' status`);
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${vehicleId} not found`);
    }

    // Check if vehicle is already attached to this dossier
    const alreadyAttached = dossier.dossierVehicles.some((dv) => dv.vehicleId === vehicleId);
    if (alreadyAttached) {
      throw new ConflictException(`Vehicle with ID ${vehicleId} is already attached to dossier ${dossier.reference}`);
    }

    if (vehicle.status !== 'available') {
      throw new ConflictException(`Vehicle ${vehicle.brand} ${vehicle.model} (${vehicleId}) is not available (current status: ${vehicle.status})`);
    }

    await this.prisma.$transaction(async (prisma) => {
      await prisma.dossierVehicle.create({
        data: {
          dossierId,
          vehicleId,
          assignedAt: new Date(),
        },
      });

      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { status: 'reserved' },
      });

      await prisma.dossierStatusHistory.create({
        data: {
          dossierId,
          fromStatus: dossier.status,
          toStatus: dossier.status,
          changedBy: userId || 'system',
          comment: `Vehicle ${vehicle.brand} ${vehicle.model} (${vehicle.vin || vehicle.id}) added to dossier`,
        },
      });
    });

    this.logger.log(`Vehicle ${vehicleId} added to dossier ${dossier.reference}`);
    return this.findOne(dossierId);
  }

  async removeVehicle(dossierId: string, vehicleId: string, userId?: string) {
    const dossier = await this.prisma.dossier.findUnique({
      where: { id: dossierId },
      include: { dossierVehicles: true },
    });

    if (!dossier) {
      throw new NotFoundException(`Dossier with ID ${dossierId} not found`);
    }

    const link = dossier.dossierVehicles.find((dv) => dv.vehicleId === vehicleId);
    if (!link) {
      throw new NotFoundException(`Vehicle with ID ${vehicleId} is not attached to dossier ${dossier.reference}`);
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    await this.prisma.$transaction(async (prisma) => {
      await prisma.dossierVehicle.delete({
        where: {
          dossierId_vehicleId: {
            dossierId,
            vehicleId,
          },
        },
      });

      // Revert vehicle status to available if not part of active order
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { status: 'available' },
      });

      await prisma.dossierStatusHistory.create({
        data: {
          dossierId,
          fromStatus: dossier.status,
          toStatus: dossier.status,
          changedBy: userId || 'system',
          comment: `Vehicle ${vehicle ? `${vehicle.brand} ${vehicle.model}` : vehicleId} removed from dossier`,
        },
      });
    });

    this.logger.log(`Vehicle ${vehicleId} removed from dossier ${dossier.reference}`);
    return this.findOne(dossierId);
  }

  async getVehicles(dossierId: string) {
    const dossier = await this.prisma.dossier.findUnique({
      where: { id: dossierId },
      include: {
        dossierVehicles: {
          include: {
            vehicle: {
              include: {
                specs: true,
                photos: {
                  include: { file: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
          orderBy: { assignedAt: 'asc' },
        },
      },
    });

    if (!dossier) {
      throw new NotFoundException(`Dossier with ID ${dossierId} not found`);
    }

    return dossier.dossierVehicles.map((dv) => ({
      ...dv.vehicle,
      assignedAt: dv.assignedAt,
    }));
  }

  async findAll(page: number = 1, limit: number = 10, filters?: FilterDossierDto) {
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters?.type) where.type = filters.type;
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
          dossierVehicles: {
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
            orderBy: { assignedAt: 'asc' },
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
      items: dossiers.map((d) => this.mapDossierWithVehicles(d)),
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
        dossierVehicles: {
          include: {
            vehicle: {
              include: {
                specs: true,
                photos: {
                  include: { file: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
          orderBy: { assignedAt: 'asc' },
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
      totalVehicles: dossier.dossierVehicles.length,
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

    const mapped = this.mapDossierWithVehicles(dossier);
    return { ...mapped, stats };
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
          dossierVehicles: {
            include: {
              vehicle: true,
            },
          },
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

      // If closing dossier, update all attached vehicles to 'sold'
      if (status === 'cloture') {
        const vehicleIds = updated.dossierVehicles.map((dv) => dv.vehicleId);
        if (vehicleIds.length > 0) {
          await prisma.vehicle.updateMany({
            where: { id: { in: vehicleIds } },
            data: { status: 'sold' },
          });
        }
      }

      return updated;
    });

    this.logger.log(`Dossier ${dossier.reference} status updated: ${currentStatus} -> ${status} (by ${userId})`);
    return this.findOne(id);
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
      this.prisma.dossier.count({
        where: { type: 'VEHICLE_SALE_CIF' },
      }),
      this.prisma.dossier.count({
        where: { type: 'VEHICLE_SALE_DDP' },
      }),
      this.prisma.dossier.count({
        where: { type: 'SHIPPING_ONLY' },
      }),
    ]);

    const [
      total,
      prospection,
      contrat_signe,
      recherche_vehicule,
      achat,
      shipping,
      douane,
      livraison,
      cloture,
      cifCount,
      ddpCount,
      shippingOnlyCount,
    ] = stats;

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
      byType: {
        VEHICLE_SALE_CIF: cifCount,
        VEHICLE_SALE_DDP: ddpCount,
        SHIPPING_ONLY: shippingOnlyCount,
      },
      completionRate: total > 0 ? (cloture / total) * 100 : 0,
    };
  }
}

