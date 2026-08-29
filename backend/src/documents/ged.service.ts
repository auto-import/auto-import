import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { paginate } from '../common/helpers/pagination.helper';
import { PrismaService } from '../prisma/prisma.service';
import type {
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
import { StorageProvider } from './storage.provider';

const RESTRICTED_SENSITIVITIES = new Set([
  'CONFIDENTIAL',
  'RESTRICTED_IDENTITY',
  'RESTRICTED_BANK',
  'RESTRICTED_PAYMENT',
  'RESTRICTED_CONTRACT',
  'RESTRICTED_CUSTOMS',
]);

const TARGET_KEYS = [
  'prospectId',
  'clientId',
  'dossierId',
  'vehicleId',
  'supplierId',
  'chinaOfferId',
  'purchaseId',
  'shipmentId',
  'customsFileId',
  'paymentId',
] as const;

type TargetKey = (typeof TARGET_KEYS)[number];
type Target = { key: TargetKey; id: string };

@Injectable()
export class GedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
  ) {}

  async references(organizationId: string) {
    const [categories, types] = await Promise.all([
      this.prisma.gedCategory.findMany({
        where: { organizationId, active: true },
        orderBy: [{ sortOrder: 'asc' }, { labelFr: 'asc' }],
      }),
      this.prisma.gedDocumentType.findMany({
        where: { organizationId, active: true },
        orderBy: [{ sortOrder: 'asc' }, { labelFr: 'asc' }],
      }),
    ]);
    return { categories, types };
  }

  async upsertCategory(
    organizationId: string,
    dto: UpsertGedReferenceDto,
  ) {
    return this.prisma.gedCategory.upsert({
      where: { organizationId_code: { organizationId, code: dto.code } },
      create: {
        organizationId,
        code: dto.code,
        labelFr: dto.labelFr,
        description: dto.description,
        defaultSensitivity: dto.defaultSensitivity ?? 'INTERNAL',
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
      update: {
        labelFr: dto.labelFr,
        description: dto.description,
        defaultSensitivity: dto.defaultSensitivity,
        active: dto.active,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async upsertType(organizationId: string, dto: UpsertGedReferenceDto) {
    if (!dto.categoryId) {
      throw new BadRequestException({
        code: 'GED_CATEGORY_REQUIRED',
        message: 'A category is required for a document type',
      });
    }
    await this.assertCategory(organizationId, dto.categoryId);
    return this.prisma.gedDocumentType.upsert({
      where: { organizationId_code: { organizationId, code: dto.code } },
      create: {
        organizationId,
        categoryId: dto.categoryId,
        code: dto.code,
        labelFr: dto.labelFr,
        description: dto.description,
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
      update: {
        categoryId: dto.categoryId,
        labelFr: dto.labelFr,
        description: dto.description,
        active: dto.active,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async upload(
    user: AuthenticatedUser,
    file: UploadedBufferFile,
    dto: UploadGedDocumentDto,
  ) {
    if (!file?.buffer) throw new BadRequestException('No file buffer provided');
    const target = this.getSingleTarget(dto);
    await this.assertTarget(user.organizationId, target);
    const references = await this.resolveReferences(
      user.organizationId,
      dto.categoryId,
      dto.documentTypeId,
    );
    const sensitivity =
      dto.sensitivity ?? references.category?.defaultSensitivity ?? 'INTERNAL';
    await this.assertSensitivePermission(user, sensitivity, 'upload', undefined);
    this.storage.assertAllowedMime(file.buffer, file.mimetype, [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
    const stored = await this.storage.saveBuffer(
      user.organizationId,
      'ged',
      file.originalname,
      file.mimetype,
      file.buffer,
    );

    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.fileAsset.create({
        data: {
          organizationId: user.organizationId,
          storageKey: stored.storageKey,
          originalName: stored.originalName,
          mimeType: stored.mimeType,
          size: stored.size,
          checksum: stored.checksum,
          category: 'GED',
          status: 'active',
          encryptionState: 'EXTERNAL_REQUIRED',
          scanStatus: 'NOT_CONFIGURED',
          integrityStatus: 'VERIFIED',
          integrityCheckedAt: new Date(),
          uploadedBy: user.id,
        },
      });
      const document = await tx.gedDocument.create({
        data: {
          organizationId: user.organizationId,
          categoryId: references.category?.id,
          documentTypeId: references.type?.id,
          title: dto.title,
          description: dto.description,
          issuingAuthority: dto.issuingAuthority,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
          validationStatus: 'TO_VALIDATE',
          sensitivity,
          createdBy: user.id,
        },
      });
      const version = await tx.gedDocumentVersion.create({
        data: {
          organizationId: user.organizationId,
          documentId: document.id,
          fileId: asset.id,
          versionNumber: 1,
          checksum: stored.checksum,
          changeReason: dto.changeReason ?? 'Version initiale',
          uploadedBy: user.id,
        },
      });
      await tx.gedDocument.update({
        where: { id: document.id },
        data: { currentVersionId: version.id },
      });
      await tx.gedDocumentLink.create({
        data: {
          organizationId: user.organizationId,
          documentId: document.id,
          [target.key]: target.id,
          createdBy: user.id,
        },
      });
      await this.auditTx(tx, user, 'GED_DOCUMENT_CREATED', document.id, {
        sensitivity,
        targetType: target.key,
      });
      return tx.gedDocument.findUniqueOrThrow({
        where: { id: document.id },
        include: this.documentInclude(),
      });
    });
  }

  async createVersion(
    user: AuthenticatedUser,
    documentId: string,
    file: UploadedBufferFile,
    dto: CreateGedVersionDto,
  ) {
    if (!file?.buffer) throw new BadRequestException('No file buffer provided');
    const document = await this.requireDocument(user.organizationId, documentId);
    if (document.archivedAt) throw new ConflictException('Document is archived');
    await this.assertSensitivePermission(
      user,
      document.sensitivity,
      'upload',
      document.id,
    );
    this.storage.assertAllowedMime(file.buffer, file.mimetype, [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
    const stored = await this.storage.saveBuffer(
      user.organizationId,
      'ged',
      file.originalname,
      file.mimetype,
      file.buffer,
    );
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.gedDocument.findFirstOrThrow({
          where: { id: documentId, organizationId: user.organizationId },
          select: { id: true, validationStatus: true },
        });
        const latest = await tx.gedDocumentVersion.aggregate({
          where: { documentId },
          _max: { versionNumber: true },
        });
        const asset = await tx.fileAsset.create({
          data: {
            organizationId: user.organizationId,
            storageKey: stored.storageKey,
            originalName: stored.originalName,
            mimeType: stored.mimeType,
            size: stored.size,
            checksum: stored.checksum,
            category: 'GED',
            status: 'active',
            encryptionState: 'EXTERNAL_REQUIRED',
            scanStatus: 'NOT_CONFIGURED',
            integrityStatus: 'VERIFIED',
            integrityCheckedAt: new Date(),
            uploadedBy: user.id,
          },
        });
        const version = await tx.gedDocumentVersion.create({
          data: {
            organizationId: user.organizationId,
            documentId,
            fileId: asset.id,
            versionNumber: (latest._max.versionNumber ?? 0) + 1,
            checksum: stored.checksum,
            changeReason: dto.changeReason,
            uploadedBy: user.id,
          },
        });
        await tx.gedDocument.update({
          where: { id: documentId },
          data: {
            currentVersionId: version.id,
            validationStatus: 'TO_VALIDATE',
          },
        });
        if (locked.validationStatus !== 'TO_VALIDATE') {
          await tx.gedValidationHistory.create({
            data: {
              organizationId: user.organizationId,
              documentId,
              fromStatus: locked.validationStatus,
              toStatus: 'TO_VALIDATE',
              reason: 'Nouvelle version',
              actorId: user.id,
            },
          });
        }
        await this.auditTx(tx, user, 'GED_VERSION_CREATED', documentId, {
          versionNumber: version.versionNumber,
        });
        return version;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async list(user: AuthenticatedUser, filter: FilterGedDocumentsDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const linkWhere = this.linkFilter(filter);
    const where: Prisma.GedDocumentWhereInput = {
      organizationId: user.organizationId,
      archivedAt: filter.archived ? { not: null } : null,
      categoryId: filter.categoryId,
      documentTypeId: filter.documentTypeId,
      validationStatus: filter.validationStatus,
      sensitivity: filter.sensitivity,
      ...(filter.search
        ? {
            OR: [
              { title: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
              {
                issuingAuthority: {
                  contains: filter.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
      ...(filter.expiringSoon
        ? {
            expiryDate: {
              gte: new Date(),
              lte: new Date(Date.now() + 30 * 86400000),
            },
          }
        : {}),
      ...(linkWhere ? { links: { some: { ...linkWhere, archivedAt: null } } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.gedDocument.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.documentInclude(),
      }),
      this.prisma.gedDocument.count({ where }),
    ]);
    return paginate(
      items.map((item) => this.toAuthorizedDocument(user, item)),
      total,
      page,
      limit,
    );
  }

  async detail(user: AuthenticatedUser, documentId: string) {
    const document = await this.prisma.gedDocument.findFirst({
      where: { id: documentId, organizationId: user.organizationId },
      include: {
        ...this.documentInclude(),
        validationHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!document) throw new NotFoundException('Document not found');
    await this.assertSensitivePermission(
      user,
      document.sensitivity,
      'metadata',
      document.id,
    );
    return this.toAuthorizedDocument(user, document);
  }

  async content(
    user: AuthenticatedUser,
    documentId: string,
    action: 'preview' | 'download',
  ) {
    const document = await this.requireDocument(user.organizationId, documentId);
    await this.assertSensitivePermission(
      user,
      document.sensitivity,
      action,
      document.id,
    );
    if (document.archivedAt || !document.currentVersion?.file) {
      throw new NotFoundException('Document content not available');
    }
    const asset = document.currentVersion.file;
    if (
      asset.status !== 'active' ||
      asset.quarantinedAt ||
      asset.scanStatus === 'INFECTED'
    ) {
      throw new ConflictException({
        code: 'GED_FILE_QUARANTINED',
        message: 'Document content is quarantined',
      });
    }
    const verified = await this.storage.verify(asset.storageKey, asset.checksum);
    if (!verified) {
      await this.prisma.$transaction(async (tx) => {
        await tx.fileAsset.update({
          where: { id: asset.id },
          data: {
            integrityStatus: 'FAILED',
            integrityCheckedAt: new Date(),
            quarantinedAt: new Date(),
            status: 'quarantined',
          },
        });
        await this.auditTx(tx, user, 'GED_INTEGRITY_FAILED', document.id, {
          versionId: document.currentVersion?.id,
        });
      });
      throw new ConflictException({
        code: 'GED_INTEGRITY_FAILED',
        message: 'Document integrity verification failed',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.fileAsset.update({
        where: { id: asset.id },
        data: { integrityStatus: 'VERIFIED', integrityCheckedAt: new Date() },
      });
      if (RESTRICTED_SENSITIVITIES.has(document.sensitivity)) {
        await this.auditTx(tx, user, `GED_SENSITIVE_${action.toUpperCase()}`, document.id, {
          versionId: document.currentVersion?.id,
        });
      }
    });
    return {
      stream: this.storage.getReadStream(asset.storageKey),
      mimeType: asset.mimeType,
      originalName: asset.originalName,
      size: Number(asset.size),
    };
  }

  async transition(
    user: AuthenticatedUser,
    documentId: string,
    dto: TransitionGedDocumentDto,
  ) {
    const document = await this.requireDocument(user.organizationId, documentId);
    const transitionPermission =
      dto.status === 'VALIDATED'
        ? Permission.GED_VALIDATE
        : Permission.GED_REJECT;
    if (!user.permissions.includes(transitionPermission)) {
      throw new ForbiddenException({
        code: 'GED_VALIDATION_PERMISSION_REQUIRED',
        message: 'Document validation permission required',
      });
    }
    if (document.archivedAt) throw new ConflictException('Document is archived');
    if (document.validationStatus !== 'TO_VALIDATE') {
      throw new ConflictException({
        code: 'GED_INVALID_TRANSITION',
        message: `${document.validationStatus} cannot transition to ${dto.status}`,
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.gedDocument.update({
        where: { id: documentId },
        data: { validationStatus: dto.status },
      });
      await tx.gedValidationHistory.create({
        data: {
          organizationId: user.organizationId,
          documentId,
          fromStatus: document.validationStatus,
          toStatus: dto.status,
          reason: dto.reason,
          actorId: user.id,
        },
      });
      await this.auditTx(tx, user, `GED_${dto.status}`, documentId, {
        status: dto.status,
        hasReason: Boolean(dto.reason),
      });
      return updated;
    });
  }

  async link(user: AuthenticatedUser, documentId: string, dto: GedEntityLinkDto) {
    const document = await this.requireDocument(user.organizationId, documentId);
    const target = this.getSingleTarget(dto);
    await this.assertTarget(user.organizationId, target);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.gedDocumentLink.findFirst({
        where: {
          organizationId: user.organizationId,
          documentId,
          [target.key]: target.id,
          archivedAt: null,
        },
      });
      if (existing) return existing;
      const link = await tx.gedDocumentLink.create({
        data: {
          organizationId: user.organizationId,
          documentId: document.id,
          [target.key]: target.id,
          createdBy: user.id,
        },
      });
      await this.auditTx(tx, user, 'GED_LINK_CREATED', documentId, {
        linkId: link.id,
        targetType: target.key,
      });
      return link;
    });
  }

  async unlink(user: AuthenticatedUser, documentId: string, linkId: string) {
    const link = await this.prisma.gedDocumentLink.findFirst({
      where: {
        id: linkId,
        documentId,
        organizationId: user.organizationId,
        archivedAt: null,
      },
    });
    if (!link) throw new NotFoundException('Document link not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.gedDocumentLink.update({
        where: { id: linkId },
        data: { archivedAt: new Date() },
      });
      await this.auditTx(tx, user, 'GED_LINK_ARCHIVED', documentId, {
        linkId,
      });
      return updated;
    });
  }

  async archive(
    user: AuthenticatedUser,
    documentId: string,
    dto: ArchiveGedDocumentDto,
  ) {
    const document = await this.requireDocument(user.organizationId, documentId);
    if (document.archivedAt) return document;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.gedDocument.update({
        where: { id: documentId },
        data: {
          archivedAt: new Date(),
          archivedById: user.id,
          archiveReason: dto.reason,
        },
      });
      await this.auditTx(tx, user, 'GED_DOCUMENT_ARCHIVED', documentId, {});
      return updated;
    });
  }

  async upsertChecklistRule(
    user: AuthenticatedUser,
    dto: UpsertChecklistRuleDto,
  ) {
    const type = await this.prisma.gedDocumentType.findFirst({
      where: { id: dto.documentTypeId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!type) throw new NotFoundException('Document type not found');
    const key = {
      organizationId: user.organizationId,
      documentTypeId: dto.documentTypeId,
      dossierType: dto.dossierType ?? null,
      workflowStatus: dto.workflowStatus ?? null,
    };
    const existing = await this.prisma.dossierChecklistRule.findFirst({
      where: key,
    });
    const data = {
      required: dto.required ?? true,
      blocking: dto.blocking ?? false,
      expiryWarningDays: dto.expiryWarningDays ?? 30,
      active: dto.active ?? true,
    };
    return existing
      ? this.prisma.dossierChecklistRule.update({
          where: { id: existing.id },
          data,
        })
      : this.prisma.dossierChecklistRule.create({
          data: { ...key, ...data, createdBy: user.id },
        });
  }

  async checklist(user: AuthenticatedUser, dossierId: string, project = false) {
    const dossier = await this.prisma.dossier.findFirst({
      where: { id: dossierId, organizationId: user.organizationId },
      select: {
        id: true,
        type: true,
        status: true,
        clientId: true,
        salesUserId: true,
        opsUserId: true,
      },
    });
    if (!dossier) throw new NotFoundException('Dossier not found');
    const rules = await this.prisma.dossierChecklistRule.findMany({
      where: {
        organizationId: user.organizationId,
        active: true,
        AND: [
          { OR: [{ dossierType: null }, { dossierType: dossier.type }] },
          { OR: [{ workflowStatus: null }, { workflowStatus: dossier.status }] },
        ],
      },
      include: { documentType: true },
      orderBy: { documentType: { sortOrder: 'asc' } },
    });
    const documents = await this.prisma.gedDocument.findMany({
      where: {
        organizationId: user.organizationId,
        archivedAt: null,
        links: { some: { dossierId, archivedAt: null } },
      },
      select: {
        id: true,
        documentTypeId: true,
        validationStatus: true,
        expiryDate: true,
      },
    });
    const now = Date.now();
    const items = rules.map((rule) => {
      const matches = documents.filter(
        (document) => document.documentTypeId === rule.documentTypeId,
      );
      const effective = matches.map((document) => {
        if (document.expiryDate && document.expiryDate.getTime() < now)
          return 'EXPIRED';
        if (
          document.expiryDate &&
          document.expiryDate.getTime() <= now + rule.expiryWarningDays * 86400000
        )
          return 'EXPIRING_SOON';
        return document.validationStatus;
      });
      const state = effective.includes('VALIDATED')
        ? 'UPLOADED'
        : effective.includes('REJECTED')
          ? 'REJECTED'
          : effective.includes('EXPIRED')
            ? 'EXPIRED'
            : effective.includes('EXPIRING_SOON')
              ? 'EXPIRING_SOON'
              : effective.includes('TO_VALIDATE')
                ? 'AWAITING_VALIDATION'
                : 'MISSING';
      return {
        ruleId: rule.id,
        documentType: rule.documentType,
        required: rule.required,
        blocking: rule.blocking,
        state,
        documentIds: matches.map(({ id }) => id),
      };
    });
    if (project) await this.projectChecklist(user, dossier, items);
    const required = items.filter((item) => item.required);
    const complete = required.filter((item) => item.state === 'UPLOADED').length;
    return {
      dossierId,
      progress: required.length ? Math.round((complete / required.length) * 100) : 100,
      blocking: items.some(
        (item) => item.blocking && item.state !== 'UPLOADED',
      ),
      items,
    };
  }

  private async projectChecklist(
    user: AuthenticatedUser,
    dossier: {
      id: string;
      clientId: string;
      salesUserId: string;
      opsUserId: string | null;
    },
    items: Array<{
      ruleId: string;
      state: string;
      documentType: { labelFr: string };
    }>,
  ) {
    const assignee = dossier.opsUserId ?? dossier.salesUserId;
    for (const item of items.filter(({ state }) => state !== 'UPLOADED')) {
      const automationKey = `ged-checklist:${dossier.id}:${item.ruleId}:${item.state}`;
      await this.prisma.task.upsert({
        where: {
          organizationId_automationKey: {
            organizationId: user.organizationId,
            automationKey,
          },
        },
        create: {
          organizationId: user.organizationId,
          assignedTo: assignee,
          createdBy: user.id,
          title: `Document ${item.documentType.labelFr}: ${item.state}`,
          type: 'ged_checklist',
          priority: item.state === 'EXPIRED' ? 'high' : 'normal',
          status: 'todo',
          relatedType: 'dossier',
          relatedId: dossier.id,
          dossierId: dossier.id,
          clientId: dossier.clientId,
          automationKey,
        },
        update: {},
      });
      await this.prisma.notification.createMany({
        data: [
          {
            organizationId: user.organizationId,
            userId: assignee,
            type: 'GED_CHECKLIST_ACTION',
            category: 'document',
            severity: item.state === 'EXPIRED' ? 'warning' : 'info',
            title: `Document ${item.documentType.labelFr}`,
            content: item.state,
            relatedType: 'dossier',
            relatedId: dossier.id,
            entityUrl: `/dossiers/${dossier.id}?tab=documents`,
            dedupeKey: automationKey,
          },
        ],
        skipDuplicates: true,
      });
    }
  }

  private getSingleTarget(dto: GedEntityLinkDto): Target {
    const targets = TARGET_KEYS.flatMap((key) =>
      dto[key] ? [{ key, id: dto[key] as string }] : [],
    );
    if (targets.length !== 1) {
      throw new BadRequestException({
        code: 'GED_EXACTLY_ONE_LINK_TARGET',
        message: 'Exactly one entity target is required per link',
      });
    }
    return targets[0];
  }

  private async assertTarget(organizationId: string, target: Target) {
    const where = { id: target.id, organizationId };
    const found =
      target.key === 'prospectId'
        ? await this.prisma.prospect.findFirst({ where, select: { id: true } })
        : target.key === 'clientId'
          ? await this.prisma.client.findFirst({ where, select: { id: true } })
          : target.key === 'dossierId'
            ? await this.prisma.dossier.findFirst({ where, select: { id: true } })
            : target.key === 'vehicleId'
              ? await this.prisma.vehicle.findFirst({ where, select: { id: true } })
              : target.key === 'supplierId'
                ? await this.prisma.partner.findFirst({
                    where: { ...where, type: 'supplier' },
                    select: { id: true },
                  })
                : target.key === 'chinaOfferId'
                  ? await this.prisma.chinaOffer.findFirst({ where, select: { id: true } })
                  : target.key === 'purchaseId'
                    ? await this.prisma.purchase.findFirst({ where, select: { id: true } })
                    : target.key === 'shipmentId'
                      ? await this.prisma.shipment.findFirst({ where, select: { id: true } })
                      : target.key === 'customsFileId'
                        ? await this.prisma.customsFile.findFirst({ where, select: { id: true } })
                        : await this.prisma.payment.findFirst({ where, select: { id: true } });
    if (!found) throw new NotFoundException('GED link target not found');
  }

  private async resolveReferences(
    organizationId: string,
    categoryId?: string,
    documentTypeId?: string,
  ) {
    const type = documentTypeId
      ? await this.prisma.gedDocumentType.findFirst({
          where: { id: documentTypeId, organizationId, active: true },
          include: { category: true },
        })
      : null;
    if (documentTypeId && !type)
      throw new NotFoundException('Document type not found');
    if (type && categoryId && type.categoryId !== categoryId) {
      throw new BadRequestException({
        code: 'GED_TYPE_CATEGORY_CONFLICT',
        message: 'Document type does not belong to the category',
      });
    }
    const category = type?.category ??
      (categoryId ? await this.assertCategory(organizationId, categoryId) : null);
    return { category, type };
  }

  private async assertCategory(organizationId: string, categoryId: string) {
    const category = await this.prisma.gedCategory.findFirst({
      where: { id: categoryId, organizationId, active: true },
    });
    if (!category) throw new NotFoundException('Document category not found');
    return category;
  }

  private async requireDocument(organizationId: string, documentId: string) {
    const document = await this.prisma.gedDocument.findFirst({
      where: { id: documentId, organizationId },
      include: {
        currentVersion: { include: { file: true } },
      },
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  private linkFilter(filter: FilterGedDocumentsDto) {
    for (const key of TARGET_KEYS) {
      if (filter[key]) return { [key]: filter[key] };
    }
    return null;
  }

  private documentInclude() {
    return {
      category: true,
      documentType: true,
      currentVersion: { include: { file: true, uploader: { select: { id: true, firstName: true, lastName: true } } } },
      versions: {
        orderBy: { versionNumber: 'desc' as const },
        include: { file: true, uploader: { select: { id: true, firstName: true, lastName: true } } },
      },
      links: { where: { archivedAt: null } },
      creator: { select: { id: true, firstName: true, lastName: true } },
    };
  }

  private toAuthorizedDocument(user: AuthenticatedUser, document: any) {
    const restricted = RESTRICTED_SENSITIVITIES.has(document.sensitivity);
    const canMetadata = user.permissions.includes(Permission.GED_SENSITIVE_METADATA);
    if (restricted && !canMetadata) {
      return {
        id: document.id,
        sensitivity: document.sensitivity,
        validationStatus: this.effectiveStatus(document),
        restricted: true,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      };
    }
    return {
      ...document,
      validationStatus: this.effectiveStatus(document),
      restricted: false,
    };
  }

  private effectiveStatus(document: { expiryDate?: Date | null; validationStatus: string }) {
    return document.expiryDate && document.expiryDate.getTime() < Date.now()
      ? 'EXPIRED'
      : document.validationStatus;
  }

  private async assertSensitivePermission(
    user: AuthenticatedUser,
    sensitivity: string,
    action: 'metadata' | 'preview' | 'download' | 'upload',
    documentId?: string,
  ) {
    if (!RESTRICTED_SENSITIVITIES.has(sensitivity)) return;
    const required =
      action === 'metadata'
        ? Permission.GED_SENSITIVE_METADATA
        : action === 'preview'
          ? Permission.GED_SENSITIVE_PREVIEW
          : action === 'download'
            ? Permission.GED_SENSITIVE_DOWNLOAD
            : Permission.GED_SENSITIVE_UPLOAD;
    if (user.permissions.includes(required)) return;
    if (documentId) {
      await this.prisma.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: 'GED_SENSITIVE_ACCESS_DENIED',
          entityType: 'ged_document',
          entityId: documentId,
          newValues: { action, sensitivity },
        },
      });
    }
    throw new ForbiddenException({
      code: 'GED_SENSITIVE_ACCESS_DENIED',
      message: 'Restricted document permission required',
    });
  }

  private auditTx(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    action: string,
    entityId: string,
    metadata: Prisma.InputJsonObject,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action,
        entityType: 'ged_document',
        entityId,
        newValues: metadata,
      },
    });
  }
}
