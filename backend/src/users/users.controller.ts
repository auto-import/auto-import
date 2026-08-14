import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermission('users:manage')
  create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() user: any,
  ) {
    return this.usersService.create(createUserDto, user.organizationId);
  }

  @Get()
  @RequirePermission('users:manage')
  findAll(
    @Query() pagination: PaginationDto,
    @CurrentUser() user: any,
  ) {
    return this.usersService.findAll(
      user.organizationId,
      pagination.page,
      pagination.limit,
    );
  }

  @Get(':id')
  @RequirePermission('users:manage')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.usersService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermission('users:manage')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: any,
  ) {
    return this.usersService.update(id, user.organizationId, updateUserDto);
  }

  @Patch(':id/password')
  @RequirePermission('users:manage')
  updatePassword(
    @Param('id') id: string,
    @Body('password') password: string,
    @CurrentUser() user: any,
  ) {
    return this.usersService.updatePassword(id, user.organizationId, password);
  }

  @Delete(':id')
  @RequirePermission('users:manage')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.usersService.remove(id, user.organizationId);
  }
}
