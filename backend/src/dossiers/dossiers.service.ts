import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DossierWorkflowService } from './workflows/dossier-workflow.service';
import { CreateDossierDto } from './dto/create-dossier.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { FilterDossierDto } from './dto/filter-dossier.dto';
import { DossierType } from './dto/dossier-type.enum';
import { paginate } from '../common/helpers/pagination.helper';
import { DossierStatus } from '@auto-import/contracts';
import { Prisma } from '@prisma/client';
import { UpdateDossierDto } from './dto/update-dossier.dto';
import { DocumentsService } from '../documents/documents.service';
import { ConfigurationService } from '../configuration/configuration.service';

@Injectable()
export class DossiersService {
  private readonly logger = new Logger(DossiersService.name);

  constructor(
    private prisma: PrismaService,
    private workflowService: DossierWorkflowService,
    private documentsService: DocumentsService,
    @Optional() private configurationService?: ConfigurationService,
  ) {}

  private async generateReference(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string> {
    const year = new Date().getUTCFullYear();
    const sequence = await tx.commerceSequence.upsert({
      where: { organizationId_key: { organizationId, key: `dossier:${year}` } },
      create: { organizationId, key: `dossier:${year}`, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `CA-${year}-${String(sequence.value).padStart(5, '0')}`;
  }

  private mapDossierWithVehicles<
    T extends {
      dossierVehicles: Array<{
        vehicle: { id: string };
        assignedAt: Date;
      }>;
    },
  >(dossier: T) {
    const vehicles = dossier.dossierVehicles.map((link) => ({
      ...link.vehicle,
      assignedAt: link.assignedAt,
    }));
    return {
      ...dossier,
      vehicles,
      // Backward compatibility: vehicleId points to the first attached vehicle if any
      vehicleId: vehicles.length > 0 ? vehicles[0].id : null,
      vehicle: vehicles.length > 0 ? vehicles[0] : null,
    };
  }

  async create(
    createDossierDto: CreateDossierDto,
    salesUserId: string,
    organizationId: string,
  ) {
    const {
      clientId,
      type,
      vehicleId,
      vehicleIds,
      orderId,
      offerReservationId,
      opsUserId,
    } = createDossierDto;

    // Check if client exists AND belongs to same organization
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId },
    });

    if (!client) {
      throw new NotFoundException(
        `Client with ID ${clientId} not found in your organization`,
      );
    }

    const salesUserIdToUse = createDossierDto.salesUserId ?? salesUserId;
    const teamIds = [
      ...new Set([salesUserIdToUse, opsUserId].filter(Boolean)),
    ] as string[];
    const teamCount = await this.prisma.user.count({
      where: { id: { in: teamIds }, organizationId, status: 'active' },
    });
    if (teamCount !== teamIds.length) {
      throw new NotFoundException(
        'One or more dossier team members are invalid',
      );
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
        throw new NotFoundException(
          `Vehicle with ID ${vId} not found in your organization`,
        );
      }

      if (vehicle.status !== 'available') {
        throw new ConflictException(
          `Vehicle ${vehicle.brand} ${vehicle.model} (${vId}) is not available (current status: ${vehicle.status})`,
        );
      }
    }

    // Validate orderId belongs to same org if provided
    if (orderId) {
      const order = await this.prisma.order.findFirst({
        where: { id: orderId, organizationId },
      });
      if (!order) {
        throw new NotFoundException(
          `Order with ID ${orderId} not found in your organization`,
        );
      }
      if (order.clientId !== clientId) {
        throw new ConflictException('Order and dossier client must match');
      }
    }

    // Validate vehicleRequestId belongs to same org if provided
    if (createDossierDto.vehicleRequestId) {
      const vehicleRequest = await this.prisma.vehicleRequest.findFirst({
        where: { id: createDossierDto.vehicleRequestId, organizationId },
      });
      if (!vehicleRequest) {
        throw new NotFoundException(
          `Vehicle request with ID ${createDossierDto.vehicleRequestId} not found in your organization`,
        );
      }
      if (vehicleRequest.clientId && vehicleRequest.clientId !== clientId) {
        throw new ConflictException(
          'Vehicle request and dossier client must match',
        );
      }
    }

    const dossierType = type || DossierType.VEHICLE_SALE_CIF;
    const initialStatus = this.workflowService.getInitialStatus(dossierType);

    if (offerReservationId) {
      if (dossierType === DossierType.SHIPPING_ONLY) {
        throw new ConflictException(
          'Shipping-only dossiers cannot consume a China offer',
        );
      }
      const reservation = await this.prisma.offerReservation.findFirst({
        where: {
          id: offerReservationId,
          organizationId,
          clientId,
          status: 'active',
          dossierId: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        include: { offer: true },
      });
      if (!reservation || reservation.offer.validUntil < new Date()) {
        throw new ConflictException('Offer reservation is invalid or expired');
      }
    }

    const dossier = await this.prisma.$transaction(async (prisma) => {
      const reference = await this.generateReference(prisma, organizationId);
      if (uniqueVehicleIds.length > 0) {
        const reserved = await prisma.vehicle.updateMany({
          where: {
            id: { in: uniqueVehicleIds },
            organizationId,
            status: 'available',
          },
          data: { status: 'reserved' },
        });
        if (reserved.count !== uniqueVehicleIds.length) {
          throw new ConflictException(
            'One or more vehicles are no longer available',
          );
        }
      }
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
          workflowVersion: 2,
          salesUserId: salesUserIdToUse,
          opsUserId,
          openedAt: new Date(),
          dossierVehicles:
            uniqueVehicleIds.length > 0
              ? {
                  create: uniqueVehicleIds.map((vId) => ({
                    vehicleId: vId,
                    assignedAt: new Date(),
                  })),
                }
              : undefined,
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
          offerReservation: {
            include: { offer: { include: { supplier: true } } },
          },
        },
      });

      // Create initial status history
      await prisma.dossierStatusHistory.create({
        data: {
          dossierId: newDossier.id,
          toStatus: newDossier.status,
          changedBy: salesUserIdToUse,
          comment:
            uniqueVehicleIds.length > 0
              ? `Dossier created with ${uniqueVehicleIds.length} vehicle(s)`
              : 'Dossier created',
        },
      });

      if (offerReservationId) {
        const linked = await prisma.offerReservation.updateMany({
          where: {
            id: offerReservationId,
            organizationId,
            clientId,
            status: 'active',
            dossierId: null,
          },
          data: { dossierId: newDossier.id },
        });
        if (linked.count !== 1) {
          throw new ConflictException(
            'Offer reservation was linked concurrently',
          );
        }
      }

      return newDossier;
    });

    this.logger.log(
      `Dossier created: ${dossier.reference} (${dossier.id}) [${dossierType}] with ${uniqueVehicleIds.length} vehicle(s)`,
    );
    return this.mapDossierWithVehicles(dossier);
  }

  async addVehicle(
    dossierId: string,
    vehicleId: string,
    organizationId: string,
    userId?: string,
  ) {
    const dossier = await this.prisma.dossier.findFirst({
      where: { id: dossierId, organizationId },
      include: { dossierVehicles: true },
    });

    if (!dossier) {
      throw new NotFoundException(
        `Dossier with ID ${dossierId} not found in your organization`,
      );
    }

    if (this.workflowService.isTerminalStatus(dossier.status)) {
      throw new ConflictException(
        `Cannot add vehicles to a dossier in terminal status '${dossier.status}'`,
      );
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
    });

    if (!vehicle) {
      throw new NotFoundException(
        `Vehicle with ID ${vehicleId} not found in your organization`,
      );
    }

    // Check if vehicle is already attached to this dossier
    const alreadyAttached = dossier.dossierVehicles.some(
      (dv) => dv.vehicleId === vehicleId,
    );
    if (alreadyAttached) {
      throw new ConflictException(
        `Vehicle with ID ${vehicleId} is already attached to dossier ${dossier.reference}`,
      );
    }

    // Check if vehicle is already attached to another active dossier
    const conflictingActiveDossier = await this.prisma.dossierVehicle.findFirst(
      {
        where: {
          vehicleId,
          dossier: {
            id: { not: dossierId },
            status: { notIn: ['closed', 'serviceCompleted', 'cancelled'] },
          },
        },
      },
    );
    if (conflictingActiveDossier) {
      throw new ConflictException(
        `Vehicle ${vehicleId} is already attached to another active dossier`,
      );
    }

    if (vehicle.status !== 'available') {
      throw new ConflictException(
        `Vehicle ${vehicle.brand} ${vehicle.model} (${vehicleId}) is not available (current status: ${vehicle.status})`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Concurrency-safe atomic reservation
      const reservation = await tx.vehicle.updateMany({
        where: {
          id: vehicleId,
          organizationId,
          status: 'available',
        },
        data: { status: 'reserved' },
      });

      if (reservation.count === 0) {
        throw new ConflictException(
          `Vehicle ${vehicle.brand} ${vehicle.model} (${vehicleId}) is no longer available for reservation`,
        );
      }

      await tx.dossierVehicle.create({
        data: {
          dossierId,
          vehicleId,
          assignedAt: new Date(),
        },
      });

      await tx.dossierStatusHistory.create({
        data: {
          dossierId,
          fromStatus: dossier.status,
          toStatus: dossier.status,
          changedBy: userId || 'system',
          comment: `Vehicle ${vehicle.brand} ${vehicle.model} (${vehicle.vin || vehicle.id}) added to dossier`,
        },
      });
    });

    this.logger.log(
      `Vehicle ${vehicleId} added to dossier ${dossier.reference}`,
    );
    return this.findOne(dossierId, organizationId);
  }

  async removeVehicle(
    dossierId: string,
    vehicleId: string,
    organizationId: string,
    userId?: string,
  ) {
    const dossier = await this.prisma.dossier.findFirst({
      where: { id: dossierId, organizationId },
      include: { dossierVehicles: true },
    });

    if (!dossier) {
      throw new NotFoundException(
        `Dossier with ID ${dossierId} not found in your organization`,
      );
    }

    const link = dossier.dossierVehicles.find(
      (dv) => dv.vehicleId === vehicleId,
    );
    if (!link) {
      throw new NotFoundException(
        `Vehicle with ID ${vehicleId} is not attached to dossier ${dossier.reference}`,
      );
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (
      vehicle?.status === 'inTransit' ||
      vehicle?.status === 'inCustoms' ||
      vehicle?.status === 'sold'
    ) {
      throw new ConflictException(
        `Cannot remove vehicle in status '${vehicle.status}' from dossier`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.dossierVehicle.delete({
        where: {
          dossierId_vehicleId: {
            dossierId,
            vehicleId,
          },
        },
      });

      // Revert vehicle status to available if reserved
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { status: 'available' },
      });

      await tx.dossierStatusHistory.create({
        data: {
          dossierId,
          fromStatus: dossier.status,
          toStatus: dossier.status,
          changedBy: userId || 'system',
          comment: `Vehicle ${vehicle ? `${vehicle.brand} ${vehicle.model}` : vehicleId} removed from dossier`,
        },
      });
    });

    this.logger.log(
      `Vehicle ${vehicleId} removed from dossier ${dossier.reference}`,
    );
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

  async findAll(
    organizationId: string,
    page: number = 1,
    limit: number = 20,
    filters?: FilterDossierDto,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.DossierWhereInput = { organizationId };

    if (filters?.type) where.type = filters.type;
    if (filters?.status) where.status = filters.status;
    if (filters?.salesUserId) where.salesUserId = filters.salesUserId;
    if (filters?.opsUserId) where.opsUserId = filters.opsUserId;
    if (filters?.reference)
      where.reference = { contains: filters.reference, mode: 'insensitive' };

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

    return paginate(
      dossiers.map((d) => this.mapDossierWithVehicles(d)),
      total,
      page,
      limit,
    );
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
        offerReservation: {
          include: { offer: { include: { supplier: true } } },
        },
        forwarderSupplier: true,
        purchases: {
          include: {
            supplier: true,
            vehicle: { include: { specs: true } },
            payments: true,
          },
        },
        invoices: {
          include: { items: true, allocations: true },
        },
        paymentPlans: {
          include: { installments: true },
        },
        payments: {
          where: { status: 'CONFIRMED' },
        },
        customerDeposits: true,
        documents: {
          include: { file: true },
        },
        customsFiles: {
          include: { shipment: true, brokerPartner: true },
        },
        history: {
          orderBy: { createdAt: 'desc' },
        },
        tasks: {
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
          include: {
            assignee: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });

    if (!dossier) {
      throw new NotFoundException(`Dossier with ID ${id} not found`);
    }

    // Calculate additional stats
    const totalPayments = (dossier.payments || []).reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const totalInvoiceAmount = (dossier.invoices || []).reduce(
      (sum, inv) => sum + Number(inv.total),
      0,
    );

    const stats = {
      totalVehicles: dossier.dossierVehicles
        ? dossier.dossierVehicles.length
        : 0,
      totalPayments,
      totalInvoiceAmount,
      isFullyPaid:
        totalInvoiceAmount > 0 && totalPayments >= totalInvoiceAmount,
    };

    const mapped = this.mapDossierWithVehicles(dossier);
    const pricing = this.configurationService
      ? await this.configurationService.refreshDossierPricing(
          id,
          dossier.organizationId,
        )
      : {
          available: Boolean(dossier.cifPrice && dossier.ddpPrice),
          locked: Boolean(dossier.priceLockedAt),
          cifPrice: dossier.cifPrice ? Number(dossier.cifPrice) : undefined,
          ddpPrice: dossier.ddpPrice ? Number(dossier.ddpPrice) : undefined,
          currency: dossier.priceCurrency,
          missing: [],
        };
    return {
      ...mapped,
      stats,
      pricing,
      sections: {
        finance: {
          invoices: dossier.invoices || [],
          paymentPlan:
            (dossier.paymentPlans && dossier.paymentPlans[0]) || null,
          payments: dossier.payments || [],
          deposits: dossier.customerDeposits || [],
        },
        shipping:
          (dossier.customsFiles && dossier.customsFiles[0]?.shipment) || null,
        customs: dossier.customsFiles || [],
        documents: dossier.documents || [],
        proofs: (dossier.documents || []).filter(
          (d) => d.kind === 'PROOF' || d.kind === 'PAYMENT_RECEIPT',
        ),
        tasks: dossier.tasks || [],
      },
    };
  }

  async updateStatus(
    id: string,
    updateStatusDto: UpdateStatusDto,
    userId: string,
    organizationId?: string,
  ) {
    const dossier = await this.findOne(id, organizationId);
    const { status, comment } = updateStatusDto;

    const currentStatus = dossier.status;

    // Validate transition through workflow state machine
    this.workflowService.validateTransition(
      dossier.type,
      currentStatus,
      status,
      dossier.workflowVersion ?? 1,
    );

    if (
      status === DossierStatus.CUSTOMS_CLEARANCE ||
      status === DossierStatus.CUSTOMS_RELEASED
    ) {
      throw new ConflictException({
        code: 'CUSTOMS_IS_SOURCE_OF_TRUTH',
        message:
          'Dédouanement et Mainlevée sont pilotés depuis le dossier douane associé.',
      });
    }

    if (status === DossierStatus.DEPOSIT_RECEIVED && !updateStatusDto.deposit) {
      throw new BadRequestException({
        code: 'DEPOSIT_DATA_REQUIRED',
        message: 'Montant, devise, moyen et date de réception sont requis.',
      });
    }
    if (
      status === DossierStatus.VEHICLE_BOOKING &&
      !updateStatusDto.vehicleBooking
    ) {
      throw new BadRequestException({
        code: 'VEHICLE_BOOKING_DATA_REQUIRED',
        message: 'Le véhicule/VIN et la date de réservation sont requis.',
      });
    }
    if (status === DossierStatus.PURCHASE_CONFIRMED && !updateStatusDto.purchase) {
      throw new BadRequestException({
        code: 'PURCHASE_DATA_REQUIRED',
        message: 'Les données de facturation fournisseur sont requises.',
      });
    }
    if (
      status === DossierStatus.INSPECTION &&
      (!updateStatusDto.inspection ||
        (!updateStatusDto.inspection.documentId && !updateStatusDto.inspection.url))
    ) {
      throw new BadRequestException({
        code: 'INSPECTION_REPORT_REQUIRED',
        message: "Un rapport d'inspection PDF ou un lien URL est requis.",
      });
    }
    if (
      status === DossierStatus.SHIPMENT_BOOKING &&
      !updateStatusDto.shipmentBooking
    ) {
      throw new BadRequestException({
        code: 'FORWARDER_REQUIRED',
        message: 'Un transitaire doit être affecté.',
      });
    }
    if (
      status === DossierStatus.BILL_OF_LADING_ISSUED &&
      !updateStatusDto.billOfLading
    ) {
      throw new BadRequestException({
        code: 'BL_PDF_REQUIRED',
        message: 'Le PDF du connaissement est requis.',
      });
    }

    const dossierVehicles = dossier.vehicles ?? [];
    const bookedVehicle = updateStatusDto.vehicleBooking
      ? dossierVehicles.find(
          (vehicle: { id: string }) =>
            vehicle.id === updateStatusDto.vehicleBooking?.vehicleId,
        )
      : undefined;
    if (updateStatusDto.vehicleBooking && !bookedVehicle) {
      throw new BadRequestException('Vehicle is not attached to this dossier');
    }
    const purchaseVehicle =
      dossierVehicles.find(
        (vehicle: { id: string }) =>
          vehicle.id === dossier.vehicleBookingVehicleId,
      ) ?? dossierVehicles[0];
    if (updateStatusDto.purchase && !purchaseVehicle) {
      throw new BadRequestException('A dossier vehicle is required');
    }
    if (updateStatusDto.purchase) {
      const supplier = await this.prisma.partner.findFirst({
        where: {
          id: updateStatusDto.purchase.supplierId,
          organizationId: dossier.organizationId,
          type: 'supplier',
          status: 'active',
        },
      });
      if (!supplier) throw new BadRequestException('Vehicle supplier not found');
    }
    if (updateStatusDto.shipmentBooking) {
      const forwarder = await this.prisma.partner.findFirst({
        where: {
          id: updateStatusDto.shipmentBooking.forwarderSupplierId,
          organizationId: dossier.organizationId,
          type: { in: ['supplier', 'carrier', 'logistics'] },
          status: 'active',
        },
      });
      if (!forwarder) throw new BadRequestException('Forwarder not found');
    }
    const stepDocumentId =
      updateStatusDto.inspection?.documentId ??
      updateStatusDto.billOfLading?.documentId;
    if (stepDocumentId) {
      const document = await this.prisma.dossierDocumentAsset.findFirst({
        where: {
          id: stepDocumentId,
          dossierId: id,
          organizationId: dossier.organizationId,
          status: 'valid',
        },
        include: { file: true },
      });
      if (!document?.file || document.file.mimeType !== 'application/pdf') {
        throw new BadRequestException('A readable PDF document is required');
      }
    }
    const shipmentLink = updateStatusDto.billOfLading
      ? await this.prisma.shipmentVehicle.findFirst({
          where: {
            vehicle: { dossierVehicles: { some: { dossierId: id } } },
            shipment: { organizationId: dossier.organizationId },
          },
          orderBy: { addedAt: 'desc' },
        })
      : null;

    if (status === DossierStatus.CONTRACT_SIGNED) {
      const contract = await this.documentsService.verifySignedContract(
        id,
        dossier.organizationId,
      );
      if (!contract) {
        throw new ConflictException({
          code: 'DOSSIER_SIGNED_CONTRACT_REQUIRED',
          message: 'A readable signed contract is required for this transition',
        });
      }
    }

    const checkpointByStatus: Partial<Record<string, string>> = {
      [DossierStatus.ARRIVED_AT_PORT]: 'ARRIVAL_AT_PORT',
      [DossierStatus.CUSTOMS_CLEARANCE]: 'CUSTOMS',
      [DossierStatus.PORT_EXIT]: 'PORT_EXIT',
      [DossierStatus.LOCAL_TRANSPORT]: 'LOCAL_TRANSPORT',
    };
    const checkpoint = checkpointByStatus[status];
    let reliedEvidenceIds: string[] = [];
    if (checkpoint) {
      const evidence = await this.documentsService.verifyCheckpoint(
        id,
        dossier.organizationId,
        checkpoint,
      );
      if (!evidence.complete) {
        throw new ConflictException({
          code: 'DOSSIER_CHECKPOINT_EVIDENCE_REQUIRED',
          checkpoint,
          missingVehicleIds: evidence.missingVehicleIds,
          message:
            'A readable checkpoint photo is required for every dossier vehicle',
        });
      }
      reliedEvidenceIds = evidence.evidenceIds;
    }

    // Enforce Phase 2 Payment Gates
    if (
      status === DossierStatus.PURCHASE_CONFIRMED ||
      status === DossierStatus.SUPPLIER_PAID
    ) {
      const plan = await this.prisma.paymentPlan.findFirst({
        where: {
          dossierId: id,
          organizationId: dossier.organizationId,
          status: 'active',
        },
        include: {
          installments: { orderBy: { installmentNumber: 'asc' } },
        },
      });
      if (plan && plan.installments.length > 0) {
        const firstInst = plan.installments[0];
        const totalPaid = firstInst.paidAmount;
        if (totalPaid.lessThan(firstInst.amount)) {
          throw new BadRequestException(
            `Payment Gate Failed: Upfront deposit of ${firstInst.amount.toString()} ${plan.currency} must be confirmed before advancing to ${status}. Currently confirmed: ${totalPaid.toString()}`,
          );
        }
      }
    }

    if (
      status === DossierStatus.DOCUMENTS_DELIVERED ||
      status === DossierStatus.DELIVERED_TO_CLIENT ||
      status === DossierStatus.CLIENT_REGISTERED
    ) {
      const plan = await this.prisma.paymentPlan.findFirst({
        where: {
          dossierId: id,
          organizationId: dossier.organizationId,
          status: 'active',
        },
      });
      if (plan) {
        const installments = await this.prisma.paymentInstallment.findMany({
          where: { paymentPlanId: plan.id, status: { not: 'CANCELLED' } },
          select: { paidAmount: true },
        });
        const totalPaid = installments.reduce(
          (sum, installment) => sum.add(installment.paidAmount),
          new Prisma.Decimal(0),
        );
        if (totalPaid.lessThan(plan.totalAmount)) {
          throw new BadRequestException(
            `Payment Gate Failed: Full 100% balance of ${plan.totalAmount.toString()} ${plan.currency} must be confirmed before final delivery/documents release. Currently confirmed: ${totalPaid.toString()}`,
          );
        }
      }
    }

    const isClosing =
      status === DossierStatus.CLOSED ||
      status === DossierStatus.SERVICE_COMPLETED ||
      status === DossierStatus.CANCELLED;

    await this.prisma.$transaction(async (prisma) => {
      if (updateStatusDto.deposit) {
        const payment = await prisma.payment.create({
          data: {
            organizationId: dossier.organizationId,
            clientId: dossier.clientId,
            dossierId: id,
            amount: new Prisma.Decimal(updateStatusDto.deposit.amount),
            allocatedAmount: new Prisma.Decimal(0),
            unallocatedAmount: new Prisma.Decimal(updateStatusDto.deposit.amount),
            currency: updateStatusDto.deposit.currency,
            paymentMethod: updateStatusDto.deposit.paymentMethod,
            reference: updateStatusDto.deposit.reference,
            status: 'CONFIRMED',
            paymentDate: new Date(updateStatusDto.deposit.receivedAt),
            receivedAt: new Date(updateStatusDto.deposit.receivedAt),
            confirmedAt: new Date(),
            actorUserId: userId,
            notes: updateStatusDto.deposit.note,
          },
        });
        await prisma.customerDeposit.create({
          data: {
            organizationId: dossier.organizationId,
            clientId: dossier.clientId,
            dossierId: id,
            paymentId: payment.id,
            amount: payment.amount,
            unappliedAmount: payment.amount,
            currency: payment.currency,
            paymentMethod: payment.paymentMethod,
            reference: payment.reference,
            paymentDate: payment.paymentDate,
            notes: payment.notes,
          },
        });
      }
      if (updateStatusDto.purchase && purchaseVehicle) {
        await prisma.purchase.create({
          data: {
            organizationId: dossier.organizationId,
            purchaseNumber: updateStatusDto.purchase.invoiceNumber,
            supplierId: updateStatusDto.purchase.supplierId,
            vehicleId: purchaseVehicle.id,
            dossierId: id,
            purchasePrice: new Prisma.Decimal(updateStatusDto.purchase.amount),
            currency: updateStatusDto.purchase.currency,
            purchaseDate: new Date(updateStatusDto.purchase.invoiceDate),
            status: 'confirmed',
            confirmedBy: userId,
          },
        });
        await prisma.vehicle.update({
          where: { id: purchaseVehicle.id },
          data: {
            purchasePrice: new Prisma.Decimal(updateStatusDto.purchase.amount),
            currency: updateStatusDto.purchase.currency,
          },
        });
      }
      if (updateStatusDto.inspection?.url) {
        await prisma.dossierDocumentAsset.create({
          data: {
            organizationId: dossier.organizationId,
            dossierId: id,
            kind: 'DOSSIER_DOCUMENT',
            documentType: 'rapport_inspection',
            title: "Rapport d'inspection",
            description: updateStatusDto.inspection.note,
            externalUrl: updateStatusDto.inspection.url,
            uploadedBy: userId,
          },
        });
      }
      if (updateStatusDto.inspection?.documentId) {
        await prisma.dossierDocumentAsset.update({
          where: { id: updateStatusDto.inspection.documentId },
          data: {
            kind: 'DOSSIER_DOCUMENT',
            documentType: 'rapport_inspection',
            title: "Rapport d'inspection",
          },
        });
      }
      if (updateStatusDto.billOfLading?.documentId) {
        await prisma.dossierDocumentAsset.update({
          where: { id: updateStatusDto.billOfLading.documentId },
          data: {
            kind: 'DOSSIER_DOCUMENT',
            documentType: 'bl_final',
            title: 'Bill of Lading',
            shipmentId: shipmentLink?.shipmentId,
          },
        });
      }
      // Update dossier status
      const updated = await prisma.dossier.update({
        where: { id },
        data: {
          status,
          closedAt: isClosing ? new Date() : undefined,
          priceLockedAt:
            status === DossierStatus.CONTRACT_SIGNED && !dossier.priceLockedAt
              ? new Date()
              : undefined,
          vehicleBookingVehicleId: updateStatusDto.vehicleBooking?.vehicleId,
          vehicleBookingDate: updateStatusDto.vehicleBooking
            ? new Date(updateStatusDto.vehicleBooking.bookingDate)
            : undefined,
          vehicleBookingNote: updateStatusDto.vehicleBooking?.note,
          forwarderSupplierId:
            updateStatusDto.shipmentBooking?.forwarderSupplierId,
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
      const history = await prisma.dossierStatusHistory.create({
        data: {
          dossierId: id,
          fromStatus: currentStatus,
          toStatus: status,
          changedBy: userId || 'system',
          comment: this.transitionHistoryComment(updateStatusDto, currentStatus),
        },
      });

      const recipients = [updated.salesUserId, updated.opsUserId].filter(
        (recipient, index, values): recipient is string =>
          Boolean(recipient) && values.indexOf(recipient) === index,
      );
      if (recipients.length > 0) {
        await prisma.notification.createMany({
          data: recipients.map((recipient) => ({
            organizationId: updated.organizationId,
            userId: recipient,
            type: 'DOSSIER_STATUS_CHANGED',
            category: 'workflow',
            severity: 'info',
            title: `Dossier ${updated.reference} mis à jour`,
            content: `${currentStatus} → ${status}`,
            relatedType: 'dossier',
            relatedId: id,
            entityUrl: `/dossiers/${id}`,
            dedupeKey: `dossier-status:${history.id}:${recipient}`,
          })),
          skipDuplicates: true,
        });
      }

      if (status === DossierStatus.CANCELLED) {
        const vehicleIds = updated.dossierVehicles.map((dv) => dv.vehicleId);
        if (vehicleIds.length > 0) {
          await prisma.vehicle.updateMany({
            where: {
              id: { in: vehicleIds },
              organizationId: updated.organizationId,
              status: 'reserved',
            },
            data: { status: 'available' },
          });
        }
        if (updated.orderId) {
          await prisma.reservation.updateMany({
            where: {
              orderId: updated.orderId,
              organizationId: updated.organizationId,
              status: 'active',
            },
            data: {
              status: 'released',
              releasedAt: new Date(),
              releaseReason: 'dossierCancelled',
            },
          });
        }
        const offerReservation = await prisma.offerReservation.findFirst({
          where: {
            dossierId: id,
            organizationId: updated.organizationId,
            status: 'active',
          },
        });
        if (offerReservation) {
          await prisma.offerReservation.update({
            where: { id: offerReservation.id },
            data: {
              status: 'released',
              releasedAt: new Date(),
              releaseReason: 'dossierCancelled',
            },
          });
          await prisma.chinaOffer.update({
            where: { id: offerReservation.offerId },
            data: {
              reservedQuantity: { decrement: offerReservation.quantity },
            },
          });
        }
      }

      // Only a completed vehicle-sale dossier can mark its vehicles sold.
      if (
        status === DossierStatus.CLOSED &&
        updated.type !== DossierType.SHIPPING_ONLY
      ) {
        const vehicleIds = updated.dossierVehicles.map((dv) => dv.vehicleId);
        if (vehicleIds.length > 0) {
          await prisma.vehicle.updateMany({
            where: { id: { in: vehicleIds } },
            data: { status: 'sold' },
          });
        }
        const offerReservation = await prisma.offerReservation.findFirst({
          where: {
            dossierId: id,
            organizationId: updated.organizationId,
            status: 'active',
          },
        });
        if (offerReservation) {
          await prisma.offerReservation.update({
            where: { id: offerReservation.id },
            data: { status: 'consumed' },
          });
          await prisma.chinaOffer.update({
            where: { id: offerReservation.offerId },
            data: {
              reservedQuantity: { decrement: offerReservation.quantity },
              availableQuantity: { decrement: offerReservation.quantity },
            },
          });
        }
      }

      return updated;
    });

    await this.documentsService.markEvidenceRelied(reliedEvidenceIds);
    if (this.configurationService) {
      await this.configurationService.refreshDossierPricing(
        id,
        dossier.organizationId,
      );
    }

    this.logger.log(
      `Dossier ${dossier.reference} status updated: ${currentStatus} -> ${status} (by ${userId})`,
    );
    return this.findOne(id, organizationId);
  }

  async update(
    id: string,
    dto: UpdateDossierDto,
    userId: string,
    organizationId: string,
  ) {
    const dossier = await this.prisma.dossier.findFirst({
      where: { id, organizationId },
    });
    if (!dossier) throw new NotFoundException('Dossier not found');
    if (
      dto.dutyOverrideAmount !== undefined &&
      !dto.dutyOverrideJustification?.trim()
    ) {
      throw new BadRequestException(
        'A justification is required for a customs duty override',
      );
    }
    const ids = [
      ...new Set([dto.salesUserId, dto.opsUserId].filter(Boolean)),
    ] as string[];
    if (ids.length) {
      const valid = await this.prisma.user.count({
        where: { id: { in: ids }, organizationId, status: 'active' },
      });
      if (valid !== ids.length)
        throw new NotFoundException('Dossier team member not found');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dossier.update({
        where: { id },
        data: {
          ...dto,
          dutyOverrideAmount:
            dto.dutyOverrideAmount === undefined
              ? undefined
              : new Prisma.Decimal(dto.dutyOverrideAmount),
        },
      });
      await tx.dossierStatusHistory.create({
        data: {
          dossierId: id,
          fromStatus: dossier.status,
          toStatus: dossier.status,
          changedBy: userId,
          comment:
            dto.dutyOverrideAmount !== undefined
              ? `Customs duty override: ${dto.dutyOverrideAmount} — ${dto.dutyOverrideJustification}`
              : 'Dossier team updated',
        },
      });
      return updated;
    });
  }

  async advanceStatus(
    id: string,
    comment?: string,
    userId?: string,
    organizationId?: string,
  ) {
    const dossier = await this.findOne(id, organizationId);
    const nextStatus = this.workflowService.getNextStatus(
      dossier.type,
      dossier.status,
      dossier.workflowVersion ?? 1,
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
      dossier.type,
      dossier.status,
      dossier.workflowVersion ?? 1,
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

  async upgradeToDdp(
    id: string,
    reason: string | undefined,
    userId: string,
    organizationId: string,
  ) {
    const dossier = await this.prisma.dossier.findFirst({
      where: { id, organizationId },
      include: { history: true },
    });
    if (!dossier) throw new NotFoundException('Dossier not found');
    if (dossier.type !== DossierType.VEHICLE_SALE_CIF) {
      throw new ConflictException('Only a CIF dossier can be upgraded to DDP');
    }
    if (
      dossier.history.some(
        (entry) => entry.toStatus === DossierStatus.DOCUMENTS_DELIVERED,
      ) ||
      this.workflowService.isTerminalStatus(dossier.status)
    ) {
      throw new ConflictException({
        code: 'CIF_DDP_UPGRADE_WINDOW_CLOSED',
        message: 'Upgrade is no longer possible after Documents remis.',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.dossier.update({
        where: { id },
        data: {
          type: DossierType.VEHICLE_SALE_DDP,
          upgradedFromType: DossierType.VEHICLE_SALE_CIF,
          upgradedAt: new Date(),
        },
      });
      await tx.dossierStatusHistory.create({
        data: {
          dossierId: id,
          fromStatus: dossier.status,
          toStatus: dossier.status,
          changedBy: userId,
          comment: `Dossier upgraded from CIF to DDP${reason ? ` — ${reason}` : ''}`,
        },
      });
    });
    return this.findOne(id, organizationId);
  }

  private transitionHistoryComment(
    dto: UpdateStatusDto,
    currentStatus: string,
  ): string {
    if (dto.deposit)
      return `Acompte reçu — ${dto.deposit.amount} ${dto.deposit.currency} — ${dto.deposit.receivedAt}${dto.deposit.reference ? ` — réf. ${dto.deposit.reference}` : ''}`;
    if (dto.vehicleBooking)
      return `Vehicle Booking — véhicule ${dto.vehicleBooking.vehicleId} — ${dto.vehicleBooking.bookingDate}${dto.vehicleBooking.note ? ` — ${dto.vehicleBooking.note}` : ''}`;
    if (dto.purchase)
      return `Achat confirmé — facture ${dto.purchase.invoiceNumber} — ${dto.purchase.amount} ${dto.purchase.currency} — ${dto.purchase.invoiceDate}`;
    if (dto.inspection)
      return `Inspection — rapport ${dto.inspection.documentId ? 'PDF' : 'URL'} enregistré${dto.inspection.note ? ` — ${dto.inspection.note}` : ''}`;
    if (dto.shipmentBooking)
      return `Shipment Booking — forwarder ${dto.shipmentBooking.forwarderSupplierId}${dto.shipmentBooking.note ? ` — ${dto.shipmentBooking.note}` : ''}`;
    if (dto.billOfLading)
      return `BL émis — PDF ${dto.billOfLading.documentId}`;
    return dto.comment || `Status changed from '${currentStatus}' to '${dto.status}'`;
  }

  async getStatistics(organizationId: string) {
    const [total, statuses, types] = await Promise.all([
      this.prisma.dossier.count({ where: { organizationId } }),
      this.prisma.dossier.groupBy({
        by: ['status'],
        where: { organizationId },
        orderBy: { status: 'asc' },
        _count: { id: true },
      }),
      this.prisma.dossier.groupBy({
        by: ['type'],
        where: { organizationId },
        orderBy: { type: 'asc' },
        _count: { id: true },
      }),
    ]);

    const byStatus = Object.fromEntries(
      statuses.map((entry) => [entry.status, entry._count.id]),
    );
    const byType = Object.fromEntries(
      types.map((entry) => [entry.type, entry._count.id]),
    );
    const completed = (byStatus.closed ?? 0) + (byStatus.serviceCompleted ?? 0);

    return {
      total,
      byStatus,
      byType,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
    };
  }
}
