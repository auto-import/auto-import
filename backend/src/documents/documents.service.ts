import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import { StorageProvider } from './storage.provider';
import {
  FilterDossierDocumentsDto,
  UploadDossierDocumentDto,
} from './dto/upload-document.dto';
import type { UploadCheckpointEvidenceDto } from './dto/upload-evidence.dto';

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

    if (!dto.dossierId && !dto.clientId) {
      throw new BadRequestException({
        code: 'DOCUMENT_OWNER_REQUIRED',
        message: 'A dossier or client is required',
      });
    }
    const dossier = dto.dossierId
      ? await this.prisma.dossier.findFirst({
          where: { id: dto.dossierId, organizationId },
        })
      : null;
    if (dto.dossierId && !dossier)
      throw new NotFoundException('Dossier not found');
    if (dossier && dto.clientId && dossier.clientId !== dto.clientId) {
      throw new BadRequestException({
        code: 'DOCUMENT_CLIENT_CONFLICT',
        message: 'Client must be derived from the dossier',
      });
    }
    const clientId = dossier?.clientId ?? dto.clientId;
    if (clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: clientId, organizationId },
        select: { id: true },
      });
      if (!client) throw new NotFoundException('Client not found');
    }
    this.storage.assertAllowedMime(
      file.buffer,
      file.mimetype,
      dto.kind === 'CONTRACT'
        ? ['application/pdf', 'image/jpeg', 'image/png']
        : ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    );

    const stored = await this.storage.saveBuffer(
      organizationId,
      dto.kind.toLowerCase(),
      file.originalname,
      file.mimetype,
      file.buffer,
    );
    const legacyTypeCode = `LEGACY_${(dto.documentType ?? dto.kind)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')}`;
    const identityDocument = /passport|nin|id_client|identity/i.test(
      dto.documentType ?? '',
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
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
            encryptionState: 'EXTERNAL_REQUIRED',
            scanStatus: 'NOT_CONFIGURED',
            integrityStatus: 'VERIFIED',
            integrityCheckedAt: new Date(),
            uploadedBy: userId,
          },
        });

        const category = await tx.gedCategory.upsert({
          where: {
            organizationId_code: { organizationId, code: 'LEGACY' },
          },
          create: {
            organizationId,
            code: 'LEGACY',
            labelFr: 'Documents historiques',
            defaultSensitivity: 'INTERNAL',
          },
          update: {},
        });
        const documentType = await tx.gedDocumentType.upsert({
          where: {
            organizationId_code: { organizationId, code: legacyTypeCode },
          },
          create: {
            organizationId,
            categoryId: category.id,
            code: legacyTypeCode,
            labelFr: dto.documentType ?? dto.kind,
          },
          update: {},
        });
        const gedDocument = await tx.gedDocument.create({
          data: {
            organizationId,
            categoryId: category.id,
            documentTypeId: documentType.id,
            title: dto.title || file.originalname,
            description: dto.description,
            validationStatus: 'TO_VALIDATE',
            sensitivity: identityDocument
              ? 'RESTRICTED_IDENTITY'
              : 'INTERNAL',
            createdBy: userId,
          },
        });
        const gedVersion = await tx.gedDocumentVersion.create({
          data: {
            organizationId,
            documentId: gedDocument.id,
            fileId: fileAsset.id,
            versionNumber: 1,
            checksum: stored.checksum,
            changeReason: 'CompatibilitÃ© upload historique',
            uploadedBy: userId,
          },
        });
        await tx.gedDocument.update({
          where: { id: gedDocument.id },
          data: { currentVersionId: gedVersion.id },
        });
        if (dto.dossierId) {
          await tx.gedDocumentLink.create({
            data: {
              organizationId,
              documentId: gedDocument.id,
              dossierId: dto.dossierId,
              createdBy: userId,
            },
          });
        }
        if (clientId) {
          await tx.gedDocumentLink.create({
            data: {
              organizationId,
              documentId: gedDocument.id,
              clientId,
              createdBy: userId,
            },
          });
        }

        const dossierDoc = await tx.dossierDocumentAsset.create({
          data: {
            organizationId,
            dossierId: dto.dossierId,
            clientId,
            fileId: fileAsset.id,
            gedDocumentId: gedDocument.id,
            kind: dto.kind,
            documentType: dto.documentType,
            title: dto.title || file.originalname,
            description: dto.description,
            status: 'valid',
            uploadedBy: userId,
          },
          include: {
            file: true,
            client: { select: { id: true, firstName: true, lastName: true } },
            dossier: { select: { id: true, reference: true } },
            uploadedByUser: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        });

        const recipients = [dossier?.salesUserId, dossier?.opsUserId].filter(
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
              title: `Document ajouté au dossier ${dossier?.reference}`,
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
    } catch (error) {
      await this.storage.delete(stored.storageKey);
      throw error;
    }
  }

  async findAll(user: AuthenticatedUser, filter: FilterDossierDocumentsDto) {
    const organizationId = user.organizationId;
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const where: Prisma.DossierDocumentAssetWhereInput = {
      organizationId,
      ...(filter.dossierId ? { dossierId: filter.dossierId } : {}),
      ...(filter.clientId ? { clientId: filter.clientId } : {}),
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
          client: { select: { id: true, firstName: true, lastName: true } },
          dossier: { select: { id: true, reference: true } },
          uploadedByUser: {
            select: { id: true, firstName: true, lastName: true },
          },
          gedDocument: { select: { sensitivity: true } },
        },
      }),
      this.prisma.dossierDocumentAsset.count({ where }),
    ]);

    return paginate(
      items.map((item) => {
        const restricted = item.gedDocument?.sensitivity?.startsWith('RESTRICTED_');
        if (
          restricted &&
          !user.permissions.includes(Permission.GED_SENSITIVE_METADATA)
        ) {
          return {
            id: item.id,
            status: item.status,
            createdAt: item.createdAt,
            restricted: true,
          };
        }
        return item;
      }),
      total,
      page,
      limit,
    );
  }

  async getDownloadStream(id: string, user: AuthenticatedUser) {
    const doc = await this.prisma.dossierDocumentAsset.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        file: true,
        gedDocument: { select: { id: true, sensitivity: true } },
      },
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    if (!doc.file) {
      throw new BadRequestException({
        code: 'DOCUMENT_IS_EXTERNAL_LINK',
        message: 'This document is an external link and has no downloadable file',
      });
    }
    const file = doc.file;

    if (
      doc.gedDocument?.sensitivity?.startsWith('RESTRICTED_') &&
      !user.permissions.includes(Permission.GED_SENSITIVE_DOWNLOAD)
    ) {
      await this.prisma.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: 'GED_SENSITIVE_ACCESS_DENIED',
          entityType: 'ged_document',
          entityId: doc.gedDocument.id,
          newValues: {
            action: 'download',
            sensitivity: doc.gedDocument.sensitivity,
          },
        },
      });
      throw new BadRequestException({
        code: 'GED_SENSITIVE_ACCESS_DENIED',
        message: 'Restricted document permission required',
      });
    }

    if (
      file.status !== 'active' ||
      !(await this.storage.verify(file.storageKey, file.checksum))
    ) {
      await this.prisma.$transaction(async (tx) => {
        await tx.fileAsset.update({
          where: { id: file.id },
          data: {
            integrityStatus: 'FAILED',
            integrityCheckedAt: new Date(),
            quarantinedAt: new Date(),
            status: 'quarantined',
          },
        });
        if (doc.gedDocument) {
          await tx.auditLog.create({
            data: {
              organizationId: user.organizationId,
              userId: user.id,
              action: 'GED_INTEGRITY_FAILED',
              entityType: 'ged_document',
              entityId: doc.gedDocument.id,
            },
          });
        }
      });
      throw new BadRequestException({
        code: 'DOCUMENT_INTEGRITY_FAILED',
        message: 'Document bytes are missing or invalid',
      });
    }
    const stream = this.storage.getReadStream(file.storageKey);

    return {
      stream,
      mimeType: file.mimeType,
      originalName: file.originalName,
      size: Number(file.size),
    };
  }

  async verifySignedContract(dossierId: string, organizationId: string) {
    // Contracts & Collections is the commercial authority. Accept a signed
    // contract only when its central GED document is validated and its current
    // encrypted file version still passes the stored SHA-256 integrity check.
    const contract = await this.prisma.contract.findFirst({
      where: {
        dossierId,
        organizationId,
        status: 'SIGNED',
        archivedAt: null,
        signedDocument: {
          archivedAt: null,
          validationStatus: 'VALIDATED',
        },
      },
      include: {
        signedDocument: {
          include: { currentVersion: { include: { file: true } } },
        },
      },
      orderBy: { signedAt: 'desc' },
    });
    const currentFile = contract?.signedDocument?.currentVersion?.file;
    if (
      currentFile?.status === 'active' &&
      (await this.storage.verify(currentFile.storageKey, currentFile.checksum))
    ) {
      return contract;
    }

    // Backward-compatible path for pre-GED signed-contract evidence. Existing
    // records remain usable while new workflows converge on Contract + GED.
    const documents = await this.prisma.dossierDocumentAsset.findMany({
      where: {
        dossierId,
        organizationId,
        kind: 'CONTRACT',
        documentType: 'SIGNED_CONTRACT',
        status: 'valid',
        file: { status: 'active' },
      },
      include: { file: true },
      orderBy: { createdAt: 'desc' },
    });
    for (const document of documents) {
      if (!document.file) continue;
      if (
        await this.storage.verify(
          document.file.storageKey,
          document.file.checksum,
        )
      ) {
        return document;
      }
    }
    return null;
  }

  async uploadCheckpointEvidence(
    organizationId: string,
    dossierId: string,
    userId: string,
    file: UploadedBufferFile,
    dto: UploadCheckpointEvidenceDto,
  ) {
    if (!file?.buffer) throw new BadRequestException('No file buffer provided');
    this.storage.assertAllowedMime(file.buffer, file.mimetype, [
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
    const membership = await this.prisma.dossierVehicle.findFirst({
      where: {
        dossierId,
        vehicleId: dto.vehicleId,
        dossier: { organizationId },
        vehicle: { organizationId },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new BadRequestException({
        code: 'EVIDENCE_VEHICLE_NOT_IN_DOSSIER',
        message: 'Vehicle is not attached to this dossier',
      });
    }
    const stored = await this.storage.saveBuffer(
      organizationId,
      `checkpoint-${dto.checkpoint.toLowerCase()}`,
      file.originalname,
      file.mimetype,
      file.buffer,
    );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const asset = await tx.fileAsset.create({
          data: {
            organizationId,
            storageKey: stored.storageKey,
            originalName: stored.originalName,
            mimeType: stored.mimeType,
            size: stored.size,
            checksum: stored.checksum,
            category: `CHECKPOINT_${dto.checkpoint}`,
            status: 'active',
            uploadedBy: userId,
          },
        });
        const replacement = await tx.dossierCheckpointEvidence.create({
          data: {
            organizationId,
            dossierId,
            vehicleId: dto.vehicleId,
            fileId: asset.id,
            checkpoint: dto.checkpoint,
            note: dto.note,
            location: dto.location,
            uploadedBy: userId,
          },
          include: { file: true, vehicle: true },
        });
        await tx.dossierCheckpointEvidence.updateMany({
          where: {
            organizationId,
            dossierId,
            vehicleId: dto.vehicleId,
            checkpoint: dto.checkpoint,
            status: 'active',
            id: { not: replacement.id },
            reliedAt: null,
          },
          data: { status: 'replaced', replacedById: replacement.id },
        });
        return replacement;
      });
    } catch (error) {
      await this.storage.delete(stored.storageKey);
      throw error;
    }
  }

  async evidenceSummary(dossierId: string, organizationId: string) {
    const dossier = await this.prisma.dossier.findFirst({
      where: { id: dossierId, organizationId },
      select: {
        dossierVehicles: {
          select: {
            vehicleId: true,
            vehicle: { select: { brand: true, model: true, vin: true } },
          },
        },
      },
    });
    if (!dossier) throw new NotFoundException('Dossier not found');
    const evidence = await this.prisma.dossierCheckpointEvidence.findMany({
      where: { dossierId, organizationId, status: 'active' },
      include: { file: true },
      orderBy: { createdAt: 'desc' },
    });
    return { vehicles: dossier.dossierVehicles, evidence };
  }

  async verifyCheckpoint(
    dossierId: string,
    organizationId: string,
    checkpoint: string,
  ) {
    const dossier = await this.prisma.dossier.findFirst({
      where: { id: dossierId, organizationId },
      select: { dossierVehicles: { select: { vehicleId: true } } },
    });
    if (!dossier) throw new NotFoundException('Dossier not found');
    const rows = await this.prisma.dossierCheckpointEvidence.findMany({
      where: { dossierId, organizationId, checkpoint, status: 'active' },
      include: { file: true },
    });
    const validVehicleIds = new Set<string>();
    const evidenceIds: string[] = [];
    for (const row of rows) {
      if (
        row.file.status === 'active' &&
        (await this.storage.verify(row.file.storageKey, row.file.checksum))
      ) {
        validVehicleIds.add(row.vehicleId);
        evidenceIds.push(row.id);
      }
    }
    const missingVehicleIds = dossier.dossierVehicles
      .map(({ vehicleId }) => vehicleId)
      .filter((vehicleId) => !validVehicleIds.has(vehicleId));
    return {
      complete:
        dossier.dossierVehicles.length > 0 && missingVehicleIds.length === 0,
      missingVehicleIds,
      evidenceIds,
    };
  }

  async markEvidenceRelied(evidenceIds: string[]) {
    if (!evidenceIds.length) return;
    await this.prisma.dossierCheckpointEvidence.updateMany({
      where: { id: { in: evidenceIds }, reliedAt: null },
      data: { reliedAt: new Date() },
    });
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
