import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-status.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Permission } from '@auto-import/contracts';
import type { OrderFilters } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @RequirePermission(Permission.ORDERS_WRITE)
  create(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.create(
      createOrderDto,
      user.id,
      user.organizationId,
    );
  }

  @Get()
  @RequirePermission(Permission.ORDERS_READ)
  findAll(
    @Query() pagination: PaginationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters?: OrderFilters,
  ) {
    return this.ordersService.findAll(
      user.organizationId,
      pagination.page,
      pagination.limit,
      filters,
    );
  }

  @Get(':id')
  @RequirePermission(Permission.ORDERS_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.findOne(id, user.organizationId);
  }

  @Get(':id/history')
  @RequirePermission(Permission.ORDERS_READ)
  getHistory(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.getHistory(id, user.organizationId);
  }

  @Get(':id/reservations')
  @RequirePermission(Permission.ORDERS_READ)
  getReservations(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.getReservations(id, user.organizationId);
  }

  @Patch(':id/status')
  @RequirePermission(Permission.ORDERS_WRITE)
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.updateStatus(
      id,
      updateStatusDto,
      user.id,
      user.organizationId,
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.ORDERS_WRITE)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.remove(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission(Permission.ORDERS_WRITE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.update(id, dto, user.id, user.organizationId);
  }

  @Post('reservations/expire')
  @RequirePermission(Permission.ORDERS_WRITE)
  expireReservations(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.expireReservations(user.organizationId);
  }
}
