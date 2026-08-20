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

@Controller('vehicle-requests')
export class VehicleRequestsController {
  constructor(private readonly vehicleRequestsService: VehicleRequestsService) {}

  // ──────────────────────────────────────────────
  // Static routes FIRST (before :id params)
  // ──────────────────────────────────────────────

  @Get('statistics')
  @RequirePermission('vehicles:read')
  getStatistics(@CurrentUser() user: any) {
    return this.vehicleRequestsService.getStatistics(user.organizationId);
  }

  @Post('candidates')
  @RequirePermission('vehicles:write')
  addCandidate(@Body() dto: CreateCandidateDto, @CurrentUser() user: any) {
    return this.vehicleRequestsService.addCandidate(dto, user.organizationId);
  }

  @Patch('candidates/:id')
  @RequirePermission('vehicles:write')
  updateCandidate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateDto,
    @CurrentUser() user: any,
  ) {
    return this.vehicleRequestsService.updateCandidate(id, dto, user.organizationId);
  }

  @Post('candidates/:id/validate')
  @RequirePermission('dossiers:write')
  validateCandidate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.vehicleRequestsService.validateCandidate(id, user.organizationId);
  }

  @Post('candidates/:id/reject')
  @RequirePermission('vehicles:write')
  rejectCandidate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.vehicleRequestsService.rejectCandidate(id, user.organizationId);
  }

  // ──────────────────────────────────────────────
  // Vehicle Request CRUD
  // ──────────────────────────────────────────────

  @Post()
  @RequirePermission('dossiers:write')
  create(@Body() dto: CreateVehicleRequestDto, @CurrentUser() user: any) {
    return this.vehicleRequestsService.create(dto, user.organizationId);
  }

  @Get()
  @RequirePermission('vehicles:read')
  findAll(@Query() query: FilterVehicleRequestDto, @CurrentUser() user: any) {
    return this.vehicleRequestsService.findAll(
      user.organizationId,
      query.page,
      query.limit,
      query,
    );
  }

  @Get(':id')
  @RequirePermission('vehicles:read')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.vehicleRequestsService.findOne(id, user.organizationId);
  }

  @Get(':id/candidates')
  @RequirePermission('vehicles:read')
  getCandidates(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.vehicleRequestsService.getCandidates(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission('dossiers:write')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.vehicleRequestsService.update(id, user.organizationId, dto);
  }

  @Delete(':id')
  @RequirePermission('dossiers:write')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.vehicleRequestsService.remove(id, user.organizationId);
  }
}
