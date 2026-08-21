import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleRequestDto } from './dto/create-request.dto';
import { UpdateVehicleRequestDto } from './dto/update-request.dto';
import { FilterVehicleRequestDto } from './dto/filter-request.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';

@Injectable()
export class VehicleRequestsService {
  private readonly logger = new Logger(VehicleRequestsService.name);

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

    // Verify prospect exists and belongs to same org if provided
    if (dto.prospectId) {
      const prospect = await this.prisma.prospect.findFirst({
        where: { id: dto.prospectId, organizationId },
      });
      if (!prospect) {
        throw new NotFoundException(
          `Prospect with ID ${dto.prospectId} not found in your organization`,
        );
      }
    }

    // Verify client exists and belongs to same org if provided
    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: dto.clientId, organizationId },
      });
      if (!client) {
        throw new NotFoundException(
          `Client with ID ${dto.clientId} not found in your organization`,
        );
      }
    }

    const request = await this.prisma.vehicleRequest.create({
      data: {
        ...dto,
        organizationId,
        status: 'open',
      },
      include: {
        candidates: true,
        dossier: true,
      },
    });

    this.logger.log(
      `Vehicle request created: ${request.id} (brand: ${request.brand || 'any'}, model: ${request.model || 'any'})`,
    );
    return request;
  }

  async findAll(
    organizationId: string,
    page: number = 1,
    limit: number = 10,
    filters?: FilterVehicleRequestDto,
  ) {
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

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

    return {
      items: requests,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, organizationId?: string) {
    const request = await this.prisma.vehicleRequest.findFirst({
      where: { id, ...(organizationId && { organizationId }) },
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
    let prospect: any = null;
    if (request.prospectId) {
      prospect = await this.prisma.prospect.findFirst({
        where: {
          id: request.prospectId,
          ...(organizationId && { organizationId }),
        },
        include: {
          activities: {
            orderBy: { activityDate: 'desc' },
            take: 5,
          },
        },
      });
    }

    // Fetch client separately (scoped by organizationId if provided)
    let client: any = null;
    if (request.clientId) {
      client = await this.prisma.client.findFirst({
        where: {
          id: request.clientId,
          ...(organizationId && { organizationId }),
        },
        include: {
          dossiers: {
            where: organizationId ? { organizationId } : undefined,
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
            where: organizationId ? { organizationId } : undefined,
            select: { id: true, orderNumber: true, status: true, total: true },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });
    }

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
    await this.findOne(id, organizationId);

    const request = await this.prisma.vehicleRequest.update({
      where: { id },
      data: dto,
      include: {
        candidates: true,
        dossier: true,
      },
    });

    this.logger.log(`Vehicle request updated: ${id}`);
    return request;
  }

  async remove(id: string, organizationId: string) {
    const request = await this.findOne(id, organizationId);

    // Block if request has a dossier
    if (request.dossier) {
      throw new ConflictException('Cannot delete request linked to a dossier');
    }

    // Block if any candidate is validated
    const validatedCandidates = request.candidates.filter(
      (c) => c.status === 'validated',
    );
    if (validatedCandidates.length > 0) {
      throw new ConflictException(
        'Cannot delete request with validated candidates',
      );
    }

    // Delete candidates first (referential integrity), then the request
    await this.prisma.$transaction(async (tx) => {
      await tx.vehicleCandidate.deleteMany({
        where: { vehicleRequestId: id },
      });
      await tx.vehicleRequest.delete({
        where: { id },
      });
    });

    this.logger.log(`Vehicle request deleted: ${id}`);
    return { message: 'Vehicle request deleted successfully' };
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
          status: { notIn: ['cloture', 'service_termine', 'annule'] },
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

      this.logger.log(
        `Candidate added: vehicle ${dto.vehicleId} → request ${dto.vehicleRequestId}`,
      );
      return candidate;
    } catch (error: any) {
      // Handle unique constraint violation (vehicleRequestId + vehicleId)
      if (error.code === 'P2002') {
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

  async validateCandidate(candidateId: string, organizationId: string, userId?: string) {
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
            status: { notIn: ['cloture', 'service_termine', 'annule'] },
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
        data: { status: 'validated' },
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

        await tx.dossier.update({
          where: { id: candidate.vehicleRequest.dossier.id },
          data: {
            status: 'achat_confirme',
          },
        });

        // Record status transition in dossier history
        await tx.dossierStatusHistory.create({
          data: {
            dossierId: candidate.vehicleRequest.dossier.id,
            fromStatus: candidate.vehicleRequest.dossier.status,
            toStatus: 'achat_confirme',
            changedBy: userId || 'system',
            comment: `Vehicle candidate ${candidateId} validated — vehicle ${candidate.vehicleId} assigned to dossier`,
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
    dto: any,
    organizationId: string,
    userId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
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

      // Determine target vehicle
      let targetVehicleId = dto.vehicleId;
      let targetCandidateId = dto.candidateId;

      if (!targetVehicleId && targetCandidateId) {
        const candidate = request.candidates.find((c) => c.id === targetCandidateId);
        if (!candidate) {
          throw new NotFoundException(
            `Candidate with ID ${targetCandidateId} not found in this request`,
          );
        }
        targetVehicleId = candidate.vehicleId;
      } else if (!targetVehicleId && !targetCandidateId) {
        const validatedCandidate = request.candidates.find((c) => c.status === 'validated');
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

      // Validate vehicle belongs to organization
      const vehicle = await tx.vehicle.findFirst({
        where: { id: targetVehicleId, organizationId },
      });

      if (!vehicle) {
        throw new NotFoundException(
          `Vehicle with ID ${targetVehicleId} not found in your organization`,
        );
      }

      // Validate supplier partner if provided
      let supplier: any = null;
      if (dto.supplierId) {
        supplier = await tx.partner.findFirst({
          where: { id: dto.supplierId, organizationId },
        });
        if (!supplier) {
          throw new NotFoundException(
            `Supplier with ID ${dto.supplierId} not found in your organization`,
          );
        }
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
            supplierId: dto.supplierId || vehicle.supplierId,
            purchasePrice: dto.purchasePrice != null ? dto.purchasePrice : vehicle.purchasePrice,
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
            supplierId: dto.supplierId || vehicle.supplierId,
            purchasePrice: dto.purchasePrice != null ? dto.purchasePrice : vehicle.purchasePrice,
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
            status: { notIn: ['cloture', 'service_termine', 'annule'] },
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

      // Update request status to validated
      await tx.vehicleRequest.update({
        where: { id: requestId },
        data: { status: 'validated' },
      });

      // If request has linked dossier, bind vehicle and advance workflow
      if (request.dossier) {
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
          data: { status: 'achat_confirme' },
        });

        await tx.dossierStatusHistory.create({
          data: {
            dossierId: request.dossier.id,
            fromStatus: request.dossier.status,
            toStatus: 'achat_confirme',
            changedBy: userId || 'system',
            comment: `Purchase confirmed for vehicle ${vehicle.brand} ${vehicle.model} (${vehicle.vin || targetVehicleId})${supplier ? ` from supplier ${supplier.name}` : ''}${dto.notes ? ` - ${dto.notes}` : ''}`,
          },
        });
      }

      // Generate purchase record
      const purchaseYear = new Date().getFullYear();
      const countPurchases = await tx.purchase.count();
      const purchaseNumber = `PUR-${purchaseYear}-${String(countPurchases + 1).padStart(5, '0')}`;

      const purchase = await tx.purchase.create({
        data: {
          purchaseNumber,
          supplierId: dto.supplierId || vehicle.supplierId || 'direct',
          vehicleId: targetVehicleId,
          purchasePrice: dto.purchasePrice != null ? dto.purchasePrice : (vehicle.purchasePrice || 0),
          currency: dto.currency || vehicle.currency || 'USD',
          status: 'confirmed',
          purchaseDate: new Date(),
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
}
