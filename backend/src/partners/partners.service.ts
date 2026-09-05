import {
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { FilterPartnerDto } from './dto/filter-partner.dto';
import { paginate } from '../common/helpers/pagination.helper';
import { normalizeCanonicalPhone } from '../crm/contact-resolution.service';
import { SensitiveFieldService } from '../common/security/sensitive-field.service';
import type {
  CreateSupplierBankDto,
  CreateSupplierContactDto,
  CreateSupplierIncidentDto,
  LinkSupplierDossierDto,
  LinkSupplierVehicleDto,
  ResolveSupplierIncidentDto,
  TransitionSupplierDto,
  UpdateSupplierScoreDto,
  UpdateSupplierBankDto,
} from './dto/supplier-v2.dto';

const SUPPLIER_TRANSITIONS: Record<string, readonly string[]> = {
  TO_VERIFY: ['VERIFIED', 'ACTIVE'],
  VERIFIED: ['ACTIVE', 'SUSPENDED'],
  ACTIVE: ['SUSPENDED'],
  SUSPENDED: ['VERIFIED', 'ACTIVE'],
};

@Injectable()
export class PartnersService {
  private readonly logger = new Logger(PartnersService.name);
  private readonly sensitive = new SensitiveFieldService();

  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePartnerDto, organizationId: string, userId?: string) {
    const partner = await this.prisma.partner.create({
      data: {
        ...dto,
        organizationId,
        status:
          dto.type === 'supplier' && !dto.status
            ? 'active'
            : dto.status || 'active',
        supplierStatus: dto.type === 'supplier' ? 'ACTIVE' : undefined,
      },
    });

    if (userId) {
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'SUPPLIER_CREATED',
          entityType: 'partner',
          entityId: partner.id,
          newValues: {
            type: partner.type,
            supplierStatus: partner.supplierStatus,
          },
        },
      });
    }

    this.logger.log(
      `Partner created: ${partner.name} (${partner.id}) [${partner.type}] for org ${organizationId}`,
    );
    return partner;
  }

  async findAll(organizationId: string, filters?: FilterPartnerDto) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PartnerWhereInput = { organizationId };

    if (filters?.type) where.type = filters.type;
    if (filters?.status) {
      if (
        ['TO_VERIFY', 'VERIFIED', 'ACTIVE', 'SUSPENDED'].includes(
          filters.status,
        )
      )
        where.supplierStatus = filters.status;
      else where.status = filters.status;
    }
    if (filters?.country) where.country = filters.country;
    if (filters?.supplierType) where.supplierType = filters.supplierType;

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { contactPerson: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [partners, total] = await Promise.all([
      this.prisma.partner.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.partner.count({ where }),
    ]);

    return paginate(partners, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { id, organizationId },
      include: {
        _count: {
          select: {
            suppliedVehicles: true,
            chinaOffers: true,
            purchases: true,
          },
        },
        suppliedVehicles: {
          select: {
            id: true,
            brand: true,
            model: true,
            status: true,
            vin: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        chinaOffers: {
          select: {
            id: true,
            reference: true,
            brand: true,
            model: true,
            status: true,
            offerStatus: true,
            validUntil: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        contacts: {
          where: { active: true },
          orderBy: [{ preferred: 'desc' }, { createdAt: 'asc' }],
        },
        incidents: { orderBy: { occurredAt: 'desc' }, take: 20 },
        dossierLinks: {
          include: {
            dossier: { select: { id: true, reference: true, status: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        purchases: {
          select: {
            id: true,
            purchasePrice: true,
            currency: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        supplierPayments: {
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            paymentDate: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        gedLinks: {
          where: { archivedAt: null },
          select: { id: true, documentId: true },
        },
      },
    });

    if (!partner) {
      throw new NotFoundException(
        `Partner with ID ${id} not found in your organization`,
      );
    }

    const [purchaseTotals, paymentTotals, openIncidents] = await Promise.all([
      this.prisma.purchase.aggregate({
        where: { organizationId, supplierId: id, status: { not: 'cancelled' } },
        _sum: { purchasePrice: true },
        _count: true,
      }),
      this.prisma.supplierPayment.aggregate({
        where: {
          organizationId,
          supplierId: id,
          status: { in: ['CONFIRMED', 'confirmed', 'VALIDATED'] },
        },
        _sum: { amount: true },
      }),
      this.prisma.supplierIncident.count({
        where: { organizationId, supplierId: id, status: 'OPEN' },
      }),
    ]);
    const purchased = Number(purchaseTotals._sum.purchasePrice ?? 0);
    const paid = Number(paymentTotals._sum.amount ?? 0);
    const scores = [
      partner.scoreReliability,
      partner.scoreQuality,
      partner.scoreDelivery,
      partner.scoreCommunication,
    ].filter((score): score is number => score != null);
    return {
      ...partner,
      kpis: {
        activeOffers: partner.chinaOffers.filter((offer) =>
          ['VALIDATED', 'RESERVED'].includes(
            offer.offerStatus ?? offer.status.toUpperCase(),
          ),
        ).length,
        totalPurchases: purchaseTotals._count,
        amountPurchased: purchased,
        vehicles: partner._count.suppliedVehicles,
        averageLeadTimeDays: partner.averageLeadTimeDays,
        supplierBalance: Math.max(0, purchased - paid),
        openIncidents,
        score: scores.length
          ? Math.round(
              scores.reduce((sum, score) => sum + score, 0) / scores.length,
            )
          : null,
      },
    };
  }

  async update(id: string, organizationId: string, dto: UpdatePartnerDto) {
    await this.requirePartner(id, organizationId);

    const updated = await this.prisma.partner.update({
      where: { id },
      data: dto,
    });

    this.logger.log(`Partner updated: ${id} (${updated.name})`);
    return updated;
  }

  async remove(id: string, organizationId: string) {
    await this.requirePartner(id, organizationId);

    const archived = await this.prisma.partner.update({
      where: { id },
      data: { status: 'archived' },
    });

    this.logger.log(`Partner archived: ${id}`);
    return archived;
  }

  async transitionSupplier(
    id: string,
    organizationId: string,
    userId: string,
    dto: TransitionSupplierDto,
  ) {
    const supplier = await this.prisma.partner.findFirst({
      where: { id, organizationId, type: 'supplier' },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const current =
      supplier.supplierStatus ??
      (supplier.status === 'active' ? 'ACTIVE' : 'TO_VERIFY');
    if (current === dto.status) return supplier;
    if (!SUPPLIER_TRANSITIONS[current]?.includes(dto.status)) {
      throw new ConflictException({
        code: 'SUPPLIER_INVALID_TRANSITION',
        message: `${current} cannot transition to ${dto.status}`,
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.partner.update({
        where: { id },
        data: {
          supplierStatus: dto.status,
          status: dto.status === 'ACTIVE' ? 'active' : 'inactive',
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'SUPPLIER_STATUS_CHANGED',
          entityType: 'partner',
          entityId: id,
          oldValues: { status: current },
          newValues: { status: dto.status, hasReason: Boolean(dto.reason) },
        },
      });
      return updated;
    });
  }

  async addContact(
    supplierId: string,
    organizationId: string,
    userId: string,
    dto: CreateSupplierContactDto,
  ) {
    await this.requireSupplier(supplierId, organizationId);
    const phoneNormalized = dto.phone
      ? normalizeCanonicalPhone(dto.phone)
      : undefined;
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.preferred) {
          await tx.supplierContact.updateMany({
            where: { organizationId, supplierId, preferred: true },
            data: { preferred: false },
          });
        }
        const contact = await tx.supplierContact.create({
          data: {
            ...dto,
            organizationId,
            supplierId,
            phoneNormalized,
            createdBy: userId,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            userId,
            action: 'SUPPLIER_CONTACT_CREATED',
            entityType: 'partner',
            entityId: supplierId,
            newValues: { contactId: contact.id, preferred: contact.preferred },
          },
        });
        return contact;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'SUPPLIER_CONTACT_DUPLICATE',
          message: 'This normalized supplier phone already exists',
        });
      }
      throw error;
    }
  }

  async createBankAccount(
    supplierId: string,
    organizationId: string,
    userId: string,
    dto: CreateSupplierBankDto,
  ) {
    await this.requireSupplier(supplierId, organizationId);
    const accountReference = [dto.details.accountNumber, dto.details.iban]
      .find((value): value is string => typeof value === 'string')
      ?.replace(/\s/g, '');
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.supplierBankAccount.create({
        data: {
          organizationId,
          supplierId,
          label: dto.label,
          bankName: dto.bankName,
          currency: dto.currency,
          encryptedDetails: this.sensitive.encrypt(
            JSON.stringify(dto.details),
            'pii',
          ),
          lastFour: accountReference?.slice(-4),
          createdBy: userId,
          updatedBy: userId,
        },
        select: {
          id: true,
          label: true,
          bankName: true,
          currency: true,
          lastFour: true,
          status: true,
          createdAt: true,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'SUPPLIER_BANK_CREATED',
          entityType: 'partner',
          entityId: supplierId,
          newValues: { bankAccountId: account.id, currency: account.currency },
        },
      });
      return account;
    });
  }

  async listBankAccounts(supplierId: string, organizationId: string) {
    await this.requireSupplier(supplierId, organizationId);
    return this.prisma.supplierBankAccount.findMany({
      where: { organizationId, supplierId, archivedAt: null },
      select: {
        id: true,
        label: true,
        bankName: true,
        currency: true,
        lastFour: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateBankAccount(
    supplierId: string,
    bankId: string,
    organizationId: string,
    userId: string,
    dto: UpdateSupplierBankDto,
  ) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new ConflictException('At least one bank field must be changed');
    }
    const current = await this.prisma.supplierBankAccount.findFirst({
      where: { id: bankId, supplierId, organizationId, archivedAt: null },
    });
    if (!current)
      throw new NotFoundException('Supplier bank account not found');
    const accountReference = dto.details
      ? [dto.details.accountNumber, dto.details.iban]
          .find((value): value is string => typeof value === 'string')
          ?.replace(/\s/g, '')
      : undefined;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supplierBankAccount.update({
        where: { id: bankId },
        data: {
          label: dto.label,
          bankName: dto.bankName,
          currency: dto.currency?.toUpperCase(),
          ...(dto.details
            ? {
                encryptedDetails: this.sensitive.encrypt(
                  JSON.stringify(dto.details),
                  'pii',
                ),
                lastFour: accountReference?.slice(-4),
              }
            : {}),
          updatedBy: userId,
        },
        select: {
          id: true,
          label: true,
          bankName: true,
          currency: true,
          lastFour: true,
          status: true,
          updatedAt: true,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'SUPPLIER_BANK_UPDATED',
          entityType: 'partner',
          entityId: supplierId,
          oldValues: {
            bankAccountId: bankId,
            currency: current.currency,
            lastFour: current.lastFour,
          },
          newValues: {
            bankAccountId: bankId,
            currency: updated.currency,
            lastFour: updated.lastFour,
            sensitiveDetailsChanged: Boolean(dto.details),
          },
        },
      });
      return updated;
    });
  }

  async archiveBankAccount(
    supplierId: string,
    bankId: string,
    organizationId: string,
    userId: string,
    reason: string,
  ) {
    const current = await this.prisma.supplierBankAccount.findFirst({
      where: { id: bankId, supplierId, organizationId, archivedAt: null },
      select: { id: true },
    });
    if (!current)
      throw new NotFoundException('Supplier bank account not found');
    return this.prisma.$transaction(async (tx) => {
      const archived = await tx.supplierBankAccount.update({
        where: { id: bankId },
        data: {
          status: 'ARCHIVED',
          archivedAt: new Date(),
          updatedBy: userId,
        },
        select: { id: true, status: true, archivedAt: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'SUPPLIER_BANK_ARCHIVED',
          entityType: 'partner',
          entityId: supplierId,
          newValues: {
            bankAccountId: bankId,
            reasonRecorded: Boolean(reason.trim()),
          },
        },
      });
      return archived;
    });
  }

  async revealBankAccount(
    supplierId: string,
    bankId: string,
    organizationId: string,
    userId: string,
  ) {
    const account = await this.prisma.supplierBankAccount.findFirst({
      where: { id: bankId, supplierId, organizationId, archivedAt: null },
    });
    if (!account)
      throw new NotFoundException('Supplier bank account not found');
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'SUPPLIER_BANK_REVEALED',
        entityType: 'partner',
        entityId: supplierId,
        newValues: { bankAccountId: account.id },
      },
    });
    return {
      id: account.id,
      label: account.label,
      bankName: account.bankName,
      currency: account.currency,
      details: JSON.parse(
        this.sensitive.decrypt(account.encryptedDetails, 'pii'),
      ) as unknown,
    };
  }

  async addIncident(
    supplierId: string,
    organizationId: string,
    userId: string,
    dto: CreateSupplierIncidentDto,
  ) {
    await this.requireSupplier(supplierId, organizationId);
    return this.prisma.$transaction(async (tx) => {
      const incident = await tx.supplierIncident.create({
        data: {
          ...dto,
          occurredAt: new Date(dto.occurredAt),
          organizationId,
          supplierId,
          reportedBy: userId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'SUPPLIER_INCIDENT_CREATED',
          entityType: 'partner',
          entityId: supplierId,
          newValues: {
            incidentId: incident.id,
            severity: incident.severity,
            type: incident.type,
          },
        },
      });
      return incident;
    });
  }

  async resolveIncident(
    supplierId: string,
    incidentId: string,
    organizationId: string,
    userId: string,
    dto: ResolveSupplierIncidentDto,
  ) {
    const incident = await this.prisma.supplierIncident.findFirst({
      where: { id: incidentId, supplierId, organizationId },
    });
    if (!incident) throw new NotFoundException('Supplier incident not found');
    if (incident.status === 'RESOLVED') return incident;
    return this.prisma.$transaction(async (tx) => {
      const resolved = await tx.supplierIncident.update({
        where: { id: incidentId },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolvedBy: userId,
          resolution: dto.resolution,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'SUPPLIER_INCIDENT_RESOLVED',
          entityType: 'partner',
          entityId: supplierId,
          newValues: { incidentId, resolutionRecorded: true },
        },
      });
      return resolved;
    });
  }

  async updateScore(
    supplierId: string,
    organizationId: string,
    userId: string,
    dto: UpdateSupplierScoreDto,
  ) {
    await this.requireSupplier(supplierId, organizationId);
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.partner.update({
        where: { id: supplierId },
        data: {
          scoreReliability: dto.reliability,
          scoreQuality: dto.quality,
          scoreDelivery: dto.delivery,
          scoreCommunication: dto.communication,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'SUPPLIER_SCORE_UPDATED',
          entityType: 'partner',
          entityId: supplierId,
          newValues: {
            reliability: dto.reliability,
            quality: dto.quality,
            delivery: dto.delivery,
            communication: dto.communication,
          },
        },
      });
      return supplier;
    });
  }

  async linkDossier(
    supplierId: string,
    organizationId: string,
    userId: string,
    dto: LinkSupplierDossierDto,
  ) {
    await this.requireSupplier(supplierId, organizationId);
    const dossier = await this.prisma.dossier.findFirst({
      where: { id: dto.dossierId, organizationId },
      select: { id: true },
    });
    if (!dossier) throw new NotFoundException('Dossier not found');
    return this.prisma.supplierDossierLink.upsert({
      where: { supplierId_dossierId: { supplierId, dossierId: dto.dossierId } },
      create: {
        organizationId,
        supplierId,
        dossierId: dto.dossierId,
        source: dto.source ?? 'MANUAL',
        createdBy: userId,
      },
      update: {},
    });
  }

  async eligibleVehicles(
    supplierId: string,
    organizationId: string,
    search?: string,
  ) {
    await this.requireSupplier(supplierId, organizationId);
    const term = search?.trim();
    return this.prisma.vehicle.findMany({
      where: {
        organizationId,
        archivedAt: null,
        OR: [{ supplierId: null }, { supplierId }],
        ...(term
          ? {
              AND: [
                {
                  OR: [
                    { brand: { contains: term, mode: 'insensitive' } },
                    { model: { contains: term, mode: 'insensitive' } },
                    { vin: { contains: term, mode: 'insensitive' } },
                  ],
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        brand: true,
        model: true,
        year: true,
        vin: true,
        status: true,
        supplierId: true,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    });
  }

  async linkVehicle(
    supplierId: string,
    organizationId: string,
    userId: string,
    dto: LinkSupplierVehicleDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.partner.findFirst({
        where: {
          id: supplierId,
          organizationId,
          type: 'supplier',
          status: { not: 'archived' },
        },
        select: { id: true },
      });
      if (!supplier) throw new NotFoundException('Supplier not found');

      const vehicle = await tx.vehicle.findFirst({
        where: { id: dto.vehicleId, organizationId, archivedAt: null },
        include: {
          purchases: {
            where: { status: { not: 'cancelled' } },
            select: { supplierId: true },
          },
        },
      });
      if (!vehicle) throw new NotFoundException('Vehicle not found');
      if (vehicle.supplierId === supplierId) return vehicle;
      if (vehicle.supplierId && vehicle.supplierId !== supplierId) {
        throw new ConflictException({
          code: 'VEHICLE_ALREADY_ASSIGNED_TO_SUPPLIER',
          message: 'Vehicle already has another primary supplier',
        });
      }
      if (
        vehicle.purchases.some((purchase) => purchase.supplierId !== supplierId)
      ) {
        throw new ConflictException({
          code: 'VEHICLE_PURCHASE_SUPPLIER_MISMATCH',
          message:
            'Vehicle purchase history belongs to another supplier and cannot be reassigned',
        });
      }

      const assignment = await tx.vehicle.updateMany({
        where: {
          id: vehicle.id,
          organizationId,
          archivedAt: null,
          supplierId: null,
        },
        data: { supplierId },
      });
      if (assignment.count !== 1) {
        throw new ConflictException({
          code: 'VEHICLE_SUPPLIER_ASSIGNMENT_CONFLICT',
          message: 'Vehicle supplier assignment changed concurrently',
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'SUPPLIER_VEHICLE_LINKED',
          entityType: 'Vehicle',
          entityId: vehicle.id,
          oldValues: { supplierId: vehicle.supplierId },
          newValues: { supplierId },
        },
      });
      return { ...vehicle, supplierId };
    });
  }

  private async requireSupplier(id: string, organizationId: string) {
    const supplier = await this.prisma.partner.findFirst({
      where: { id, organizationId, type: 'supplier' },
      select: { id: true },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  private async requirePartner(id: string, organizationId: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!partner) {
      throw new NotFoundException(
        `Partner with ID ${id} not found in your organization`,
      );
    }
    return partner;
  }
}
