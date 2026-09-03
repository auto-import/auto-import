import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { CreateVehicleSpecDto } from './dto/create-vehicle-spec.dto';
import { FilterVehicleDto } from './dto/filter-vehicle.dto';
import { paginate } from '../common/helpers/pagination.helper';
import {
  StorageProvider,
  type StoredFileResult,
} from '../documents/storage.provider';
import type { UploadedBufferFile } from '../documents/documents.service';
import type { EligibleVehiclesDto } from './dto/eligible-vehicles.dto';
import { DossierType } from '../dossiers/dto/dossier-type.enum';

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    private prisma: PrismaService,
    @Optional()
    private readonly storage: StorageProvider = new StorageProvider(),
  ) {}

  private async storeVehiclePhotos(
    organizationId: string,
    files: UploadedBufferFile[],
  ): Promise<StoredFileResult[]> {
    if (files.length !== 3) {
      throw new BadRequestException(
        'Exactly three vehicle photos are required',
      );
    }
    const stored: StoredFileResult[] = [];
    try {
      for (const file of files) {
        if (!file.buffer || file.buffer.length > 8 * 1024 * 1024) {
          throw new BadRequestException(
            'Each vehicle photo must not exceed 8 MB',
          );
        }
        const detected = this.storage.detectMimeType(
          file.buffer,
          'application/octet-stream',
        );
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(detected)) {
          throw new BadRequestException(
            'Vehicle photos must be JPEG, PNG or WebP',
          );
        }
        stored.push(
          await this.storage.saveBuffer(
            organizationId,
            'vehicle-photos',
            file.originalname,
            detected,
            file.buffer,
          ),
        );
      }
      if (new Set(stored.map(({ checksum }) => checksum)).size !== 3) {
        throw new BadRequestException(
          'The three vehicle photos must be distinct',
        );
      }
      return stored;
    } catch (error) {
      await Promise.all(
        stored.map(({ storageKey }) => this.storage.delete(storageKey)),
      );
      throw error;
    }
  }

  async createWithPhotos(
    dto: CreateVehicleDto,
    organizationId: string,
    userId: string,
    files: UploadedBufferFile[],
  ) {
    if (!dto.vin && dto.status !== 'prePurchase') {
      throw new ConflictException(
        'VIN is required outside the pre-purchase state',
      );
    }
    if (dto.status === 'rejected' && !dto.rejectionReason?.trim()) {
      throw new BadRequestException('A rejection reason is required');
    }
    const stored = await this.storeVehiclePhotos(organizationId, files);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if (
            dto.vin &&
            (await tx.vehicle.findUnique({ where: { vin: dto.vin } }))
          ) {
            throw new ConflictException('A vehicle with this VIN exists');
          }
          await this.validateTenantRelations(tx, dto, organizationId);
          const vehicle = await tx.vehicle.create({
            data: {
              ...dto,
              equipment: dto.equipment as Prisma.InputJsonValue | undefined,
              organizationId,
            },
          });
          for (const [sortOrder, item] of stored.entries()) {
            const asset = await tx.fileAsset.create({
              data: {
                organizationId,
                uploadedBy: userId,
                category: 'VEHICLE_PHOTO',
                storageKey: item.storageKey,
                originalName: item.originalName,
                mimeType: item.mimeType,
                size: item.size,
                checksum: item.checksum,
              },
            });
            await tx.vehiclePhoto.create({
              data: {
                vehicleId: vehicle.id,
                fileId: asset.id,
                sortOrder,
                isPrimary: sortOrder === 0,
              },
            });
          }
          return tx.vehicle.findUniqueOrThrow({
            where: { id: vehicle.id },
            include: {
              specs: true,
              photos: {
                include: { file: true },
                orderBy: { sortOrder: 'asc' },
              },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      await Promise.all(
        stored.map(({ storageKey }) => this.storage.delete(storageKey)),
      );
      throw error;
    }
  }

  async replacePhotos(
    id: string,
    organizationId: string,
    userId: string,
    files: UploadedBufferFile[],
  ) {
    const stored = await this.storeVehiclePhotos(organizationId, files);
    const previous = await this.prisma.vehicle.findFirst({
      where: { id, organizationId },
      include: { photos: { include: { file: true } } },
    });
    if (!previous) {
      await Promise.all(
        stored.map(({ storageKey }) => this.storage.delete(storageKey)),
      );
      throw new NotFoundException('Vehicle not found');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.vehiclePhoto.deleteMany({ where: { vehicleId: id } });
        for (const photo of previous.photos)
          await tx.fileAsset.delete({ where: { id: photo.fileId } });
        for (const [sortOrder, item] of stored.entries()) {
          const asset = await tx.fileAsset.create({
            data: {
              organizationId,
              uploadedBy: userId,
              category: 'VEHICLE_PHOTO',
              storageKey: item.storageKey,
              originalName: item.originalName,
              mimeType: item.mimeType,
              size: item.size,
              checksum: item.checksum,
            },
          });
          await tx.vehiclePhoto.create({
            data: {
              vehicleId: id,
              fileId: asset.id,
              sortOrder,
              isPrimary: sortOrder === 0,
            },
          });
        }
      });
    } catch (error) {
      await Promise.all(
        stored.map(({ storageKey }) => this.storage.delete(storageKey)),
      );
      throw error;
    }
    await Promise.all(
      previous.photos.map(({ file }) => this.storage.delete(file.storageKey)),
    );
    return this.findOne(id, organizationId);
  }

  async photoStream(photoId: string, organizationId: string) {
    const photo = await this.prisma.vehiclePhoto.findFirst({
      where: { id: photoId, vehicle: { organizationId } },
      include: { file: true },
    });
    if (!photo) throw new NotFoundException('Vehicle photo not found');
    return {
      stream: this.storage.getReadStream(photo.file.storageKey),
      mimeType: photo.file.mimeType,
      size: Number(photo.file.size),
    };
  }

  async create(createVehicleDto: CreateVehicleDto, organizationId: string) {
    if (!createVehicleDto.vin && createVehicleDto.status !== 'prePurchase') {
      throw new ConflictException(
        'VIN is required outside the pre-purchase state',
      );
    }
    if (
      createVehicleDto.status === 'rejected' &&
      !createVehicleDto.rejectionReason?.trim()
    ) {
      throw new BadRequestException('A rejection reason is required');
    }
    const vehicle = await this.prisma.$transaction(
      async (transaction) => {
        if (createVehicleDto.vin) {
          const existing = await transaction.vehicle.findUnique({
            where: { vin: createVehicleDto.vin },
          });
          if (existing) {
            throw new ConflictException('A vehicle with this VIN exists');
          }
        }
        await this.validateTenantRelations(
          transaction,
          createVehicleDto,
          organizationId,
        );
        return transaction.vehicle.create({
          data: {
            ...createVehicleDto,
            equipment: createVehicleDto.equipment as
              Prisma.InputJsonValue | undefined,
            organizationId,
          },
          include: { specs: true, photos: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.logger.log(
      `Vehicle created: ${vehicle.brand} ${vehicle.model} (${vehicle.id})`,
    );
    return vehicle;
  }

  async findAll(organizationId: string, filters: FilterVehicleDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.VehicleWhereInput = { organizationId };

    if (filters.search) {
      where.OR = [
        { brand: { contains: filters.search, mode: 'insensitive' } },
        { model: { contains: filters.search, mode: 'insensitive' } },
        { vin: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.brand) {
      where.brand = { contains: filters.brand, mode: 'insensitive' };
    }
    if (filters.model) {
      where.model = { contains: filters.model, mode: 'insensitive' };
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.acquisitionType) {
      where.acquisitionType = filters.acquisitionType;
    }
    if (filters.condition) {
      where.condition = filters.condition;
    }
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.locationId) where.currentLocationId = filters.locationId;
    if (filters.vin) where.vin = { contains: filters.vin, mode: 'insensitive' };
    where.archivedAt = null;

    const [vehicles, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        include: {
          specs: true,
          supplier: { select: { id: true, name: true, country: true } },
          currentLocation: {
            include: { warehouse: { select: { id: true, name: true } } },
          },
          photos: {
            include: { file: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return paginate(vehicles, total, page, limit);
  }

  async eligibleForDossier(organizationId: string, query: EligibleVehiclesDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 50);
    const sourceFilter =
      query.type === DossierType.SHIPPING_ONLY
        ? { in: ['external', 'clientRequest'] }
        : { in: ['stock', 'chinaOffer', 'clientRequest'] };
    const searchWhere: Prisma.VehicleWhereInput = query.search
      ? {
          OR: [
            { brand: { contains: query.search, mode: 'insensitive' } },
            { model: { contains: query.search, mode: 'insensitive' } },
            { vin: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const activeStatuses = ['closed', 'serviceCompleted', 'cancelled'];
    const eligibleWhere: Prisma.VehicleWhereInput = {
      organizationId,
      archivedAt: null,
      status: 'available',
      acquisitionType: sourceFilter,
      dossierVehicles: {
        none: { dossier: { status: { notIn: activeStatuses } } },
      },
      ...searchWhere,
    };
    const include = {
      specs: true,
      photos: { where: { isPrimary: true }, include: { file: true } },
      dossierVehicles: {
        where: { dossier: { status: { notIn: activeStatuses } } },
        select: { dossier: { select: { id: true, reference: true } } },
      },
    } satisfies Prisma.VehicleInclude;
    if (!query.includeExcluded) {
      const [items, total] = await Promise.all([
        this.prisma.vehicle.findMany({
          where: eligibleWhere,
          include,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.vehicle.count({ where: eligibleWhere }),
      ]);
      return paginate(
        items.map((vehicle) => ({
          ...vehicle,
          eligibility: { eligible: true, reason: null },
        })),
        total,
        page,
        limit,
      );
    }
    const where: Prisma.VehicleWhereInput = { organizationId, ...searchWhere };
    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return paginate(
      items.map((vehicle) => {
        let reason: string | null = null;
        if (vehicle.archivedAt) reason = 'ARCHIVED';
        else if (vehicle.status === 'sold') reason = 'SOLD';
        else if (vehicle.status !== 'available')
          reason =
            vehicle.status === 'reserved' ? 'RESERVED' : 'UNAVAILABLE_STATUS';
        else if (!sourceFilter.in.includes(vehicle.acquisitionType))
          reason = 'INCOMPATIBLE_WORKFLOW';
        else if (vehicle.dossierVehicles.length)
          reason = 'ACTIVE_DOSSIER_ASSIGNMENT';
        return {
          ...vehicle,
          eligibility: { eligible: reason === null, reason },
        };
      }),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string, organizationId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, organizationId },
      include: {
        specs: true,
        photos: {
          include: { file: true },
          orderBy: { sortOrder: 'asc' },
        },
        dossierVehicles: {
          where: { dossier: { organizationId } },
          include: {
            dossier: {
              select: {
                id: true,
                reference: true,
                status: true,
                createdAt: true,
              },
            },
          },
        },
        candidates: {
          where: { vehicleRequest: { organizationId } },
          select: {
            id: true,
            vehicleRequestId: true,
            status: true,
            proposedPrice: true,
          },
        },
        supplier: true,
        currentLocation: { include: { warehouse: true } },
        stockMovements: {
          include: {
            fromLocation: true,
            toLocation: true,
            user: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${id} not found`);
    }

    const dossiers = vehicle.dossierVehicles
      ? vehicle.dossierVehicles.map((dv) => dv.dossier)
      : [];
    return { ...vehicle, dossiers };
  }

  async update(
    id: string,
    organizationId: string,
    updateVehicleDto: UpdateVehicleDto,
    userId?: string,
  ) {
    const vehicle = await this.prisma.$transaction(
      async (transaction) => {
        const existingVehicle = await transaction.vehicle.findFirst({
          where: { id, organizationId },
        });
        if (!existingVehicle) throw new NotFoundException('Vehicle not found');
        const nextStatus = updateVehicleDto.status ?? existingVehicle.status;
        if (nextStatus === 'rejected' && !updateVehicleDto.rejectionReason?.trim()) {
          throw new BadRequestException(
            'A rejection reason is required when rejecting a vehicle',
          );
        }
        const nextVin = updateVehicleDto.vin ?? existingVehicle.vin;
        if (!nextVin && nextStatus !== 'prePurchase') {
          throw new ConflictException(
            'VIN is required outside the pre-purchase state',
          );
        }
        if (updateVehicleDto.vin) {
          const duplicate = await transaction.vehicle.findFirst({
            where: { vin: updateVehicleDto.vin, NOT: { id } },
          });
          if (duplicate) {
            throw new ConflictException('A vehicle with this VIN exists');
          }
        }
        await this.validateTenantRelations(
          transaction,
          updateVehicleDto,
          organizationId,
        );
        return transaction.vehicle.update({
          where: { id },
          data: {
            ...updateVehicleDto,
            rejectedAt:
              nextStatus === 'rejected' && existingVehicle.status !== 'rejected'
                ? new Date()
                : undefined,
            rejectedBy:
              nextStatus === 'rejected' && existingVehicle.status !== 'rejected'
                ? userId
                : undefined,
            equipment: updateVehicleDto.equipment as
              Prisma.InputJsonValue | undefined,
          },
          include: { specs: true, photos: true },
        }).then(async (updated) => {
          if (nextStatus === 'rejected' && existingVehicle.status !== 'rejected') {
            await transaction.auditLog.create({
              data: {
                organizationId,
                userId,
                action: 'vehicle.rejected',
                entityType: 'vehicle',
                entityId: id,
                oldValues: { status: existingVehicle.status },
                newValues: {
                  status: 'rejected',
                  reason: updateVehicleDto.rejectionReason,
                },
              },
            });
          }
          return updated;
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.logger.log(
      `Vehicle updated: ${vehicle.brand} ${vehicle.model} (${id})`,
    );
    return vehicle;
  }

  async remove(id: string, organizationId: string) {
    const vehicle = await this.findOne(id, organizationId);

    // Check if vehicle has active dossiers
    const activeDossiers = vehicle.dossierVehicles?.filter(
      (dv) =>
        dv.dossier.status !== 'closed' &&
        dv.dossier.status !== 'serviceCompleted' &&
        dv.dossier.status !== 'cancelled',
    );
    if (activeDossiers && activeDossiers.length > 0) {
      throw new ConflictException('Cannot delete vehicle with active dossiers');
    }

    const archived = await this.prisma.vehicle.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    this.logger.log(`Vehicle deleted: ${id}`);
    return archived;
  }

  // ──────────────────────────────────────────────
  // Vehicle Specs
  // ──────────────────────────────────────────────

  async upsertSpecs(
    vehicleId: string,
    specsDto: CreateVehicleSpecDto,
    organizationId: string,
  ) {
    await this.findOne(vehicleId, organizationId);

    const specs = await this.prisma.vehicleSpec.upsert({
      where: { vehicleId },
      update: specsDto,
      create: {
        vehicleId,
        ...specsDto,
      },
    });

    this.logger.log(`Vehicle specs updated for vehicle ${vehicleId}`);
    return specs;
  }

  async getSpecs(vehicleId: string, organizationId: string) {
    await this.findOne(vehicleId, organizationId);

    const specs = await this.prisma.vehicleSpec.findUnique({
      where: { vehicleId },
    });

    if (!specs) {
      throw new NotFoundException(`Specs not found for vehicle ${vehicleId}`);
    }

    return specs;
  }

  // ──────────────────────────────────────────────
  // Stock Summary
  // ──────────────────────────────────────────────

  async getStockSummary(organizationId: string) {
    const [
      totalVehicles,
      availableCount,
      reservedCount,
      soldCount,
      inTransitCount,
      inCustomsCount,
    ] = await Promise.all([
      this.prisma.vehicle.count({ where: { organizationId } }),
      this.prisma.vehicle.count({
        where: { organizationId, status: 'available' },
      }),
      this.prisma.vehicle.count({
        where: { organizationId, status: 'reserved' },
      }),
      this.prisma.vehicle.count({ where: { organizationId, status: 'sold' } }),
      this.prisma.vehicle.count({
        where: { organizationId, status: 'inTransit' },
      }),
      this.prisma.vehicle.count({
        where: { organizationId, status: 'inCustoms' },
      }),
    ]);

    // Group by brand
    const byBrand = await this.prisma.vehicle.groupBy({
      by: ['brand'],
      where: { organizationId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // Group by acquisition type
    const byAcquisition = await this.prisma.vehicle.groupBy({
      by: ['acquisitionType'],
      where: { organizationId },
      _count: { id: true },
    });

    return {
      total: totalVehicles,
      byStatus: {
        available: availableCount,
        reserved: reservedCount,
        sold: soldCount,
        inTransit: inTransitCount,
        inCustoms: inCustomsCount,
      },
      byBrand: byBrand.map((b) => ({
        brand: b.brand,
        count: b._count.id,
      })),
      byAcquisitionType: byAcquisition.map((a) => ({
        type: a.acquisitionType,
        count: a._count.id,
      })),
    };
  }

  private async validateTenantRelations(
    transaction: Prisma.TransactionClient,
    dto: Pick<CreateVehicleDto, 'supplierId' | 'currentLocationId'>,
    organizationId: string,
  ): Promise<void> {
    if (dto.supplierId) {
      const supplier = await transaction.partner.findFirst({
        where: { id: dto.supplierId, organizationId, type: 'supplier' },
        select: { id: true },
      });
      if (!supplier) throw new NotFoundException('Supplier not found');
    }
    if (dto.currentLocationId) {
      const location = await transaction.warehouseLocation.findFirst({
        where: {
          id: dto.currentLocationId,
          warehouse: { organizationId },
        },
        select: { id: true },
      });
      if (!location)
        throw new NotFoundException('Warehouse location not found');
    }
  }
}
