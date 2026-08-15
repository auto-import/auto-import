import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-status.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @RequirePermission('orders:write')
  create(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.create(createOrderDto, user.id);
  }

  @Get()
  @RequirePermission('orders:read')
  findAll(
    @Query() pagination: PaginationDto,
    @Query() filters?: any,
  ) {
    return this.ordersService.findAll(
      pagination.page,
      pagination.limit,
      filters,
    );
  }

  @Get(':id')
  @RequirePermission('orders:read')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Get(':id/history')
  @RequirePermission('orders:read')
  getHistory(@Param('id') id: string) {
    return this.ordersService.getHistory(id);
  }

  @Get(':id/reservations')
  @RequirePermission('orders:read')
  getReservations(@Param('id') id: string) {
    return this.ordersService.getReservations(id);
  }

  @Patch(':id/status')
  @RequirePermission('orders:write')
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateOrderStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.updateStatus(id, updateStatusDto, user.id);
  }

  @Delete(':id')
  @RequirePermission('orders:write')
  remove(@Param('id') id: string) {
    return this.ordersService.remove(id);
  }
}
