import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { CreateVehicleSpecDto } from './dto/create-vehicle-spec.dto';
import { FilterVehicleDto } from './dto/filter-vehicle.dto';

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(private prisma: PrismaService) {}

  async create(createVehicleDto: CreateVehicleDto, organizationId: string) {
    // Check VIN uniqueness if provided
    if (createVehicleDto.vin) {
      const existing = await this.prisma.vehicle.findUnique({
        where: { vin: createVehicleDto.vin },
      });
      if (existing) {
        throw new ConflictException(
          `Vehicle with VIN ${createVehicleDto.vin} already exists`,
        );
      }
    }

    const vehicle = await this.prisma.vehicle.create({
      data: {
        ...createVehicleDto,
        organizationId,
      },
      include: {
        specs: true,
        photos: true,
      },
    });

    this.logger.log(
      `Vehicle created: ${vehicle.brand} ${vehicle.model} (${vehicle.id})`,
    );
    return vehicle;
  }

  async findAll(organizationId: string, filters: FilterVehicleDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

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

    const [vehicles, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        include: {
          specs: true,
          photos: {
            include: { file: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return {
      items: vehicles,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, organizationId?: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, ...(organizationId && { organizationId }) },
      include: {
        specs: true,
        photos: {
          include: { file: true },
          orderBy: { sortOrder: 'asc' },
        },
        dossierVehicles: {
          where: organizationId ? { dossier: { organizationId } } : undefined,
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
          where: organizationId
            ? { vehicleRequest: { organizationId } }
            : undefined,
          select: {
            id: true,
            vehicleRequestId: true,
            status: true,
            proposedPrice: true,
          },
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
    await this.findOne(id, organizationId);

    // Check VIN uniqueness if updating
    if (updateVehicleDto.vin) {
      const existing = await this.prisma.vehicle.findFirst({
        where: {
          vin: updateVehicleDto.vin,
          NOT: { id },
        },
      });
      if (existing) {
        throw new ConflictException(
          `Vehicle with VIN ${updateVehicleDto.vin} already exists`,
        );
      }
    }

    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: updateVehicleDto,
      include: {
        specs: true,
        photos: true,
      },
    });

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
        dv.dossier.status !== 'cloture' &&
        dv.dossier.status !== 'service_termine' &&
        dv.dossier.status !== 'annule',
    );
    if (activeDossiers && activeDossiers.length > 0) {
      throw new ConflictException('Cannot delete vehicle with active dossiers');
    }

    await this.prisma.vehicle.delete({ where: { id } });

    this.logger.log(`Vehicle deleted: ${id}`);
    return { message: 'Vehicle deleted successfully' };
  }

  // ──────────────────────────────────────────────
  // Vehicle Specs
  // ──────────────────────────────────────────────

  async upsertSpecs(
    vehicleId: string,
    specsDto: CreateVehicleSpecDto,
    organizationId?: string,
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

  async getSpecs(vehicleId: string, organizationId?: string) {
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
        where: { organizationId, status: 'in_transit' },
      }),
      this.prisma.vehicle.count({
        where: { organizationId, status: 'in_customs' },
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
        in_transit: inTransitCount,
        in_customs: inCustomsCount,
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
}
