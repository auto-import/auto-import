import {
  Injectable,
  NotFoundException,
  Logger,
  ConflictException,
  Optional,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateClientDto } from './dto/update-client.dto';
import { paginate } from '../common/helpers/pagination.helper';
import { Prisma } from '@prisma/client';
import { ContactResolutionService } from '../crm/contact-resolution.service';
import { CreateClientDto } from './dto/create-client.dto';
import {
  maskIdentity,
  normalizeNin,
  normalizePassport,
  SensitiveFieldService,
} from '../common/security/sensitive-field.service';
import {
  DocumentsService,
  type UploadedBufferFile,
} from '../documents/documents.service';

type IdentityStorageKey =
  | 'ninEncrypted'
  | 'ninLookupHash'
  | 'passportEncrypted'
  | 'passportLookupHash'
  | 'passportNumber';

type MaskedClient<T> = Omit<T, IdentityStorageKey> & {
  ninMasked: string | null;
  passportNumberMasked: string | null;
  identityConfigured: { nin: boolean; passport: boolean };
};

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);
  private readonly sensitive = new SensitiveFieldService();

  constructor(
    private prisma: PrismaService,
    @Optional() private readonly contacts?: ContactResolutionService,
    private readonly documents?: DocumentsService,
  ) {}

  async createWithPassport(
    dto: CreateClientDto,
    organizationId: string,
    userId: string,
    passportScan: UploadedBufferFile,
  ) {
    if (!this.documents) throw new Error('Documents service unavailable');
    const client = await this.create(dto, organizationId, userId);
    try {
      const document = await this.documents.uploadDossierDocument(
        organizationId,
        userId,
        passportScan,
        {
          clientId: client.id,
          kind: 'DOSSIER_DOCUMENT',
          documentType: 'PASSPORT_SCAN',
          title: 'Passport scan',
        },
      );
      return { client, document };
    } catch (error) {
      await this.prisma.client.delete({ where: { id: client.id } });
      throw error;
    }
  }

  async create(dto: CreateClientDto, organizationId: string, userId: string) {
    const assignedTo = dto.assignedTo ?? userId;
    const {
      nin,
      passportNumber,
      identityIssueDate,
      passportExpiry,
      ...clientData
    } = dto;
    this.assertNinRequirement(dto.nationality, Boolean(nin?.trim()));
    const identity = this.protectIdentity(organizationId, nin, passportNumber);
    const client = await this.prisma.$transaction(
      async (tx) => {
        const assignee = await tx.user.findFirst({
          where: { id: assignedTo, organizationId, status: 'active' },
          select: { id: true },
        });
        if (!assignee) throw new NotFoundException('Assignee not found');
        const client = await tx.client.create({
          data: {
            ...clientData,
            ...identity,
            passportNumber: null,
            identityIssueDate: identityIssueDate
              ? new Date(identityIssueDate)
              : undefined,
            passportExpiry: passportExpiry
              ? new Date(passportExpiry)
              : undefined,
            assignedTo,
            organizationId,
          },
        });
        if (this.contacts) {
          await this.contacts.syncClientContacts(
            tx,
            organizationId,
            client.id,
            clientData.phone,
            clientData.email,
          );
        }
        return client;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.maskClient(client);
  }

  async findAll(
    organizationId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { search?: string },
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = { organizationId };
    if (filters?.search) {
      const search = filters.search.trim();
      const identityHashes: Prisma.ClientWhereInput[] = [];
      if (/^\d{18}$/.test(search.replace(/[ -]/g, ''))) {
        identityHashes.push({
          ninLookupHash: this.sensitive.blindHash(
            organizationId,
            normalizeNin(search),
          ),
        });
      }
      if (/^[A-Za-z0-9\s]{6,12}$/.test(search)) {
        identityHashes.push({
          passportLookupHash: this.sensitive.blindHash(
            organizationId,
            normalizePassport(search),
          ),
        });
      }
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        ...identityHashes,
      ];
    }

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip,
        take: limit,
        include: {
          prospect: {
            include: {
              activities: {
                orderBy: { activityDate: 'desc' },
                take: 3,
              },
            },
          },
          dossiers: {
            where: { organizationId },
            select: {
              id: true,
              reference: true,
              status: true,
              createdAt: true,
            },
          },
          orders: {
            where: { organizationId },
            select: {
              id: true,
              orderNumber: true,
              status: true,
              total: true,
              createdAt: true,
            },
          },
          assignee: { select: { id: true, firstName: true, lastName: true } },
          contactPoints: true,
          tasks: {
            where: { status: { notIn: ['completed', 'cancelled'] } },
            orderBy: { dueDate: 'asc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.count({ where }),
    ]);

    return paginate(
      clients.map((client) => this.maskClient(client)),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string, organizationId?: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, ...(organizationId && { organizationId }) },
      include: {
        prospect: {
          include: {
            activities: {
              orderBy: { activityDate: 'desc' },
            },
          },
        },
        dossiers: {
          where: organizationId ? { organizationId } : undefined,
          include: {
            dossierVehicles: {
              include: { vehicle: true },
            },
            order: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        orders: {
          where: organizationId ? { organizationId } : undefined,
          include: {
            items: true,
            invoices: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        contactPoints: true,
        tasks: { orderBy: { dueDate: 'asc' } },
        documents: {
          where: { organizationId },
          select: {
            id: true,
            kind: true,
            documentType: true,
            title: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    // Format dossiers with vehicles for backward compatibility
    const formattedDossiers = client.dossiers.map((d) => ({
      ...d,
      vehicles: d.dossierVehicles
        ? d.dossierVehicles.map((dv) => dv.vehicle)
        : [],
      vehicle:
        d.dossierVehicles && d.dossierVehicles.length > 0
          ? d.dossierVehicles[0].vehicle
          : null,
      vehicleId:
        d.dossierVehicles && d.dossierVehicles.length > 0
          ? d.dossierVehicles[0].vehicleId
          : null,
    }));

    // Add summary stats
    const stats = {
      totalDossiers: client.dossiers.length,
      totalOrders: client.orders.length,
      activeDossiers: client.dossiers.filter(
        (d) =>
          d.status !== 'closed' &&
          d.status !== 'serviceCompleted' &&
          d.status !== 'cancelled',
      ).length,
    };

    return this.maskClient({ ...client, dossiers: formattedDossiers, stats });
  }

  async update(
    id: string,
    organizationId: string,
    updateClientDto: UpdateClientDto,
  ) {
    const existing = await this.findOne(id, organizationId);
    this.assertNinRequirement(
      updateClientDto.nationality ?? existing.nationality,
      updateClientDto.nin !== undefined
        ? Boolean(updateClientDto.nin.trim())
        : existing.identityConfigured.nin,
    );

    const client = await this.prisma.$transaction(async (tx) => {
      if (updateClientDto.assignedTo) {
        const assignee = await tx.user.findFirst({
          where: {
            id: updateClientDto.assignedTo,
            organizationId,
            status: 'active',
          },
          select: { id: true },
        });
        if (!assignee) throw new NotFoundException('Assignee not found');
      }
      const {
        nin,
        passportNumber,
        identityIssueDate,
        passportExpiry,
        ...safeUpdate
      } = updateClientDto;
      const identity = this.protectIdentity(
        organizationId,
        nin,
        passportNumber,
      );
      const updated = await tx.client.update({
        where: { id },
        data: {
          ...safeUpdate,
          ...identity,
          ...(passportNumber !== undefined ? { passportNumber: null } : {}),
          ...(identityIssueDate !== undefined
            ? { identityIssueDate: new Date(identityIssueDate) }
            : {}),
          ...(passportExpiry !== undefined
            ? { passportExpiry: new Date(passportExpiry) }
            : {}),
        },
        include: { prospect: true, dossiers: true, orders: true },
      });
      if (
        updateClientDto.phone !== undefined ||
        updateClientDto.email !== undefined
      ) {
        if (this.contacts) {
          await this.contacts.syncClientContacts(
            tx,
            organizationId,
            id,
            updateClientDto.phone,
            updateClientDto.email,
          );
        }
      }
      return updated;
    });

    this.logger.log(
      `Client updated: ${client.firstName} ${client.lastName} (${id})`,
    );
    return this.maskClient(client);
  }

  async revealIdentity(id: string, organizationId: string, userId: string) {
    const [client, user] = await Promise.all([
      this.prisma.client.findFirst({ where: { id, organizationId } }),
      this.prisma.user.findFirst({
        where: { id: userId, organizationId },
        select: { lastLoginAt: true },
      }),
    ]);
    if (!client) throw new NotFoundException('Client not found');
    if (
      !user?.lastLoginAt ||
      Date.now() - user.lastLoginAt.getTime() > 15 * 60_000
    ) {
      throw new ForbiddenException({
        code: 'RECENT_AUTHENTICATION_REQUIRED',
        message: 'Sign in again before revealing identity data',
      });
    }
    const revealed = {
      nin: client.ninEncrypted
        ? this.sensitive.decrypt(client.ninEncrypted, 'pii')
        : null,
      passportNumber: client.passportEncrypted
        ? this.sensitive.decrypt(client.passportEncrypted, 'pii')
        : client.passportNumber,
    };
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'CLIENT_IDENTITY_REVEALED',
        entityType: 'Client',
        entityId: id,
        newValues: {
          fields: Object.entries(revealed)
            .filter(([, value]) => Boolean(value))
            .map(([key]) => key),
        },
      },
    });
    return revealed;
  }

  private protectIdentity(
    organizationId: string,
    nin?: string,
    passportNumber?: string,
  ) {
    try {
      const normalizedNin = nin === undefined ? undefined : normalizeNin(nin);
      const normalizedPassport =
        passportNumber === undefined
          ? undefined
          : normalizePassport(passportNumber);
      return {
        ...(normalizedNin === undefined
          ? {}
          : {
              ninEncrypted: this.sensitive.encrypt(normalizedNin, 'pii'),
              ninLookupHash: this.sensitive.blindHash(
                organizationId,
                normalizedNin,
              ),
            }),
        ...(normalizedPassport === undefined
          ? {}
          : {
              passportEncrypted: this.sensitive.encrypt(
                normalizedPassport,
                'pii',
              ),
              passportLookupHash: this.sensitive.blindHash(
                organizationId,
                normalizedPassport,
              ),
            }),
      };
    } catch (error) {
      if (error instanceof Error && !('getStatus' in error)) {
        throw new BadRequestException({
          code: 'CLIENT_IDENTITY_INVALID',
          message: error.message,
        });
      }
      throw error;
    }
  }

  private assertNinRequirement(
    nationality: string | null | undefined,
    hasNin: boolean,
  ) {
    if (!nationality) return;
    const normalized = nationality
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
    if (
      ['DZ', 'DZA', 'ALGERIA', 'ALGERIE', 'ALGERIAN'].includes(normalized) &&
      !hasNin
    ) {
      throw new BadRequestException({
        code: 'CLIENT_NIN_REQUIRED_FOR_ALGERIAN',
        message: 'NIN is required for an Algerian client',
      });
    }
  }

  private maskClient<T extends Record<string, unknown>>(
    client: T,
  ): MaskedClient<T> {
    const rawNin =
      typeof client.ninEncrypted === 'string'
        ? this.sensitive.decrypt(client.ninEncrypted, 'pii')
        : null;
    const rawPassport =
      typeof client.passportEncrypted === 'string'
        ? this.sensitive.decrypt(client.passportEncrypted, 'pii')
        : typeof client.passportNumber === 'string'
          ? client.passportNumber
          : null;
    const publicClient: Record<string, unknown> = { ...client };
    delete publicClient.ninEncrypted;
    delete publicClient.ninLookupHash;
    delete publicClient.passportEncrypted;
    delete publicClient.passportLookupHash;
    delete publicClient.passportNumber;
    return {
      ...(publicClient as Omit<T, IdentityStorageKey>),
      ninMasked: maskIdentity(rawNin),
      passportNumberMasked: maskIdentity(rawPassport),
      identityConfigured: {
        nin: Boolean(rawNin),
        passport: Boolean(rawPassport),
      },
    };
  }

  async remove(id: string, organizationId: string) {
    const client = await this.findOne(id, organizationId);

    if (
      (client?.dossiers?.length ?? 0) > 0 ||
      (client?.orders?.length ?? 0) > 0
    ) {
      throw new ConflictException(
        'Cannot delete client with existing dossiers or orders',
      );
    }

    await this.prisma.client.delete({
      where: { id },
    });

    this.logger.log(`Client deleted: ${id}`);
    return { message: 'Client deleted successfully' };
  }

  async getDossiers(clientId: string, organizationId: string) {
    await this.findOne(clientId, organizationId);

    const dossiers = await this.prisma.dossier.findMany({
      where: { clientId, organizationId },
      include: {
        dossierVehicles: {
          include: { vehicle: true },
        },
        order: true,
        history: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return dossiers.map((d) => ({
      ...d,
      vehicles: d.dossierVehicles
        ? d.dossierVehicles.map((dv) => dv.vehicle)
        : [],
      vehicle:
        d.dossierVehicles && d.dossierVehicles.length > 0
          ? d.dossierVehicles[0].vehicle
          : null,
      vehicleId:
        d.dossierVehicles && d.dossierVehicles.length > 0
          ? d.dossierVehicles[0].vehicleId
          : null,
    }));
  }

  async getOrders(clientId: string, organizationId: string) {
    await this.findOne(clientId, organizationId);

    return this.prisma.order.findMany({
      where: { clientId, organizationId },
      include: {
        items: true,
        invoices: true,
        dossier: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
