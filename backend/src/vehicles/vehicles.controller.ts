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
import { Permission } from '@auto-import/contracts';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { CreateVehicleSpecDto } from './dto/create-vehicle-spec.dto';
import { FilterVehicleDto } from './dto/filter-vehicle.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @RequirePermission(Permission.VEHICLES_WRITE)
  create(
    @Body() createVehicleDto: CreateVehicleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.create(createVehicleDto, user.organizationId);
  }

  @Get()
  @RequirePermission(Permission.VEHICLES_READ)
  findAll(
    @Query() filters: FilterVehicleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.findAll(user.organizationId, filters);
  }

  @Get('stock-summary')
  @RequirePermission(Permission.VEHICLES_READ)
  getStockSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.getStockSummary(user.organizationId);
  }

  @Get(':id')
  @RequirePermission(Permission.VEHICLES_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission(Permission.VEHICLES_WRITE)
  update(
    @Param('id') id: string,
    @Body() updateVehicleDto: UpdateVehicleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.update(
      id,
      user.organizationId,
      updateVehicleDto,
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.VEHICLES_WRITE)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.remove(id, user.organizationId);
  }

  // ──────────────────────────────────────────────
  // Vehicle Specs
  // ──────────────────────────────────────────────

  @Put(':id/specs')
  @RequirePermission(Permission.VEHICLES_WRITE)
  upsertSpecs(
    @Param('id') id: string,
    @Body() specsDto: CreateVehicleSpecDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.upsertSpecs(id, specsDto, user.organizationId);
  }

  @Get(':id/specs')
  @RequirePermission(Permission.VEHICLES_READ)
  getSpecs(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.getSpecs(id, user.organizationId);
  }
}
