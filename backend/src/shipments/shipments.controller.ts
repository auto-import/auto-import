import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  CreateShipmentDto,
  AddShipmentVehicleDto,
  CreateCustomsFromShipmentDto,
  FilterShipmentsDto,
  TransitionShipmentDto,
  UpdateShipmentDto,
} from './dto/shipments.dto';
import { ShipmentsService } from './shipments.service';

@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get()
  @RequirePermission(Permission.SHIPMENTS_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FilterShipmentsDto,
  ) {
    return this.shipments.findAll(user.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.SHIPMENTS_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.shipments.findOne(id, user.organizationId);
  }

  @Post()
  @RequirePermission(Permission.SHIPMENTS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateShipmentDto,
  ) {
    return this.shipments.create(user.organizationId, user.id, dto);
  }

  @Put(':id')
  @RequirePermission(Permission.SHIPMENTS_WRITE)
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateShipmentDto,
  ) {
    return this.shipments.update(id, user.organizationId, dto);
  }

  @Post(':id/transition')
  @RequirePermission(Permission.SHIPMENTS_TRANSITION)
  transition(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TransitionShipmentDto,
  ) {
    return this.shipments.transition(id, user.organizationId, user.id, dto);
  }

  @Post(':id/create-customs-files')
  @RequirePermission(Permission.CUSTOMS_AUTOMATE)
  createCustomsFiles(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomsFromShipmentDto,
  ) {
    return this.shipments.createCustomsFromShipment(
      id,
      user.organizationId,
      user.id,
      dto.responsibleUserId,
    );
  }

  @Post(':id/vehicles')
  @RequirePermission(Permission.SHIPMENTS_WRITE)
  addVehicle(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddShipmentVehicleDto,
  ) {
    return this.shipments.addVehicle(
      id,
      user.organizationId,
      user.id,
      dto,
    );
  }
}
