import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueryDto, TaskQueryDto } from './phase3.dto';
import { Phase3Service } from './phase3.service';

const user = (
  permissions: AuthenticatedUser['permissions'] = [
    Permission.TASKS_READ,
    Permission.TASKS_WRITE,
  ],
): AuthenticatedUser => ({
  id: '10000000-0000-4000-8000-000000000001',
  email: 'agent@example.test',
  firstName: 'Agent',
  lastName: 'Tenant',
  organizationId: '20000000-0000-4000-8000-000000000001',
  office: null,
  roles: [],
  permissions,
});

describe('Phase3Service tenant safety', () => {
  it('requires assignment permission before looking up another assignee', async () => {
    const prisma = { user: { findFirst: jest.fn() } };
    const service = new Phase3Service(prisma as unknown as PrismaService);

    await expect(
      service.createTask(user(), {
        title: 'Relance',
        assignedTo: '10000000-0000-4000-8000-000000000002',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('validates linked entities inside the actor organization', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: user().id }) },
      dossier: { findFirst: jest.fn().mockResolvedValue(null) },
      prospect: { findFirst: jest.fn() },
      client: { findFirst: jest.fn() },
      whatsappConversation: { findFirst: jest.fn() },
    };
    const service = new Phase3Service(prisma as unknown as PrismaService);
    const dossierId = '30000000-0000-4000-8000-000000000001';

    await expect(
      service.createTask(user(), { title: 'Dossier', dossierId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.dossier.findFirst).toHaveBeenCalledWith({
      where: { id: dossierId, organizationId: user().organizationId },
      select: { id: true },
    });
  });

  it('returns personal overdue tasks and the organization timezone', async () => {
    const findMany = jest.fn((args: { where: Record<string, unknown> }) => {
      void args;
      return Promise.resolve([
        {
          id: 'task-1',
          status: 'todo',
          dueDate: new Date(Date.now() - 60_000),
        },
      ]);
    });
    const prisma = {
      task: {
        findMany,
        count: jest.fn().mockResolvedValue(1),
      },
      organizationSettings: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Africa/Algiers' }),
      },
    };
    const service = new Phase3Service(prisma as unknown as PrismaService);

    const query = new TaskQueryDto();
    query.view = 'mine';
    const result = await service.listTasks(user(), query);
    expect(result.items[0].overdue).toBe(true);
    expect(result.timezone).toBe('Africa/Algiers');
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: user().organizationId,
      assignedTo: user().id,
    });
  });

  it('rejects the team view without tasks:assign', async () => {
    const service = new Phase3Service({} as PrismaService);
    const query = new TaskQueryDto();
    query.view = 'team';
    await expect(service.listTasks(user(), query)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('scopes inbox totals and unread counts to both tenant and user', async () => {
    const prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new Phase3Service(prisma as unknown as PrismaService);

    const query = new NotificationQueryDto();
    query.unread = 'true';
    await service.listNotifications(user(), query);
    const expectedScope = {
      organizationId: user().organizationId,
      userId: user().id,
      readAt: null,
    };
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedScope }),
    );
    expect(prisma.notification.count).toHaveBeenNthCalledWith(2, {
      where: expectedScope,
    });
  });

  it('cannot mark a notification owned by another tenant or user', async () => {
    const prisma = {
      notification: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };
    const service = new Phase3Service(prisma as unknown as PrismaService);
    const id = '40000000-0000-4000-8000-000000000001';

    await expect(service.markNotification(user(), id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: { id, organizationId: user().organizationId, userId: user().id },
      select: { id: true },
    });
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('locks base currency after posted financial activity', async () => {
    const prisma = {
      organizationSettings: {
        findUnique: jest.fn().mockResolvedValue({ baseCurrency: 'DZD' }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Tenant' }),
      },
      invoice: { count: jest.fn().mockResolvedValue(1) },
      payment: { count: jest.fn().mockResolvedValue(0) },
      cost: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new Phase3Service(prisma as unknown as PrismaService);

    await expect(
      service.updateSettings(user(), { baseCurrency: 'USD' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolves and persists one notification per unique active tenant recipient', async () => {
    const recipients = [
      { id: '10000000-0000-4000-8000-000000000011' },
      { id: '10000000-0000-4000-8000-000000000012' },
    ];
    const userFindMany = jest.fn<
      Promise<typeof recipients>,
      [{ where: { organizationId: string; status: string } }]
    >();
    const notificationCreateMany = jest.fn<
      Promise<{ count: number }>,
      [{ data: unknown[] }]
    >();
    const auditCreate = jest.fn<
      Promise<{ id: string }>,
      [{ data: { newValues: unknown } }]
    >();
    userFindMany.mockResolvedValue(recipients);
    notificationCreateMany.mockResolvedValue({ count: 2 });
    auditCreate.mockResolvedValue({ id: 'audit-1' });
    const transaction = {
      notification: { createMany: notificationCreateMany },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      user: { findMany: userFindMany },
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const realtime = { emitUser: jest.fn() };
    const service = new Phase3Service(
      prisma as unknown as PrismaService,
      realtime as never,
    );
    const result = await service.sendNotification(
      user([Permission.NOTIFICATIONS_SEND]),
      {
        userIds: [recipients[0].id, recipients[0].id],
        roleIds: ['30000000-0000-4000-8000-000000000001'],
        allActive: false,
        title: 'Clôture mensuelle',
        message: 'Merci de vérifier les dossiers.',
        category: 'finance',
        severity: 'info',
        entityUrl: '/finance',
      },
    );
    expect(result).toMatchObject({ delivered: 2, channel: 'in_app' });
    const audienceQuery = userFindMany.mock.calls[0][0];
    expect(audienceQuery.where.organizationId).toBe(user().organizationId);
    expect(audienceQuery.where.status).toBe('active');
    expect(notificationCreateMany.mock.calls[0][0].data).toHaveLength(2);
    expect(auditCreate.mock.calls[0][0].data.newValues).not.toHaveProperty(
      'message',
    );
    expect(realtime.emitUser).toHaveBeenCalledTimes(2);
  });

  it('rejects empty notification audiences and unsafe links', async () => {
    const service = new Phase3Service({} as PrismaService);
    await expect(
      service.resolveNotificationAudience(user(), {
        userIds: [],
        roleIds: [],
        allActive: false,
        title: 'Titre',
        message: 'Message',
        category: 'general',
        severity: 'info',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const scoped = new Phase3Service({
      user: { findMany: jest.fn().mockResolvedValue([{ id: user().id }]) },
    } as unknown as PrismaService);
    await expect(
      scoped.sendNotification(user(), {
        userIds: [user().id],
        roleIds: [],
        allActive: false,
        title: 'Titre',
        message: 'Message',
        category: 'general',
        severity: 'info',
        entityUrl: 'javascript:alert(1)',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
