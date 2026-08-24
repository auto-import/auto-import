import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OfficesService } from './offices.service';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';
import { FilterOfficeDto } from './dto/filter-office.dto';

@Controller('offices')
export class OfficesController {
  constructor(private readonly officesService: OfficesService) {}

  @Post()
  @RequirePermission(Permission.OFFICES_WRITE)
  create(@Body() dto: CreateOfficeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.officesService.create(dto, user.organizationId);
  }

  @Get()
  @RequirePermission(Permission.OFFICES_READ)
  findAll(
    @Query() filters: FilterOfficeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.officesService.findAll(user.organizationId, filters);
  }

  @Get('lookup')
  @RequirePermission(Permission.OFFICES_READ)
  lookup(@CurrentUser() user: AuthenticatedUser) {
    return this.officesService.lookup(user.organizationId);
  }

  @Get(':id')
  @RequirePermission(Permission.OFFICES_READ)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.officesService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission(Permission.OFFICES_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOfficeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.officesService.update(id, user.organizationId, dto);
  }

  @Delete(':id')
  @RequirePermission(Permission.OFFICES_WRITE)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.officesService.remove(id, user.organizationId);
  }
}
