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
  getStatistics() {
    return this.vehicleRequestsService.getStatistics();
  }

  @Post('candidates')
  @RequirePermission('vehicles:write')
  addCandidate(@Body() dto: CreateCandidateDto) {
    return this.vehicleRequestsService.addCandidate(dto);
  }

  @Patch('candidates/:id')
  @RequirePermission('vehicles:write')
  updateCandidate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateDto,
  ) {
    return this.vehicleRequestsService.updateCandidate(id, dto);
  }

  @Post('candidates/:id/validate')
  @RequirePermission('dossiers:write')
  validateCandidate(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicleRequestsService.validateCandidate(id);
  }

  @Post('candidates/:id/reject')
  @RequirePermission('vehicles:write')
  rejectCandidate(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicleRequestsService.rejectCandidate(id);
  }

  // ──────────────────────────────────────────────
  // Vehicle Request CRUD
  // ──────────────────────────────────────────────

  @Post()
  @RequirePermission('dossiers:write')
  create(@Body() dto: CreateVehicleRequestDto) {
    return this.vehicleRequestsService.create(dto);
  }

  @Get()
  @RequirePermission('vehicles:read')
  findAll(@Query() query: FilterVehicleRequestDto) {
    return this.vehicleRequestsService.findAll(
      query.page,
      query.limit,
      query,
    );
  }

  @Get(':id')
  @RequirePermission('vehicles:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicleRequestsService.findOne(id);
  }

  @Get(':id/candidates')
  @RequirePermission('vehicles:read')
  getCandidates(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicleRequestsService.getCandidates(id);
  }

  @Patch(':id')
  @RequirePermission('dossiers:write')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleRequestDto,
  ) {
    return this.vehicleRequestsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('dossiers:write')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicleRequestsService.remove(id);
  }
}
