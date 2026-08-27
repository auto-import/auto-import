import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @RequirePermission(Permission.ROLES_MANAGE)
  create(
    @Body() createRoleDto: CreateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rolesService.create(createRoleDto, user.organizationId, user);
  }

  @Get()
  @RequirePermission(Permission.ROLES_READ)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.rolesService.findAll(user.organizationId);
  }

  @Get('permissions')
  @RequirePermission(Permission.ROLES_READ)
  findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  @Get(':id')
  @RequirePermission(Permission.ROLES_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rolesService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission(Permission.ROLES_MANAGE)
  update(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rolesService.update(
      id,
      user.organizationId,
      updateRoleDto,
      user,
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.ROLES_MANAGE)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rolesService.remove(id, user.organizationId);
  }
}
