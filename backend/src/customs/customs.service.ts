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

  async create(organizationId: string, userId: string, dto: CreateCustomsFileDto) {
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
    }

    const duty = dto.dutyAmount !== undefined ? new Prisma.Decimal(dto.dutyAmount) : undefined;
    const tax = dto.taxAmount !== undefined ? new Prisma.Decimal(dto.taxAmount) : undefined;
    const fees = dto.feesAmount !== undefined ? new Prisma.Decimal(dto.feesAmount) : undefined;
    const customsVal = dto.customsValue !== undefined ? new Prisma.Decimal(dto.customsValue) : undefined;

    let totalCustoms = new Prisma.Decimal(0);
    if (duty) totalCustoms = totalCustoms.add(duty);
    if (tax) totalCustoms = totalCustoms.add(tax);
    if (fees) totalCustoms = totalCustoms.add(fees);

    return this.prisma.$transaction(async (tx) => {
      const reference = await this.generateCustomsReference(tx, organizationId);

      const customsFile = await tx.customsFile.create({
        data: {
          organizationId,
          reference,
          shipmentId: dto.shipmentId,
          vehicleId: dto.vehicleId,
          dossierId: dto.dossierId,
          brokerPartnerId: dto.brokerPartnerId,
          declarationNumber: dto.declarationNumber,
          customsValue: customsVal,
          customsAmount: totalCustoms.greaterThan(0) ? totalCustoms : undefined,
          dutyAmount: duty,
          taxAmount: tax,
          feesAmount: fees,
          currency: dto.currency || 'DZD',
          status: 'open',
          notes: dto.notes,
          statusHistory: {
            create: {
              toStatus: 'open',
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

      return customsFile;
    });
  }

  async update(id: string, organizationId: string, dto: UpdateCustomsFileDto) {
    const file = await this.prisma.customsFile.findFirst({
      where: { id, organizationId },
    });
    if (!file) throw new NotFoundException('Customs file not found');

    const duty = dto.dutyAmount !== undefined ? new Prisma.Decimal(dto.dutyAmount) : file.dutyAmount;
    const tax = dto.taxAmount !== undefined ? new Prisma.Decimal(dto.taxAmount) : file.taxAmount;
    const fees = dto.feesAmount !== undefined ? new Prisma.Decimal(dto.feesAmount) : file.feesAmount;
    const customsVal = dto.customsValue !== undefined ? new Prisma.Decimal(dto.customsValue) : file.customsValue;

    let totalCustoms = new Prisma.Decimal(0);
    if (duty) totalCustoms = totalCustoms.add(duty);
    if (tax) totalCustoms = totalCustoms.add(tax);
    if (fees) totalCustoms = totalCustoms.add(fees);

    const updated = await this.prisma.customsFile.update({
      where: { id },
      data: {
        brokerPartnerId: dto.brokerPartnerId !== undefined ? dto.brokerPartnerId : file.brokerPartnerId,
        declarationNumber: dto.declarationNumber !== undefined ? dto.declarationNumber : file.declarationNumber,
        customsValue: customsVal,
        customsAmount: totalCustoms.greaterThan(0) ? totalCustoms : file.customsAmount,
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

      const updated = await tx.customsFile.update({
        where: { id },
        data: {
          status: dto.status,
          clearedAt: dto.status === 'cleared' && !file.clearedAt ? new Date() : file.clearedAt,
          releasedAt: dto.status === 'released' && !file.releasedAt ? new Date() : file.releasedAt,
          closedAt: dto.status === 'closed' && !file.closedAt ? new Date() : file.closedAt,
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

      return updated;
    });
  }

  async findAll(organizationId: string, filter: FilterCustomsFilesDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const where: Prisma.CustomsFileWhereInput = {
      organizationId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.dossierId ? { dossierId: filter.dossierId } : {}),
      ...(filter.shipmentId ? { shipmentId: filter.shipmentId } : {}),
      ...(filter.vehicleId ? { vehicleId: filter.vehicleId } : {}),
      ...(filter.brokerPartnerId ? { brokerPartnerId: filter.brokerPartnerId } : {}),
      ...(filter.declarationNumber ? { declarationNumber: { contains: filter.declarationNumber, mode: 'insensitive' } } : {}),
      ...(filter.search
        ? {
            OR: [
              { reference: { contains: filter.search, mode: 'insensitive' } },
              { declarationNumber: { contains: filter.search, mode: 'insensitive' } },
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
          dossier: { select: { id: true, reference: true, status: true } },
          vehicle: { select: { id: true, brand: true, model: true, vin: true } },
          shipment: { select: { id: true, shipmentNumber: true, status: true } },
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
        dossier: true,
        vehicle: true,
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
