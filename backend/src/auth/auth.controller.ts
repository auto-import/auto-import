import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from './auth.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '@auto-import/contracts';

const REFRESH_COOKIE = 'auto_import_refresh';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    const result = await this.authService.login(
      user,
      this.sessionMetadata(request),
    );
    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshExpiresAt,
    );
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertTrustedOrigin(request);
    const result = await this.authService.refreshToken(
      this.readRefreshCookie(request),
      this.sessionMetadata(request),
    );
    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshExpiresAt,
    );
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Get('session')
  async session(@Req() request: Request) {
    return {
      authenticated: await this.authService.hasValidSession(
        this.readRefreshCookie(request),
      ),
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertTrustedOrigin(request);
    const result = await this.authService.logout(
      this.readRefreshCookie(request),
    );
    response.clearCookie(REFRESH_COOKIE, this.cookieSecurityOptions);
    return result;
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Post('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    deprecated: true,
    summary: 'Compatibility alias; use GET /auth/me',
  })
  meCompatibility(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertTrustedOrigin(request);
    const result = await this.authService.changeOwnPassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      dto.confirmation,
      this.readRefreshCookie(request),
      this.sessionMetadata(request),
    );
    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshExpiresAt,
    );
    return {
      accessToken: result.accessToken,
      user: result.user,
      sessionBehavior: result.sessionBehavior,
    };
  }

  @Post('change-email')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.SETTINGS_WRITE)
  async changeEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeEmailDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertTrustedOrigin(request);
    const result = await this.authService.changeOwnEmail(
      user.id,
      dto.currentPassword,
      dto.newEmail,
      dto.confirmation,
      this.readRefreshCookie(request),
      this.sessionMetadata(request),
    );
    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshExpiresAt,
    );
    return {
      accessToken: result.accessToken,
      user: result.user,
      sessionBehavior: result.sessionBehavior,
    };
  }

  private get cookieSecurityOptions() {
    const configuredSecure = this.configService.get<string>('COOKIE_SECURE');
    return {
      httpOnly: true,
      secure:
        configuredSecure === 'false'
          ? false
          : configuredSecure === 'true' ||
            this.configService.get('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };
  }

  private setRefreshCookie(
    response: Response,
    refreshToken: string,
    expires: Date,
  ): void {
    response.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.cookieSecurityOptions,
      expires,
      priority: 'high',
    });
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return undefined;
    for (const cookie of cookieHeader.split(';')) {
      const separator = cookie.indexOf('=');
      if (separator === -1) continue;
      const name = cookie.slice(0, separator).trim();
      if (name === REFRESH_COOKIE) {
        return decodeURIComponent(cookie.slice(separator + 1).trim());
      }
    }
    return undefined;
  }

  private sessionMetadata(request: Request) {
    return {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    };
  }

  private assertTrustedOrigin(request: Request): void {
    const origin = request.get('origin');
    if (!origin) return;
    const allowedOrigins = this.configService
      .get<string>('CORS_ORIGIN', 'http://localhost:3001')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!allowedOrigins.includes(origin)) {
      throw new ForbiddenException('Untrusted request origin');
    }
  }
}
