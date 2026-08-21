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
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @RequirePermission('vehicles:write')
  create(@Body() createVehicleDto: CreateVehicleDto, @CurrentUser() user: any) {
    return this.vehiclesService.create(createVehicleDto, user.organizationId);
  }

  @Get()
  @RequirePermission('vehicles:read')
  findAll(@Query() filters: FilterVehicleDto, @CurrentUser() user: any) {
    return this.vehiclesService.findAll(user.organizationId, filters);
  }

  @Get('stock-summary')
  @RequirePermission('vehicles:read')
  getStockSummary(@CurrentUser() user: any) {
    return this.vehiclesService.getStockSummary(user.organizationId);
  }

  @Get(':id')
  @RequirePermission('vehicles:read')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.vehiclesService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission('vehicles:write')
  update(
    @Param('id') id: string,
    @Body() updateVehicleDto: UpdateVehicleDto,
    @CurrentUser() user: any,
  ) {
    return this.vehiclesService.update(
      id,
      user.organizationId,
      updateVehicleDto,
    );
  }

  @Delete(':id')
  @RequirePermission('vehicles:write')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.vehiclesService.remove(id, user.organizationId);
  }

  // ──────────────────────────────────────────────
  // Vehicle Specs
  // ──────────────────────────────────────────────

  @Put(':id/specs')
  @RequirePermission('vehicles:write')
  upsertSpecs(
    @Param('id') id: string,
    @Body() specsDto: CreateVehicleSpecDto,
    @CurrentUser() user: any,
  ) {
    return this.vehiclesService.upsertSpecs(id, specsDto, user.organizationId);
  }

  @Get(':id/specs')
  @RequirePermission('vehicles:read')
  getSpecs(@Param('id') id: string, @CurrentUser() user: any) {
    return this.vehiclesService.getSpecs(id, user.organizationId);
  }
}
