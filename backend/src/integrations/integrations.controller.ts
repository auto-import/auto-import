import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { UpdateIntegrationDto } from './dto/integration.dto';
import { IntegrationsService } from './integrations.service';

@Controller('settings/integrations')
@RequirePermission(Permission.SETTINGS_INTEGRATIONS_MANAGE)
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.integrations.list(user);
  }

  @Put()
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateIntegrationDto,
  ) {
    return this.integrations.save(user, dto);
  }

  @Delete(':kind/credentials')
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('kind') kind: string) {
    return this.integrations.revoke(user, kind);
  }

  @Post(':kind/test')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  test(@CurrentUser() user: AuthenticatedUser, @Param('kind') kind: string) {
    return this.integrations.test(user, kind);
  }
}
