import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { VehicleRequestsService } from './vehicle-requests.service';
import { CreateVehicleRequestDto } from './dto/create-request.dto';
import { UpdateVehicleRequestDto } from './dto/update-request.dto';
import { FilterVehicleRequestDto } from './dto/filter-request.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permission } from '@auto-import/contracts';
import { ConfirmPurchaseDto } from './dto/confirm-purchase.dto';
import type { AuthenticatedUser } from '../auth/auth.types';

@Controller('vehicle-requests')
export class VehicleRequestsController {
  constructor(
    private readonly vehicleRequestsService: VehicleRequestsService,
  ) {}

  // ──────────────────────────────────────────────
  // Static routes FIRST (before :id params)
  // ──────────────────────────────────────────────

  @Get('statistics')
  @RequirePermission(Permission.VEHICLE_REQUESTS_READ)
  getStatistics(@CurrentUser() user: AuthenticatedUser) {
    return this.vehicleRequestsService.getStatistics(user.organizationId);
  }

  @Post('candidates')
  @RequirePermission(Permission.VEHICLE_REQUESTS_WRITE)
  addCandidate(
    @Body() dto: CreateCandidateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicleRequestsService.addCandidate(dto, user.organizationId);
  }

  @Patch('candidates/:id')
  @RequirePermission(Permission.VEHICLE_REQUESTS_WRITE)
  updateCandidate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicleRequestsService.updateCandidate(
      id,
      dto,
      user.organizationId,
    );
  }

  @Post('candidates/:id/validate')
  @RequirePermission(Permission.VEHICLE_REQUESTS_WRITE)
  validateCandidate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicleRequestsService.validateCandidate(
      id,
      user.organizationId,
      user.id,
    );
  }

  @Post('candidates/:id/reject')
  @RequirePermission(Permission.VEHICLE_REQUESTS_WRITE)
  rejectCandidate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicleRequestsService.rejectCandidate(id, user.organizationId);
  }

  @Post(':id/confirm-purchase')
  @RequirePermission(Permission.VEHICLE_REQUESTS_WRITE)
  confirmPurchase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmPurchaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicleRequestsService.confirmPurchase(
      id,
      dto,
      user.organizationId,
      user.id,
    );
  }

  // ──────────────────────────────────────────────
  // Vehicle Request CRUD
  // ──────────────────────────────────────────────

  @Post()
  @RequirePermission(Permission.VEHICLE_REQUESTS_WRITE)
  create(
    @Body() dto: CreateVehicleRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicleRequestsService.create(dto, user.organizationId);
  }

  @Get()
  @RequirePermission(Permission.VEHICLE_REQUESTS_READ)
  findAll(
    @Query() query: FilterVehicleRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicleRequestsService.findAll(
      user.organizationId,
      query.page,
      query.limit,
      query,
    );
  }

  @Get(':id')
  @RequirePermission(Permission.VEHICLE_REQUESTS_READ)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicleRequestsService.findOne(id, user.organizationId);
  }

  @Get(':id/candidates')
  @RequirePermission(Permission.VEHICLE_REQUESTS_READ)
  getCandidates(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicleRequestsService.getCandidates(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission(Permission.VEHICLE_REQUESTS_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicleRequestsService.update(id, user.organizationId, dto);
  }

  @Delete(':id')
  @RequirePermission(Permission.VEHICLE_REQUESTS_WRITE)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicleRequestsService.remove(id, user.organizationId);
  }
}
