import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import {
  CreateCustomsFileDto,
  FilterCustomsFilesDto,
  TransitionCustomsFileDto,
  UpdateCustomsFileDto,
} from './dto/customs.dto';

const CUSTOMS_TRANSITIONS: Record<string, readonly string[]> = {
  TO_PREPARE: ['AWAITING_ARRIVAL'],
  AWAITING_ARRIVAL: ['ARRIVED_AT_PORT'],
  ARRIVED_AT_PORT: ['FILE_TRANSMITTED'],
  FILE_TRANSMITTED: ['CLEARANCE_IN_PROGRESS'],
  CLEARANCE_IN_PROGRESS: ['INSPECTION'],
  INSPECTION: ['DUTIES_TAXES'],
  DUTIES_TAXES: ['RELEASE'],
  RELEASE: ['PORT_EXIT'],
  PORT_EXIT: ['CLOSED'],
  CLOSED: [],
};

const LEGACY_TO_V2: Record<string, string> = {
  open: 'TO_PREPARE',
  inInspection: 'INSPECTION',
  cleared: 'RELEASE',
  released: 'PORT_EXIT',
  closed: 'CLOSED',
};

const V2_TO_LEGACY: Record<string, string> = {
  TO_PREPARE: 'open',
  AWAITING_ARRIVAL: 'open',
  ARRIVED_AT_PORT: 'open',
  FILE_TRANSMITTED: 'open',
  CLEARANCE_IN_PROGRESS: 'open',
  INSPECTION: 'inInspection',
  DUTIES_TAXES: 'inInspection',
  RELEASE: 'cleared',
  PORT_EXIT: 'released',
  CLOSED: 'closed',
};

const LEGACY_CUSTOMS_TRANSITIONS: Record<string, readonly string[]> = {
  open: ['inInspection', 'documentsRequired', 'cleared', 'rejected'],
  documentsRequired: ['open', 'rejected'],
  inInspection: ['cleared', 'documentsRequired', 'rejected'],
  cleared: ['released'],
  released: ['closed'],
  rejected: [],
  closed: [],
};

@Injectable()
export class CustomsService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateCustomsReference(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string> {
    const year = new Date().getUTCFullYear();
    const sequence = await tx.commerceSequence.upsert({
      where: {
        organizationId_key: { organizationId, key: `customs:${year}` },
      },
      create: { organizationId, key: `customs:${year}`, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `CUST-${year}-${String(sequence.value).padStart(5, '0')}`;
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateCustomsFileDto,
  ) {
    const scopedLinks = [dto.shipmentId, dto.vehicleId, dto.dossierId].filter(
      Boolean,
    );
    if (scopedLinks.length > 0 && scopedLinks.length !== 3) {
      throw new BadRequestException(
        'shipmentId, vehicleId and dossierId are required together',
      );
    }
    if (dto.brokerPartnerId) {
      const broker = await this.prisma.partner.findFirst({
        where: { id: dto.brokerPartnerId, organizationId },
      });
      if (!broker) throw new NotFoundException('Customs broker not found');
    }

    if (dto.dossierId) {
      const dossier = await this.prisma.dossier.findFirst({
        where: { id: dto.dossierId, organizationId },
      });
      if (!dossier) throw new NotFoundException('Dossier not found');
      const existing = await this.prisma.customsFile.findFirst({
        where: { organizationId, dossierId: dto.dossierId, v2Status: { not: null } },
      });
      if (existing) return this.findOne(existing.id, organizationId);
    }

    if (dto.responsibleUserId) {
      const responsible = await this.prisma.user.findFirst({
        where: {
          id: dto.responsibleUserId,
          organizationId,
          status: 'active',
        },
      });
      if (!responsible)
        throw new NotFoundException('Responsible user not found');
    }

    let shipmentSnapshot:
      | {
          containerNumber: string | null;
          blNumber: string | null;
          arrivalPort: string | null;
        }
      | undefined;
    if (dto.shipmentId && dto.vehicleId && dto.dossierId) {
      const existing = await this.prisma.customsFile.findFirst({
        where: {
          organizationId,
          dossierId: dto.dossierId,
          v2Status: { not: null },
        },
      });
      if (existing) return this.findOne(existing.id, organizationId);
      const link = await this.prisma.shipmentVehicle.findFirst({
        where: {
          shipmentId: dto.shipmentId,
          vehicleId: dto.vehicleId,
          shipment: { organizationId },
          vehicle: {
            dossierVehicles: { some: { dossierId: dto.dossierId } },
          },
        },
        include: {
          shipment: {
            select: {
              containerNumber: true,
              blNumber: true,
              arrivalPort: true,
            },
          },
        },
      });
      if (!link) {
        throw new BadRequestException(
          'Vehicle, dossier and maritime shipment do not match',
        );
      }
      shipmentSnapshot = link.shipment;
    }

    const duty =
      dto.dutyAmount !== undefined
        ? new Prisma.Decimal(dto.dutyAmount)
        : undefined;
    const tax =
      dto.taxAmount !== undefined
        ? new Prisma.Decimal(dto.taxAmount)
        : undefined;
    const fees =
      dto.feesAmount !== undefined
        ? new Prisma.Decimal(dto.feesAmount)
        : undefined;
    const customsVal =
      dto.customsValue !== undefined
        ? new Prisma.Decimal(dto.customsValue)
        : undefined;

    let totalCustoms = new Prisma.Decimal(0);
    if (duty) totalCustoms = totalCustoms.add(duty);
    if (tax) totalCustoms = totalCustoms.add(tax);
    if (fees) totalCustoms = totalCustoms.add(fees);

    const run = () =>
      this.prisma.$transaction(async (tx) => {
        const reference = await this.generateCustomsReference(
          tx,
          organizationId,
        );

        const customsFile = await tx.customsFile.create({
          data: {
            organizationId,
            reference,
            shipmentId: dto.shipmentId,
            vehicleId: dto.vehicleId,
            dossierId: dto.dossierId,
            brokerPartnerId: dto.brokerPartnerId,
            responsibleUserId: dto.responsibleUserId,
            declarationNumber: dto.declarationNumber,
            customsValue: customsVal,
            customsAmount: totalCustoms.greaterThan(0)
              ? totalCustoms
              : undefined,
            dutyAmount: duty,
            taxAmount: tax,
            feesAmount: fees,
            currency: dto.currency || 'DZD',
            status: 'open',
            v2Status: scopedLinks.length === 3 ? 'TO_PREPARE' : undefined,
            reconciliationRequired: scopedLinks.length !== 3,
            containerSnapshot: shipmentSnapshot?.containerNumber,
            blSnapshot: shipmentSnapshot?.blNumber,
            arrivalPortSnapshot: shipmentSnapshot?.arrivalPort,
            notes: dto.notes,
            statusHistory: {
              create: {
                toStatus: scopedLinks.length === 3 ? 'TO_PREPARE' : 'open',
                changedBy: userId,
                comment: 'Customs file opened',
              },
            },
          },
          include: {
            dossier: true,
            brokerPartner: true,
            shipment: true,
            vehicle: true,
            statusHistory: {
              include: {
                user: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        });

        if (dto.vehicleId) {
          await tx.customsFileVehicle.create({
            data: { customsFileId: customsFile.id, vehicleId: dto.vehicleId },
          });
        }

        return customsFile;
      });
    try {
      return await run();
    } catch (error) {
      if (
        dto.vehicleId &&
        dto.dossierId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.customsFile.findFirst({
          where: {
            organizationId,
            vehicleId: dto.vehicleId,
            dossierId: dto.dossierId,
            v2Status: { not: null },
          },
        });
        if (existing) return this.findOne(existing.id, organizationId);
      }
      throw error;
    }
  }

  async update(id: string, organizationId: string, dto: UpdateCustomsFileDto) {
    const file = await this.prisma.customsFile.findFirst({
      where: { id, organizationId },
    });
    if (!file) throw new NotFoundException('Customs file not found');
    const duty =
      dto.dutyAmount !== undefined
        ? new Prisma.Decimal(dto.dutyAmount)
        : file.dutyAmount;
    const tax =
      dto.taxAmount !== undefined
        ? new Prisma.Decimal(dto.taxAmount)
        : file.taxAmount;
    const fees =
      dto.feesAmount !== undefined
        ? new Prisma.Decimal(dto.feesAmount)
        : file.feesAmount;
    const customsVal =
      dto.customsValue !== undefined
        ? new Prisma.Decimal(dto.customsValue)
        : file.customsValue;

    let totalCustoms = new Prisma.Decimal(0);
    if (duty) totalCustoms = totalCustoms.add(duty);
    if (tax) totalCustoms = totalCustoms.add(tax);
    if (fees) totalCustoms = totalCustoms.add(fees);

    const updated = await this.prisma.customsFile.update({
      where: { id },
      data: {
        brokerPartnerId:
          dto.brokerPartnerId !== undefined
            ? dto.brokerPartnerId
            : file.brokerPartnerId,
        declarationNumber:
          dto.declarationNumber !== undefined
            ? dto.declarationNumber
            : file.declarationNumber,
        customsValue: customsVal,
        customsAmount: totalCustoms.greaterThan(0)
          ? totalCustoms
          : file.customsAmount,
        dutyAmount: duty,
        taxAmount: tax,
        feesAmount: fees,
        clearedAt: dto.clearedAt ? new Date(dto.clearedAt) : file.clearedAt,
        releasedAt: dto.releasedAt ? new Date(dto.releasedAt) : file.releasedAt,
        notes: dto.notes !== undefined ? dto.notes : file.notes,
      },
      include: {
        brokerPartner: true,
        dossier: true,
      },
    });

    return updated;
  }

  async transition(
    id: string,
    organizationId: string,
    userId: string,
    dto: TransitionCustomsFileDto,
  ) {
    const file = await this.prisma.customsFile.findFirst({
      where: { id, organizationId },
    });
    if (!file) throw new NotFoundException('Customs file not found');
    if (!file.v2Status && dto.status !== dto.status.toUpperCase()) {
      if (!LEGACY_CUSTOMS_TRANSITIONS[file.status]?.includes(dto.status)) {
        throw new ConflictException({
          code: 'CUSTOMS_LEGACY_INVALID_TRANSITION',
          message: `${file.status} cannot transition to ${dto.status}`,
        });
      }
      return this.prisma.$transaction(async (tx) => {
        await tx.customsStatusHistory.create({
          data: {
            customsFileId: id,
            fromStatus: file.status,
            toStatus: dto.status,
            changedBy: userId,
            comment: dto.comment,
          },
        });
        return tx.customsFile.update({
          where: { id },
          data: {
            status: dto.status,
            clearedAt:
              dto.status === 'cleared' && !file.clearedAt
                ? new Date()
                : file.clearedAt,
            releasedAt:
              dto.status === 'released' && !file.releasedAt
                ? new Date()
                : file.releasedAt,
            closedAt:
              dto.status === 'closed' && !file.closedAt
                ? new Date()
                : file.closedAt,
          },
          include: {
            brokerPartner: true,
            dossier: true,
            statusHistory: true,
          },
        });
      });
    }
    const current = file.v2Status ?? LEGACY_TO_V2[file.status];
    if (!current) {
      throw new ConflictException({
        code: 'CUSTOMS_RECONCILIATION_REQUIRED',
        message: 'Legacy customs status must be reconciled before transition',
      });
    }
    if (current === dto.status) return this.findOne(id, organizationId);
    if (!CUSTOMS_TRANSITIONS[current]?.includes(dto.status)) {
      throw new ConflictException({
        code: 'CUSTOMS_INVALID_TRANSITION',
        message: `${current} cannot transition to ${dto.status}`,
      });
    }

    const parentDossier = file.dossierId
      ? await this.prisma.dossier.findFirst({
          where: { id: file.dossierId, organizationId },
        })
      : null;
    if (parentDossier?.type === 'VEHICLE_SALE_DDP') {
      if (
        dto.status === 'CLEARANCE_IN_PROGRESS' &&
        parentDossier.status !== 'arrivedAtPort'
      ) {
        throw new ConflictException({
          code: 'DDP_DOSSIER_NOT_READY_FOR_CLEARANCE',
          message: 'The parent DDP dossier must be at Arrivée au port.',
        });
      }
      if (dto.status === 'RELEASE' && parentDossier.status !== 'customsClearance') {
        throw new ConflictException({
          code: 'DDP_DOSSIER_NOT_IN_CLEARANCE',
          message: 'The parent DDP dossier must first enter Dédouanement.',
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.customsStatusHistory.create({
        data: {
          customsFileId: id,
          fromStatus: current,
          toStatus: dto.status,
          changedBy: userId,
          comment: dto.comment,
        },
      });

      const updated = await tx.customsFile.update({
        where: { id },
        data: {
          status: V2_TO_LEGACY[dto.status],
          v2Status: dto.status,
          clearedAt:
            dto.status === 'RELEASE' && !file.clearedAt
              ? new Date()
              : file.clearedAt,
          releasedAt:
            dto.status === 'RELEASE' && !file.releasedAt
              ? new Date()
              : file.releasedAt,
          closedAt:
            dto.status === 'CLOSED' && !file.closedAt
              ? new Date()
              : file.closedAt,
          portExitAt:
            dto.status === 'PORT_EXIT' && !file.portExitAt
              ? new Date()
              : file.portExitAt,
        },
        include: {
          brokerPartner: true,
          dossier: true,
          statusHistory: {
            orderBy: { createdAt: 'desc' },
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      });

      const dossierStatus =
        dto.status === 'CLEARANCE_IN_PROGRESS'
          ? 'customsClearance'
          : dto.status === 'RELEASE'
            ? 'customsReleased'
            : null;
      if (dossierStatus && parentDossier?.type === 'VEHICLE_SALE_DDP') {
        const fromStatus = parentDossier.status;
        await tx.dossier.update({
          where: { id: parentDossier.id },
          data: { status: dossierStatus },
        });
        await tx.dossierStatusHistory.create({
          data: {
            dossierId: parentDossier.id,
            fromStatus,
            toStatus: dossierStatus,
            changedBy: userId,
            comment: `Progression pilotée par le dossier douane ${file.reference}${dto.comment ? ` — ${dto.comment}` : ''}`,
          },
        });
      }

      if (dto.status === 'PORT_EXIT' && file.dossierId) {
        const dossier = await tx.dossier.findFirst({
          where: { id: file.dossierId, organizationId },
        });
        const responsible =
          file.responsibleUserId ?? dossier?.opsUserId ?? dossier?.salesUserId;
        if (dossier && responsible) {
          await tx.task.upsert({
            where: {
              organizationId_automationKey: {
                organizationId,
                automationKey: `delivery-handoff:${file.id}`,
              },
            },
            create: {
              organizationId,
              assignedTo: responsible,
              createdBy: userId,
              title: `Organiser la livraison de ${dossier.reference}`,
              type: 'delivery_handoff',
              status: 'todo',
              dossierId: dossier.id,
              relatedType: 'customsFile',
              relatedId: file.id,
              automationKey: `delivery-handoff:${file.id}`,
            },
            update: {},
          });
          await tx.notification.createMany({
            data: [
              {
                organizationId,
                userId: responsible,
                type: 'DELIVERY_HANDOFF_READY',
                category: 'delivery',
                severity: 'success',
                title: `Sortie du port: ${dossier.reference}`,
                relatedType: 'dossier',
                relatedId: dossier.id,
                entityUrl: `/dossiers/${dossier.id}`,
                dedupeKey: `delivery-handoff:${file.id}:${responsible}`,
              },
            ],
            skipDuplicates: true,
          });
        }
      }

      return updated;
    });
  }

  async findAll(organizationId: string, filter: FilterCustomsFilesDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const where: Prisma.CustomsFileWhereInput = {
      organizationId,
      ...(filter.status
        ? filter.status === filter.status.toUpperCase()
          ? { v2Status: filter.status }
          : { status: filter.status }
        : {}),
      ...(filter.dossierId ? { dossierId: filter.dossierId } : {}),
      ...(filter.shipmentId ? { shipmentId: filter.shipmentId } : {}),
      ...(filter.vehicleId ? { vehicleId: filter.vehicleId } : {}),
      ...(filter.brokerPartnerId
        ? { brokerPartnerId: filter.brokerPartnerId }
        : {}),
      ...(filter.declarationNumber
        ? {
            declarationNumber: {
              contains: filter.declarationNumber,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(filter.search
        ? {
            OR: [
              { reference: { contains: filter.search, mode: 'insensitive' } },
              {
                declarationNumber: {
                  contains: filter.search,
                  mode: 'insensitive',
                },
              },
              { notes: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.customsFile.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          brokerPartner: { select: { id: true, name: true } },
          responsibleUser: {
            select: { id: true, firstName: true, lastName: true },
          },
          dossier: { select: { id: true, reference: true, status: true } },
          vehicle: {
            select: { id: true, brand: true, model: true, vin: true },
          },
          vehicles: {
            include: {
              vehicle: {
                select: { id: true, brand: true, model: true, vin: true },
              },
            },
          },
          shipment: {
            select: { id: true, shipmentNumber: true, status: true },
          },
          costs: { where: { status: 'POSTED' } },
        },
      }),
      this.prisma.customsFile.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const file = await this.prisma.customsFile.findFirst({
      where: { id, organizationId },
      include: {
        brokerPartner: true,
        responsibleUser: {
          select: { id: true, firstName: true, lastName: true },
        },
        dossier: true,
        vehicle: true,
        vehicles: { include: { vehicle: true } },
        shipment: true,
        costs: true,
        documents: {
          include: { file: true },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!file) throw new NotFoundException('Customs file not found');
    return file;
  }
}
