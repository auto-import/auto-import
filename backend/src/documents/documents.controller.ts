import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  FilterDossierDocumentsDto,
  UploadDossierDocumentDto,
} from './dto/upload-document.dto';
import { DocumentsService, type UploadedBufferFile } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequirePermission(Permission.DOCUMENTS_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FilterDossierDocumentsDto,
  ) {
    return this.documents.findAll(user.organizationId, query);
  }

  @Post('upload')
  @RequirePermission(Permission.DOCUMENTS_WRITE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedBufferFile,
    @Body() dto: UploadDossierDocumentDto,
  ) {
    return this.documents.uploadDossierDocument(
      user.organizationId,
      user.id,
      file,
      dto,
    );
  }

  @Get(':id/download')
  @RequirePermission(Permission.DOCUMENTS_READ)
  async download(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { stream, mimeType, originalName, size } =
      await this.documents.getDownloadStream(id, user.organizationId);

    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(originalName)}"`,
    );
    if (size) {
      res.setHeader('Content-Length', size);
    }

    stream.pipe(res);
  }
}
