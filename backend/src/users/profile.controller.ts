import {
  Controller,
  Body,
  Patch,
  Delete,
  Get,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { UploadedBufferFile } from '../documents/documents.service';
import { ProfileService } from './profile.service';
import { UpdateLocaleDto } from './dto/update-locale.dto';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission } from '@auto-import/contracts';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.get(user);
  }

  @Patch('locale')
  locale(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateLocaleDto) {
    return this.profile.updateLocale(user, dto.locale);
  }

  @Patch('branding')
  @RequirePermission(Permission.SETTINGS_WRITE)
  branding(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateBrandingDto,
  ) {
    return this.profile.updateBranding(user, dto.companyName);
  }

  @Post('branding/logo')
  @RequirePermission(Permission.SETTINGS_WRITE)
  @UseInterceptors(
    FileInterceptor('logo', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  uploadBrandingLogo(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedBufferFile,
  ) {
    return this.profile.uploadBrandingLogo(user, file);
  }

  @Delete('branding/logo')
  @RequirePermission(Permission.SETTINGS_WRITE)
  removeBrandingLogo(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.removeBrandingLogo(user);
  }

  @Get('branding/logo')
  async brandingLogo(
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.profile.brandingLogo(user);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', file.size);
    response.setHeader(
      'Content-Disposition',
      'inline; filename="company-logo"',
    );
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    file.stream.pipe(response);
  }

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('avatar', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedBufferFile,
  ) {
    return this.profile.uploadAvatar(user, file);
  }

  @Delete('avatar')
  remove(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.removeAvatar(user);
  }

  @Get('avatar')
  async avatar(
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.profile.avatar(user);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', file.size);
    response.setHeader('Cache-Control', 'private, max-age=300');
    file.stream.pipe(response);
  }
}
