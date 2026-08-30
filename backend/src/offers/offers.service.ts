import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import {
  CreateOfferDto,
  AssignOfferDto,
  CreatePurchaseFromOfferDto,
  FilterOfferDto,
  ReserveOfferDto,
  MaterializeOfferDto,
  UpdateOfferDto,
  TransitionOfferDto,
} from './dto/offer.dto';
import { DossierWorkflowService } from '../dossiers/workflows/dossier-workflow.service';
import { DossierStatus, DossierType } from '@auto-import/contracts';
import {
  StorageProvider,
  type StoredFileResult,
} from '../documents/storage.provider';
import type { UploadedBufferFile } from '../documents/documents.service';

type OfferRow = { id: string; currentRevisionId: string | null };

const OFFER_TRANSITIONS: Record<string, readonly string[]> = {
  RECEIVED: ['UNDER_VERIFICATION', 'REJECTED', 'EXPIRED'],
  UNDER_VERIFICATION: ['VALIDATED', 'REJECTED', 'EXPIRED'],
  VALIDATED: ['RESERVED', 'REJECTED', 'EXPIRED'],
  RESERVED: ['VALIDATED', 'REJECTED', 'EXPIRED'],
  REJECTED: [],
  EXPIRED: ['UNDER_VERIFICATION'],
};

@Injectable()
export class OffersService {
  private readonly dossierWorkflow = new DossierWorkflowService();
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly storage: StorageProvider = new StorageProvider(),
  ) {}

  private async storePhotos(
    organizationId: string,
    files: UploadedBufferFile[],
  ) {
    if (files.length < 1 || files.length > 3)
      throw new BadRequestException(
        'Offer galleries accept between one and three photos',
      );
    const stored: StoredFileResult[] = [];
    try {
      for (const file of files) {
        if (!file.buffer || file.buffer.length > 8 * 1024 * 1024)
          throw new BadRequestException(
            'Each offer photo must not exceed 8 MB',
          );
        const detected = this.storage.assertAllowedMime(
          file.buffer,
          file.mimetype,
          ['image/jpeg', 'image/png', 'image/webp'],
        );
        stored.push(
          await this.storage.saveBuffer(
            organizationId,
            'offer-photos',
            file.originalname,
            detected,
            file.buffer,
          ),
        );
      }
      if (
        new Set(stored.map(({ checksum }) => checksum)).size !== stored.length
      )
        throw new BadRequestException(
          'Offer photos must be distinct',
        );
      return stored;
    } catch (error) {
      await Promise.all(
        stored.map(({ storageKey }) => this.storage.delete(storageKey)),
      );
      throw error;
    }
  }

  private derivedStatus(offer: {
    archivedAt: Date | null;
    validFrom: Date;
    validUntil: Date;
    availableQuantity: number;
    reservedQuantity: number;
  }): string {
    const now = new Date();
    if (offer.archivedAt) return 'archived';
    if (offer.validFrom > now) return 'upcoming';
    if (offer.validUntil < now) return 'expired';
    if (offer.availableQuantity <= 0) return 'sold';
    if (offer.reservedQuantity >= offer.availableQuantity) return 'reserved';
    return 'available';
  }

  private present<T extends Parameters<OffersService['derivedStatus']>[0]>(
    offer: T,
  ) {
    const {
      cifPrice: _legacyCifPrice,
      ddpPrice: _legacyDdpPrice,
      purchasePrice: _legacyPurchasePrice,
      ...supplierOffer
    } = offer as T & {
      cifPrice?: unknown;
      ddpPrice?: unknown;
      purchasePrice?: unknown;
    };
    void _legacyCifPrice;
    void _legacyDdpPrice;
    void _legacyPurchasePrice;
    const availabilityStatus = this.derivedStatus(offer);
    return {
      ...supplierOffer,
      status:
        availabilityStatus === 'expired'
          ? 'EXPIRED'
          : ((offer as T & { offerStatus?: string | null }).offerStatus ??
            'RECEIVED'),
      legacyAvailabilityStatus: availabilityStatus,
      customerPricingAuthority: 'TARIFICATION',
      remainingQuantity: Math.max(
        0,
        offer.availableQuantity - offer.reservedQuantity,
      ),
    };
  }

  private async nextReference(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string> {
    const year = new Date().getUTCFullYear();
    const sequence = await tx.commerceSequence.upsert({
      where: { organizationId_key: { organizationId, key: `offer:${year}` } },
      create: { organizationId, key: `offer:${year}`, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `OFF-${year}-${String(sequence.value).padStart(5, '0')}`;
  }

  private validateDates(validFrom: Date, validUntil: Date): void {
    if (validUntil < validFrom) {
      throw new BadRequestException('validUntil must be on or after validFrom');
    }
  }

  private async requireSupplier(
    tx: Prisma.TransactionClient,
    supplierId: string,
    organizationId: string,
  ): Promise<void> {
    const supplier = await tx.partner.findFirst({
      where: {
        id: supplierId,
        organizationId,
        type: 'supplier',
        OR: [
          { supplierStatus: 'ACTIVE' },
          { supplierStatus: null, status: 'active' },
        ],
      },
      select: { id: true },
    });
    if (!supplier) throw new NotFoundException('Active supplier not found');
  }

  private supplierPrice(dto: { supplierPrice?: number }) {
    const price = dto.supplierPrice;
    if (price == null || price <= 0) {
      throw new BadRequestException('A positive supplier price is required');
    }
    return price;
  }

  private async appendRevision(
    tx: Prisma.TransactionClient,
    offer: {
      id: string;
      organizationId: string;
      supplierPrice: Prisma.Decimal | null;
      purchasePrice: Prisma.Decimal | null;
      currency: string;
      incoterm: string | null;
      location: string | null;
      availableQuantity: number;
      leadTimeDays: number | null;
      estimatedDelayDays: number | null;
      validFrom: Date;
      validUntil: Date;
      paymentConditions: string | null;
      brand: string;
      model: string;
      version: string | null;
      year: number | null;
      condition: string;
      mileage: number | null;
      specification: Prisma.JsonValue;
    },
    userId: string,
    reason: string,
  ) {
    const latest = await tx.chinaOfferRevision.aggregate({
      where: { offerId: offer.id },
      _max: { revisionNumber: true },
    });
    const supplierPrice = offer.supplierPrice ?? offer.purchasePrice;
    if (!supplierPrice) throw new ConflictException('Supplier price missing');
    const revision = await tx.chinaOfferRevision.create({
      data: {
        organizationId: offer.organizationId,
        offerId: offer.id,
        revisionNumber: (latest._max.revisionNumber ?? 0) + 1,
        supplierPrice,
        currency: offer.currency,
        incoterm: offer.incoterm,
        location: offer.location,
        quantity: offer.availableQuantity,
        leadTimeDays: offer.leadTimeDays ?? offer.estimatedDelayDays,
        validFrom: offer.validFrom,
        validUntil: offer.validUntil,
        paymentConditions: offer.paymentConditions,
        reason,
        createdBy: userId,
        snapshot: {
          brand: offer.brand,
          model: offer.model,
          version: offer.version,
          year: offer.year,
          condition: offer.condition,
          mileage: offer.mileage,
          specification: offer.specification,
        },
      },
    });
    await tx.chinaOffer.update({
      where: { id: offer.id },
      data: { currentRevisionId: revision.id },
    });
    return revision;
  }

  async create(dto: CreateOfferDto, organizationId: string, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireSupplier(tx, dto.supplierId, organizationId);
      const validFrom = new Date(dto.validFrom);
      const validUntil = new Date(dto.validUntil);
      this.validateDates(validFrom, validUntil);
      const supplierPrice = this.supplierPrice(dto);
      const offer = await tx.chinaOffer.create({
        data: {
          ...dto,
          supplierPrice,
          purchasePrice: supplierPrice,
          cifPrice: null,
          ddpPrice: null,
          leadTimeDays: dto.leadTimeDays ?? dto.estimatedDelayDays,
          offerStatus: 'RECEIVED',
          specification: dto.specification as Prisma.InputJsonValue,
          validFrom,
          validUntil,
          organizationId,
          reference: await this.nextReference(tx, organizationId),
        },
        include: { supplier: true },
      });
      if (userId) await this.appendRevision(tx, offer, userId, 'Offre reçue');
      return this.present(offer);
    });
  }

  async createWithPhotos(
    dto: CreateOfferDto,
    organizationId: string,
    userId: string,
    files: UploadedBufferFile[],
  ) {
    const stored = await this.storePhotos(organizationId, files);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireSupplier(tx, dto.supplierId, organizationId);
        const validFrom = new Date(dto.validFrom);
        const validUntil = new Date(dto.validUntil);
        this.validateDates(validFrom, validUntil);
        const supplierPrice = this.supplierPrice(dto);
        const offer = await tx.chinaOffer.create({
          data: {
            ...dto,
            supplierPrice,
            purchasePrice: supplierPrice,
            cifPrice: null,
            ddpPrice: null,
            leadTimeDays: dto.leadTimeDays ?? dto.estimatedDelayDays,
            offerStatus: 'RECEIVED',
            specification: dto.specification as Prisma.InputJsonValue,
            validFrom,
            validUntil,
            organizationId,
            reference: await this.nextReference(tx, organizationId),
          },
        });
        await this.appendRevision(tx, offer, userId, 'Offre reçue');
        for (const [sortOrder, item] of stored.entries()) {
          const asset = await tx.fileAsset.create({
            data: {
              organizationId,
              uploadedBy: userId,
              category: 'OFFER_PHOTO',
              storageKey: item.storageKey,
              originalName: item.originalName,
              mimeType: item.mimeType,
              size: item.size,
              checksum: item.checksum,
            },
          });
          await tx.offerPhoto.create({
            data: {
              organizationId,
              offerId: offer.id,
              fileId: asset.id,
              sortOrder,
              isPrimary: sortOrder === 0,
            },
          });
        }
        const complete = await tx.chinaOffer.findUniqueOrThrow({
          where: { id: offer.id },
          include: {
            supplier: true,
            photos: { include: { file: true }, orderBy: { sortOrder: 'asc' } },
          },
        });
        return this.present(complete);
      });
    } catch (error) {
      await Promise.all(
        stored.map(({ storageKey }) => this.storage.delete(storageKey)),
      );
      throw error;
    }
  }

  async replacePhotos(
    offerId: string,
    organizationId: string,
    userId: string,
    files: UploadedBufferFile[],
  ) {
    const stored = await this.storePhotos(organizationId, files);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const offer = await tx.chinaOffer.findFirst({
          where: { id: offerId, organizationId },
          select: { id: true },
        });
        if (!offer) throw new NotFoundException('Offer not found');
        const previous = await tx.offerPhoto.findMany({
          where: { offerId, organizationId },
          include: { file: true },
        });
        await tx.offerPhoto.deleteMany({ where: { offerId, organizationId } });
        for (const [sortOrder, item] of stored.entries()) {
          const asset = await tx.fileAsset.create({
            data: {
              organizationId,
              uploadedBy: userId,
              category: 'OFFER_PHOTO',
              storageKey: item.storageKey,
              originalName: item.originalName,
              mimeType: item.mimeType,
              size: item.size,
              checksum: item.checksum,
            },
          });
          await tx.offerPhoto.create({
            data: {
              organizationId,
              offerId,
              fileId: asset.id,
              sortOrder,
              isPrimary: sortOrder === 0,
            },
          });
        }
        const updated = await tx.chinaOffer.findUniqueOrThrow({
          where: { id: offerId },
          include: {
            supplier: true,
            photos: {
              include: { file: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        });
        return { updated, previous };
      });

      for (const previous of result.previous) {
        const asset = await this.prisma.fileAsset.findFirst({
          where: { id: previous.fileId, organizationId },
          include: {
            _count: {
              select: {
                vehiclePhotos: true,
                offerPhotos: true,
                customsDocuments: true,
                businessDocuments: true,
                dossierDocuments: true,
                avatarUses: true,
                checkpointEvidence: true,
              },
            },
          },
        });
        if (
          asset &&
          Object.values(asset._count).every((count) => count === 0)
        ) {
          try {
            await this.prisma.fileAsset.delete({ where: { id: asset.id } });
            await this.storage.delete(asset.storageKey);
          } catch {
            // A concurrent relation may now own the asset; retaining private bytes is safer.
          }
        }
      }
      return this.present(result.updated);
    } catch (error) {
      await Promise.all(
        stored.map(({ storageKey }) => this.storage.delete(storageKey)),
      );
      throw error;
    }
  }

  async photoStream(photoId: string, organizationId: string) {
    const photo = await this.prisma.offerPhoto.findFirst({
      where: { id: photoId, organizationId, offer: { organizationId } },
      include: { file: true },
    });
    if (
      !photo ||
      !(await this.storage.verify(photo.file.storageKey, photo.file.checksum))
    ) {
      throw new NotFoundException('Offer photo not found');
    }
    return {
      stream: this.storage.getReadStream(photo.file.storageKey),
      mimeType: photo.file.mimeType,
      size: Number(photo.file.size),
    };
  }

  async findAll(organizationId: string, filters: FilterOfferDto) {
    await this.expireReservations(organizationId);
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const validAt = filters.validAt ? new Date(filters.validAt) : undefined;
    const where: Prisma.ChinaOfferWhereInput = {
      organizationId,
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters.condition ? { condition: filters.condition } : {}),
      ...(filters.search
        ? {
            OR: ['reference', 'brand', 'model', 'version'].map((field) => ({
              [field]: { contains: filters.search, mode: 'insensitive' },
            })),
          }
        : {}),
      ...(validAt
        ? { validFrom: { lte: validAt }, validUntil: { gte: validAt } }
        : {}),
    };
    if (!filters.status) {
      const [rows, total] = await Promise.all([
        this.prisma.chinaOffer.findMany({
          where,
          include: {
            supplier: true,
            _count: { select: { reservations: true } },
            photos: { where: { isPrimary: true }, include: { file: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.chinaOffer.count({ where }),
      ]);
      return paginate(
        rows.map((row) => this.present(row)),
        total,
        page,
        limit,
      );
    }
    const now = new Date();
    const predicates: Prisma.Sql[] = [
      Prisma.sql`o."organizationId" = ${organizationId}`,
    ];
    if (filters.supplierId)
      predicates.push(Prisma.sql`o."supplierId" = ${filters.supplierId}`);
    if (filters.condition)
      predicates.push(Prisma.sql`o."condition" = ${filters.condition}`);
    if (filters.search) {
      const search = `%${filters.search}%`;
      predicates.push(
        Prisma.sql`(o."reference" ILIKE ${search} OR o."brand" ILIKE ${search} OR o."model" ILIKE ${search} OR o."version" ILIKE ${search})`,
      );
    }
    const active = Prisma.sql`o."archivedAt" IS NULL AND o."validFrom" <= ${now} AND o."validUntil" >= ${now}`;
    const statusPredicate: Record<string, Prisma.Sql> = {
      archived: Prisma.sql`o."archivedAt" IS NOT NULL`,
      expired: Prisma.sql`o."archivedAt" IS NULL AND o."validUntil" < ${now}`,
      upcoming: Prisma.sql`o."archivedAt" IS NULL AND o."validFrom" > ${now}`,
      sold: Prisma.sql`${active} AND o."availableQuantity" <= 0`,
      reserved: Prisma.sql`${active} AND o."availableQuantity" > 0 AND o."reservedQuantity" >= o."availableQuantity"`,
      available: Prisma.sql`${active} AND o."availableQuantity" > 0 AND o."reservedQuantity" < o."availableQuantity"`,
    };
    const statusSql = statusPredicate[filters.status];
    if (!statusSql)
      throw new BadRequestException('Unsupported derived offer status');
    predicates.push(statusSql);
    const sqlWhere = Prisma.join(predicates, ' AND ');
    const offset = (page - 1) * limit;
    const [idRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT o."id" FROM "ChinaOffer" o WHERE ${sqlWhere} ORDER BY o."createdAt" DESC LIMIT ${limit} OFFSET ${offset}`,
      ),
      this.prisma.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "ChinaOffer" o WHERE ${sqlWhere}`,
      ),
    ]);
    const rows = idRows.length
      ? await this.prisma.chinaOffer.findMany({
          where: { id: { in: idRows.map(({ id }) => id) } },
          include: {
            supplier: true,
            _count: { select: { reservations: true } },
            photos: { where: { isPrimary: true }, include: { file: true } },
          },
        })
      : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    return paginate(
      idRows.map(({ id }) => this.present(byId.get(id)!)),
      Number(countRows[0]?.count ?? 0),
      page,
      limit,
    );
  }

  async findOne(id: string, organizationId: string) {
    await this.expireReservations(organizationId, id);
    const offer = await this.prisma.chinaOffer.findFirst({
      where: { id, organizationId },
      include: {
        supplier: true,
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          include: {
            creator: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        statusHistory: { orderBy: { createdAt: 'desc' } },
        reservations: {
          include: {
            client: true,
            dossier: { select: { id: true, reference: true, status: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        photos: { include: { file: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    return this.present(offer);
  }

  async update(
    id: string,
    dto: UpdateOfferDto,
    organizationId: string,
    userId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.chinaOffer.findFirst({
        where: { id, organizationId },
      });
      if (!current) throw new NotFoundException('Offer not found');
      if (dto.supplierId)
        await this.requireSupplier(tx, dto.supplierId, organizationId);
      const validFrom = dto.validFrom
        ? new Date(dto.validFrom)
        : current.validFrom;
      const validUntil = dto.validUntil
        ? new Date(dto.validUntil)
        : current.validUntil;
      this.validateDates(validFrom, validUntil);
      if (
        dto.availableQuantity != null &&
        dto.availableQuantity < current.reservedQuantity
      ) {
        throw new ConflictException(
          'Quantity cannot be lower than active reservations',
        );
      }
      const { revisionReason, ...changes } = dto;
      const revisionFields: Array<keyof UpdateOfferDto> = [
        'supplierPrice',
        'currency',
        'incoterm',
        'location',
        'availableQuantity',
        'leadTimeDays',
        'estimatedDelayDays',
        'validFrom',
        'validUntil',
        'paymentConditions',
        'brand',
        'model',
        'version',
        'year',
        'condition',
        'mileage',
        'specification',
      ];
      const commercialChange = revisionFields.some(
        (field) => dto[field] !== undefined,
      );
      if (commercialChange && !revisionReason?.trim()) {
        throw new BadRequestException({
          code: 'OFFER_REVISION_REASON_REQUIRED',
          message: 'A revision reason is required for offer changes',
        });
      }
      const supplierPrice =
        dto.supplierPrice ?? current.supplierPrice?.toNumber();
      if (commercialChange && userId && !current.currentRevisionId) {
        await this.appendRevision(
          tx,
          current,
          userId,
          `Base historique avant modification: ${revisionReason!.trim()}`,
        );
      }
      const offer = await tx.chinaOffer.update({
        where: { id },
        data: {
          ...changes,
          ...(supplierPrice != null
            ? { supplierPrice, purchasePrice: supplierPrice }
            : {}),
          specification: dto.specification as Prisma.InputJsonValue | undefined,
          validFrom,
          validUntil,
          status: undefined,
        },
        include: { supplier: true },
      });
      if (commercialChange && userId) {
        await this.appendRevision(tx, offer, userId, revisionReason!.trim());
      }
      return this.present(offer);
    });
  }

  async archive(id: string, organizationId: string) {
    const offer = await this.findOne(id, organizationId);
    if (
      offer.reservations.some((reservation) => reservation.status === 'active')
    ) {
      throw new ConflictException(
        'Release active reservations before archiving this offer',
      );
    }
    return this.prisma.chinaOffer.update({
      where: { id },
      data: { archivedAt: new Date(), status: 'archived' },
    });
  }

  async reserve(
    id: string,
    dto: ReserveOfferDto,
    userId: string,
    organizationId: string,
  ) {
    const run = async () =>
      this.prisma.$transaction(
        async (tx) => {
          const client = await tx.client.findFirst({
            where: { id: dto.clientId, organizationId },
          });
          if (!client) throw new NotFoundException('Client not found');
          const quantity = dto.quantity ?? 1;
          const rows = await tx.$queryRaw<OfferRow[]>`
          UPDATE "ChinaOffer"
          SET "reservedQuantity" = "reservedQuantity" + ${quantity}, "updatedAt" = NOW()
          WHERE "id" = ${id} AND "organizationId" = ${organizationId}
            AND "archivedAt" IS NULL AND "validFrom" <= NOW() AND "validUntil" >= NOW()
            AND "reservedQuantity" + ${quantity} <= "availableQuantity"
          RETURNING "id", "currentRevisionId"`;
          if (rows.length !== 1)
            throw new ConflictException(
              'Offer is expired, archived, or has insufficient quantity',
              );
          if (!rows[0].currentRevisionId) {
            throw new ConflictException('Offer price revision is missing');
          }
          const reservation = await tx.offerReservation.create({
            data: {
              organizationId,
              offerId: id,
              sourceOfferRevisionId: rows[0].currentRevisionId,
              clientId: dto.clientId,
              quantity,
              expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
              createdBy: userId,
            },
            include: { offer: true, client: true },
          });
          await tx.chinaOffer.update({
            where: { id },
            data: { offerStatus: 'RESERVED' },
          });
          return reservation;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    try {
      return await run();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      )
        return run();
      throw error;
    }
  }

  async release(
    reservationId: string,
    reason: string | undefined,
    organizationId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.offerReservation.findFirst({
        where: { id: reservationId, organizationId },
      });
      if (!reservation)
        throw new NotFoundException('Offer reservation not found');
      if (reservation.status !== 'active') return reservation;
      await tx.chinaOffer.update({
        where: { id: reservation.offerId },
        data: { reservedQuantity: { decrement: reservation.quantity } },
      });
      return tx.offerReservation.update({
        where: { id: reservationId },
        data: {
          status: 'released',
          releasedAt: new Date(),
          releaseReason: reason ?? 'manual',
        },
      });
    });
  }

  async materialize(
    reservationId: string,
    dto: MaterializeOfferDto,
    userId: string,
    organizationId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.purchase.findUnique({
          where: { offerReservationId: reservationId },
        });
        if (existing) return existing;
        const reservation = await tx.offerReservation.findFirst({
          where: {
            id: reservationId,
            organizationId,
            status: 'active',
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: {
            offer: { include: { supplier: true, photos: true } },
            sourceOfferRevision: true,
            dossier: true,
          },
        });
        if (!reservation || reservation.offer.validUntil < new Date()) {
          throw new ConflictException(
            'Offer reservation is invalid or expired',
          );
        }
        if (reservation.quantity !== 1) {
          throw new ConflictException(
            'Materialize quantity reservations one vehicle at a time',
          );
        }
        if (reservation.dossier) {
          if (reservation.dossier.type === DossierType.SHIPPING_ONLY) {
            throw new ConflictException(
              'Shipping-only dossiers cannot purchase China offers',
            );
          }
          this.dossierWorkflow.validateTransition(
            reservation.dossier.type,
            reservation.dossier.status,
            DossierStatus.PURCHASE_CONFIRMED,
          );
        }
        if (dto.currentLocationId) {
          const location = await tx.warehouseLocation.findFirst({
            where: { id: dto.currentLocationId, warehouse: { organizationId } },
          });
          if (!location)
            throw new NotFoundException('Warehouse location not found');
        }
        const purchasePrice =
          reservation.sourceOfferRevision.supplierPrice.toNumber();
        if (purchasePrice == null || purchasePrice <= 0) {
          throw new ConflictException('A positive purchase price is required');
        }
        const specification =
          typeof reservation.offer.specification === 'object' &&
          reservation.offer.specification !== null &&
          !Array.isArray(reservation.offer.specification)
            ? reservation.offer.specification
            : {};
        const vehicle = await tx.vehicle.create({
          data: {
            organizationId,
            vin: dto.vin,
            brand: reservation.offer.brand,
            model: reservation.offer.model,
            year: reservation.offer.year,
            mileage: reservation.offer.mileage,
            condition: reservation.offer.condition,
            purchasePrice,
            currency: reservation.offer.currency,
            acquisitionType: 'chinaOffer',
            supplierId: reservation.offer.supplierId,
            currentLocationId: dto.currentLocationId,
            status: reservation.dossierId ? 'reserved' : 'available',
            acquiredAt: new Date(),
            specs: {
              create: {
                engine:
                  typeof specification.engine === 'string'
                    ? specification.engine
                    : undefined,
                fuelType:
                  typeof specification.fuelType === 'string'
                    ? specification.fuelType
                    : undefined,
                transmission:
                  typeof specification.transmission === 'string'
                    ? specification.transmission
                    : undefined,
                color:
                  typeof specification.color === 'string'
                    ? specification.color
                    : undefined,
                description:
                  typeof specification.description === 'string'
                    ? specification.description
                    : undefined,
              },
            },
          },
          include: { specs: true },
        });
        for (const photo of reservation.offer.photos) {
          await tx.vehiclePhoto.create({
            data: {
              vehicleId: vehicle.id,
              fileId: photo.fileId,
              sortOrder: photo.sortOrder,
              isPrimary: photo.isPrimary,
            },
          });
        }
        if (reservation.dossierId) {
          await tx.dossierVehicle.create({
            data: { dossierId: reservation.dossierId, vehicleId: vehicle.id },
          });
          await tx.dossier.update({
            where: { id: reservation.dossierId },
            data: { status: DossierStatus.PURCHASE_CONFIRMED },
          });
          await tx.dossierStatusHistory.create({
            data: {
              dossierId: reservation.dossierId,
              fromStatus: reservation.dossier?.status,
              toStatus: DossierStatus.PURCHASE_CONFIRMED,
              changedBy: userId,
              comment: `Offer ${reservation.offer.reference} materialized as vehicle ${dto.vin}`,
            },
          });
        }
        const year = new Date().getUTCFullYear();
        const sequence = await tx.commerceSequence.upsert({
          where: {
            organizationId_key: { organizationId, key: `purchase:${year}` },
          },
          create: { organizationId, key: `purchase:${year}`, value: 1 },
          update: { value: { increment: 1 } },
        });
        const purchase = await tx.purchase.create({
          data: {
            organizationId,
            purchaseNumber: `PUR-${year}-${String(sequence.value).padStart(5, '0')}`,
            supplierId: reservation.offer.supplierId,
            vehicleId: vehicle.id,
            purchasePrice,
            currency: reservation.offer.currency,
            status: 'confirmed',
            purchaseDate: new Date(),
            dossierId: reservation.dossierId,
            confirmedBy: userId,
            offerReservationId: reservation.id,
            sourceOfferId: reservation.offer.id,
            sourceOfferRevisionId: reservation.sourceOfferRevisionId,
            supplierSnapshot: {
              id: reservation.offer.supplier.id,
              name: reservation.offer.supplier.name,
              country: reservation.offer.supplier.country,
            },
            vehicleSnapshot: {
              vin: dto.vin,
              brand: vehicle.brand,
              model: vehicle.model,
              year: vehicle.year,
              specification,
            },
          },
        });
        await tx.offerReservation.update({
          where: { id: reservation.id },
          data: { status: 'consumed' },
        });
        await tx.chinaOffer.update({
          where: { id: reservation.offerId },
          data: {
            reservedQuantity: { decrement: reservation.quantity },
            availableQuantity: { decrement: reservation.quantity },
          },
        });
        return purchase;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async expireReservations(
    organizationId: string,
    offerId?: string,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const expired = await tx.offerReservation.findMany({
        where: {
          organizationId,
          status: 'active',
          expiresAt: { lte: new Date() },
          ...(offerId ? { offerId } : {}),
        },
      });
      for (const reservation of expired) {
        await tx.offerReservation.update({
          where: { id: reservation.id },
          data: {
            status: 'expired',
            releasedAt: new Date(),
            releaseReason: 'expired',
          },
        });
        await tx.chinaOffer.update({
          where: { id: reservation.offerId },
          data: { reservedQuantity: { decrement: reservation.quantity } },
        });
      }
      return expired.length;
    });
  }

  async transition(
    id: string,
    dto: TransitionOfferDto,
    userId: string,
    organizationId: string,
  ) {
    const offer = await this.prisma.chinaOffer.findFirst({
      where: { id, organizationId },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    const current = offer.offerStatus ?? 'RECEIVED';
    if (current === dto.status) return this.present(offer);
    if (!OFFER_TRANSITIONS[current]?.includes(dto.status)) {
      throw new ConflictException({
        code: 'OFFER_INVALID_TRANSITION',
        message: `${current} cannot transition to ${dto.status}`,
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.chinaOffer.update({
        where: { id },
        data: { offerStatus: dto.status },
      });
      await tx.chinaOfferStatusHistory.create({
        data: {
          organizationId,
          offerId: id,
          fromStatus: current,
          toStatus: dto.status,
          reason: dto.reason,
          actorId: userId,
        },
      });
      return this.present(updated);
    });
  }

  async assignToDossier(
    id: string,
    dto: AssignOfferDto,
    userId: string,
    organizationId: string,
  ) {
    const run = () =>
      this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.offerReservation.findUnique({
            where: { dossierId: dto.dossierId },
          });
          if (existing) {
            if (existing.offerId !== id) {
              throw new ConflictException(
                'Dossier is assigned to another offer',
              );
            }
            return existing;
          }
          const offer = await tx.chinaOffer.findFirst({
            where: {
              id,
              organizationId,
              archivedAt: null,
              validUntil: { gte: new Date() },
              offerStatus: { in: ['VALIDATED', 'RESERVED'] },
            },
          });
          if (!offer) {
            throw new ConflictException('Validated active offer required');
          }
          if (!offer.currentRevisionId) {
            throw new ConflictException('Offer price revision is missing');
          }
          const dossier = await tx.dossier.findFirst({
            where: { id: dto.dossierId, organizationId },
            select: { id: true, clientId: true },
          });
          if (!dossier) throw new NotFoundException('Dossier not found');
          const rows = await tx.$queryRaw<OfferRow[]>`
            UPDATE "ChinaOffer"
            SET "reservedQuantity" = "reservedQuantity" + 1,
                "offerStatus" = 'RESERVED',
                "updatedAt" = NOW()
            WHERE "id" = ${id} AND "organizationId" = ${organizationId}
              AND "reservedQuantity" + 1 <= "availableQuantity"
            RETURNING "id", "currentRevisionId"`;
          if (rows.length !== 1) {
            throw new ConflictException('Offer has insufficient quantity');
          }
          const reservation = await tx.offerReservation.create({
            data: {
              organizationId,
              offerId: id,
              sourceOfferRevisionId: offer.currentRevisionId,
              clientId: dossier.clientId,
              dossierId: dossier.id,
              quantity: 1,
              expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
              createdBy: userId,
            },
          });
          await tx.supplierDossierLink.upsert({
            where: {
              supplierId_dossierId: {
                supplierId: offer.supplierId,
                dossierId: dossier.id,
              },
            },
            create: {
              organizationId,
              supplierId: offer.supplierId,
              dossierId: dossier.id,
              source: 'CHINA_OFFER',
              createdBy: userId,
            },
            update: {},
          });
          if (offer.offerStatus !== 'RESERVED') {
            await tx.chinaOfferStatusHistory.create({
              data: {
                organizationId,
                offerId: id,
                fromStatus: offer.offerStatus,
                toStatus: 'RESERVED',
                reason: `Assigned to dossier ${dossier.id}`,
                actorId: userId,
              },
            });
          }
          return reservation;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    try {
      return await run();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      ) {
        const existing = await this.prisma.offerReservation.findUnique({
          where: { dossierId: dto.dossierId },
        });
        if (existing?.offerId === id) return existing;
      }
      throw error;
    }
  }

  async createPurchaseFromOffer(
    id: string,
    dto: CreatePurchaseFromOfferDto,
    userId: string,
    organizationId: string,
  ) {
    const reservation = await this.assignToDossier(
      id,
      dto,
      userId,
      organizationId,
    );
    return this.materialize(
      reservation.id,
        {
          vin: dto.vin,
          currentLocationId: dto.currentLocationId,
      },
      userId,
      organizationId,
    );
  }

  async statistics(organizationId: string) {
    await this.expireReservations(organizationId);
    const offers = await this.prisma.chinaOffer.findMany({
      where: { organizationId },
    });
    const byStatus: Record<string, number> = {};
    for (const offer of offers) {
      const status = this.derivedStatus(offer);
      byStatus[status] = (byStatus[status] ?? 0) + 1;
    }
    return {
      total: offers.length,
      byStatus,
      availableQuantity: offers.reduce(
        (sum, row) => sum + row.availableQuantity,
        0,
      ),
      reservedQuantity: offers.reduce(
        (sum, row) => sum + row.reservedQuantity,
        0,
      ),
    };
  }
}
