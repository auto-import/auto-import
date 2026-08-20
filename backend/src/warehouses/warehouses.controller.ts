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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @RequirePermission('warehouses:write')
  create(@Body() createWarehouseDto: CreateWarehouseDto, @CurrentUser() user: any) {
    return this.warehousesService.create(createWarehouseDto, user.organizationId);
  }

  @Get()
  @RequirePermission('warehouses:read')
  findAll(@Query() pagination: PaginationDto, @CurrentUser() user: any) {
    return this.warehousesService.findAll(
      user.organizationId,
      pagination.page,
      pagination.limit,
      pagination.search,
    );
  }

  @Get(':id')
  @RequirePermission('warehouses:read')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.warehousesService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission('warehouses:write')
  update(
    @Param('id') id: string,
    @Body() updateWarehouseDto: UpdateWarehouseDto,
    @CurrentUser() user: any,
  ) {
    return this.warehousesService.update(id, user.organizationId, updateWarehouseDto);
  }

  @Delete(':id')
  @RequirePermission('warehouses:write')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.warehousesService.remove(id, user.organizationId);
  }

  // ──────────────────────────────────────────────
  // Warehouse Locations
  // ──────────────────────────────────────────────

  @Post(':id/locations')
  @RequirePermission('warehouses:write')
  addLocation(
    @Param('id') id: string,
    @Body() locationDto: CreateWarehouseLocationDto,
    @CurrentUser() user: any,
  ) {
    return this.warehousesService.addLocation(id, locationDto, user.organizationId);
  }

  @Get(':id/locations')
  @RequirePermission('warehouses:read')
  getLocations(@Param('id') id: string, @CurrentUser() user: any) {
    return this.warehousesService.getLocations(id, user.organizationId);
  }

  @Delete(':id/locations/:locationId')
  @RequirePermission('warehouses:write')
  removeLocation(
    @Param('id') id: string,
    @Param('locationId') locationId: string,
    @CurrentUser() user: any,
  ) {
    return this.warehousesService.removeLocation(id, locationId, user.organizationId);
  }

  // ──────────────────────────────────────────────
  // Stock Movements
  // ──────────────────────────────────────────────

  @Post('stock-movements')
  @RequirePermission('warehouses:write')
  createStockMovement(
    @Body() dto: CreateStockMovementDto,
    @CurrentUser() user: any,
  ) {
    return this.warehousesService.createStockMovement(dto, user.id, user.organizationId);
  }

  @Get('stock-movements')
  @RequirePermission('warehouses:read')
  getStockMovements(@Query() filterDto: FilterStockMovementDto, @CurrentUser() user: any) {
    return this.warehousesService.getStockMovements(
      filterDto.vehicleId,
      filterDto.page,
      filterDto.limit,
      user.organizationId,
    );
  }
}
