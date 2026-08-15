import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Put,
} from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { CreateVehicleSpecDto } from './dto/create-vehicle-spec.dto';
import { FilterVehicleDto } from './dto/filter-vehicle.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @RequirePermission('vehicles:write')
  create(@Body() createVehicleDto: CreateVehicleDto) {
    return this.vehiclesService.create(createVehicleDto);
  }

  @Get()
  @RequirePermission('vehicles:read')
  findAll(@Query() filters: FilterVehicleDto) {
    return this.vehiclesService.findAll(filters);
  }

  @Get('stock-summary')
  @RequirePermission('vehicles:read')
  getStockSummary() {
    return this.vehiclesService.getStockSummary();
  }

  @Get(':id')
  @RequirePermission('vehicles:read')
  findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('vehicles:write')
  update(
    @Param('id') id: string,
    @Body() updateVehicleDto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(id, updateVehicleDto);
  }

  @Delete(':id')
  @RequirePermission('vehicles:write')
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }

  // ──────────────────────────────────────────────
  // Vehicle Specs
  // ──────────────────────────────────────────────

  @Put(':id/specs')
  @RequirePermission('vehicles:write')
  upsertSpecs(
    @Param('id') id: string,
    @Body() specsDto: CreateVehicleSpecDto,
  ) {
    return this.vehiclesService.upsertSpecs(id, specsDto);
  }

  @Get(':id/specs')
  @RequirePermission('vehicles:read')
  getSpecs(@Param('id') id: string) {
    return this.vehiclesService.getSpecs(id);
  }
}
