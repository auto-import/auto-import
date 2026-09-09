import { Body, Controller, Get, Post } from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CreatePortDto } from './dto/shipments.dto';
import { PortsService } from './ports.service';

@Controller('ports')
export class PortsController {
  constructor(private readonly ports: PortsService) {}

  @Get()
  @RequirePermission(Permission.SHIPMENTS_READ)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.ports.list(user.organizationId);
  }

  @Post()
  @RequirePermission(Permission.SHIPMENTS_WRITE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePortDto) {
    return this.ports.create(user.organizationId, user.id, dto);
  }
}
