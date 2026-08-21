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

@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Post()
  @RequirePermission('vehicles:write')
  create(@Body() dto: CreatePartnerDto, @CurrentUser() user: any) {
    return this.partnersService.create(dto, user.organizationId);
  }

  @Get()
  @RequirePermission('vehicles:read')
  findAll(@Query() query: FilterPartnerDto, @CurrentUser() user: any) {
    return this.partnersService.findAll(user.organizationId, query);
  }

  @Get(':id')
  @RequirePermission('vehicles:read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.partnersService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission('vehicles:write')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartnerDto,
    @CurrentUser() user: any,
  ) {
    return this.partnersService.update(id, user.organizationId, dto);
  }

  @Delete(':id')
  @RequirePermission('vehicles:write')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.partnersService.remove(id, user.organizationId);
  }
}
