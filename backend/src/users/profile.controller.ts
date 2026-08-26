import {
  Controller,
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

@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.get(user);
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
