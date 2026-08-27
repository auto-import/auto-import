import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleRequestDto } from './dto/create-request.dto';
import { UpdateVehicleRequestDto } from './dto/update-request.dto';
import { FilterVehicleRequestDto } from './dto/filter-request.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { paginate } from '../common/helpers/pagination.helper';
import { ConfirmPurchaseDto } from './dto/confirm-purchase.dto';
import { DossierWorkflowService } from '../dossiers/workflows/dossier-workflow.service';
import { DossierStatus, DossierType } from '@auto-import/contracts';

@Injectable()
export class VehicleRequestsService {
  private readonly logger = new Logger(VehicleRequestsService.name);
  private readonly dossierWorkflow = new DossierWorkflowService();

  constructor(private prisma: PrismaService) {}

  // ──────────────────────────────────────────────
  // Vehicle Requests CRUD
  // ──────────────────────────────────────────────

  async create(dto: CreateVehicleRequestDto, organizationId: string) {
    if (!dto.prospectId && !dto.clientId) {
      throw new ConflictException(
        'Either prospectId or clientId must be provided',
      );
    }

    const request = await this.prisma.$transaction(
      async (transaction) => {
        await this.validateRequestRelations(transaction, dto, organizationId);
        return transaction.vehicleRequest.create({
          data: { ...dto, organizationId, status: 'open' },
          include: { candidates: true, dossier: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.logger.log(
      `Vehicle request created: ${request.id} (brand: ${request.brand || 'any'}, model: ${request.model || 'any'})`,
    );
    return request;
  }

  async findAll(
    organizationId: string,
    page: number = 1,
    limit: number = 20,
    filters?: FilterVehicleRequestDto,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.VehicleRequestWhereInput = { organizationId };

    if (filters?.status) where.status = filters.status;
    if (filters?.assignedTo) where.assignedTo = filters.assignedTo;
    if (filters?.clientId) where.clientId = filters.clientId;
    if (filters?.prospectId) where.prospectId = filters.prospectId;

    if (filters?.search) {
      where.OR = [
        { brand: { contains: filters.search, mode: 'insensitive' } },
        { model: { contains: filters.search, mode: 'insensitive' } },
        { requirements: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [requests, total] = await Promise.all([
      this.prisma.vehicleRequest.findMany({
        where,
        skip,
        take: limit,
        include: {
          candidates: {
            include: {
              vehicle: {
                select: {
                  id: true,
                  brand: true,
                  model: true,
                  year: true,
                  status: true,
                  sellingPrice: true,
                },
              },
            },
          },
          dossier: {
            select: {
              id: true,
              reference: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vehicleRequest.count({ where }),
    ]);

    return paginate(requests, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const request = await this.prisma.vehicleRequest.findFirst({
      where: { id, organizationId },
      include: {
        candidates: {
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
        },
        dossier: {
          include: {
            client: true,
            dossierVehicles: {
              include: { vehicle: true },
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException(`Vehicle request with ID ${id} not found`);
    }

    // Fetch prospect separately (scoped by organizationId if provided)
    const prospect = request.prospectId
      ? await this.prisma.prospect.findFirst({
          where: {
            id: request.prospectId,
            organizationId,
          },
          include: {
            activities: {
              orderBy: { activityDate: 'desc' },
              take: 5,
            },
          },
        })
      : null;

    // Fetch client separately (scoped by organizationId if provided)
    const client = request.clientId
      ? await this.prisma.client.findFirst({
          where: {
            id: request.clientId,
            organizationId,
          },
          include: {
            dossiers: {
              where: { organizationId },
              select: {
                id: true,
                reference: true,
                status: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
            orders: {
              where: { organizationId },
              select: {
                id: true,
                orderNumber: true,
                status: true,
                total: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
          },
        })
      : null;

    // Compute best candidate (lowest proposedPrice among non-rejected)
    const activeCandidates = request.candidates.filter(
      (c) => c.status !== 'rejected',
    );
    const bestCandidate =
      activeCandidates
        .filter((c) => c.proposedPrice != null)
        .sort((a, b) => Number(a.proposedPrice) - Number(b.proposedPrice))[0] ||
      null;

    return {
      ...request,
      prospect,
      client,
      candidateCount: request.candidates.length,
      bestCandidate,
    };
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateVehicleRequestDto,
  ) {
    const request = await this.prisma.$transaction(
      async (transaction) => {
        const existing = await transaction.vehicleRequest.findFirst({
          where: { id, organizationId },
        });
        if (!existing) throw new NotFoundException('Vehicle request not found');
        if (['purchased', 'cancelled'].includes(existing.status)) {
          throw new ConflictException(
            `Cannot edit a request in '${existing.status}'`,
          );
        }
        await this.validateRequestRelations(transaction, dto, organizationId);
        return transaction.vehicleRequest.update({
          where: { id },
          data: dto,
          include: { candidates: true, dossier: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.logger.log(`Vehicle request updated: ${id}`);
    return request;
  }

  async remove(id: string, organizationId: string) {
    const request = await this.findOne(id, organizationId);

    // Block if request has a dossier
    if (request.dossier) {
      throw new ConflictException('Cannot delete request linked to a dossier');
    }

    if (request.status === 'cancelled') return request;
    const reservedVehicleIds = request.candidates
      .filter((candidate) => candidate.status === 'validated')
      .map((candidate) => candidate.vehicleId);
    const cancelled = await this.prisma.$transaction(async (tx) => {
      if (reservedVehicleIds.length) {
        await tx.vehicle.updateMany({
          where: {
            id: { in: reservedVehicleIds },
            organizationId,
            status: 'reserved',
          },
          data: { status: 'available' },
        });
      }
      return tx.vehicleRequest.update({
        where: { id },
        data: { status: 'cancelled' },
      });
    });
    this.logger.log(`Vehicle request cancelled: ${id}`);
    return cancelled;
  }

  // ──────────────────────────────────────────────
  // Vehicle Candidates
  // ──────────────────────────────────────────────

  async addCandidate(dto: CreateCandidateDto, organizationId: string) {
    // Verify request exists in same organization
    const request = await this.prisma.vehicleRequest.findFirst({
      where: { id: dto.vehicleRequestId, organizationId },
    });
    if (!request) {
      throw new NotFoundException(
        `Vehicle request with ID ${dto.vehicleRequestId} not found in your organization`,
      );
    }
    if (!['open', 'sourcing'].includes(request.status)) {
      throw new ConflictException(
        `Cannot add a candidate to a request in '${request.status}'`,
      );
    }

    // Verify vehicle exists in same organization
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, organizationId },
    });
    if (!vehicle) {
      throw new NotFoundException(
        `Vehicle with ID ${dto.vehicleId} not found in your organization`,
      );
    }

    if (vehicle.status !== 'available') {
      throw new ConflictException(
        `Vehicle ${dto.vehicleId} is not available (current status: ${vehicle.status})`,
      );
    }

    // Check if vehicle is already attached to an active dossier
    const activeDossierConflict = await this.prisma.dossierVehicle.findFirst({
      where: {
        vehicleId: dto.vehicleId,
        dossier: {
          status: { notIn: ['closed', 'serviceCompleted', 'cancelled'] },
        },
      },
    });
    if (activeDossierConflict) {
      throw new ConflictException(
        `Vehicle ${dto.vehicleId} is already attached to an active dossier`,
      );
    }

    try {
      const candidate = await this.prisma.vehicleCandidate.create({
        data: {
          vehicleRequestId: dto.vehicleRequestId,
          vehicleId: dto.vehicleId,
          proposedPrice: dto.proposedPrice,
          currency: dto.currency,
          notes: dto.notes,
          status: 'proposed',
          presentedAt: new Date(),
        },
        include: {
          vehicle: {
            include: { specs: true },
          },
          vehicleRequest: true,
        },
      });

      if (request.status === 'open') {
        await this.prisma.vehicleRequest.update({
          where: { id: request.id },
          data: { status: 'sourcing' },
        });
      }

      this.logger.log(
        `Candidate added: vehicle ${dto.vehicleId} → request ${dto.vehicleRequestId}`,
      );
      return candidate;
    } catch (error: unknown) {
      // Handle unique constraint violation (vehicleRequestId + vehicleId)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Vehicle ${dto.vehicleId} is already a candidate for request ${dto.vehicleRequestId}`,
        );
      }
      throw error;
    }
  }

  async updateCandidate(
    candidateId: string,
    dto: UpdateCandidateDto,
    organizationId: string,
  ) {
    const candidate = await this.prisma.vehicleCandidate.findFirst({
      where: {
        id: candidateId,
        vehicleRequest: { organizationId },
      },
    });

    if (!candidate) {
      throw new NotFoundException(
        `Candidate with ID ${candidateId} not found in your organization`,
      );
    }

    const updated = await this.prisma.vehicleCandidate.update({
      where: { id: candidateId },
      data: dto,
      include: {
        vehicle: {
          include: { specs: true },
        },
        vehicleRequest: true,
      },
    });

    this.logger.log(`Candidate updated: ${candidateId}`);
    return updated;
  }

  async validateCandidate(
    candidateId: string,
    organizationId: string,
    userId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch candidate with relations and verify org
      const candidate = await tx.vehicleCandidate.findFirst({
        where: {
          id: candidateId,
          vehicleRequest: { organizationId },
        },
        include: {
          vehicleRequest: {
            include: { dossier: true },
          },
          vehicle: true,
        },
      });

      if (!candidate) {
        throw new NotFoundException(
          `Candidate with ID ${candidateId} not found in your organization`,
        );
      }

      if (candidate.status === 'validated') {
        throw new ConflictException('Candidate is already validated');
      }

      // 2. Check no conflicting active dossier owns the vehicle
      const conflictingDossier = await tx.dossierVehicle.findFirst({
        where: {
          vehicleId: candidate.vehicleId,
          dossier: {
            id: { not: candidate.vehicleRequest.dossier?.id },
            status: { notIn: ['closed', 'serviceCompleted', 'cancelled'] },
          },
        },
      });
      if (conflictingDossier) {
        throw new ConflictException(
          `Vehicle ${candidate.vehicleId} is already attached to another active dossier`,
        );
      }

      // 3. Concurrency-safe atomic reservation
      const updateResult = await tx.vehicle.updateMany({
        where: {
          id: candidate.vehicleId,
          organizationId,
          status: 'available',
        },
        data: { status: 'reserved' },
      });

      if (updateResult.count === 0) {
        throw new ConflictException(
          `Vehicle ${candidate.vehicleId} is not available for reservation`,
        );
      }

      // 4. Update candidate → VALIDATED
      const updatedCandidate = await tx.vehicleCandidate.update({
        where: { id: candidateId },
        data: {
          status: 'validated',
          validatedAt: new Date(),
        },
        include: {
          vehicle: true,
          vehicleRequest: {
            include: { dossier: true },
          },
        },
      });

      // 5. Update request status → validated
      await tx.vehicleRequest.update({
        where: { id: candidate.vehicleRequestId },
        data: { status: 'candidateSelected' },
      });

      // 6. If request has a linked dossier, bind vehicle and advance status
      if (candidate.vehicleRequest.dossier) {
        await tx.dossierVehicle.upsert({
          where: {
            dossierId_vehicleId: {
              dossierId: candidate.vehicleRequest.dossier.id,
              vehicleId: candidate.vehicleId,
            },
          },
          create: {
            dossierId: candidate.vehicleRequest.dossier.id,
            vehicleId: candidate.vehicleId,
            assignedAt: new Date(),
          },
          update: {},
        });

        await tx.dossierStatusHistory.create({
          data: {
            dossierId: candidate.vehicleRequest.dossier.id,
            fromStatus: candidate.vehicleRequest.dossier.status,
            toStatus: candidate.vehicleRequest.dossier.status,
            changedBy: userId || 'system',
            comment: `Vehicle candidate ${candidateId} validated and assigned to dossier`,
          },
        });
      }

      this.logger.log(
        `Candidate ${candidateId} validated: vehicle ${candidate.vehicleId} → reserved, request ${candidate.vehicleRequestId} → validated`,
      );

      return updatedCandidate;
    });
  }

  async rejectCandidate(candidateId: string, organizationId: string) {
    const candidate = await this.prisma.vehicleCandidate.findFirst({
      where: {
        id: candidateId,
        vehicleRequest: { organizationId },
      },
    });

    if (!candidate) {
      throw new NotFoundException(
        `Candidate with ID ${candidateId} not found in your organization`,
      );
    }

    if (candidate.status === 'rejected') {
      throw new ConflictException('Candidate is already rejected');
    }

    if (candidate.status === 'validated') {
      throw new ConflictException('Cannot reject a validated candidate');
    }

    const rejected = await this.prisma.vehicleCandidate.update({
      where: { id: candidateId },
      data: { status: 'rejected' },
      include: {
        vehicle: true,
        vehicleRequest: true,
      },
    });

    this.logger.log(`Candidate ${candidateId} rejected`);
    return rejected;
  }

  async confirmPurchase(
    requestId: string,
    dto: ConfirmPurchaseDto,
    organizationId: string,
    userId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existingPurchase = await tx.purchase.findUnique({
        where: { vehicleRequestId: requestId },
      });
      if (existingPurchase) {
        return {
          message: 'Purchase was already confirmed',
          requestId,
          vehicleId: existingPurchase.vehicleId,
          purchase: existingPurchase,
        };
      }
      const request = await tx.vehicleRequest.findFirst({
        where: { id: requestId, organizationId },
        include: {
          candidates: {
            include: { vehicle: true },
          },
          dossier: true,
        },
      });

      if (!request) {
        throw new NotFoundException(
          `Vehicle request with ID ${requestId} not found in your organization`,
        );
      }
      if (request.status === 'cancelled') {
        throw new ConflictException('A cancelled request cannot be purchased');
      }
      if (request.dossier?.type === DossierType.SHIPPING_ONLY) {
        throw new ConflictException(
          'Shipping-only dossiers cannot enter purchase states',
        );
      }

      // Determine target vehicle
      let targetVehicleId = dto.vehicleId;
      let targetCandidateId = dto.candidateId;

      if (targetCandidateId) {
        const candidate = request.candidates.find(
          (c) => c.id === targetCandidateId,
        );
        if (!candidate) {
          throw new NotFoundException('Candidate not found');
        }
        if (targetVehicleId && targetVehicleId !== candidate.vehicleId) {
          throw new ConflictException(
            'Candidate and vehicle do not identify the same request option',
          );
        }
        targetVehicleId = candidate.vehicleId;
      } else if (!targetVehicleId && !targetCandidateId) {
        const validatedCandidate = request.candidates.find(
          (c) => c.status === 'validated',
        );
        if (validatedCandidate) {
          targetVehicleId = validatedCandidate.vehicleId;
          targetCandidateId = validatedCandidate.id;
        } else if (request.candidates.length === 1) {
          targetVehicleId = request.candidates[0].vehicleId;
          targetCandidateId = request.candidates[0].id;
        } else {
          throw new ConflictException(
            'Please specify which vehicle or candidate to confirm purchase for',
          );
        }
      }

      if (!targetVehicleId) {
        throw new ConflictException('A vehicle is required for purchase');
      }
      const selectedCandidate = request.candidates.find(
        (candidate) => candidate.vehicleId === targetVehicleId,
      );
      if (!selectedCandidate) {
        throw new ConflictException(
          'The selected vehicle is not a candidate for this request',
        );
      }
      targetCandidateId = selectedCandidate.id;

      // Validate vehicle belongs to organization
      const vehicle = await tx.vehicle.findFirst({
        where: { id: targetVehicleId, organizationId },
      });

      if (!vehicle) {
        throw new NotFoundException(
          `Vehicle with ID ${targetVehicleId} not found in your organization`,
        );
      }

      const supplierId = dto.supplierId || vehicle.supplierId;
      if (!supplierId) {
        throw new ConflictException('A tenant supplier is required');
      }
      const supplier = await tx.partner.findFirst({
        where: { id: supplierId, organizationId, type: 'supplier' },
      });
      if (!supplier) {
        throw new NotFoundException('Supplier not found');
      }
      const purchasePrice =
        dto.purchasePrice != null
          ? dto.purchasePrice
          : vehicle.purchasePrice?.toNumber();
      if (purchasePrice == null || purchasePrice <= 0) {
        throw new ConflictException('A positive purchase price is required');
      }

      // Concurrency-safe reservation & state check
      if (vehicle.status === 'available') {
        const reservationResult = await tx.vehicle.updateMany({
          where: {
            id: targetVehicleId,
            organizationId,
            status: 'available',
          },
          data: {
            status: 'reserved',
            supplierId,
            purchasePrice:
              dto.purchasePrice != null
                ? dto.purchasePrice
                : vehicle.purchasePrice,
            currency: dto.currency || vehicle.currency,
          },
        });
        if (reservationResult.count === 0) {
          throw new ConflictException(
            `Vehicle ${targetVehicleId} is no longer available for purchase`,
          );
        }
      } else if (vehicle.status === 'reserved') {
        await tx.vehicle.update({
          where: { id: targetVehicleId },
          data: {
            supplierId,
            purchasePrice:
              dto.purchasePrice != null
                ? dto.purchasePrice
                : vehicle.purchasePrice,
            currency: dto.currency || vehicle.currency,
          },
        });
      } else {
        throw new ConflictException(
          `Cannot purchase vehicle with status '${vehicle.status}'`,
        );
      }

      // Check no conflicting active dossier owns the vehicle
      const conflictingDossier = await tx.dossierVehicle.findFirst({
        where: {
          vehicleId: targetVehicleId,
          dossier: {
            id: { not: request.dossier?.id },
            status: { notIn: ['closed', 'serviceCompleted', 'cancelled'] },
          },
        },
      });
      if (conflictingDossier) {
        throw new ConflictException(
          `Vehicle ${targetVehicleId} is already attached to another active dossier`,
        );
      }

      // Update candidate status to validated
      if (targetCandidateId) {
        await tx.vehicleCandidate.update({
          where: { id: targetCandidateId },
          data: {
            status: 'validated',
            validatedAt: new Date(),
          },
        });
      }

      // Mark the request purchased only after all consistency checks passed.
      await tx.vehicleRequest.update({
        where: { id: requestId },
        data: { status: 'purchased' },
      });

      // If request has linked dossier, bind vehicle and advance workflow
      if (request.dossier) {
        this.dossierWorkflow.validateTransition(
          request.dossier.type,
          request.dossier.status,
          DossierStatus.PURCHASE_CONFIRMED,
        );
        await tx.dossierVehicle.upsert({
          where: {
            dossierId_vehicleId: {
              dossierId: request.dossier.id,
              vehicleId: targetVehicleId,
            },
          },
          create: {
            dossierId: request.dossier.id,
            vehicleId: targetVehicleId,
            assignedAt: new Date(),
          },
          update: {},
        });

        await tx.dossier.update({
          where: { id: request.dossier.id },
          data: { status: DossierStatus.PURCHASE_CONFIRMED },
        });

        await tx.dossierStatusHistory.create({
          data: {
            dossierId: request.dossier.id,
            fromStatus: request.dossier.status,
            toStatus: DossierStatus.PURCHASE_CONFIRMED,
            changedBy: userId,
            comment: `Purchase confirmed for vehicle ${vehicle.brand} ${vehicle.model} (${vehicle.vin || targetVehicleId})${supplier ? ` from supplier ${supplier.name}` : ''}${dto.notes ? ` - ${dto.notes}` : ''}`,
          },
        });
      }

      const purchaseYear = new Date().getUTCFullYear();
      const sequence = await tx.commerceSequence.upsert({
        where: {
          organizationId_key: {
            organizationId,
            key: `purchase:${purchaseYear}`,
          },
        },
        create: { organizationId, key: `purchase:${purchaseYear}`, value: 1 },
        update: { value: { increment: 1 } },
      });
      const purchaseNumber = `PUR-${purchaseYear}-${String(sequence.value).padStart(5, '0')}`;

      const purchase = await tx.purchase.create({
        data: {
          organizationId,
          purchaseNumber,
          supplierId,
          vehicleId: targetVehicleId,
          purchasePrice,
          currency: dto.currency || vehicle.currency || 'USD',
          status: 'confirmed',
          purchaseDate: new Date(),
          vehicleRequestId: requestId,
          candidateId: targetCandidateId,
          dossierId: request.dossier?.id,
          orderId: request.dossier?.orderId,
          confirmedBy: userId,
          supplierSnapshot: {
            id: supplier.id,
            name: supplier.name,
            country: supplier.country,
            paymentTerms: supplier.paymentTerms,
          },
          vehicleSnapshot: {
            id: vehicle.id,
            vin: vehicle.vin,
            brand: vehicle.brand,
            model: vehicle.model,
            year: vehicle.year,
            condition: vehicle.condition,
          },
        },
      });

      this.logger.log(
        `Purchase confirmed for request ${requestId}: vehicle ${targetVehicleId}, purchase ${purchase.purchaseNumber}`,
      );

      return {
        message: 'Purchase confirmed successfully',
        requestId,
        vehicleId: targetVehicleId,
        purchase,
      };
    });
  }

  async getCandidates(requestId: string, organizationId: string) {
    // Verify request exists in same organization
    await this.findOne(requestId, organizationId);

    return this.prisma.vehicleCandidate.findMany({
      where: { vehicleRequestId: requestId },
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
      orderBy: { presentedAt: 'desc' },
    });
  }

  // ──────────────────────────────────────────────
  // Statistics
  // ──────────────────────────────────────────────

  async getStatistics(organizationId: string) {
    const [total, open, validated, closed] = await this.prisma.$transaction([
      this.prisma.vehicleRequest.count({ where: { organizationId } }),
      this.prisma.vehicleRequest.count({
        where: { organizationId, status: 'open' },
      }),
      this.prisma.vehicleRequest.count({
        where: { organizationId, status: 'validated' },
      }),
      this.prisma.vehicleRequest.count({
        where: { organizationId, status: 'closed' },
      }),
    ]);

    return {
      total,
      byStatus: {
        open,
        validated,
        closed,
      },
      conversionRate:
        total > 0 ? Math.round((validated / total) * 10000) / 100 : 0,
    };
  }

  private async validateRequestRelations(
    transaction: Prisma.TransactionClient,
    dto: Pick<
      CreateVehicleRequestDto,
      'prospectId' | 'clientId' | 'assignedTo'
    >,
    organizationId: string,
  ): Promise<void> {
    if (dto.prospectId) {
      const prospect = await transaction.prospect.findFirst({
        where: { id: dto.prospectId, organizationId },
        select: { id: true },
      });
      if (!prospect) throw new NotFoundException('Prospect not found');
    }
    if (dto.clientId) {
      const client = await transaction.client.findFirst({
        where: { id: dto.clientId, organizationId },
        select: { id: true },
      });
      if (!client) throw new NotFoundException('Client not found');
    }
    if (dto.assignedTo) {
      const assignee = await transaction.user.findFirst({
        where: { id: dto.assignedTo, organizationId, status: 'active' },
        select: { id: true },
      });
      if (!assignee) throw new NotFoundException('Assignee not found');
    }
  }
}
