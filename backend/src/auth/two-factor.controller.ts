import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Permission } from '@auto-import/contracts';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from './auth.types';
import {
  ConfirmTwoFactorDto,
  DisableTwoFactorDto,
  ResetTwoFactorDto,
  StartTwoFactorDto,
} from './dto/two-factor.dto';
import { TwoFactorService } from './two-factor.service';

@Controller('auth/two-factor')
@UseGuards(ThrottlerGuard)
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}
  private metadata(request: Request) {
    return { ipAddress: request.ip, userAgent: request.get('user-agent') };
  }

  @Get('status')
  @Header('Cache-Control', 'no-store')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.twoFactor.status(user.id);
  }

  @Post('setup')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  setup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartTwoFactorDto,
    @Req() request: Request,
  ) {
    return this.twoFactor.startSetup(
      user.id,
      dto.currentPassword,
      this.metadata(request),
    );
  }

  @Post('enable')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  enable(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmTwoFactorDto,
    @Req() request: Request,
  ) {
    return this.twoFactor.confirmSetup(
      user.id,
      dto.code,
      this.metadata(request),
    );
  }

  @Post('disable')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  disable(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DisableTwoFactorDto,
    @Req() request: Request,
  ) {
    return this.twoFactor.disable(
      user.id,
      dto.currentPassword,
      dto.code,
      this.metadata(request),
    );
  }

  @Post('users/:id/reset')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermission(Permission.USERS_MANAGE)
  reset(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ResetTwoFactorDto,
    @Req() request: Request,
  ) {
    return this.twoFactor.adminReset(
      id,
      user,
      dto.currentPassword,
      dto.code,
      dto.reason,
      this.metadata(request),
    );
  }
}
