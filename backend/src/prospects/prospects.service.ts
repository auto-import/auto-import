import {
  Injectable,
  NotFoundException,
  Logger,
  ConflictException,
  Optional,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CrmLeadStatus, CrmReferenceKind } from '@auto-import/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import { CreateProspectDto } from './dto/create-prospect.dto';
import { UpdateProspectDto } from './dto/update-prospect.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ConvertProspectDto } from './dto/convert-prospect.dto';
import { FilterProspectDto } from './dto/filter-prospect.dto';
import { ContactResolutionService } from '../crm/contact-resolution.service';
import { CrmReferenceService } from '../crm/crm-reference.service';
import {
  assertCrmLeadTransition,
  legacyStatusProjection,
} from '../crm/crm-lead-workflow';
import { TransitionProspectDto } from './dto/transition-prospect.dto';

function isPrismaConcurrencyError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (['P2002', 'P2034'].includes(error.code)) return true;
    if (error.code !== 'P2010') return false;
    const metadata = JSON.stringify(error.meta ?? {}).toLowerCase();
    return (
      metadata.includes('40001') ||
      metadata.includes('40p01') ||
      metadata.includes('could not serialize') ||
      metadata.includes('deadlock detected')
    );
  }
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return ['23505', '40001', '40P01'].includes(String(error.code));
}

@Injectable()
export class ProspectsService {
  private readonly logger = new Logger(ProspectsService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private readonly contacts?: ContactResolutionService,
    @Optional() private readonly references?: CrmReferenceService,
  ) {}

  async create(
    createProspectDto: CreateProspectDto,
    userId: string,
    organizationId: string,
  ) {
    if (!this.contacts || !this.references) {
      throw new Error('CRM identity services unavailable');
    }
    const initialMatch = await this.prisma.$transaction(async (tx) => {
      const normalizedValue = await this.contacts!.normalizePhoneForCountry(
        tx,
        organizationId,
        createProspectDto.phone,
        createProspectDto.countryId,
      );
      return this.contacts!.matchNormalizedPhoneInTransaction(
        tx,
        organizationId,
        normalizedValue,
      );
    });
    if (initialMatch.match) {
      return this.matchedCreateResponse(
        organizationId,
        userId,
        initialMatch.normalizedValue,
        initialMatch.match,
      );
    }
    const assignedTo = createProspectDto.assignedTo || userId;
    const { requirement, nextActionAt, ...leadData } = createProspectDto;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const prospect = await this.prisma.$transaction(
          async (transaction) => {
            await this.assertTenantAssignee(
              transaction,
              assignedTo,
              organizationId,
            );
            await this.references!.assertReference(
              transaction,
              organizationId,
              leadData.entryChannelId,
              CrmReferenceKind.ENTRY_CHANNEL,
              true,
            );
            await this.references!.assertReference(
              transaction,
              organizationId,
              leadData.marketingSourceId,
              CrmReferenceKind.MARKETING_SOURCE,
              true,
            );
            await this.references!.assertReference(
              transaction,
              organizationId,
              leadData.countryId,
              CrmReferenceKind.COUNTRY,
            );
            const phoneNormalized =
              await this.contacts!.normalizePhoneForCountry(
                transaction,
                organizationId,
                leadData.phone,
                leadData.countryId,
              );
            const created = await transaction.prospect.create({
              data: {
                ...leadData,
                organizationId,
                assignedTo,
                phoneNormalized,
                crmStatus: CrmLeadStatus.NEW,
                status: legacyStatusProjection(CrmLeadStatus.NEW),
                nextActionAt: nextActionAt ? new Date(nextActionAt) : undefined,
                vehicleRequests: requirement
                  ? { create: { ...requirement, organizationId, assignedTo } }
                  : undefined,
              },
              include: this.prospectInclude(),
            });
            await this.contacts!.syncProspectContacts(
              transaction,
              organizationId,
              created.id,
              leadData.phone,
              leadData.email,
              phoneNormalized,
            );
            await transaction.prospectStatusHistory.create({
              data: {
                organizationId,
                prospectId: created.id,
                changedBy: userId,
                toStatus: CrmLeadStatus.NEW,
                reason: 'Lead created in V2 CRM',
              },
            });
            await this.syncFollowUpTask(
              transaction,
              organizationId,
              created.id,
              assignedTo,
              userId,
              nextActionAt ? new Date(nextActionAt) : null,
              leadData.nextAction,
            );
            await transaction.auditLog.create({
              data: {
                organizationId,
                userId,
                action: 'CRM_LEAD_CREATED',
                entityType: 'Prospect',
                entityId: created.id,
                newValues: { crmStatus: CrmLeadStatus.NEW, hasPhone: true },
              },
            });
            return created;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        this.logger.log(
          `Prospect created: ${prospect.firstName} ${prospect.lastName} (${prospect.id})`,
        );
        return { ...prospect, created: true, matchState: 'CREATED' as const };
      } catch (error) {
        if (!isPrismaConcurrencyError(error)) throw error;
        const winner = await this.prisma.$transaction(async (tx) => {
          const normalizedValue = await this.contacts!.normalizePhoneForCountry(
            tx,
            organizationId,
            createProspectDto.phone,
            createProspectDto.countryId,
          );
          return this.contacts!.matchNormalizedPhoneInTransaction(
            tx,
            organizationId,
            normalizedValue,
          );
        });
        if (winner.match) {
          return this.matchedCreateResponse(
            organizationId,
            userId,
            winner.normalizedValue,
            winner.match,
          );
        }
        if (attempt < 2) continue;
      }
    }
    throw new ServiceUnavailableException({
      code: 'CRM_CONCURRENCY_RETRY_EXHAUSTED',
      message: 'CRM operation could not be completed safely; retry the request',
    });
  }

  async findAll(
    organizationId: string,
    page: number = 1,
    limit: number = 20,
    filters?: FilterProspectDto,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.ProspectWhereInput = {
      organizationId,
      ...(!filters?.includeArchived ? { archivedAt: null } : {}),
    };
    if (filters?.status) where.crmStatus = filters.status;
    if (filters?.assignedTo) where.assignedTo = filters.assignedTo;
    if (filters?.entryChannelId) where.entryChannelId = filters.entryChannelId;
    if (filters?.marketingSourceId)
      where.marketingSourceId = filters.marketingSourceId;
    if (filters?.qualification) where.qualification = filters.qualification;
    if (filters?.overdue) {
      where.nextActionAt = { lt: new Date() };
      where.crmStatus = { not: CrmLeadStatus.CONVERTED };
    }
    if (filters?.createdFrom || filters?.createdTo) {
      where.createdAt = {
        ...(filters.createdFrom ? { gte: new Date(filters.createdFrom) } : {}),
        ...(filters.createdTo ? { lte: new Date(filters.createdTo) } : {}),
      };
    }
    if (filters?.updatedFrom || filters?.updatedTo) {
      where.updatedAt = {
        ...(filters.updatedFrom ? { gte: new Date(filters.updatedFrom) } : {}),
        ...(filters.updatedTo ? { lte: new Date(filters.updatedTo) } : {}),
      };
    }
    if (filters?.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [prospects, total] = await Promise.all([
      this.prisma.prospect.findMany({
        where,
        skip,
        take: limit,
        include: {
          ...this.prospectInclude(),
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.prospect.count({ where }),
    ]);

    return paginate(prospects, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const prospect = await this.prisma.prospect.findFirst({
      where: { id, organizationId },
      include: this.prospectInclude(true),
    });

    if (!prospect) {
      throw new NotFoundException(`Prospect with ID ${id} not found`);
    }

    return prospect;
  }

  async update(
    id: string,
    organizationId: string,
    updateProspectDto: UpdateProspectDto,
    changedBy: string,
  ) {
    if (!this.contacts || !this.references)
      throw new Error('CRM services unavailable');
    const prospect = await this.prisma.$transaction(
      async (transaction) => {
        const existing = await transaction.prospect.findFirst({
          where: { id, organizationId },
          select: {
            id: true,
            assignedTo: true,
            archivedAt: true,
            countryId: true,
          },
        });
        if (!existing) throw new NotFoundException('Prospect not found');
        if (existing.archivedAt)
          throw new ConflictException('Archived lead is read-only');
        if (updateProspectDto.assignedTo) {
          await this.assertTenantAssignee(
            transaction,
            updateProspectDto.assignedTo,
            organizationId,
          );
        }
        await this.references!.assertReference(
          transaction,
          organizationId,
          updateProspectDto.entryChannelId,
          CrmReferenceKind.ENTRY_CHANNEL,
        );
        await this.references!.assertReference(
          transaction,
          organizationId,
          updateProspectDto.marketingSourceId,
          CrmReferenceKind.MARKETING_SOURCE,
        );
        await this.references!.assertReference(
          transaction,
          organizationId,
          updateProspectDto.countryId,
          CrmReferenceKind.COUNTRY,
        );
        const { nextActionAt, requirement, ...data } = updateProspectDto;
        const phoneNormalized =
          data.phone === undefined
            ? undefined
            : await this.contacts!.normalizePhoneForCountry(
                transaction,
                organizationId,
                data.phone,
                data.countryId ?? existing.countryId,
              );
        const updated = await transaction.prospect.update({
          where: { id },
          data: {
            ...data,
            ...(phoneNormalized !== undefined ? { phoneNormalized } : {}),
            ...(nextActionAt !== undefined
              ? { nextActionAt: nextActionAt ? new Date(nextActionAt) : null }
              : {}),
          },
          include: this.prospectInclude(false),
        });
        if (
          updateProspectDto.phone !== undefined ||
          updateProspectDto.email !== undefined
        ) {
          if (this.contacts) {
            await this.contacts.syncProspectContacts(
              transaction,
              organizationId,
              id,
              updateProspectDto.phone,
              updateProspectDto.email,
              phoneNormalized,
            );
          }
        }
        if (requirement) {
          const openRequest = await transaction.vehicleRequest.findFirst({
            where: {
              organizationId,
              prospectId: id,
              status: { in: ['open', 'sourcing'] },
            },
            orderBy: { createdAt: 'desc' },
          });
          if (openRequest) {
            await transaction.vehicleRequest.update({
              where: { id: openRequest.id },
              data: requirement,
            });
          } else {
            await transaction.vehicleRequest.create({
              data: {
                ...requirement,
                organizationId,
                prospectId: id,
                assignedTo: updateProspectDto.assignedTo ?? existing.assignedTo,
              },
            });
          }
        }
        await this.syncFollowUpTask(
          transaction,
          organizationId,
          id,
          updateProspectDto.assignedTo ?? existing.assignedTo ?? changedBy,
          changedBy,
          nextActionAt !== undefined
            ? nextActionAt
              ? new Date(nextActionAt)
              : null
            : updated.nextActionAt,
          updateProspectDto.nextAction ?? updated.nextAction,
        );
        await transaction.auditLog.create({
          data: {
            organizationId,
            userId: changedBy,
            action: 'CRM_LEAD_UPDATED',
            entityType: 'Prospect',
            entityId: id,
            newValues: {
              changedFields: Object.keys(updateProspectDto)
                .filter((key) => key !== 'phone')
                .sort(),
            },
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.logger.log(
      `Prospect updated: ${prospect.firstName} ${prospect.lastName} (${id})`,
    );
    return prospect;
  }

  listAssignees(organizationId: string) {
    return this.prisma.user.findMany({
      where: {
        organizationId,
        status: 'active',
        userRoles: {
          some: {
            role: {
              rolePermissions: {
                some: {
                  permission: {
                    OR: [
                      { resource: 'prospects', action: 'write' },
                      { resource: 'callCenter', action: 'handle' },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async transition(
    id: string,
    organizationId: string,
    actorId: string,
    dto: TransitionProspectDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.prospect.findFirst({
        where: { id, organizationId, archivedAt: null },
      });
      if (!current) throw new NotFoundException('Prospect not found');
      assertCrmLeadTransition(current.crmStatus, dto.status);
      if (current.crmStatus === dto.status) return current;
      const updated = await tx.prospect.update({
        where: { id },
        data: {
          crmStatus: dto.status,
          status: legacyStatusProjection(dto.status),
          reconciliationRequired: false,
        },
        include: this.prospectInclude(false),
      });
      await tx.prospectStatusHistory.create({
        data: {
          organizationId,
          prospectId: id,
          changedBy: actorId,
          fromStatus: current.crmStatus,
          toStatus: dto.status,
          reason: dto.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actorId,
          action: 'CRM_LEAD_STATUS_CHANGED',
          entityType: 'Prospect',
          entityId: id,
          oldValues: { crmStatus: current.crmStatus },
          newValues: { crmStatus: dto.status },
        },
      });
      return updated;
    });
  }

  async remove(
    id: string,
    organizationId: string,
    actorId: string,
    reason: string,
  ) {
    const prospect = await this.prisma.prospect.findFirst({
      where: { id, organizationId },
    });
    if (!prospect) throw new NotFoundException('Prospect not found');
    if (prospect.archivedAt)
      return {
        message: 'Prospect already archived',
        archivedAt: prospect.archivedAt,
      };
    const archivedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.prospect.update({
        where: { id },
        data: { archivedAt, archivedById: actorId, archiveReason: reason },
      });
      await tx.task.updateMany({
        where: {
          organizationId,
          prospectId: id,
          status: { notIn: ['completed', 'cancelled'] },
        },
        data: { status: 'cancelled' },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actorId,
          action: 'CRM_LEAD_ARCHIVED',
          entityType: 'Prospect',
          entityId: id,
          newValues: { reasonProvided: Boolean(reason) },
        },
      });
    });
    return { message: 'Prospect archived successfully', archivedAt };
  }

  async addActivity(
    createActivityDto: CreateActivityDto,
    userId: string,
    organizationId: string,
  ) {
    const prospect = await this.findOne(
      createActivityDto.prospectId,
      organizationId,
    );

    const activity = await this.prisma.prospectActivity.create({
      data: {
        ...createActivityDto,
        userId,
        activityDate: createActivityDto.activityDate || new Date(),
      },
    });
    await this.prisma.prospect.update({
      where: { id: prospect.id },
      data: { lastInteractionAt: activity.activityDate },
    });

    this.logger.log(
      `Activity added to prospect ${prospect.id} by user ${userId}`,
    );
    return activity;
  }

  async convertToClient(
    id: string,
    convertProspectDto: ConvertProspectDto,
    userId: string,
    organizationId: string,
  ) {
    if (!this.contacts || !this.references)
      throw new Error('CRM services unavailable');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const client = await this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw(
              Prisma.sql`SELECT "id" FROM "Prospect" WHERE "id" = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`,
            );
            const existingConversion = await tx.prospectConversion.findFirst({
              where: { organizationId, prospectId: id },
              include: { client: { select: this.safeClientSelect() } },
            });
            if (existingConversion) {
              return {
                ...existingConversion.client,
                converted: false,
                idempotentReplay: true,
              };
            }
            const prospect = await tx.prospect.findFirst({
              where: { id, organizationId, archivedAt: null },
            });
            if (!prospect) throw new NotFoundException('Prospect not found');
            assertCrmLeadTransition(
              prospect.crmStatus,
              CrmLeadStatus.CONVERTED,
            );

            const phone = convertProspectDto.phone ?? prospect.phone;
            if (!phone)
              throw new BadRequestException(
                'A phone number is required for conversion',
              );
            const normalizedValue =
              await this.contacts!.normalizePhoneForCountry(
                tx,
                organizationId,
                phone,
                convertProspectDto.countryId ?? prospect.countryId,
              );
            const resolved =
              await this.contacts!.matchNormalizedPhoneInTransaction(
                tx,
                organizationId,
                normalizedValue,
              );
            if (resolved.match?.matchState === 'AMBIGUOUS') {
              throw new ConflictException({
                code: 'AMBIGUOUS_PHONE_MATCH',
                message: 'Phone ownership must be reconciled before conversion',
                candidateIds: resolved.match.candidateIds,
              });
            }
            const matchedClientId = resolved.match?.clientId ?? null;
            let client = matchedClientId
              ? await tx.client.findFirst({
                  where: {
                    id: matchedClientId,
                    organizationId,
                    archivedAt: null,
                  },
                })
              : null;
            if (!client) {
              await this.references!.assertReference(
                tx,
                organizationId,
                convertProspectDto.countryId ?? prospect.countryId ?? undefined,
                CrmReferenceKind.COUNTRY,
              );
              await this.references!.assertReference(
                tx,
                organizationId,
                convertProspectDto.nationalityCountryId,
                CrmReferenceKind.COUNTRY,
              );
              client = await tx.client.create({
                data: {
                  organizationId,
                  prospectId: id,
                  firstName: convertProspectDto.firstName ?? prospect.firstName,
                  lastName: convertProspectDto.lastName ?? prospect.lastName,
                  phone,
                  phoneNormalized: resolved.normalizedValue,
                  email: convertProspectDto.email ?? prospect.email,
                  countryId: convertProspectDto.countryId ?? prospect.countryId,
                  nationalityCountryId: convertProspectDto.nationalityCountryId,
                  address: convertProspectDto.address,
                  assignedTo: prospect.assignedTo,
                  lastInteractionAt: prospect.lastInteractionAt,
                  nextActionAt: prospect.nextActionAt,
                },
              });
            }
            const convertedAt = new Date();
            await tx.prospectConversion.create({
              data: {
                organizationId,
                prospectId: id,
                clientId: client.id,
                convertedBy: userId,
                convertedAt,
              },
            });
            await tx.prospect.update({
              where: { id },
              data: {
                crmStatus: CrmLeadStatus.CONVERTED,
                status: legacyStatusProjection(CrmLeadStatus.CONVERTED),
                convertedAt,
              },
            });
            const contacts = await tx.contactPoint.findMany({
              where: { organizationId, prospectId: id },
            });
            for (const point of contacts) {
              if (point.clientId && point.clientId !== client.id) {
                throw new ConflictException({
                  code: 'AMBIGUOUS_CONTACT_OWNER',
                  message: 'Contact point is linked to another client',
                });
              }
              await tx.contactPoint.update({
                where: { id: point.id },
                data: { clientId: client.id },
              });
            }
            await tx.task.updateMany({
              where: { organizationId, prospectId: id },
              data: { clientId: client.id },
            });
            await tx.vehicleRequest.updateMany({
              where: { organizationId, prospectId: id },
              data: { clientId: client.id },
            });
            await tx.callSession.updateMany({
              where: { organizationId, prospectId: id },
              data: { prospectId: null, clientId: client.id },
            });
            await tx.whatsappConversation.updateMany({
              where: { organizationId, prospectId: id },
              data: { prospectId: null, clientId: client.id },
            });
            await tx.appointment.updateMany({
              where: { organizationId, prospectId: id },
              data: { prospectId: null, clientId: client.id },
            });
            await tx.crmNote.updateMany({
              where: { organizationId, prospectId: id },
              data: { prospectId: null, clientId: client.id },
            });
            await tx.prospectStatusHistory.create({
              data: {
                organizationId,
                prospectId: id,
                changedBy: userId,
                fromStatus: prospect.crmStatus,
                toStatus: CrmLeadStatus.CONVERTED,
                reason: 'Atomic lead-to-client conversion',
              },
            });
            await tx.auditLog.create({
              data: {
                organizationId,
                userId,
                action: 'CRM_LEAD_CONVERTED',
                entityType: 'Prospect',
                entityId: id,
                newValues: {
                  clientId: client.id,
                  reusedExistingClient: Boolean(matchedClientId),
                },
              },
            });
            const safe = await tx.client.findUniqueOrThrow({
              where: { id: client.id },
              select: this.safeClientSelect(),
            });
            return { ...safe, converted: true, idempotentReplay: false };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        this.logger.log(`Prospect converted to client: ${client.id}`);
        return client;
      } catch (error) {
        if (isPrismaConcurrencyError(error)) {
          const winner = await this.prisma.prospectConversion.findFirst({
            where: { organizationId, prospectId: id },
            include: { client: { select: this.safeClientSelect() } },
          });
          if (winner)
            return {
              ...winner.client,
              converted: false,
              idempotentReplay: true,
            };
          if (attempt < 2) continue;
        }
        throw error;
      }
    }
    const winner = await this.prisma.prospectConversion.findFirst({
      where: { organizationId, prospectId: id },
      include: { client: { select: this.safeClientSelect() } },
    });
    if (winner) {
      return {
        ...winner.client,
        converted: false,
        idempotentReplay: true,
      };
    }
    throw new ServiceUnavailableException({
      code: 'CRM_CONCURRENCY_RETRY_EXHAUSTED',
      message:
        'CRM conversion could not be completed safely; retry the request',
    });
  }

  async getActivities(prospectId: string, organizationId: string) {
    await this.findOne(prospectId, organizationId);

    return this.prisma.prospectActivity.findMany({
      where: { prospectId },
      orderBy: { activityDate: 'desc' },
    });
  }

  private async assertTenantAssignee(
    transaction: Prisma.TransactionClient,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const user = await transaction.user.findFirst({
      where: {
        id: userId,
        organizationId,
        status: 'active',
        userRoles: {
          some: {
            role: {
              rolePermissions: {
                some: {
                  permission: {
                    OR: [
                      { resource: 'prospects', action: 'write' },
                      { resource: 'callCenter', action: 'handle' },
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
    if (!user)
      throw new NotFoundException('Active Agent/Commercial assignee not found');
  }

  private prospectInclude(full = false): Prisma.ProspectInclude {
    return {
      activities: {
        orderBy: { activityDate: 'desc' as const },
        ...(full ? {} : { take: 3 }),
      },
      client: true,
      conversions: { include: { client: { select: this.safeClientSelect() } } },
      assignee: { select: { id: true, firstName: true, lastName: true } },
      contactPoints: true,
      entryChannel: true,
      marketingSource: true,
      country: true,
      vehicleRequests: { orderBy: { createdAt: 'desc' as const } },
      tasks: {
        where: { status: { notIn: ['completed', 'cancelled'] } },
        orderBy: { dueDate: 'asc' as const },
        ...(full ? {} : { take: 1 }),
      },
    };
  }

  private safeClientSelect() {
    return {
      id: true,
      organizationId: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      countryId: true,
      nationalityCountryId: true,
      address: true,
      status: true,
      assignedTo: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private async syncFollowUpTask(
    tx: Prisma.TransactionClient,
    organizationId: string,
    prospectId: string,
    assignedTo: string,
    createdBy: string,
    dueDate: Date | null,
    nextAction?: string | null,
  ) {
    const automationKey = `crm-lead-follow-up:${prospectId}`;
    if (!dueDate) {
      await tx.task.updateMany({
        where: {
          organizationId,
          automationKey,
          status: { notIn: ['completed', 'cancelled'] },
        },
        data: { status: 'cancelled' },
      });
      return;
    }
    const task = await tx.task.upsert({
      where: {
        organizationId_automationKey: { organizationId, automationKey },
      },
      update: {
        assignedTo,
        dueDate,
        title: nextAction || 'Relancer le lead',
        status: 'todo',
      },
      create: {
        organizationId,
        assignedTo,
        createdBy,
        title: nextAction || 'Relancer le lead',
        type: 'follow_up',
        dueDate,
        prospectId,
        relatedType: 'prospect',
        relatedId: prospectId,
        automationKey,
      },
    });
    await tx.notification.upsert({
      where: {
        organizationId_userId_dedupeKey: {
          organizationId,
          userId: assignedTo,
          dedupeKey: automationKey,
        },
      },
      update: {
        title: nextAction || 'Relance CRM',
        content: dueDate.toISOString(),
        readAt: null,
      },
      create: {
        organizationId,
        userId: assignedTo,
        type: 'CRM_FOLLOW_UP',
        category: 'crm',
        title: nextAction || 'Relance CRM',
        content: dueDate.toISOString(),
        relatedType: 'task',
        relatedId: task.id,
        dedupeKey: automationKey,
      },
    });
  }

  private async matchedCreateResponse(
    organizationId: string,
    actorId: string,
    normalizedValue: string,
    match: {
      prospectId: string | null;
      clientId: string | null;
      matchState: 'MATCHED' | 'AMBIGUOUS';
      candidateIds?: { prospectIds: string[]; clientIds: string[] };
    },
  ) {
    if (match.matchState === 'AMBIGUOUS') {
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          userId: actorId,
          action: 'CRM_PHONE_AMBIGUOUS_MATCH',
          entityType: 'ContactPoint',
          entityId: 'reconciliation-required',
          newValues: {
            prospectCount: match.candidateIds?.prospectIds.length ?? 0,
            clientCount: match.candidateIds?.clientIds.length ?? 0,
          },
        },
      });
      return {
        created: false,
        matchState: 'AMBIGUOUS' as const,
        code: 'AMBIGUOUS_PHONE_MATCH',
        candidateIds: match.candidateIds,
      };
    }
    if (match.prospectId && !match.clientId) {
      await this.prisma.crmNote.create({
        data: {
          organizationId,
          authorId: actorId,
          prospectId: match.prospectId,
          content: 'Nouvelle prise de contact agrégée au lead existant.',
        },
      });
      const prospect = await this.findOne(match.prospectId, organizationId);
      return {
        ...prospect,
        created: false,
        matchState: 'MATCHED' as const,
        matchedRecordType: 'LEAD' as const,
      };
    }
    if (match.clientId) {
      await this.prisma.crmNote.create({
        data: {
          organizationId,
          authorId: actorId,
          clientId: match.clientId,
          content: 'Nouvelle prise de contact agrégée au client existant.',
        },
      });
      const client = await this.prisma.client.findFirstOrThrow({
        where: { id: match.clientId, organizationId },
        select: this.safeClientSelect(),
      });
      return {
        created: false,
        matchState: 'MATCHED' as const,
        matchedRecordType: 'CLIENT' as const,
        matchedRecord: client,
        linkedLeadId: match.prospectId,
      };
    }
    throw new ConflictException(
      `Contact match for ${normalizedValue} could not be resolved`,
    );
  }
}
