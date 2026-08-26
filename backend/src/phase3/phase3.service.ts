import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Permission } from '@auto-import/contracts';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  AuditQueryDto,
  CreateNotificationTemplateDto,
  CreateTaskDto,
  DateRangeDto,
  NotificationQueryDto,
  TaskQueryDto,
  UpdateSettingsDto,
  UpdateTaskDto,
  SendNotificationDto,
} from './phase3.dto';
import { Optional } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
import PDFDocument from 'pdfkit';
import * as fs from 'node:fs';

const ACTIVE_DOSSIER_STATUSES = ['closed', 'serviceCompleted', 'cancelled'];
const OPEN_TASK_STATUSES = ['todo', 'in_progress'];

@Injectable()
export class Phase3Service {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtime?: NotificationsGateway,
  ) {}

  private page<T>(items: T[], total: number, page: number, limit: number) {
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private canAssign(user: AuthenticatedUser) {
    return user.permissions.includes(Permission.TASKS_ASSIGN);
  }

  private async assertTenantUser(id: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId, status: 'active' },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Assignee not found');
  }

  private async validateTaskLinks(organizationId: string, dto: CreateTaskDto) {
    const checks: Array<Promise<unknown>> = [];
    if (dto.prospectId)
      checks.push(
        this.prisma.prospect.findFirst({
          where: { id: dto.prospectId, organizationId },
          select: { id: true },
        }),
      );
    if (dto.clientId)
      checks.push(
        this.prisma.client.findFirst({
          where: { id: dto.clientId, organizationId },
          select: { id: true },
        }),
      );
    if (dto.dossierId)
      checks.push(
        this.prisma.dossier.findFirst({
          where: { id: dto.dossierId, organizationId },
          select: { id: true },
        }),
      );
    if (dto.conversationId)
      checks.push(
        this.prisma.whatsappConversation.findFirst({
          where: { id: dto.conversationId, organizationId },
          select: { id: true },
        }),
      );
    if (Boolean(dto.relatedType) !== Boolean(dto.relatedId)) {
      throw new BadRequestException(
        'relatedType and relatedId must be provided together',
      );
    }
    if (dto.relatedType && dto.relatedId) {
      const where = { id: dto.relatedId, organizationId };
      if (dto.relatedType === 'appointment')
        checks.push(
          this.prisma.appointment.findFirst({ where, select: { id: true } }),
        );
      else if (dto.relatedType === 'call')
        checks.push(
          this.prisma.callSession.findFirst({ where, select: { id: true } }),
        );
      else if (dto.relatedType === 'prospect')
        checks.push(
          this.prisma.prospect.findFirst({ where, select: { id: true } }),
        );
      else if (dto.relatedType === 'client')
        checks.push(
          this.prisma.client.findFirst({ where, select: { id: true } }),
        );
      else if (dto.relatedType === 'dossier')
        checks.push(
          this.prisma.dossier.findFirst({ where, select: { id: true } }),
        );
      else if (dto.relatedType === 'conversation')
        checks.push(
          this.prisma.whatsappConversation.findFirst({
            where,
            select: { id: true },
          }),
        );
      else throw new BadRequestException('Unsupported related entity type');
    }
    if ((await Promise.all(checks)).some((result) => !result))
      throw new NotFoundException('Related tenant entity not found');
  }

  async createTask(user: AuthenticatedUser, dto: CreateTaskDto) {
    const assignedTo = dto.assignedTo ?? user.id;
    if (assignedTo !== user.id && !this.canAssign(user))
      throw new ForbiddenException('tasks:assign is required');
    await Promise.all([
      this.assertTenantUser(assignedTo, user.organizationId),
      this.validateTaskLinks(user.organizationId, dto),
    ]);
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          organizationId: user.organizationId,
          assignedTo,
          createdBy: user.id,
          title: dto.title.trim(),
          description: dto.description,
          notes: dto.notes,
          type: dto.type ?? 'follow_up',
          priority: dto.priority ?? 'normal',
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          relatedType: dto.relatedType,
          relatedId: dto.relatedId,
          prospectId: dto.prospectId,
          clientId: dto.clientId,
          dossierId: dto.dossierId,
          conversationId: dto.conversationId,
        },
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true } },
          creator: { select: { id: true, firstName: true, lastName: true } },
          dossier: { select: { id: true, reference: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
          prospect: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      await tx.notification.create({
        data: {
          organizationId: user.organizationId,
          userId: assignedTo,
          type: 'TASK_ASSIGNED',
          category: 'task',
          severity: dto.priority === 'urgent' ? 'warning' : 'info',
          title: 'Nouvelle tâche assignée',
          content: task.title,
          relatedType: 'task',
          relatedId: task.id,
          entityUrl: `/tasks?task=${task.id}`,
          dedupeKey: `task-created:${task.id}`,
        },
      });
      return task;
    });
  }

  async listTasks(user: AuthenticatedUser, query: TaskQueryDto) {
    if (query.view === 'team' && !this.canAssign(user))
      throw new ForbiddenException('tasks:assign is required for team view');
    const where: Prisma.TaskWhereInput = {
      organizationId: user.organizationId,
      ...(query.view === 'mine' ? { assignedTo: user.id } : {}),
      ...(query.assignedTo ? { assignedTo: query.assignedTo } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.relatedType ? { relatedType: query.relatedType } : {}),
      ...(query.relatedId ? { relatedId: query.relatedId } : {}),
      ...(query.dueFrom || query.dueTo
        ? {
            dueDate: {
              ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
              ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
            },
          }
        : {}),
    };
    const [items, total, settings] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true } },
          creator: { select: { id: true, firstName: true, lastName: true } },
          dossier: { select: { id: true, reference: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
          prospect: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.task.count({ where }),
      this.prisma.organizationSettings.findUnique({
        where: { organizationId: user.organizationId },
        select: { timezone: true },
      }),
    ]);
    const now = Date.now();
    return {
      ...this.page(
        items.map((task) => ({
          ...task,
          overdue: Boolean(
            task.dueDate &&
            OPEN_TASK_STATUSES.includes(task.status) &&
            task.dueDate.getTime() < now,
          ),
        })),
        total,
        query.page,
        query.limit,
      ),
      timezone: settings?.timezone ?? 'Africa/Algiers',
    };
  }

  async getTask(user: AuthenticatedUser, id: string) {
    const task = await this.prisma.task.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        ...(!this.canAssign(user) ? { assignedTo: user.id } : {}),
      },
      include: {
        assignee: true,
        creator: true,
        dossier: true,
        client: true,
        prospect: true,
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return {
      ...task,
      overdue: Boolean(
        task.dueDate &&
        OPEN_TASK_STATUSES.includes(task.status) &&
        task.dueDate.getTime() < Date.now(),
      ),
    };
  }

  async updateTask(user: AuthenticatedUser, id: string, dto: UpdateTaskDto) {
    await this.getTask(user, id);
    const status = dto.status;
    return this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description: dto.description,
        notes: dto.notes,
        type: dto.type,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status,
        completedAt:
          status === 'completed' ? new Date() : status ? null : undefined,
      },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async reassignTask(user: AuthenticatedUser, id: string, assignedTo: string) {
    if (!this.canAssign(user))
      throw new ForbiddenException('tasks:assign is required');
    await Promise.all([
      this.getTask(user, id),
      this.assertTenantUser(assignedTo, user.organizationId),
    ]);
    const task = await this.prisma.task.update({
      where: { id },
      data: { assignedTo },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    await this.prisma.notification.upsert({
      where: {
        organizationId_userId_dedupeKey: {
          organizationId: user.organizationId,
          userId: assignedTo,
          dedupeKey: `task-reassigned:${id}:${assignedTo}`,
        },
      },
      update: {},
      create: {
        organizationId: user.organizationId,
        userId: assignedTo,
        type: 'TASK_ASSIGNED',
        category: 'task',
        title: 'Tâche réassignée',
        content: task.title,
        relatedType: 'task',
        relatedId: id,
        entityUrl: `/tasks?task=${id}`,
        dedupeKey: `task-reassigned:${id}:${assignedTo}`,
      },
    });
    return task;
  }

  async listNotifications(
    user: AuthenticatedUser,
    query: NotificationQueryDto,
  ) {
    const where: Prisma.NotificationWhereInput = {
      organizationId: user.organizationId,
      userId: user.id,
      ...(query.category ? { category: query.category } : {}),
      ...(query.unread === 'true' ? { readAt: null } : {}),
    };
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: {
          organizationId: user.organizationId,
          userId: user.id,
          readAt: null,
        },
      }),
    ]);
    return { ...this.page(items, total, query.page, query.limit), unreadCount };
  }

  unreadCount(user: AuthenticatedUser) {
    return this.prisma.notification
      .count({
        where: {
          organizationId: user.organizationId,
          userId: user.id,
          readAt: null,
        },
      })
      .then((count) => ({ count }));
  }

  async markNotification(user: AuthenticatedUser, id: string) {
    const found = await this.prisma.notification.findFirst({
      where: { id, organizationId: user.organizationId, userId: user.id },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllNotifications(user: AuthenticatedUser) {
    const result = await this.prisma.notification.updateMany({
      where: {
        organizationId: user.organizationId,
        userId: user.id,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async notificationAudience(user: AuthenticatedUser) {
    const [users, roles] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId: user.organizationId, status: 'active' },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
      this.prisma.role.findMany({
        where: { organizationId: user.organizationId, scope: 'tenant' },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);
    return { users, roles };
  }

  async resolveNotificationAudience(
    user: AuthenticatedUser,
    dto: SendNotificationDto,
  ) {
    const userIds = [...new Set(dto.userIds ?? [])];
    const roleIds = [...new Set(dto.roleIds ?? [])];
    if (!dto.allActive && userIds.length === 0 && roleIds.length === 0) {
      throw new BadRequestException('Select at least one recipient audience');
    }
    const recipients = await this.prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        status: 'active',
        ...(dto.allActive
          ? {}
          : {
              OR: [
                ...(userIds.length ? [{ id: { in: userIds } }] : []),
                ...(roleIds.length
                  ? [
                      {
                        userRoles: {
                          some: {
                            roleId: { in: roleIds },
                            role: { organizationId: user.organizationId },
                          },
                        },
                      },
                    ]
                  : []),
              ],
            }),
      },
      select: { id: true },
    });
    return {
      recipientCount: recipients.length,
      recipientIds: recipients.map(({ id }) => id),
    };
  }

  async sendNotification(user: AuthenticatedUser, dto: SendNotificationDto) {
    if (
      dto.entityUrl &&
      !/^\/(?!\/)[a-zA-Z0-9/_?=&.%-]*$/.test(dto.entityUrl)
    ) {
      throw new BadRequestException('Only safe internal links are allowed');
    }
    const resolved = await this.resolveNotificationAudience(user, dto);
    if (resolved.recipientCount === 0) {
      throw new BadRequestException(
        'The selected audience has no active recipients',
      );
    }
    const sentAt = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.notification.createMany({
        data: resolved.recipientIds.map((userId) => ({
          organizationId: user.organizationId,
          userId,
          type: 'ADMIN_MESSAGE',
          category: dto.category,
          severity: dto.severity,
          title: dto.title.trim(),
          content: dto.message.trim(),
          entityUrl: dto.entityUrl,
          dedupeKey: `admin-message:${user.id}:${sentAt.getTime()}:${userId}`,
        })),
      });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: 'notification.send',
          entityType: 'notification_batch',
          entityId: `${user.id}:${sentAt.getTime()}`,
          newValues: {
            audience: dto.allActive ? 'all_active' : 'selected',
            userSelectionCount: new Set(dto.userIds ?? []).size,
            roleSelectionCount: new Set(dto.roleIds ?? []).size,
            recipientCount: resolved.recipientCount,
            category: dto.category,
            severity: dto.severity,
            hasEntityUrl: Boolean(dto.entityUrl),
          },
        },
      });
      return {
        delivered: resolved.recipientCount,
        channel: 'in_app' as const,
        sentAt: sentAt.toISOString(),
      };
    });
    for (const recipientId of resolved.recipientIds) {
      this.realtime?.emitUser(recipientId, {
        category: dto.category,
        severity: dto.severity,
        sentAt: result.sentAt,
      });
    }
    return result;
  }

  listTemplates(user: AuthenticatedUser) {
    return this.prisma.notificationTemplate.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { eventType: 'asc' },
    });
  }

  createTemplate(user: AuthenticatedUser, dto: CreateNotificationTemplateDto) {
    return this.prisma.notificationTemplate.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name,
        eventType: dto.eventType,
        subject: dto.subject,
        content: dto.content,
        channel: dto.channel ?? 'in_app',
      },
    });
  }

  async listAudit(user: AuthenticatedUser, query: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      organizationId: user.organizationId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return this.page(items, total, query.page, query.limit);
  }

  private range(query: DateRangeDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth() + 1, 1));
    if (from > to) throw new BadRequestException('from must be before to');
    return { from, to };
  }

  async dashboard(user: AuthenticatedUser, query: DateRangeDto) {
    const { from, to } = this.range(query);
    const organizationId = user.organizationId;
    const [
      settings,
      dossierTotal,
      dossierActive,
      dossiersByStatus,
      dossiersByType,
      vehiclesByStatus,
      vehiclesBySource,
      offersByStatus,
      leadsActive,
      qualifiedLeads,
      conversions,
      appointments,
      calls,
      missedCalls,
      callDuration,
      shipmentsLate,
      customsActive,
      overdueTasks,
      overdueCallbacks,
      unmetDossierGates,
      invoices,
      payments,
      costs,
      recentDossiers,
      recentAudit,
    ] = await Promise.all([
      this.getSettings(user),
      this.prisma.dossier.count({
        where: { organizationId, openedAt: { gte: from, lte: to } },
      }),
      this.prisma.dossier.count({
        where: { organizationId, status: { notIn: ACTIVE_DOSSIER_STATUSES } },
      }),
      this.prisma.dossier.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { _all: true },
      }),
      this.prisma.dossier.groupBy({
        by: ['type'],
        where: { organizationId },
        _count: { _all: true },
      }),
      this.prisma.vehicle.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { _all: true },
      }),
      this.prisma.vehicle.groupBy({
        by: ['acquisitionType'],
        where: { organizationId },
        _count: { _all: true },
      }),
      this.prisma.chinaOffer.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { _all: true },
      }),
      this.prisma.prospect.count({
        where: { organizationId, status: { notIn: ['converted', 'lost'] } },
      }),
      this.prisma.prospect.count({
        where: { organizationId, qualification: { in: ['HOT', 'WARM'] } },
      }),
      this.prisma.prospect.count({
        where: { organizationId, convertedAt: { gte: from, lte: to } },
      }),
      this.prisma.appointment.count({
        where: { organizationId, scheduledStart: { gte: from, lte: to } },
      }),
      this.prisma.callSession.count({
        where: { organizationId, receivedAt: { gte: from, lte: to } },
      }),
      this.prisma.callSession.count({
        where: {
          organizationId,
          receivedAt: { gte: from, lte: to },
          state: 'MISSED',
        },
      }),
      this.prisma.callSession.aggregate({
        where: { organizationId, receivedAt: { gte: from, lte: to } },
        _sum: { durationSeconds: true },
      }),
      this.prisma.shipment.count({
        where: {
          organizationId,
          eta: { lt: new Date() },
          status: { notIn: ['arrived', 'delivered', 'cancelled'] },
        },
      }),
      this.prisma.customsFile.count({
        where: {
          organizationId,
          status: { notIn: ['released', 'closed', 'rejected'] },
        },
      }),
      this.prisma.task.count({
        where: {
          organizationId,
          status: { in: OPEN_TASK_STATUSES },
          dueDate: { lt: new Date() },
        },
      }),
      this.prisma.task.count({
        where: {
          organizationId,
          status: { in: OPEN_TASK_STATUSES },
          callbackForCallId: { not: null },
          dueDate: { lt: new Date() },
        },
      }),
      this.prisma.paymentPlan.count({
        where: {
          organizationId,
          status: 'active',
          installments: { some: { status: { not: 'PAID' } } },
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          status: { notIn: ['DRAFT', 'VOIDED'] },
          createdAt: { gte: from, lte: to },
        },
        select: {
          total: true,
          paidAmount: true,
          currency: true,
          status: true,
          dueDate: true,
          issueDate: true,
        },
      }),
      this.prisma.payment.findMany({
        where: {
          organizationId,
          status: 'CONFIRMED',
          confirmedAt: { gte: from, lte: to },
        },
        include: { exchangeRate: true },
      }),
      this.prisma.cost.findMany({
        where: {
          organizationId,
          status: 'POSTED',
          occurredAt: { gte: from, lte: to },
        },
        select: {
          amount: true,
          amountInBaseCurrency: true,
          currency: true,
          occurredAt: true,
        },
      }),
      this.prisma.dossier.findMany({
        where: { organizationId },
        take: 6,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          reference: true,
          status: true,
          type: true,
          updatedAt: true,
          client: { select: { firstName: true, lastName: true } },
          dossierVehicles: {
            take: 3,
            orderBy: { assignedAt: 'asc' },
            select: {
              vehicle: { select: { brand: true, model: true, year: true } },
            },
          },
        },
      }),
      this.prisma.auditLog.findMany({
        where: { organizationId },
        take: 8,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          createdAt: true,
        },
      }),
    ]);
    const baseCurrency = settings.baseCurrency;
    const conversionIssues: string[] = [];
    const convertPayment = (payment: (typeof payments)[number]) => {
      if (payment.currency === baseCurrency) return payment.amount;
      if (payment.exchangeRate)
        return payment.amount.mul(payment.exchangeRate.rate);
      conversionIssues.push(`payment:${payment.id}:${payment.currency}`);
      return new Prisma.Decimal(0);
    };
    const issued = invoices
      .filter((invoice) => invoice.currency === baseCurrency)
      .reduce((sum, invoice) => sum.add(invoice.total), new Prisma.Decimal(0));
    for (const invoice of invoices)
      if (invoice.currency !== baseCurrency)
        conversionIssues.push(`invoice:${invoice.currency}`);
    const collected = payments.reduce(
      (sum, payment) => sum.add(convertPayment(payment)),
      new Prisma.Decimal(0),
    );
    const totalCosts = costs.reduce(
      (sum, cost) =>
        sum.add(
          cost.amountInBaseCurrency ??
            (cost.currency === baseCurrency ? cost.amount : 0),
        ),
      new Prisma.Decimal(0),
    );
    const overdueInvoices = invoices.filter(
      (invoice) =>
        invoice.dueDate &&
        invoice.dueDate < new Date() &&
        invoice.paidAmount.lessThan(invoice.total),
    ).length;
    const trend = new Map<
      string,
      {
        revenue: Prisma.Decimal;
        collections: Prisma.Decimal;
        costs: Prisma.Decimal;
      }
    >();
    const timezone = query.timezone ?? settings.timezone;
    const monthKey = (date: Date) => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
      }).formatToParts(date);
      return `${parts.find(({ type }) => type === 'year')?.value}-${parts.find(({ type }) => type === 'month')?.value}`;
    };
    const trendBucket = (date: Date) => {
      const key = monthKey(date);
      const current = trend.get(key) ?? {
        revenue: new Prisma.Decimal(0),
        collections: new Prisma.Decimal(0),
        costs: new Prisma.Decimal(0),
      };
      trend.set(key, current);
      return current;
    };
    for (const invoice of invoices) {
      if (invoice.issueDate && invoice.currency === baseCurrency) {
        const bucket = trendBucket(invoice.issueDate);
        bucket.revenue = bucket.revenue.add(invoice.total);
      }
    }
    for (const payment of payments) {
      if (payment.confirmedAt) {
        const bucket = trendBucket(payment.confirmedAt);
        bucket.collections = bucket.collections.add(convertPayment(payment));
      }
    }
    for (const cost of costs) {
      const bucket = trendBucket(cost.occurredAt);
      bucket.costs = bucket.costs.add(
        cost.amountInBaseCurrency ??
          (cost.currency === baseCurrency ? cost.amount : 0),
      );
    }
    const cursor = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1),
    );
    const lastMonth = new Date(
      Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1),
    );
    while (cursor <= lastMonth) {
      trendBucket(cursor);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        timezone,
        baseCurrency,
      },
      dossiers: {
        total: dossierTotal,
        active: dossierActive,
        byStatus: Object.fromEntries(
          dossiersByStatus.map((item) => [item.status, item._count._all]),
        ),
        byType: Object.fromEntries(
          dossiersByType.map((item) => [item.type, item._count._all]),
        ),
      },
      vehicles: {
        byStatus: Object.fromEntries(
          vehiclesByStatus.map((item) => [item.status, item._count._all]),
        ),
        bySource: Object.fromEntries(
          vehiclesBySource.map((item) => [
            item.acquisitionType,
            item._count._all,
          ]),
        ),
      },
      finance: {
        issued: issued.toFixed(2),
        collected: collected.toFixed(2),
        outstanding: Prisma.Decimal.max(issued.minus(collected), 0).toFixed(2),
        overdueInvoices,
        costs: totalCosts.toFixed(2),
        grossMargin: issued.minus(totalCosts).toFixed(2),
        conversionIssues: [...new Set(conversionIssues)].sort(),
        trend: [...trend.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([month, values]) => ({
            month,
            revenue: values.revenue.toFixed(2),
            collections: values.collections.toFixed(2),
            costs: values.costs.toFixed(2),
            grossMargin: values.revenue.minus(values.costs).toFixed(2),
          })),
      },
      offers: {
        byStatus: Object.fromEntries(
          offersByStatus.map((item) => [item.status, item._count._all]),
        ),
      },
      crm: {
        activeLeads: leadsActive,
        qualifiedLeads,
        appointments,
        conversions,
      },
      callCenter: {
        calls,
        missedCalls,
        durationSeconds: callDuration._sum.durationSeconds ?? 0,
      },
      logistics: {
        lateShipments: shipmentsLate,
        activeCustomsFiles: customsActive,
      },
      alerts: {
        overdueTasks,
        overdueCallbacks,
        overdueInvoices,
        lateShipments: shipmentsLate,
        unmetDossierGates,
      },
      recent: { dossiers: recentDossiers, events: recentAudit },
    };
  }

  async reportSummary(user: AuthenticatedUser, query: DateRangeDto) {
    const dashboard = await this.dashboard(user, query);
    const { from, to } = this.range(query);
    const organizationId = user.organizationId;
    const [
      closedDossiers,
      purchasesByStatus,
      purchasesBySupplier,
      supplierCount,
      crmBySource,
      crmByStatus,
      crmByTemperature,
      crmByAgent,
      conversionsByAgent,
      callsByAgent,
      shipmentsByStatus,
      shipmentTimeliness,
      customsByStatus,
    ] = await Promise.all([
      this.prisma.dossier.findMany({
        where: { organizationId, closedAt: { gte: from, lte: to } },
        select: { openedAt: true, closedAt: true },
      }),
      this.prisma.purchase.groupBy({
        by: ['status'],
        where: { organizationId, createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.purchase.groupBy({
        by: ['supplierId'],
        where: { organizationId, createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.partner.count({
        where: { organizationId, type: 'supplier', status: 'active' },
      }),
      this.prisma.prospect.groupBy({
        by: ['source'],
        where: { organizationId, createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.prospect.groupBy({
        by: ['status'],
        where: { organizationId, createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.prospect.groupBy({
        by: ['qualification'],
        where: { organizationId, createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.prospect.groupBy({
        by: ['assignedTo'],
        where: { organizationId, createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.prospect.groupBy({
        by: ['assignedTo'],
        where: { organizationId, convertedAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.callSession.groupBy({
        by: ['handlingEmployeeId'],
        where: { organizationId, receivedAt: { gte: from, lte: to } },
        _count: { _all: true },
        _sum: { durationSeconds: true },
      }),
      this.prisma.shipment.groupBy({
        by: ['status'],
        where: { organizationId, createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.shipment.findMany({
        where: {
          organizationId,
          actualArrivalDate: { gte: from, lte: to },
        },
        select: { eta: true, actualArrivalDate: true },
      }),
      this.prisma.customsFile.groupBy({
        by: ['status'],
        where: { organizationId, createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
    ]);
    const processingHours = closedDossiers
      .filter((item) => item.closedAt)
      .map(
        (item) =>
          (item.closedAt!.getTime() - item.openedAt.getTime()) / 3_600_000,
      );
    const onTimeShipments = shipmentTimeliness.filter(
      (item) =>
        item.eta &&
        item.actualArrivalDate &&
        item.actualArrivalDate <= item.eta,
    ).length;
    const distribution = <
      T extends Record<string, unknown> & { _count: { _all: number } },
    >(
      values: T[],
      key: keyof T,
    ) =>
      Object.fromEntries(
        values.map((item) => [
          String(item[key] ?? 'unassigned'),
          item._count._all,
        ]),
      );
    const conversions = new Map(
      conversionsByAgent.map((item) => [
        item.assignedTo ?? 'unassigned',
        item._count._all,
      ]),
    );
    return {
      generatedAt: new Date().toISOString(),
      ...dashboard,
      reportMetadata: {
        dateBoundary: '[from,to] inclusive',
        timezone: dashboard.period.timezone,
        processingTimeDenominator: processingHours.length,
        shipmentTimelinessDenominator: shipmentTimeliness.length,
      },
      dossierReport: {
        byStatus: dashboard.dossiers.byStatus,
        byType: dashboard.dossiers.byType,
        averageProcessingHours:
          processingHours.length > 0
            ? (
                processingHours.reduce((sum, value) => sum + value, 0) /
                processingHours.length
              ).toFixed(2)
            : '0.00',
      },
      procurementReport: {
        vehicleByStatus: dashboard.vehicles.byStatus,
        vehicleBySource: dashboard.vehicles.bySource,
        offersByStatus: dashboard.offers.byStatus,
        purchasesByStatus: distribution(purchasesByStatus, 'status'),
        purchasesBySupplier: distribution(purchasesBySupplier, 'supplierId'),
        activeSuppliers: supplierCount,
      },
      crmReport: {
        bySource: distribution(crmBySource, 'source'),
        byStatus: distribution(crmByStatus, 'status'),
        byTemperature: distribution(crmByTemperature, 'qualification'),
        byAgent: Object.fromEntries(
          crmByAgent.map((item) => {
            const agent = item.assignedTo ?? 'unassigned';
            return [
              agent,
              {
                leads: item._count._all,
                conversions: conversions.get(agent) ?? 0,
              },
            ];
          }),
        ),
      },
      callCenterReport: {
        byAgent: Object.fromEntries(
          callsByAgent.map((item) => [
            item.handlingEmployeeId ?? 'unassigned',
            {
              calls: item._count._all,
              durationSeconds: item._sum.durationSeconds ?? 0,
            },
          ]),
        ),
      },
      logisticsReport: {
        shipmentsByStatus: distribution(shipmentsByStatus, 'status'),
        customsByStatus: distribution(customsByStatus, 'status'),
        onTimeShipments,
        lateArrivals: shipmentTimeliness.length - onTimeShipments,
      },
    };
  }

  async reportPdf(
    user: AuthenticatedUser,
    query: DateRangeDto,
  ): Promise<Buffer> {
    const [report, settings] = await Promise.all([
      this.reportSummary(user, query),
      this.getSettings(user),
    ]);
    const candidates = [
      process.env.PDF_FONT_PATH,
      'C:\\Windows\\Fonts\\arial.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ].filter((value): value is string => Boolean(value));
    const fontPath = candidates.find((value) => fs.existsSync(value));
    if (!fontPath)
      throw new Error(
        'A Unicode PDF font must be configured with PDF_FONT_PATH',
      );
    const document = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 42,
      bufferPages: true,
      info: {
        Title: 'Rapport financier',
        Author: settings.displayName ?? settings.legalName ?? 'Auto-Import ERP',
      },
    });
    document.registerFont('Unicode', fontPath).font('Unicode');
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const complete = new Promise<Buffer>((resolve, reject) => {
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });
    const money = (value: string) =>
      `${new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))} ${report.period.baseCurrency}`;
    const heading = (value: string) => {
      if (document.y > 500) document.addPage();
      document
        .moveDown(0.7)
        .fontSize(13)
        .fillColor('#111111')
        .text(value)
        .moveDown(0.35);
    };
    const row = (label: string, value: string, alternate = false) => {
      const y = document.y;
      if (alternate)
        document
          .rect(42, y - 3, 758, 22)
          .fill('#f5f5f5')
          .fillColor('#111111');
      document
        .fontSize(9)
        .text(label.replace(/\p{Cc}/gu, ''), 50, y, { width: 500 });
      document.text(value.replace(/\p{Cc}/gu, ''), 570, y, {
        width: 220,
        align: 'right',
      });
      document.y = y + 22;
    };
    document
      .fontSize(20)
      .text(settings.displayName ?? settings.legalName ?? 'Auto-Import ERP');
    document.fontSize(15).text('Rapport financier et opérationnel');
    document
      .moveDown(0.4)
      .fontSize(9)
      .fillColor('#555555')
      .text(
        `Période : ${new Date(report.period.from).toLocaleDateString('fr-FR')} – ${new Date(report.period.to).toLocaleDateString('fr-FR')} · Fuseau : ${report.period.timezone}`,
      );
    document.text(
      `Généré le ${new Date(report.generatedAt).toLocaleString('fr-FR', { timeZone: report.period.timezone })} par ${user.firstName} ${user.lastName}`,
    );
    document.fillColor('#111111');
    heading('Synthèse financière');
    [
      ['Facturé', money(report.finance.issued)],
      ['Encaissé', money(report.finance.collected)],
      ['Reste à encaisser', money(report.finance.outstanding)],
      ['Factures en retard', String(report.finance.overdueInvoices)],
      ['Coûts', money(report.finance.costs)],
      ['Marge brute', money(report.finance.grossMargin)],
    ].forEach(([label, value], index) => row(label, value, index % 2 === 1));
    const distribution = (title: string, values: Record<string, number>) => {
      heading(title);
      const entries = Object.entries(values).slice(0, 100);
      if (!entries.length) row('Aucune donnée', '0');
      entries.forEach(([label, value], index) =>
        row(label, String(value), index % 2 === 1),
      );
    };
    distribution('Dossiers par statut', report.dossiers.byStatus);
    distribution('Dossiers par type', report.dossiers.byType);
    distribution('Véhicules par statut', report.vehicles.byStatus);
    distribution('Offres par statut', report.offers.byStatus);
    const range = document.bufferedPageRange();
    for (
      let index = range.start;
      index < range.start + range.count;
      index += 1
    ) {
      document.switchToPage(index);
      document
        .fontSize(8)
        .fillColor('#666666')
        .text(
          `Page ${index + 1}/${range.count}`,
          42,
          document.page.height - 28,
          { width: document.page.width - 84, align: 'right' },
        );
    }
    document.end();
    return complete;
  }

  async getSettings(user: AuthenticatedUser) {
    const [settings, organization] = await Promise.all([
      this.prisma.organizationSettings.findUnique({
        where: { organizationId: user.organizationId },
      }),
      this.prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { name: true, phone: true, email: true, address: true },
      }),
    ]);
    if (!organization) throw new NotFoundException('Organization not found');
    return (
      settings ?? {
        organizationId: user.organizationId,
        displayName: organization.name,
        legalName: organization.name,
        phone: organization.phone,
        email: organization.email,
        address: organization.address,
        locale: 'fr-DZ',
        timezone: 'Africa/Algiers',
        baseCurrency: 'DZD',
        dossierPrefix: 'CA',
        invoicePrefix: 'FAC',
        notificationDefaults: {},
      }
    );
  }

  async updateSettings(user: AuthenticatedUser, dto: UpdateSettingsDto) {
    if (dto.timezone) {
      try {
        new Intl.DateTimeFormat('fr-FR', { timeZone: dto.timezone }).format(
          new Date(),
        );
      } catch {
        throw new BadRequestException('Invalid IANA timezone');
      }
    }
    const current = await this.getSettings(user);
    if (dto.baseCurrency && dto.baseCurrency !== current.baseCurrency) {
      const [invoices, payments, costs] = await Promise.all([
        this.prisma.invoice.count({
          where: {
            organizationId: user.organizationId,
            status: { not: 'DRAFT' },
          },
        }),
        this.prisma.payment.count({
          where: { organizationId: user.organizationId, status: 'CONFIRMED' },
        }),
        this.prisma.cost.count({
          where: { organizationId: user.organizationId, status: 'POSTED' },
        }),
      ]);
      if (invoices + payments + costs > 0)
        throw new BadRequestException(
          'Base currency cannot change after financial activity is posted',
        );
    }
    const cleanPrefix = (value?: string) =>
      value
        ?.trim()
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, '');
    if (dto.dossierPrefix && !cleanPrefix(dto.dossierPrefix))
      throw new BadRequestException('Invalid dossier prefix');
    if (dto.invoicePrefix && !cleanPrefix(dto.invoicePrefix))
      throw new BadRequestException('Invalid invoice prefix');
    return this.prisma.organizationSettings.upsert({
      where: { organizationId: user.organizationId },
      update: {
        ...dto,
        dossierPrefix: cleanPrefix(dto.dossierPrefix),
        invoicePrefix: cleanPrefix(dto.invoicePrefix),
      },
      create: {
        organizationId: user.organizationId,
        ...dto,
        dossierPrefix: cleanPrefix(dto.dossierPrefix) ?? 'CA',
        invoicePrefix: cleanPrefix(dto.invoicePrefix) ?? 'FAC',
      },
    });
  }
}
