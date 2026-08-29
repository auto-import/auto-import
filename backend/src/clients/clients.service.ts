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
import { CrmReferenceService } from '../crm/crm-reference.service';
import {
  CrmReferenceKind,
  Permission,
  type Permission as PermissionValue,
} from '@auto-import/contracts';

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
    @Optional() private readonly references?: CrmReferenceService,
  ) {}

  async createWithPassport(
    dto: CreateClientDto,
    organizationId: string,
    userId: string,
    passportScan: UploadedBufferFile,
  ) {
    if (!this.documents) throw new Error('Documents service unavailable');
    const client = await this.create(dto, organizationId, userId, true);
    if ('created' in client && client.created === false) {
      throw new ConflictException(
        'Passport upload cannot target an existing matched client',
      );
    }
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
      await this.prisma.$transaction(async (tx) => {
        await tx.client.update({
          where: { id: client.id },
          data: {
            status: 'archived',
            archivedAt: new Date(),
            archivedById: userId,
            archiveReason: 'Passport upload failed during creation',
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            userId,
            action: 'CLIENT_CREATION_ARCHIVED_AFTER_DOCUMENT_FAILURE',
            entityType: 'Client',
            entityId: client.id,
          },
        });
      });
      throw error;
    }
  }

  async create(
    dto: CreateClientDto,
    organizationId: string,
    userId: string,
    canWriteIdentity = false,
  ) {
    if (!this.contacts || !this.references)
      throw new Error('CRM services unavailable');
    this.assertIdentityPermission(dto, canWriteIdentity);
    const matched = dto.phone
      ? await this.prisma.$transaction(async (tx) => {
          const normalizedValue = await this.contacts!.normalizePhoneForCountry(
            tx,
            organizationId,
            dto.phone!,
            dto.countryId,
          );
          return this.contacts!.matchNormalizedPhoneInTransaction(
            tx,
            organizationId,
            normalizedValue,
          );
        })
      : null;
    if (matched?.match?.matchState === 'AMBIGUOUS') {
      throw new ConflictException({
        code: 'AMBIGUOUS_PHONE_MATCH',
        message: 'Reconcile phone ownership before creating a client',
      });
    }
    if (matched?.match?.clientId) {
      const existing = await this.prisma.client.findFirst({
        where: { id: matched.match.clientId, organizationId },
      });
      if (existing)
        return this.maskClient({
          ...existing,
          created: false,
          matchState: 'MATCHED',
        });
    }
    if (matched?.match?.prospectId) {
      throw new ConflictException({
        code: 'PHONE_MATCHES_EXISTING_LEAD',
        message:
          'Convert the existing lead instead of creating a duplicate client',
        matchedRecord: { prospectId: matched.match.prospectId },
      });
    }
    const assignedTo = dto.assignedTo ?? userId;
    const {
      nin,
      passportNumber,
      identityIssueDate,
      passportExpiry,
      ...clientData
    } = dto;
    const identity = this.protectIdentity(organizationId, nin, passportNumber);
    const client = await this.prisma.$transaction(
      async (tx) => {
        const assignee = await tx.user.findFirst({
          where: {
            id: assignedTo,
            organizationId,
            status: 'active',
            userRoles: {
              some: {
                role: {
                  rolePermissions: {
                    some: {
                      permission: {
                        OR: [
                          { resource: 'clients', action: 'write' },
                          { resource: 'prospects', action: 'write' },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
          select: { id: true },
        });
        if (!assignee) throw new NotFoundException('Assignee not found');
        await this.references!.assertReference(
          tx,
          organizationId,
          clientData.countryId,
          CrmReferenceKind.COUNTRY,
        );
        const nationalityReference = await this.references!.assertReference(
          tx,
          organizationId,
          clientData.nationalityCountryId,
          CrmReferenceKind.COUNTRY,
        );
        const phoneNormalized = clientData.phone
          ? await this.contacts!.normalizePhoneForCountry(
              tx,
              organizationId,
              clientData.phone,
              clientData.countryId,
            )
          : null;
        const client = await tx.client.create({
          data: {
            ...clientData,
            ...identity,
            passportNumber: null,
            phoneNormalized,
            nationality: clientData.nationality ?? nationalityReference?.code,
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
            phoneNormalized,
          );
        }
        await tx.auditLog.create({
          data: {
            organizationId,
            userId,
            action: 'CLIENT_CREATED',
            entityType: 'Client',
            entityId: client.id,
            newValues: {
              identityFieldsConfigured: Object.keys(identity).filter((key) =>
                key.endsWith('Encrypted'),
              ),
            },
          },
        });
        return client;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.maskClient({ ...client, created: true, matchState: 'CREATED' });
  }

  async findAll(
    organizationId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { search?: string },
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = { organizationId, archivedAt: null };
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
            select: { id: true, crmStatus: true, convertedAt: true },
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

  async findOne(
    id: string,
    organizationId: string,
    permissions: readonly PermissionValue[] = [],
  ) {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId },
      include: {
        prospect: {
          include: {
            activities: {
              orderBy: { activityDate: 'desc' },
            },
          },
        },
        dossiers: {
          where: { organizationId },
          include: {
            dossierVehicles: {
              include: { vehicle: true },
            },
            order: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        orders: {
          where: { organizationId },
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
        gedLinks: {
          where: { organizationId, archivedAt: null },
          include: {
            document: {
              select: {
                id: true,
                title: true,
                sensitivity: true,
                validationStatus: true,
                createdAt: true,
                documentType: { select: { code: true, labelFr: true } },
              },
            },
          },
        },
        country: true,
        nationalityCountry: true,
        conversions: {
          include: {
            prospect: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                crmStatus: true,
                createdAt: true,
              },
            },
            actor: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { convertedAt: 'desc' },
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

    const publicClient = this.maskClient({
      ...client,
      dossiers: formattedDossiers,
      stats,
    }) as Record<string, unknown>;
    const can = (permission: PermissionValue) =>
      permissions.includes(permission);
    if (
      !can(Permission.CRM_TIMELINE_READ) &&
      publicClient.prospect &&
      typeof publicClient.prospect === 'object'
    ) {
      delete (publicClient.prospect as Record<string, unknown>).activities;
    }
    if (!can(Permission.DOSSIERS_READ)) {
      delete publicClient.dossiers;
      delete publicClient.stats;
    }
    if (!can(Permission.ORDERS_READ)) delete publicClient.orders;
    if (!can(Permission.DOCUMENTS_READ)) {
      delete publicClient.documents;
      delete publicClient.gedLinks;
    } else if (publicClient.gedLinks && Array.isArray(publicClient.gedLinks)) {
      const canGedMetadata = can(Permission.GED_SENSITIVE_METADATA);
      publicClient.gedLinks = (
        publicClient.gedLinks as Array<Record<string, unknown>>
      ).map((link) => {
        const doc = link.document as
          | { id?: string; title?: string; sensitivity?: string }
          | undefined;
        const restricted = doc?.sensitivity?.startsWith('RESTRICTED_');
        if (restricted && !canGedMetadata) {
          return {
            id: link.id,
            documentId: link.documentId,
            restricted: true,
            document: {
              id: doc?.id,
              title: 'Document confidentiel',
              sensitivity: doc?.sensitivity,
              restricted: true,
            },
          };
        }
        return link;
      });
    }
    if (!can(Permission.TASKS_READ)) delete publicClient.tasks;
    const [payments, history] = await Promise.all([
      can(Permission.PAYMENTS_READ)
        ? this.prisma.payment.findMany({
            where: { organizationId, clientId: id },
            select: {
              id: true,
              amount: true,
              currency: true,
              paymentMethod: true,
              reference: true,
              status: true,
              paymentDate: true,
              confirmedAt: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
      can(Permission.AUDIT_READ)
        ? this.prisma.auditLog.findMany({
            where: { organizationId, entityType: 'Client', entityId: id },
            select: {
              id: true,
              action: true,
              createdAt: true,
              oldValues: true,
              newValues: true,
              user: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
          })
        : Promise.resolve([]),
    ]);
    publicClient.payments = payments;
    publicClient.history = history;
    publicClient.access = {
      interactions: can(Permission.CRM_TIMELINE_READ),
      dossiers: can(Permission.DOSSIERS_READ),
      documents: can(Permission.DOCUMENTS_READ),
      payments: can(Permission.PAYMENTS_READ),
      vehicles: can(Permission.VEHICLES_READ),
      tasks: can(Permission.TASKS_READ),
      history: can(Permission.AUDIT_READ),
      identityReveal: can(Permission.CLIENTS_IDENTITY_REVEAL),
      identityWrite: can(Permission.CLIENTS_IDENTITY_WRITE),
    };
    return publicClient;
  }

  async update(
    id: string,
    organizationId: string,
    updateClientDto: UpdateClientDto,
    actorId?: string,
    canWriteIdentity = false,
  ) {
    if (!this.contacts || !this.references)
      throw new Error('CRM services unavailable');
    this.assertIdentityPermission(updateClientDto, canWriteIdentity);
    const existing = await this.findOne(id, organizationId, [
      Permission.CRM_TIMELINE_READ,
      Permission.DOSSIERS_READ,
      Permission.ORDERS_READ,
      Permission.DOCUMENTS_READ,
      Permission.TASKS_READ,
    ]);
    // NIN is optional at initial creation in V2. If a caller explicitly sends
    // an Algerian NIN update, an empty value is still rejected as an accidental
    // destructive identity clear.
    if (updateClientDto.nin !== undefined) {
      const nationality = updateClientDto.nationality ?? existing.nationality;
      this.assertNinRequirement(
        typeof nationality === 'string' ? nationality : null,
        Boolean(updateClientDto.nin.trim()),
      );
    }

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
      await this.references!.assertReference(
        tx,
        organizationId,
        updateClientDto.countryId,
        CrmReferenceKind.COUNTRY,
      );
      const nationalityReference = await this.references!.assertReference(
        tx,
        organizationId,
        updateClientDto.nationalityCountryId,
        CrmReferenceKind.COUNTRY,
      );
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
      const phoneNormalized =
        safeUpdate.phone === undefined
          ? undefined
          : safeUpdate.phone
            ? await this.contacts!.normalizePhoneForCountry(
                tx,
                organizationId,
                safeUpdate.phone,
                safeUpdate.countryId ??
                  (existing.countryId as string | null | undefined),
              )
            : null;
      const updated = await tx.client.update({
        where: { id },
        data: {
          ...safeUpdate,
          ...identity,
          ...(phoneNormalized !== undefined ? { phoneNormalized } : {}),
          ...(updateClientDto.nationalityCountryId
            ? { nationality: nationalityReference?.code }
            : {}),
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
            phoneNormalized,
          );
        }
      }
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actorId,
          action: 'CLIENT_UPDATED',
          entityType: 'Client',
          entityId: id,
          newValues: {
            changedFields: Object.keys(updateClientDto)
              .filter((key) => !['nin', 'passportNumber'].includes(key))
              .sort(),
            identityChanged: nin !== undefined || passportNumber !== undefined,
          },
        },
      });
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

  async remove(
    id: string,
    organizationId: string,
    actorId: string,
    reason: string,
  ) {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId },
    });
    if (!client) throw new NotFoundException('Client not found');
    if (client.archivedAt)
      return {
        message: 'Client already archived',
        archivedAt: client.archivedAt,
      };
    const archivedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id },
        data: {
          status: 'archived',
          archivedAt,
          archivedById: actorId,
          archiveReason: reason,
        },
      });
      await tx.task.updateMany({
        where: {
          organizationId,
          clientId: id,
          status: { notIn: ['completed', 'cancelled'] },
        },
        data: { status: 'cancelled' },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actorId,
          action: 'CLIENT_ARCHIVED',
          entityType: 'Client',
          entityId: id,
          newValues: { reasonProvided: Boolean(reason) },
        },
      });
    });
    this.logger.log(`Client archived: ${id}`);
    return { message: 'Client archived successfully', archivedAt };
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

  private assertIdentityPermission(
    dto: Pick<
      CreateClientDto,
      'nin' | 'passportNumber' | 'identityIssueDate' | 'passportExpiry'
    >,
    canWriteIdentity: boolean,
  ) {
    const requested = Boolean(
      dto.nin ||
      dto.passportNumber ||
      dto.identityIssueDate ||
      dto.passportExpiry,
    );
    if (requested && !canWriteIdentity) {
      throw new ForbiddenException({
        code: 'CLIENT_IDENTITY_WRITE_FORBIDDEN',
        message: 'Restricted identity permission is required',
      });
    }
  }
}
