import {
  Injectable,
  NotFoundException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { CreateWarehouseLocationDto } from './dto/create-warehouse-location.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';

@Injectable()
export class WarehousesService {
  private readonly logger = new Logger(WarehousesService.name);

  constructor(private prisma: PrismaService) {}

  // ──────────────────────────────────────────────
  // Warehouse CRUD
  // ──────────────────────────────────────────────

  async create(createWarehouseDto: CreateWarehouseDto, organizationId: string) {
    const warehouse = await this.prisma.warehouse.create({
      data: {
        ...createWarehouseDto,
        organizationId: createWarehouseDto.organizationId || organizationId,
      },
      include: {
        locations: true,
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    this.logger.log(`Warehouse created: ${warehouse.name} (${warehouse.id})`);
    return warehouse;
  }

  async findAll(
    organizationId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = { organizationId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { country: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [warehouses, total] = await Promise.all([
      this.prisma.warehouse.findMany({
        where,
        skip,
        take: limit,
        include: {
          locations: true,
          organization: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.warehouse.count({ where }),
    ]);

    return {
      items: warehouses,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, organizationId?: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, ...(organizationId && { organizationId }) },
      include: {
        locations: true,
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID ${id} not found`);
    }

    return warehouse;
  }

  async update(
    id: string,
    organizationId: string,
    updateWarehouseDto: UpdateWarehouseDto,
  ) {
    await this.findOne(id, organizationId);

    const warehouse = await this.prisma.warehouse.update({
      where: { id },
      data: updateWarehouseDto,
      include: {
        locations: true,
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    this.logger.log(`Warehouse updated: ${warehouse.name} (${id})`);
    return warehouse;
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    // Check if warehouse has locations
    const locations = await this.prisma.warehouseLocation.count({
      where: { warehouseId: id },
    });

    if (locations > 0) {
      throw new ConflictException(
        'Cannot delete warehouse with existing locations. Remove locations first.',
      );
    }

    await this.prisma.warehouse.delete({ where: { id } });

    this.logger.log(`Warehouse deleted: ${id}`);
    return { message: 'Warehouse deleted successfully' };
  }

  // ──────────────────────────────────────────────
  // Warehouse Locations
  // ──────────────────────────────────────────────

  async addLocation(
    warehouseId: string,
    locationDto: CreateWarehouseLocationDto,
    organizationId?: string,
  ) {
    await this.findOne(warehouseId, organizationId);

    const location = await this.prisma.warehouseLocation.create({
      data: {
        warehouseId,
        ...locationDto,
      },
    });

    this.logger.log(
      `Location added to warehouse ${warehouseId}: ${location.code}`,
    );
    return location;
  }

  async getLocations(warehouseId: string, organizationId?: string) {
    await this.findOne(warehouseId, organizationId);

    return this.prisma.warehouseLocation.findMany({
      where: { warehouseId },
    });
  }

  async removeLocation(
    warehouseId: string,
    locationId: string,
    organizationId?: string,
  ) {
    await this.findOne(warehouseId, organizationId);

    const location = await this.prisma.warehouseLocation.findFirst({
      where: { id: locationId, warehouseId },
    });

    if (!location) {
      throw new NotFoundException(
        `Location ${locationId} not found in warehouse ${warehouseId}`,
      );
    }

    await this.prisma.warehouseLocation.delete({
      where: { id: locationId },
    });

    this.logger.log(
      `Location removed: ${locationId} from warehouse ${warehouseId}`,
    );
    return { message: 'Location deleted successfully' };
  }

  // ──────────────────────────────────────────────
  // Stock Movements
  // ──────────────────────────────────────────────

  async createStockMovement(
    dto: CreateStockMovementDto,
    performedBy: string,
    organizationId?: string,
  ) {
    // Verify vehicle exists in same organization if organizationId provided
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, ...(organizationId && { organizationId }) },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${dto.vehicleId} not found`);
    }

    // Create the movement record
    const movement = await this.prisma.stockMovement.create({
      data: {
        ...dto,
        performedBy,
      },
    });

    // Update vehicle's current location if "in" or "transfer"
    if (dto.toLocationId && (dto.type === 'in' || dto.type === 'transfer')) {
      await this.prisma.vehicle.update({
        where: { id: dto.vehicleId },
        data: { currentLocationId: dto.toLocationId },
      });
    }

    // If type is "out", clear the location
    if (dto.type === 'out') {
      await this.prisma.vehicle.update({
        where: { id: dto.vehicleId },
        data: { currentLocationId: null },
      });
    }

    this.logger.log(
      `Stock movement created: ${movement.type} for vehicle ${dto.vehicleId}`,
    );
    return movement;
  }

  async getStockMovements(
    vehicleId?: string,
    page: number = 1,
    limit: number = 10,
    organizationId?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (vehicleId) {
      where.vehicleId = vehicleId;
    }

    const [movements, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      items: movements,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
