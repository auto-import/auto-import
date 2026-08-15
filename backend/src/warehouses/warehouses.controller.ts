import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
} from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { CreateWarehouseLocationDto } from './dto/create-warehouse-location.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { FilterStockMovementDto } from './dto/filter-stock-movement.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @RequirePermission('warehouses:write')
  create(@Body() createWarehouseDto: CreateWarehouseDto) {
    return this.warehousesService.create(createWarehouseDto);
  }

  @Get()
  @RequirePermission('warehouses:read')
  findAll(@Query() pagination: PaginationDto) {
    return this.warehousesService.findAll(
      pagination.page,
      pagination.limit,
      pagination.search,
    );
  }

  @Get(':id')
  @RequirePermission('warehouses:read')
  findOne(@Param('id') id: string) {
    return this.warehousesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('warehouses:write')
  update(
    @Param('id') id: string,
    @Body() updateWarehouseDto: UpdateWarehouseDto,
  ) {
    return this.warehousesService.update(id, updateWarehouseDto);
  }

  @Delete(':id')
  @RequirePermission('warehouses:write')
  remove(@Param('id') id: string) {
    return this.warehousesService.remove(id);
  }

  // ──────────────────────────────────────────────
  // Warehouse Locations
  // ──────────────────────────────────────────────

  @Post(':id/locations')
  @RequirePermission('warehouses:write')
  addLocation(
    @Param('id') id: string,
    @Body() locationDto: CreateWarehouseLocationDto,
  ) {
    return this.warehousesService.addLocation(id, locationDto);
  }

  @Get(':id/locations')
  @RequirePermission('warehouses:read')
  getLocations(@Param('id') id: string) {
    return this.warehousesService.getLocations(id);
  }

  @Delete(':warehouseId/locations/:locationId')
  @RequirePermission('warehouses:write')
  removeLocation(
    @Param('warehouseId') warehouseId: string,
    @Param('locationId') locationId: string,
  ) {
    return this.warehousesService.removeLocation(warehouseId, locationId);
  }

  // ──────────────────────────────────────────────
  // Stock Movements
  // ──────────────────────────────────────────────

  @Post('stock-movements')
  @RequirePermission('warehouses:write')
  createStockMovement(
    @Body() dto: CreateStockMovementDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub || 'system';
    return this.warehousesService.createStockMovement(dto, userId);
  }

  @Get('stock-movements/history')
  @RequirePermission('warehouses:read')
  getStockMovements(
    @Query() filter: FilterStockMovementDto,
  ) {
    return this.warehousesService.getStockMovements(
      filter.vehicleId,
      filter.page,
      filter.limit,
    );
  }
}
