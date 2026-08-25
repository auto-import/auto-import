import {
  Injectable,
  NotFoundException,
  Logger,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { CreateWarehouseLocationDto } from './dto/create-warehouse-location.dto';
import {
  CreateStockMovementDto,
  StockMovementType,
} from './dto/create-stock-movement.dto';
import { UpdateWarehouseLocationDto } from './dto/update-warehouse-location.dto';

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
        organizationId,
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
    limit: number = 20,
    search?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.WarehouseWhereInput = { organizationId };
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

    return paginate(warehouses, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, organizationId },
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
    organizationId: string,
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

  async getLocations(warehouseId: string, organizationId: string) {
    await this.findOne(warehouseId, organizationId);

    return this.prisma.warehouseLocation.findMany({
      where: { warehouseId },
    });
  }

  async updateLocation(
    warehouseId: string,
    locationId: string,
    dto: UpdateWarehouseLocationDto,
    organizationId: string,
  ) {
    await this.findOne(warehouseId, organizationId);
    const location = await this.prisma.warehouseLocation.findFirst({
      where: { id: locationId, warehouseId },
    });
    if (!location) throw new NotFoundException('Warehouse location not found');
    return this.prisma.warehouseLocation.update({
      where: { id: locationId },
      data: dto,
    });
  }

  async removeLocation(
    warehouseId: string,
    locationId: string,
    organizationId: string,
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
    organizationId: string,
  ) {
    this.validateMovementShape(dto);

    return this.prisma.$transaction(
      async (transaction) => {
        const vehicle = await transaction.vehicle.findFirst({
          where: { id: dto.vehicleId, organizationId },
        });
        if (!vehicle) throw new NotFoundException('Vehicle not found');

        const locationIds = [dto.fromLocationId, dto.toLocationId].filter(
          (locationId): locationId is string => Boolean(locationId),
        );
        const locations = await transaction.warehouseLocation.findMany({
          where: {
            id: { in: locationIds },
            warehouse: { organizationId },
          },
          select: { id: true },
        });
        if (
          new Set(locations.map(({ id }) => id)).size !== locationIds.length
        ) {
          throw new NotFoundException('Warehouse location not found');
        }
        if (
          dto.fromLocationId &&
          vehicle.currentLocationId !== dto.fromLocationId
        ) {
          throw new ConflictException(
            'Vehicle is not currently in the source location',
          );
        }

        const { occurredAt, ...movementData } = dto;
        const movement = await transaction.stockMovement.create({
          data: {
            ...movementData,
            occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
            performedBy,
            organizationId,
          },
          include: {
            fromLocation: true,
            toLocation: true,
            vehicle: true,
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        });
        const nextLocationId =
          dto.type === StockMovementType.OUT ? null : dto.toLocationId;
        const updated = await transaction.vehicle.updateMany({
          where: {
            id: dto.vehicleId,
            organizationId,
            currentLocationId: vehicle.currentLocationId,
          },
          data: { currentLocationId: nextLocationId },
        });
        if (updated.count !== 1) {
          throw new ConflictException('Vehicle location changed concurrently');
        }
        return movement;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async getStockMovements(
    organizationId: string,
    vehicleId?: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {
      organizationId,
      ...(vehicleId ? { vehicleId } : {}),
    };

    const [movements, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        include: {
          fromLocation: true,
          toLocation: true,
          vehicle: true,
          user: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { occurredAt: 'desc' },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return paginate(movements, total, page, limit);
  }

  async getStockSummary(organizationId: string) {
    const [total, byWarehouse, unlocated] = await Promise.all([
      this.prisma.vehicle.count({
        where: { organizationId, archivedAt: null },
      }),
      this.prisma.warehouse.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          status: true,
          locations: {
            select: {
              id: true,
              code: true,
              name: true,
              _count: { select: { vehicles: true } },
            },
          },
        },
      }),
      this.prisma.vehicle.count({
        where: { organizationId, currentLocationId: null, archivedAt: null },
      }),
    ]);
    return { total, unlocated, warehouses: byWarehouse };
  }

  private validateMovementShape(dto: CreateStockMovementDto): void {
    if (dto.type === StockMovementType.IN && !dto.toLocationId) {
      throw new BadRequestException('An inbound movement needs a destination');
    }
    if (dto.type === StockMovementType.OUT && !dto.fromLocationId) {
      throw new BadRequestException('An outbound movement needs a source');
    }
    if (
      dto.type === StockMovementType.TRANSFER &&
      (!dto.fromLocationId ||
        !dto.toLocationId ||
        dto.fromLocationId === dto.toLocationId)
    ) {
      throw new BadRequestException(
        'A transfer needs different source and destination locations',
      );
    }
  }
}
