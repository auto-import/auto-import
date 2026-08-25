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
import { PartnersService } from './partners.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { FilterPartnerDto } from './dto/filter-partner.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';

@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Post()
  @RequirePermission(Permission.PARTNERS_WRITE)
  create(
    @Body() dto: CreatePartnerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.create(dto, user.organizationId);
  }

  @Get()
  @RequirePermission(Permission.PARTNERS_READ)
  findAll(
    @Query() query: FilterPartnerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.findAll(user.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.PARTNERS_READ)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission(Permission.PARTNERS_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartnerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.update(id, user.organizationId, dto);
  }

  @Delete(':id')
  @RequirePermission(Permission.PARTNERS_WRITE)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.partnersService.remove(id, user.organizationId);
  }
}
