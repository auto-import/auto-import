import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  CreateCustomsFileDto,
  FilterCustomsFilesDto,
  TransitionCustomsFileDto,
  UpdateCustomsFileDto,
} from './dto/customs.dto';
import { CustomsService } from './customs.service';

@Controller('customs')
export class CustomsController {
  constructor(private readonly customs: CustomsService) {}

  @Get()
  @RequirePermission(Permission.CUSTOMS_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FilterCustomsFilesDto,
  ) {
    return this.customs.findAll(user.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.CUSTOMS_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.customs.findOne(id, user.organizationId);
  }

  @Post()
  @RequirePermission(Permission.CUSTOMS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomsFileDto,
  ) {
    return this.customs.create(user.organizationId, user.id, dto);
  }

  @Put(':id')
  @RequirePermission(Permission.CUSTOMS_WRITE)
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCustomsFileDto,
  ) {
    return this.customs.update(id, user.organizationId, dto);
  }

  @Post(':id/transition')
  @RequirePermission(Permission.CUSTOMS_TRANSITION)
  transition(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TransitionCustomsFileDto,
  ) {
    return this.customs.transition(id, user.organizationId, user.id, dto);
  }
}
