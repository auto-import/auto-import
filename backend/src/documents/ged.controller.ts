import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Permission } from '@auto-import/contracts';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  ArchiveGedDocumentDto,
  CreateGedVersionDto,
  FilterGedDocumentsDto,
  GedEntityLinkDto,
  TransitionGedDocumentDto,
  UploadGedDocumentDto,
  UpsertChecklistRuleDto,
  UpsertGedReferenceDto,
} from './dto/ged.dto';
import type { UploadedBufferFile } from './documents.service';
import { GedService } from './ged.service';

@Controller('ged')
export class GedController {
  constructor(private readonly ged: GedService) {}

  @Get('references')
  @RequirePermission(Permission.GED_METADATA_LIST)
  references(@CurrentUser() user: AuthenticatedUser) {
    return this.ged.references(user.organizationId);
  }

  @Post('references/categories')
  @RequirePermission(Permission.DOSSIER_CHECKLIST_MANAGE)
  upsertCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertGedReferenceDto,
  ) {
    return this.ged.upsertCategory(user.organizationId, dto);
  }

  @Post('references/types')
  @RequirePermission(Permission.DOSSIER_CHECKLIST_MANAGE)
  upsertType(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertGedReferenceDto,
  ) {
    return this.ged.upsertType(user.organizationId, dto);
  }

  @Get('documents')
  @RequirePermission(Permission.GED_METADATA_LIST)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filter: FilterGedDocumentsDto,
  ) {
    return this.ged.list(user, filter);
  }

  @Post('documents')
  @RequirePermission(Permission.GED_BYTES_UPLOAD)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedBufferFile,
    @Body() dto: UploadGedDocumentDto,
  ) {
    return this.ged.upload(user, file, dto);
  }

  @Get('documents/:id')
  @RequirePermission(Permission.GED_METADATA_READ)
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.ged.detail(user, id);
  }

  @Post('documents/:id/versions')
  @RequirePermission(Permission.GED_BYTES_CREATE_VERSION)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  createVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: UploadedBufferFile,
    @Body() dto: CreateGedVersionDto,
  ) {
    return this.ged.createVersion(user, id, file, dto);
  }

  @Post('documents/:id/links')
  @RequirePermission(Permission.GED_METADATA_LINK)
  link(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GedEntityLinkDto,
  ) {
    return this.ged.link(user, id, dto);
  }

  @Patch('documents/:id/links/:linkId/archive')
  @RequirePermission(Permission.GED_METADATA_UNLINK)
  unlink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
  ) {
    return this.ged.unlink(user, id, linkId);
  }

  @Post('documents/:id/validation')
  @RequirePermission(Permission.GED_METADATA_UPDATE)
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransitionGedDocumentDto,
  ) {
    return this.ged.transition(user, id, dto);
  }

  @Patch('documents/:id/archive')
  @RequirePermission(Permission.GED_METADATA_ARCHIVE)
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ArchiveGedDocumentDto,
  ) {
    return this.ged.archive(user, id, dto);
  }

  @Get('documents/:id/preview')
  @RequirePermission(Permission.GED_BYTES_PREVIEW)
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    return this.stream(user, id, 'preview', response);
  }

  @Get('documents/:id/download')
  @RequirePermission(Permission.GED_BYTES_DOWNLOAD)
  download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    return this.stream(user, id, 'download', response);
  }

  @Post('checklist/rules')
  @RequirePermission(Permission.DOSSIER_CHECKLIST_MANAGE)
  upsertChecklistRule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertChecklistRuleDto,
  ) {
    return this.ged.upsertChecklistRule(user, dto);
  }

  @Get('dossiers/:dossierId/checklist')
  @RequirePermission(Permission.DOSSIER_CHECKLIST_READ)
  checklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dossierId') dossierId: string,
    @Query('project') project?: string,
  ) {
    return this.ged.checklist(user, dossierId, project === 'true');
  }

  private async stream(
    user: AuthenticatedUser,
    id: string,
    action: 'preview' | 'download',
    response: Response,
  ) {
    const content = await this.ged.content(user, id, action);
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader(
      'Content-Disposition',
      `${action === 'preview' ? 'inline' : 'attachment'}; filename="document"; filename*=UTF-8''${encodeURIComponent(content.originalName.replace(/[\r\n]/g, ''))}`,
    );
    response.setHeader('Content-Length', content.size);
    content.stream.pipe(response);
  }
}
