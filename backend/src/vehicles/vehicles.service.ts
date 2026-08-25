import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { CreateVehicleSpecDto } from './dto/create-vehicle-spec.dto';
import { FilterVehicleDto } from './dto/filter-vehicle.dto';
import { paginate } from '../common/helpers/pagination.helper';

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(private prisma: PrismaService) {}

  async create(createVehicleDto: CreateVehicleDto, organizationId: string) {
    if (!createVehicleDto.vin && createVehicleDto.status !== 'prePurchase') {
      throw new ConflictException(
        'VIN is required outside the pre-purchase state',
      );
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
          data: { ...createVehicleDto, organizationId },
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
  ) {
    const vehicle = await this.prisma.$transaction(
      async (transaction) => {
        const existingVehicle = await transaction.vehicle.findFirst({
          where: { id, organizationId },
        });
        if (!existingVehicle) throw new NotFoundException('Vehicle not found');
        const nextStatus = updateVehicleDto.status ?? existingVehicle.status;
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
          data: updateVehicleDto,
          include: { specs: true, photos: true },
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
