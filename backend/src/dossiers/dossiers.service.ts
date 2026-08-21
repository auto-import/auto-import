import { Injectable, NotFoundException, ConflictException, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DossierWorkflowService } from './workflows/dossier-workflow.service';
import { CreateDossierDto } from './dto/create-dossier.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { FilterDossierDto } from './dto/filter-dossier.dto';
import { DossierType } from './dto/dossier-type.enum';

@Injectable()
export class DossiersService {
  private readonly logger = new Logger(DossiersService.name);

  constructor(
    private prisma: PrismaService,
    private workflowService: DossierWorkflowService,
  ) {}

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

  async create(createDossierDto: CreateDossierDto, salesUserId: string, organizationId: string) {
    const { clientId, type, vehicleId, vehicleIds, orderId, status } = createDossierDto;

    // Check if client exists AND belongs to same organization
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId },
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${clientId} not found in your organization`);
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

    // Validate all vehicles exist, belong to same org, and are available
    for (const vId of uniqueVehicleIds) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: vId, organizationId },
      });

      if (!vehicle) {
        throw new NotFoundException(`Vehicle with ID ${vId} not found in your organization`);
      }

      if (vehicle.status !== 'available') {
        throw new ConflictException(`Vehicle ${vehicle.brand} ${vehicle.model} (${vId}) is not available (current status: ${vehicle.status})`);
      }
    }

    // Validate orderId belongs to same org if provided
    if (orderId) {
      const order = await this.prisma.order.findFirst({
        where: { id: orderId, organizationId },
      });
      if (!order) {
        throw new NotFoundException(`Order with ID ${orderId} not found in your organization`);
      }
    }

    // Validate vehicleRequestId belongs to same org if provided
    if (createDossierDto.vehicleRequestId) {
      const vehicleRequest = await this.prisma.vehicleRequest.findFirst({
        where: { id: createDossierDto.vehicleRequestId, organizationId },
      });
      if (!vehicleRequest) {
        throw new NotFoundException(`Vehicle request with ID ${createDossierDto.vehicleRequestId} not found in your organization`);
      }
    }

    // Generate reference
    const reference = await this.generateReference();
    const dossierType = (type || DossierType.VEHICLE_SALE_CIF) as DossierType;
    const initialStatus = status || this.workflowService.getInitialStatus(dossierType);

    const dossier = await this.prisma.$transaction(async (prisma) => {
      // Create dossier
      const newDossier = await prisma.dossier.create({
        data: {
          reference,
          type: dossierType,
          organizationId,
          clientId,
          vehicleRequestId: createDossierDto.vehicleRequestId,
          orderId,
          status: initialStatus,
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

    this.logger.log(`Dossier created: ${reference} (${dossier.id}) [${dossierType}] with ${uniqueVehicleIds.length} vehicle(s)`);
    return this.mapDossierWithVehicles(dossier);
  }

  async addVehicle(dossierId: string, vehicleId: string, organizationId: string, userId?: string) {
    const dossier = await this.prisma.dossier.findFirst({
      where: { id: dossierId, organizationId },
      include: { dossierVehicles: true },
    });

    if (!dossier) {
      throw new NotFoundException(`Dossier with ID ${dossierId} not found`);
    }

    if (this.workflowService.isTerminalStatus(dossier.status)) {
      throw new ConflictException(`Cannot add vehicles to a dossier in terminal status '${dossier.status}'`);
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${vehicleId} not found in your organization`);
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
    return this.findOne(dossierId, organizationId);
  }

  async removeVehicle(dossierId: string, vehicleId: string, organizationId: string, userId?: string) {
    const dossier = await this.prisma.dossier.findFirst({
      where: { id: dossierId, organizationId },
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
    return this.findOne(dossierId, organizationId);
  }

  async getVehicles(dossierId: string, organizationId: string) {
    const dossier = await this.prisma.dossier.findFirst({
      where: { id: dossierId, organizationId },
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

  async findAll(organizationId: string, page: number = 1, limit: number = 10, filters?: FilterDossierDto) {
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

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

  async findOne(id: string, organizationId?: string) {
    const dossier = await this.prisma.dossier.findFirst({
      where: { id, ...(organizationId && { organizationId }) },
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

  async updateStatus(id: string, updateStatusDto: UpdateStatusDto, userId: string, organizationId?: string) {
    const dossier = await this.findOne(id, organizationId);
    const { status, comment } = updateStatusDto;

    const currentStatus = dossier.status;

    // Validate transition through workflow state machine
    this.workflowService.validateTransition(
      dossier.type as DossierType,
      currentStatus,
      status,
    );

    const isClosing = status === 'cloture' || status === 'service_termine' || status === 'annule';

    const updatedDossier = await this.prisma.$transaction(async (prisma) => {
      // Update dossier status
      const updated = await prisma.dossier.update({
        where: { id },
        data: {
          status,
          closedAt: isClosing ? new Date() : undefined,
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
          changedBy: userId || 'system',
          comment: comment || `Status changed from '${currentStatus}' to '${status}'`,
        },
      });

      // If closing dossier successfully, update attached vehicles to 'sold'
      if (status === 'cloture' || status === 'service_termine') {
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
    return this.findOne(id, organizationId);
  }

  async advanceStatus(id: string, comment?: string, userId?: string, organizationId?: string) {
    const dossier = await this.findOne(id, organizationId);
    const nextStatus = this.workflowService.getNextStatus(
      dossier.type as DossierType,
      dossier.status,
    );

    if (!nextStatus) {
      throw new ConflictException(
        `Dossier ${dossier.reference} is in status '${dossier.status}' and has reached its final workflow step.`,
      );
    }

    return this.updateStatus(
      id,
      {
        status: nextStatus,
        comment: comment || `Workflow advanced to '${nextStatus}'`,
      },
      userId || 'system',
      organizationId,
    );
  }

  async getAllowedTransitions(id: string, organizationId?: string) {
    const dossier = await this.findOne(id, organizationId);
    const allowed = this.workflowService.getAllowedTransitions(
      dossier.type as DossierType,
      dossier.status,
    );

    return {
      dossierId: dossier.id,
      reference: dossier.reference,
      type: dossier.type,
      currentStatus: dossier.status,
      isTerminal: this.workflowService.isTerminalStatus(dossier.status),
      allowedTransitions: allowed,
    };
  }

  async getHistory(id: string, organizationId?: string) {
    await this.findOne(id, organizationId);

    return this.prisma.dossierStatusHistory.findMany({
      where: { dossierId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStatistics(organizationId: string) {
    const stats = await this.prisma.$transaction([
      this.prisma.dossier.count({ where: { organizationId } }),
      this.prisma.dossier.count({
        where: { organizationId, status: 'prospection' },
      }),
      this.prisma.dossier.count({
        where: { organizationId, status: 'contrat_signe' },
      }),
      this.prisma.dossier.count({
        where: { organizationId, status: 'recherche_vehicule' },
      }),
      this.prisma.dossier.count({
        where: { organizationId, status: 'achat' },
      }),
      this.prisma.dossier.count({
        where: { organizationId, status: 'shipping' },
      }),
      this.prisma.dossier.count({
        where: { organizationId, status: 'douane' },
      }),
      this.prisma.dossier.count({
        where: { organizationId, status: 'livraison' },
      }),
      this.prisma.dossier.count({
        where: { organizationId, status: 'cloture' },
      }),
      this.prisma.dossier.count({
        where: { organizationId, type: 'VEHICLE_SALE_CIF' },
      }),
      this.prisma.dossier.count({
        where: { organizationId, type: 'VEHICLE_SALE_DDP' },
      }),
      this.prisma.dossier.count({
        where: { organizationId, type: 'SHIPPING_ONLY' },
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

