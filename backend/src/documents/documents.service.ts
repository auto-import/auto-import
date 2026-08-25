import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import { StorageProvider } from './storage.provider';
import {
  FilterDossierDocumentsDto,
  UploadDossierDocumentDto,
} from './dto/upload-document.dto';

export interface UploadedBufferFile {
  fieldname?: string;
  originalname: string;
  encoding?: string;
  mimetype: string;
  size?: number;
  buffer: Buffer;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
  ) {}

  async uploadDossierDocument(
    organizationId: string,
    userId: string,
    file: UploadedBufferFile,
    dto: UploadDossierDocumentDto,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file buffer provided');
    }

    const dossier = await this.prisma.dossier.findFirst({
      where: { id: dto.dossierId, organizationId },
    });
    if (!dossier) throw new NotFoundException('Dossier not found');

    const stored = await this.storage.saveBuffer(
      organizationId,
      dto.kind.toLowerCase(),
      file.originalname,
      file.mimetype,
      file.buffer,
    );

    return this.prisma.$transaction(async (tx) => {
      const fileAsset = await tx.fileAsset.create({
        data: {
          organizationId,
          storageKey: stored.storageKey,
          originalName: stored.originalName,
          mimeType: stored.mimeType,
          size: stored.size,
          checksum: stored.checksum,
          category: dto.kind,
          status: 'active',
          uploadedBy: userId,
        },
      });

      const dossierDoc = await tx.dossierDocumentAsset.create({
        data: {
          organizationId,
          dossierId: dto.dossierId,
          fileId: fileAsset.id,
          kind: dto.kind,
          documentType: dto.documentType,
          title: dto.title || file.originalname,
          description: dto.description,
          status: 'valid',
          uploadedBy: userId,
        },
        include: {
          file: true,
          uploadedByUser: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      const recipients = [dossier.salesUserId, dossier.opsUserId].filter(
        (recipient, index, values): recipient is string =>
          Boolean(recipient) && values.indexOf(recipient) === index,
      );
      if (recipients.length > 0) {
        await tx.notification.createMany({
          data: recipients.map((recipient) => ({
            organizationId,
            userId: recipient,
            type: 'DOSSIER_DOCUMENT_ADDED',
            category: 'document',
            severity: 'info',
            title: `Document ajouté au dossier ${dossier.reference}`,
            content: dossierDoc.title,
            relatedType: 'dossier_document',
            relatedId: dossierDoc.id,
            entityUrl: `/dossiers/${dto.dossierId}`,
            dedupeKey: `dossier-document:${dossierDoc.id}:${recipient}`,
          })),
          skipDuplicates: true,
        });
      }

      return dossierDoc;
    });
  }

  async findAll(organizationId: string, filter: FilterDossierDocumentsDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const where: Prisma.DossierDocumentAssetWhereInput = {
      organizationId,
      ...(filter.dossierId ? { dossierId: filter.dossierId } : {}),
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.documentType ? { documentType: filter.documentType } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.dossierDocumentAsset.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          file: true,
          uploadedByUser: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.dossierDocumentAsset.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  async getDownloadStream(id: string, organizationId: string) {
    const doc = await this.prisma.dossierDocumentAsset.findFirst({
      where: { id, organizationId },
      include: { file: true },
    });

    if (!doc || !doc.file) {
      throw new NotFoundException('Document not found');
    }

    const stream = this.storage.getReadStream(doc.file.storageKey);

    return {
      stream,
      mimeType: doc.file.mimeType,
      originalName: doc.file.originalName,
      size: Number(doc.file.size),
    };
  }

  /**
   * Check if all mandatory documents are present and valid for a dossier
   */
  async checkDocumentRequirements(
    dossierId: string,
    organizationId: string,
    requiredTypes: string[],
  ): Promise<{ complete: boolean; missing: string[] }> {
    const docs = await this.prisma.dossierDocumentAsset.findMany({
      where: {
        dossierId,
        organizationId,
        status: 'valid',
      },
    });

    const presentTypes = new Set(
      docs.map((d) => d.documentType).filter(Boolean),
    );
    const missing = requiredTypes.filter((req) => !presentTypes.has(req));

    return {
      complete: missing.length === 0,
      missing,
    };
  }
}
