import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @RequirePermission('roles:manage')
  create(
    @Body() createRoleDto: CreateRoleDto,
    @CurrentUser() user: any,
  ) {
    return this.rolesService.create(createRoleDto, user.organizationId);
  }

  @Get()
  @RequirePermission('roles:manage')
  findAll(@CurrentUser() user: any) {
    return this.rolesService.findAll(user.organizationId);
  }

  @Get('permissions')
  @RequirePermission('roles:manage')
  findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  @Get(':id')
  @RequirePermission('roles:manage')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.rolesService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission('roles:manage')
  update(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @CurrentUser() user: any,
  ) {
    return this.rolesService.update(id, user.organizationId, updateRoleDto);
  }

  @Delete(':id')
  @RequirePermission('roles:manage')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.rolesService.remove(id, user.organizationId);
  }
}
