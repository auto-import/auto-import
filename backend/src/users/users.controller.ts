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
import { Permission } from '@auto-import/contracts';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FilterUsersDto } from './dto/filter-users.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { SetUserStatusDto } from './dto/set-user-status.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermission(Permission.USERS_WRITE)
  create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.create(createUserDto, user.organizationId, user);
  }

  @Get()
  @RequirePermission(Permission.USERS_READ)
  findAll(
    @Query() filters: FilterUsersDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.findAll(user.organizationId, filters);
  }

  @Get(':id')
  @RequirePermission(Permission.USERS_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission(Permission.USERS_WRITE)
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.update(
      id,
      user.organizationId,
      updateUserDto,
      user,
    );
  }

  @Patch(':id/password')
  @RequirePermission(Permission.USERS_MANAGE)
  updatePassword(
    @Param('id') id: string,
    @Body() dto: SetPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.updatePassword(
      id,
      user.organizationId,
      dto.password,
    );
  }

  @Patch(':id/status')
  @RequirePermission(Permission.USERS_WRITE)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: SetUserStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.update(id, user.organizationId, dto, user);
  }

  @Delete(':id')
  @RequirePermission(Permission.USERS_MANAGE)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.remove(id, user.organizationId, user.id);
  }
}
