import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { CreateWarehouseLocationDto } from './dto/create-warehouse-location.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { FilterStockMovementDto } from './dto/filter-stock-movement.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../auth/auth.types';

@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @RequirePermission(Permission.WAREHOUSES_WRITE)
  create(
    @Body() createWarehouseDto: CreateWarehouseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.warehousesService.create(
      createWarehouseDto,
      user.organizationId,
    );
  }

  @Get()
  @RequirePermission(Permission.WAREHOUSES_READ)
  findAll(
    @Query() pagination: PaginationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.warehousesService.findAll(
      user.organizationId,
      pagination.page,
      pagination.limit,
      pagination.search,
    );
  }

  @Get(':id')
  @RequirePermission(Permission.WAREHOUSES_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.warehousesService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission(Permission.WAREHOUSES_WRITE)
  update(
    @Param('id') id: string,
    @Body() updateWarehouseDto: UpdateWarehouseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.warehousesService.update(
      id,
      user.organizationId,
      updateWarehouseDto,
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.WAREHOUSES_WRITE)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.warehousesService.remove(id, user.organizationId);
  }

  // ──────────────────────────────────────────────
  // Warehouse Locations
  // ──────────────────────────────────────────────

  @Post(':id/locations')
  @RequirePermission(Permission.WAREHOUSES_WRITE)
  addLocation(
    @Param('id') id: string,
    @Body() locationDto: CreateWarehouseLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.warehousesService.addLocation(
      id,
      locationDto,
      user.organizationId,
    );
  }

  @Get(':id/locations')
  @RequirePermission(Permission.WAREHOUSES_READ)
  getLocations(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.warehousesService.getLocations(id, user.organizationId);
  }

  @Delete(':id/locations/:locationId')
  @RequirePermission(Permission.WAREHOUSES_WRITE)
  removeLocation(
    @Param('id') id: string,
    @Param('locationId') locationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.warehousesService.removeLocation(
      id,
      locationId,
      user.organizationId,
    );
  }

  // ──────────────────────────────────────────────
  // Stock Movements
  // ──────────────────────────────────────────────

  @Post('stock-movements')
  @RequirePermission(Permission.WAREHOUSES_WRITE)
  createStockMovement(
    @Body() dto: CreateStockMovementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.warehousesService.createStockMovement(
      dto,
      user.id,
      user.organizationId,
    );
  }

  @Get('stock-movements')
  @RequirePermission(Permission.WAREHOUSES_READ)
  getStockMovements(
    @Query() filterDto: FilterStockMovementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.warehousesService.getStockMovements(
      user.organizationId,
      filterDto.vehicleId,
      filterDto.page,
      filterDto.limit,
    );
  }
}
