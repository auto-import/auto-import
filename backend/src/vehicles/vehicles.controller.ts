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
  BadRequestException,
  UploadedFiles,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Permission } from '@auto-import/contracts';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { CreateVehicleSpecDto } from './dto/create-vehicle-spec.dto';
import { FilterVehicleDto } from './dto/filter-vehicle.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { UploadedBufferFile } from '../documents/documents.service';
import { EligibleVehiclesDto } from './dto/eligible-vehicles.dto';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @RequirePermission(Permission.VEHICLES_WRITE)
  create(@Body() _createVehicleDto: CreateVehicleDto) {
    void _createVehicleDto;
    throw new BadRequestException(
      'Vehicle creation requires exactly three photos; use /vehicles/with-photos',
    );
  }

  @Post('with-photos')
  @RequirePermission(Permission.VEHICLES_WRITE)
  @UseInterceptors(
    FilesInterceptor('photos', 3, {
      limits: { files: 3, fileSize: 8 * 1024 * 1024 },
    }),
  )
  createWithPhotos(
    @Body() dto: CreateVehicleDto,
    @UploadedFiles() photos: UploadedBufferFile[],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.createWithPhotos(
      dto,
      user.organizationId,
      user.id,
      photos ?? [],
    );
  }

  @Put(':id/photos')
  @RequirePermission(Permission.VEHICLES_WRITE)
  @UseInterceptors(
    FilesInterceptor('photos', 3, {
      limits: { files: 3, fileSize: 8 * 1024 * 1024 },
    }),
  )
  replacePhotos(
    @Param('id') id: string,
    @UploadedFiles() photos: UploadedBufferFile[],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.replacePhotos(
      id,
      user.organizationId,
      user.id,
      photos ?? [],
    );
  }

  @Get('photos/:photoId')
  @RequirePermission(Permission.VEHICLES_READ)
  async photo(
    @Param('photoId') photoId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.vehiclesService.photoStream(
      photoId,
      user.organizationId,
    );
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', file.size);
    response.setHeader('Cache-Control', 'private, max-age=300');
    file.stream.pipe(response);
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

  @Get('eligible-for-dossier')
  @RequirePermission(Permission.VEHICLES_READ)
  eligible(
    @Query() query: EligibleVehiclesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.eligibleForDossier(user.organizationId, query);
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
      user.id,
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
