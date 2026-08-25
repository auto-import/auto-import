import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProspectActivity, ProspectStatusHistory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface TimelineCursor {
  occurredAt: string;
  id: string;
}

export interface TimelineItem {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  occurredAt: Date;
  metadata?: unknown;
}

@Injectable()
export class CrmTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async getTimeline(
    organizationId: string,
    ownerType: 'prospect' | 'client',
    ownerId: string,
    cursor?: string,
    limit = 30,
  ) {
    const owner =
      ownerType === 'prospect'
        ? await this.prisma.prospect.findFirst({
            where: { id: ownerId, organizationId },
            select: { id: true },
          })
        : await this.prisma.client.findFirst({
            where: { id: ownerId, organizationId },
            select: { id: true, prospectId: true },
          });
    if (!owner) throw new NotFoundException('CRM contact not found');

    const prospectId =
      ownerType === 'prospect'
        ? ownerId
        : 'prospectId' in owner
          ? owner.prospectId
          : null;
    const clientId = ownerType === 'client' ? ownerId : null;

    const activitiesPromise = prospectId
      ? this.prisma.prospectActivity.findMany({
          where: { prospectId },
          orderBy: [{ activityDate: 'desc' }, { id: 'desc' }],
          take: limit + 1,
        })
      : Promise.resolve<ProspectActivity[]>([]);
    const statusesPromise = prospectId
      ? this.prisma.prospectStatusHistory.findMany({
          where: { organizationId, prospectId },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
        })
      : Promise.resolve<ProspectStatusHistory[]>([]);

    const [activities, calls, messages, tasks, appointments, notes, statuses] =
      await Promise.all([
        activitiesPromise,
        this.prisma.callSession.findMany({
          where: {
            organizationId,
            ...(clientId ? { clientId } : { prospectId: ownerId }),
          },
          include: {
            assignments: {
              include: {
                dispatcher: { select: { firstName: true, lastName: true } },
                toUser: { select: { firstName: true, lastName: true } },
              },
            },
          },
          orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
        }),
        this.prisma.whatsappMessage.findMany({
          where: {
            organizationId,
            conversation: clientId ? { clientId } : { prospectId: ownerId },
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
        }),
        this.prisma.task.findMany({
          where: {
            organizationId,
            ...(clientId ? { clientId } : { prospectId: ownerId }),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
        }),
        this.prisma.appointment.findMany({
          where: {
            organizationId,
            ...(clientId ? { clientId } : { prospectId: ownerId }),
          },
          orderBy: [{ scheduledStart: 'desc' }, { id: 'desc' }],
          take: limit + 1,
        }),
        this.prisma.crmNote.findMany({
          where: {
            organizationId,
            ...(clientId ? { clientId } : { prospectId: ownerId }),
          },
          include: {
            author: { select: { firstName: true, lastName: true } },
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
        }),
        statusesPromise,
      ]);

    const items: TimelineItem[] = [
      ...activities.map((item) => ({
        id: `activity:${item.id}`,
        type: item.type,
        title: item.title,
        description: item.description,
        occurredAt: item.activityDate,
      })),
      ...calls.map((item) => ({
        id: `call:${item.id}`,
        type: 'CALL',
        title: `Appel ${item.direction.toLowerCase()} — ${item.state}`,
        description: item.notes,
        occurredAt: item.receivedAt,
        metadata: {
          state: item.state,
          outcome: item.outcome,
          durationSeconds: item.durationSeconds,
          externalNumber: item.externalNumber,
          nextAction: item.nextAction,
          nextActionAt: item.nextActionAt,
          assignments: item.assignments,
        },
      })),
      ...messages.map((item) => ({
        id: `whatsapp:${item.id}`,
        type: 'WHATSAPP',
        title: `WhatsApp ${item.direction.toLowerCase()}`,
        description: item.text,
        occurredAt: item.occurredAt,
        metadata: { status: item.status, contentType: item.contentType },
      })),
      ...tasks.map((item) => ({
        id: `task:${item.id}`,
        type: 'FOLLOW_UP',
        title: item.title,
        description: item.description,
        occurredAt: item.createdAt,
        metadata: {
          status: item.status,
          dueDate: item.dueDate,
          priority: item.priority,
        },
      })),
      ...appointments.map((item) => ({
        id: `appointment:${item.id}`,
        type: 'APPOINTMENT',
        title: item.title,
        description: item.notes,
        occurredAt: item.scheduledStart,
        metadata: { status: item.status, scheduledEnd: item.scheduledEnd },
      })),
      ...notes.map((item) => ({
        id: `note:${item.id}`,
        type: 'NOTE',
        title: `Note — ${item.author.firstName} ${item.author.lastName}`,
        description: item.content,
        occurredAt: item.occurredAt,
      })),
      ...statuses.map((item) => ({
        id: `status:${item.id}`,
        type: 'STATUS_CHANGE',
        title: `${item.fromStatus ?? '—'} → ${item.toStatus}`,
        description: item.reason,
        occurredAt: item.occurredAt,
      })),
    ].sort(
      (a, b) =>
        b.occurredAt.getTime() - a.occurredAt.getTime() ||
        b.id.localeCompare(a.id),
    );

    const decoded = cursor ? this.decodeCursor(cursor) : null;
    const filtered = decoded
      ? items.filter(
          (item) =>
            item.occurredAt < new Date(decoded.occurredAt) ||
            (item.occurredAt.getTime() ===
              new Date(decoded.occurredAt).getTime() &&
              item.id < decoded.id),
        )
      : items;
    const pageItems = filtered.slice(0, limit);
    const last = pageItems.at(-1);
    return {
      items: pageItems,
      nextCursor:
        filtered.length > limit && last
          ? Buffer.from(
              JSON.stringify({
                occurredAt: last.occurredAt.toISOString(),
                id: last.id,
              }),
            ).toString('base64url')
          : null,
    };
  }

  async addNote(
    organizationId: string,
    authorId: string,
    ownerType: 'prospect' | 'client',
    ownerId: string,
    content: string,
  ) {
    const exists =
      ownerType === 'prospect'
        ? await this.prisma.prospect.findFirst({
            where: { id: ownerId, organizationId },
            select: { id: true },
          })
        : await this.prisma.client.findFirst({
            where: { id: ownerId, organizationId },
            select: { id: true },
          });
    if (!exists) throw new NotFoundException('CRM contact not found');
    return this.prisma.crmNote.create({
      data: {
        organizationId,
        authorId,
        content,
        ...(ownerType === 'prospect'
          ? { prospectId: ownerId }
          : { clientId: ownerId }),
      },
    });
  }

  private decodeCursor(cursor: string): TimelineCursor {
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as TimelineCursor;
      if (!parsed.id || Number.isNaN(Date.parse(parsed.occurredAt))) {
        throw new Error('Invalid cursor');
      }
      return parsed;
    } catch {
      throw new NotFoundException('Invalid timeline cursor');
    }
  }
}
