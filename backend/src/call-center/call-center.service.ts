import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentPresenceStatus,
  CallAssignmentStatus,
  CallDirection,
  CallState,
  CompanyChannelKind,
  MessageContentType,
  MessageDeliveryStatus,
  MessageDirection,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContactResolutionService } from '../crm/contact-resolution.service';
import { CrmKpiService } from '../crm/crm-kpi.service';
import { CallCenterGateway } from './call-center.gateway';
import { AgentPresenceService } from './agent-presence.service';
import { WebhookInboxService } from './webhook-inbox.service';
import { ProviderRegistryService } from './providers/provider-registry.service';
import type {
  NormalizedCallEvent,
  NormalizedMessageEvent,
} from './providers/provider.interfaces';
import {
  assertCrmLeadTransition,
  legacyStatusProjection,
} from '../crm/crm-lead-workflow';
import type {
  AppointmentStatusDto,
  AssignCallDto,
  CreateAppointmentDto,
  CreateChannelDto,
  DispositionCallDto,
  ReplyWhatsappDto,
  TaskStatusDto,
} from './dto/call-center.dto';

const TERMINAL_CALL_STATES: CallState[] = [
  CallState.COMPLETED,
  CallState.MISSED,
  CallState.FAILED,
];

const CALL_TRANSITIONS: Record<CallState, CallState[]> = {
  RINGING: [
    CallState.QUEUED,
    CallState.ASSIGNED,
    CallState.MISSED,
    CallState.FAILED,
  ],
  QUEUED: [CallState.ASSIGNED, CallState.MISSED, CallState.FAILED],
  ASSIGNED: [
    CallState.FORWARDED,
    CallState.ANSWERED,
    CallState.MISSED,
    CallState.FAILED,
  ],
  FORWARDED: [CallState.ANSWERED, CallState.MISSED, CallState.FAILED],
  ANSWERED: [CallState.COMPLETED, CallState.FORWARDED, CallState.FAILED],
  COMPLETED: [],
  MISSED: [],
  FAILED: [],
};

@Injectable()
export class CallCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactResolutionService,
    private readonly inbox: WebhookInboxService,
    private readonly presence: AgentPresenceService,
    private readonly providers: ProviderRegistryService,
    private readonly gateway: CallCenterGateway,
    private readonly kpis: CrmKpiService,
  ) {}

  listChannels(organizationId: string) {
    return this.prisma.companyChannel.findMany({
      where: { organizationId },
      orderBy: [{ channel: 'asc' }, { displayName: 'asc' }],
    });
  }

  async createChannel(organizationId: string, dto: CreateChannelDto) {
    const normalizedNumber = this.contacts.normalizePhone(dto.normalizedNumber);
    const provider =
      dto.channel === CompanyChannelKind.VOICE
        ? this.providers.telephony(dto.providerKey)
        : this.providers.messaging(dto.providerKey);
    return this.prisma.companyChannel.upsert({
      where: {
        organizationId_channel_normalizedNumber: {
          organizationId,
          channel: dto.channel,
          normalizedNumber,
        },
      },
      update: {
        displayName: dto.displayName,
        providerKey: dto.providerKey,
        active: dto.active ?? true,
        queueName: dto.queueName ?? 'default',
        routingConfig: (dto.routingConfig ?? {}) as Prisma.InputJsonValue,
      },
      create: {
        organizationId,
        channel: dto.channel,
        displayName: dto.displayName,
        normalizedNumber,
        providerKey: dto.providerKey,
        active: dto.active ?? true,
        queueName: dto.queueName ?? 'default',
        routingConfig: {
          ...(dto.routingConfig ?? {}),
          capabilities: provider.capabilities(),
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async listCalls(
    organizationId: string,
    options: { state?: CallState; view?: string; limit?: number },
  ) {
    const states = options.state
      ? [options.state]
      : options.view === 'queue'
        ? [CallState.RINGING, CallState.QUEUED]
        : options.view === 'active'
          ? [CallState.ASSIGNED, CallState.FORWARDED, CallState.ANSWERED]
          : options.view === 'missed'
            ? [CallState.MISSED]
            : undefined;
    return this.prisma.callSession.findMany({
      where: {
        organizationId,
        ...(states ? { state: { in: states } } : {}),
      },
      include: this.callInclude(),
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: options.limit ?? 50,
    });
  }

  async getCall(organizationId: string, id: string) {
    const call = await this.prisma.callSession.findFirst({
      where: { id, organizationId },
      include: {
        ...this.callInclude(),
        events: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] },
        assignments: {
          include: {
            dispatcher: {
              select: { id: true, firstName: true, lastName: true },
            },
            fromUser: { select: { id: true, firstName: true, lastName: true } },
            toUser: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { requestedAt: 'asc' },
        },
      },
    });
    if (!call) throw new NotFoundException('Call not found');
    return call;
  }

  async ingestCallEvent(
    providerKey: string,
    event: NormalizedCallEvent,
    preferredAssigneeId?: string,
    expectedOrganizationId?: string,
  ) {
    const channel = await this.resolveChannel(
      providerKey,
      CompanyChannelKind.VOICE,
      event.companyNumber,
      expectedOrganizationId,
    );
    const receiptState = await this.inbox.begin({
      organizationId: channel.organizationId,
      channelId: channel.id,
      providerKey,
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      payload: {
        providerCallId: event.providerCallId,
        eventType: event.eventType,
        companyNumber: event.companyNumber,
        externalNumber: event.externalNumber,
        state: event.state,
      },
    });
    if (receiptState.replay) {
      const existing = await this.prisma.callSession.findUnique({
        where: {
          organizationId_providerKey_providerCallId: {
            organizationId: channel.organizationId,
            providerKey,
            providerCallId: event.providerCallId,
          },
        },
        include: this.callInclude(),
      });
      return { replay: true, call: existing };
    }

    try {
      let call = await this.prisma.callSession.findUnique({
        where: {
          organizationId_providerKey_providerCallId: {
            organizationId: channel.organizationId,
            providerKey,
            providerCallId: event.providerCallId,
          },
        },
      });
      if (!call) {
        const resolved = await this.contacts.resolvePhone(
          channel.organizationId,
          event.externalNumber,
          'INBOUND_CALL',
          preferredAssigneeId,
        );
        const queuedAt =
          event.state === CallState.RINGING ? null : event.occurredAt;
        call = await this.prisma.$transaction(async (tx) => {
          const created = await tx.callSession.create({
            data: {
              organizationId: channel.organizationId,
              channelId: channel.id,
              providerKey,
              providerCallId: event.providerCallId,
              direction: CallDirection.INBOUND,
              companyNumber: channel.normalizedNumber,
              externalNumber: resolved.normalizedValue,
              prospectId: resolved.prospectId,
              clientId: resolved.clientId,
              state:
                event.state === CallState.RINGING
                  ? CallState.QUEUED
                  : event.state,
              receivedAt: event.occurredAt,
              queuedAt: queuedAt ?? event.occurredAt,
            },
          });
          await tx.callEvent.create({
            data: {
              callSessionId: created.id,
              providerEventId: event.providerEventId,
              state: created.state,
              occurredAt: event.occurredAt,
              metadata: { simulated: providerKey === 'mock' },
            },
          });
          await this.touchContact(
            tx,
            resolved.prospectId,
            resolved.clientId,
            event.occurredAt,
          );
          await this.notifyDispatchers(
            tx,
            channel.organizationId,
            created.id,
            resolved.created
              ? 'Nouvel appel — lead créé automatiquement'
              : 'Nouvel appel entrant',
            resolved.normalizedValue,
          );
          return created;
        });
      } else if (call.state !== event.state) {
        call = await this.applyCallState(
          channel.organizationId,
          call.id,
          event.state,
          event.occurredAt,
          event.providerEventId,
          undefined,
          undefined,
        );
      }
      await this.inbox.processed(receiptState.receipt.id);
      const hydrated = await this.getCall(channel.organizationId, call.id);
      this.gateway.emitOrganization(
        channel.organizationId,
        'call.updated',
        hydrated,
      );
      return { replay: false, call: hydrated };
    } catch (error) {
      await this.inbox.failed(receiptState.receipt.id, error);
      throw error;
    }
  }

  async assignCall(
    organizationId: string,
    callId: string,
    dispatcherId: string,
    dto: AssignCallDto,
  ) {
    const [call, target] = await Promise.all([
      this.prisma.callSession.findFirst({
        where: { id: callId, organizationId },
      }),
      this.prisma.user.findFirst({
        where: { id: dto.toUserId, organizationId, status: 'active' },
        select: { id: true },
      }),
    ]);
    if (!call || !target)
      throw new NotFoundException('Call or employee not found');
    if (TERMINAL_CALL_STATES.includes(call.state)) {
      throw new ConflictException('A completed call cannot be assigned');
    }
    const isTransfer = Boolean(call.handlingEmployeeId);
    if (
      isTransfer &&
      !this.providers.telephony(call.providerKey).capabilities().transfer
    ) {
      throw new ConflictException(
        'The configured provider cannot transfer calls',
      );
    }
    if (isTransfer) {
      await this.providers
        .telephony(call.providerKey)
        .transfer(call.providerCallId, target.id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.callAssignment.create({
        data: {
          callSessionId: call.id,
          dispatcherId,
          fromUserId: call.handlingEmployeeId,
          toUserId: target.id,
          status: CallAssignmentStatus.ACCEPTED,
          reason: dto.reason,
          resolvedAt: new Date(),
        },
      });
      await tx.callSession.update({
        where: { id: call.id },
        data: {
          dispatcherId: call.dispatcherId ?? dispatcherId,
          handlingEmployeeId: target.id,
          state: isTransfer ? CallState.FORWARDED : CallState.ASSIGNED,
        },
      });
      await tx.callEvent.create({
        data: {
          callSessionId: call.id,
          state: isTransfer ? CallState.FORWARDED : CallState.ASSIGNED,
          actorUserId: dispatcherId,
          occurredAt: new Date(),
          metadata: { simulatedTransfer: isTransfer },
        },
      });
    });
    const hydrated = await this.getCall(organizationId, call.id);
    this.gateway.emitOrganization(organizationId, 'call.assigned', hydrated);
    return hydrated;
  }

  async transitionCall(
    organizationId: string,
    callId: string,
    actorUserId: string,
    state: CallState,
    reason?: string,
    providerEventId?: string,
    occurredAt = new Date(),
  ) {
    const call = await this.prisma.callSession.findFirst({
      where: { id: callId, organizationId },
    });
    if (!call) throw new NotFoundException('Call not found');
    if (
      call.handlingEmployeeId &&
      call.handlingEmployeeId !== actorUserId &&
      call.dispatcherId !== actorUserId
    ) {
      throw new ForbiddenException('This call belongs to another employee');
    }
    await this.applyCallState(
      organizationId,
      callId,
      state,
      occurredAt,
      providerEventId,
      actorUserId,
      reason,
    );
    const hydrated = await this.getCall(organizationId, call.id);
    this.gateway.emitOrganization(organizationId, 'call.updated', hydrated);
    return hydrated;
  }

  async dispositionCall(
    organizationId: string,
    callId: string,
    userId: string,
    dto: DispositionCallDto,
  ) {
    const call = await this.prisma.callSession.findFirst({
      where: { id: callId, organizationId },
    });
    if (!call) throw new NotFoundException('Call not found');
    if (call.handlingEmployeeId !== userId) {
      throw new ForbiddenException(
        'Only the handling employee can disposition this call',
      );
    }
    if (!TERMINAL_CALL_STATES.includes(call.state)) {
      throw new ConflictException('Complete the call before disposition');
    }
    if (
      Boolean(dto.appointmentStart) !== Boolean(dto.appointmentEnd) ||
      Boolean(dto.appointmentTitle) !== Boolean(dto.appointmentStart)
    ) {
      throw new BadRequestException(
        'Appointment title, start and end are required together',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const nextActionAt = dto.nextActionAt ? new Date(dto.nextActionAt) : null;
      await tx.callSession.update({
        where: { id: call.id },
        data: {
          outcome: dto.outcome,
          notes: dto.notes,
          nextAction: dto.nextAction,
          nextActionAt,
          dispositionedAt: new Date(),
        },
      });
      if (call.prospectId) {
        const prospect = await tx.prospect.findUniqueOrThrow({
          where: { id: call.prospectId },
          select: { crmStatus: true },
        });
        if (dto.crmStatus)
          assertCrmLeadTransition(prospect.crmStatus, dto.crmStatus);
        await tx.prospect.update({
          where: { id: call.prospectId },
          data: {
            ...(dto.qualification ? { qualification: dto.qualification } : {}),
            ...(dto.crmStatus
              ? {
                  crmStatus: dto.crmStatus,
                  status: legacyStatusProjection(dto.crmStatus),
                  reconciliationRequired: false,
                }
              : {}),
            nextAction: dto.nextAction,
            nextActionAt,
            lastInteractionAt: call.completedAt ?? new Date(),
          },
        });
        if (dto.crmStatus && dto.crmStatus !== prospect.crmStatus) {
          await tx.prospectStatusHistory.create({
            data: {
              organizationId,
              prospectId: call.prospectId,
              changedBy: userId,
              fromStatus: prospect.crmStatus,
              toStatus: dto.crmStatus,
              reason: `Disposition: ${dto.outcome}`,
            },
          });
        }
      }
      if (call.clientId) {
        await tx.client.update({
          where: { id: call.clientId },
          data: {
            nextActionAt,
            lastInteractionAt: call.completedAt ?? new Date(),
          },
        });
      }
      if (dto.callbackAt) {
        await tx.task.upsert({
          where: { callbackForCallId: call.id },
          update: {
            dueDate: new Date(dto.callbackAt),
            title: dto.nextAction || 'Rappel client',
            status: 'todo',
            assignedTo: userId,
          },
          create: {
            organizationId,
            assignedTo: userId,
            createdBy: userId,
            title: dto.nextAction || 'Rappel client',
            description: dto.notes,
            priority: 'high',
            status: 'todo',
            dueDate: new Date(dto.callbackAt),
            relatedType: 'call',
            relatedId: call.id,
            callbackForCallId: call.id,
            prospectId: call.prospectId,
            clientId: call.clientId,
          },
        });
      }
      if (dto.appointmentTitle && dto.appointmentStart && dto.appointmentEnd) {
        await tx.appointment.create({
          data: {
            organizationId,
            assignedTo: userId,
            prospectId: call.prospectId,
            clientId: call.clientId,
            title: dto.appointmentTitle,
            scheduledStart: new Date(dto.appointmentStart),
            scheduledEnd: new Date(dto.appointmentEnd),
            notes: dto.notes,
          },
        });
      }
    });
    const hydrated = await this.getCall(organizationId, call.id);
    this.gateway.emitOrganization(
      organizationId,
      'call.dispositioned',
      hydrated,
    );
    return hydrated;
  }

  listPresence(organizationId: string) {
    return this.presence.list(organizationId);
  }

  listAgents(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId, status: 'active' },
      select: { id: true, firstName: true, lastName: true, officeId: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async setPresence(
    organizationId: string,
    userId: string,
    status: AgentPresenceStatus,
  ) {
    const updated = await this.presence.setManual(
      organizationId,
      userId,
      status,
    );
    this.gateway.emitOrganization(organizationId, 'presence.updated', updated);
    return updated;
  }

  heartbeat(organizationId: string, userId: string) {
    return this.presence.heartbeat(organizationId, userId);
  }

  async ingestWhatsappEvent(
    providerKey: string,
    event: NormalizedMessageEvent,
    preferredAssigneeId?: string,
    expectedOrganizationId?: string,
  ) {
    const channel = await this.resolveChannel(
      providerKey,
      CompanyChannelKind.WHATSAPP,
      event.companyNumber,
      expectedOrganizationId,
    );
    const receiptState = await this.inbox.begin({
      organizationId: channel.organizationId,
      channelId: channel.id,
      providerKey,
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      payload: {
        providerMessageId: event.providerMessageId,
        eventType: event.eventType,
        companyNumber: event.companyNumber,
        externalNumber: event.externalNumber,
        text: event.text,
        status: event.status,
      },
    });
    if (receiptState.replay) {
      const message = await this.prisma.whatsappMessage.findUnique({
        where: {
          organizationId_providerKey_providerMessageId: {
            organizationId: channel.organizationId,
            providerKey,
            providerMessageId: event.providerMessageId,
          },
        },
      });
      return { replay: true, message };
    }
    try {
      const resolved = await this.contacts.resolvePhone(
        channel.organizationId,
        event.externalNumber,
        'WHATSAPP',
        preferredAssigneeId,
      );
      const assigneeId =
        preferredAssigneeId ??
        (resolved.prospectId
          ? (
              await this.prisma.prospect.findUnique({
                where: { id: resolved.prospectId },
                select: { assignedTo: true },
              })
            )?.assignedTo
          : (
              await this.prisma.client.findUnique({
                where: { id: resolved.clientId! },
                select: { assignedTo: true },
              })
            )?.assignedTo);
      const message = await this.prisma.$transaction(async (tx) => {
        const conversation = await tx.whatsappConversation.upsert({
          where: {
            organizationId_channelId_externalNumber: {
              organizationId: channel.organizationId,
              channelId: channel.id,
              externalNumber: resolved.normalizedValue,
            },
          },
          update: {
            lastMessageAt: event.occurredAt,
            closedAt: null,
            ...(assigneeId ? { assignedTo: assigneeId } : {}),
          },
          create: {
            organizationId: channel.organizationId,
            channelId: channel.id,
            providerKey,
            externalNumber: resolved.normalizedValue,
            prospectId: resolved.prospectId,
            clientId: resolved.clientId,
            assignedTo: assigneeId,
            lastMessageAt: event.occurredAt,
          },
        });
        const created = await tx.whatsappMessage.create({
          data: {
            organizationId: channel.organizationId,
            conversationId: conversation.id,
            providerKey,
            providerMessageId: event.providerMessageId,
            direction: MessageDirection.INBOUND,
            contentType: MessageContentType.TEXT,
            text: event.text,
            status: MessageDeliveryStatus.RECEIVED,
            occurredAt: event.occurredAt,
            receivedAt: event.occurredAt,
          },
        });
        await this.touchContact(
          tx,
          resolved.prospectId,
          resolved.clientId,
          event.occurredAt,
        );
        if (assigneeId) {
          await tx.notification.create({
            data: {
              organizationId: channel.organizationId,
              userId: assigneeId,
              type: 'WHATSAPP_INBOUND',
              title: resolved.created
                ? 'Nouveau WhatsApp — lead créé'
                : 'Nouveau message WhatsApp',
              content: event.text,
              relatedType: 'whatsappConversation',
              relatedId: conversation.id,
              category: 'whatsapp',
              dedupeKey: `whatsapp:${event.providerMessageId}`,
            },
          });
        }
        return created;
      });
      await this.inbox.processed(receiptState.receipt.id);
      this.gateway.emitOrganization(
        channel.organizationId,
        'whatsapp.message',
        message,
      );
      return { replay: false, message };
    } catch (error) {
      await this.inbox.failed(receiptState.receipt.id, error);
      throw error;
    }
  }

  listConversations(organizationId: string) {
    return this.prisma.whatsappConversation.findMany({
      where: { organizationId },
      include: {
        prospect: true,
        client: true,
        assignee: { select: { id: true, firstName: true, lastName: true } },
        messages: { orderBy: { occurredAt: 'desc' }, take: 1 },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
  }

  async getConversation(organizationId: string, id: string) {
    const conversation = await this.prisma.whatsappConversation.findFirst({
      where: { id, organizationId },
      include: {
        prospect: true,
        client: true,
        assignee: { select: { id: true, firstName: true, lastName: true } },
        messages: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async replyWhatsapp(
    organizationId: string,
    conversationId: string,
    userId: string,
    dto: ReplyWhatsappDto,
  ) {
    const conversation = await this.prisma.whatsappConversation.findFirst({
      where: { id: conversationId, organizationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const result = await this.providers
      .messaging(conversation.providerKey)
      .sendText({
        conversationId,
        to: conversation.externalNumber,
        text: dto.text,
        idempotencyKey: dto.idempotencyKey,
      });
    const existing = await this.prisma.whatsappMessage.findUnique({
      where: {
        organizationId_providerKey_providerMessageId: {
          organizationId,
          providerKey: conversation.providerKey,
          providerMessageId: result.providerMessageId,
        },
      },
    });
    if (existing) return existing;
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.whatsappMessage.create({
        data: {
          organizationId,
          conversationId,
          providerKey: conversation.providerKey,
          providerMessageId: result.providerMessageId,
          direction: MessageDirection.OUTBOUND,
          contentType: MessageContentType.TEXT,
          text: dto.text,
          status: MessageDeliveryStatus.SIMULATED,
          occurredAt: new Date(),
          sentAt: new Date(),
        },
      });
      await tx.whatsappConversation.update({
        where: { id: conversationId },
        data: { assignedTo: userId, lastMessageAt: created.occurredAt },
      });
      return created;
    });
    this.gateway.emitOrganization(organizationId, 'whatsapp.message', message);
    return { ...message, simulated: true };
  }

  async updateMessageStatus(
    organizationId: string,
    providerMessageId: string,
    status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED',
    occurredAt: Date,
  ) {
    const message = await this.prisma.whatsappMessage.findFirst({
      where: { organizationId, providerMessageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    const rank: MessageDeliveryStatus[] = [
      MessageDeliveryStatus.SIMULATED,
      MessageDeliveryStatus.SENT,
      MessageDeliveryStatus.DELIVERED,
      MessageDeliveryStatus.READ,
    ];
    const next = status as MessageDeliveryStatus;
    if (
      next !== MessageDeliveryStatus.FAILED &&
      rank.indexOf(next) <= rank.indexOf(message.status)
    ) {
      return message;
    }
    const updated = await this.prisma.whatsappMessage.update({
      where: { id: message.id },
      data: {
        status: next,
        ...(next === MessageDeliveryStatus.SENT ? { sentAt: occurredAt } : {}),
        ...(next === MessageDeliveryStatus.DELIVERED
          ? { deliveredAt: occurredAt }
          : {}),
        ...(next === MessageDeliveryStatus.READ ? { readAt: occurredAt } : {}),
        ...(next === MessageDeliveryStatus.FAILED
          ? { failedAt: occurredAt }
          : {}),
      },
    });
    this.gateway.emitOrganization(organizationId, 'whatsapp.status', updated);
    return updated;
  }

  async listFollowUps(organizationId: string, queue?: string) {
    const now = new Date();
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const where: Prisma.TaskWhereInput = { organizationId };
    if (queue === 'today') {
      where.status = { notIn: ['completed', 'cancelled'] };
      where.dueDate = { gte: start, lt: end };
    } else if (queue === 'overdue') {
      where.status = { notIn: ['completed', 'cancelled'] };
      where.dueDate = { lt: now };
    } else if (queue === 'upcoming') {
      where.status = { notIn: ['completed', 'cancelled'] };
      where.dueDate = { gte: end };
    } else if (queue === 'completed') where.status = 'completed';
    else if (queue === 'cancelled') where.status = 'cancelled';
    return this.prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        prospect: true,
        client: true,
        callbackForCall: { select: { id: true, externalNumber: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async setTaskStatus(organizationId: string, id: string, dto: TaskStatusDto) {
    const task = await this.prisma.task.findFirst({
      where: { id, organizationId },
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.prisma.task.update({
      where: { id },
      data: {
        status: dto.status,
        completedAt: dto.status === 'completed' ? new Date() : null,
      },
    });
  }

  listAppointments(organizationId: string) {
    return this.prisma.appointment.findMany({
      where: { organizationId },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        prospect: true,
        client: true,
      },
      orderBy: { scheduledStart: 'asc' },
      take: 200,
    });
  }

  async createAppointment(
    organizationId: string,
    userId: string,
    dto: CreateAppointmentDto,
  ) {
    if (Boolean(dto.prospectId) === Boolean(dto.clientId)) {
      throw new BadRequestException(
        'Exactly one prospectId or clientId is required',
      );
    }
    const [assignee, contact] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: dto.assignedTo, organizationId, status: 'active' },
        select: { id: true },
      }),
      dto.prospectId
        ? this.prisma.prospect.findFirst({
            where: { id: dto.prospectId, organizationId },
            select: { id: true },
          })
        : this.prisma.client.findFirst({
            where: { id: dto.clientId, organizationId },
            select: { id: true },
          }),
    ]);
    if (!assignee || !contact)
      throw new NotFoundException('Employee or CRM contact not found');
    const start = new Date(dto.scheduledStart);
    const end = new Date(dto.scheduledEnd);
    if (end <= start)
      throw new BadRequestException('Appointment end must be after start');
    const appointment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          organizationId,
          assignedTo: dto.assignedTo,
          prospectId: dto.prospectId,
          clientId: dto.clientId,
          title: dto.title,
          scheduledStart: start,
          scheduledEnd: end,
          notes: dto.notes,
        },
      });
      if (dto.prospectId) {
        await tx.prospect.update({
          where: { id: dto.prospectId },
          data: { nextActionAt: start },
        });
      } else if (dto.clientId) {
        await tx.client.update({
          where: { id: dto.clientId },
          data: { nextActionAt: start },
        });
      }
      await tx.notification.create({
        data: {
          organizationId,
          userId: dto.assignedTo,
          type: 'APPOINTMENT_CREATED',
          title: 'Nouveau rendez-vous',
          content: dto.title,
          relatedType: 'appointment',
          relatedId: created.id,
          category: 'appointment',
          dedupeKey: `appointment:${created.id}`,
        },
      });
      return created;
    });
    this.gateway.emitUser(dto.assignedTo, 'appointment.created', appointment);
    return { ...appointment, createdBy: userId };
  }

  async updateAppointmentStatus(
    organizationId: string,
    id: string,
    dto: AppointmentStatusDto,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, organizationId },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return this.prisma.appointment.update({
      where: { id },
      data: { status: dto.status, outcome: dto.outcome },
    });
  }

  listNotifications(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markNotificationRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: notification.readAt ?? new Date() },
    });
  }

  markAllNotificationsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  getKpis(organizationId: string, from: Date, to: Date, agentId?: string) {
    return this.kpis.calculate(organizationId, from, to, agentId);
  }

  assertSimulatorEnabled() {
    if ((process.env.NODE_ENV ?? 'development') === 'production') {
      throw new NotFoundException('Not found');
    }
  }

  private async applyCallState(
    organizationId: string,
    callId: string,
    state: CallState,
    occurredAt: Date,
    providerEventId?: string,
    actorUserId?: string,
    reason?: string,
  ) {
    const call = await this.prisma.callSession.findFirst({
      where: { id: callId, organizationId },
    });
    if (!call) throw new NotFoundException('Call not found');
    if (call.state === state) return call;
    if (!CALL_TRANSITIONS[call.state].includes(state)) {
      throw new ConflictException(
        `Invalid call transition ${call.state} -> ${state}`,
      );
    }
    const answeredAt =
      state === CallState.ANSWERED ? occurredAt : call.answeredAt;
    const completedAt = TERMINAL_CALL_STATES.includes(state)
      ? occurredAt
      : call.completedAt;
    const waitingSeconds =
      answeredAt && call.queuedAt
        ? Math.max(
            0,
            Math.round((answeredAt.getTime() - call.queuedAt.getTime()) / 1000),
          )
        : call.waitingSeconds;
    const durationSeconds =
      completedAt && answeredAt
        ? Math.max(
            0,
            Math.round((completedAt.getTime() - answeredAt.getTime()) / 1000),
          )
        : call.durationSeconds;
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.callSession.update({
        where: { id: call.id },
        data: {
          state,
          answeredAt,
          completedAt,
          waitingSeconds,
          durationSeconds,
          ...(state === CallState.MISSED
            ? { missedReason: reason ?? 'unanswered' }
            : {}),
          ...(state === CallState.FAILED
            ? { failureReason: reason ?? 'provider_failure' }
            : {}),
        },
      });
      await tx.callEvent.create({
        data: {
          callSessionId: call.id,
          providerEventId,
          state,
          actorUserId,
          occurredAt,
          metadata: reason ? { reason } : undefined,
        },
      });
      await this.touchContact(tx, call.prospectId, call.clientId, occurredAt);
      if (state === CallState.MISSED)
        await this.createMissedCallback(tx, result);
      return result;
    });
    if (state === CallState.ANSWERED && updated.handlingEmployeeId) {
      await this.presence.busy(
        organizationId,
        updated.handlingEmployeeId,
        updated.id,
      );
    }
    if (TERMINAL_CALL_STATES.includes(state) && updated.handlingEmployeeId) {
      await this.presence.available(organizationId, updated.handlingEmployeeId);
    }
    return updated;
  }

  private async createMissedCallback(
    tx: Prisma.TransactionClient,
    call: {
      id: string;
      organizationId: string;
      handlingEmployeeId: string | null;
      prospectId: string | null;
      clientId: string | null;
      externalNumber: string;
    },
  ) {
    let assignedTo = call.handlingEmployeeId;
    if (!assignedTo && call.prospectId) {
      assignedTo =
        (
          await tx.prospect.findUnique({
            where: { id: call.prospectId },
            select: { assignedTo: true },
          })
        )?.assignedTo ?? null;
    }
    if (!assignedTo && call.clientId) {
      assignedTo =
        (
          await tx.client.findUnique({
            where: { id: call.clientId },
            select: { assignedTo: true },
          })
        )?.assignedTo ?? null;
    }
    assignedTo ??=
      (
        await tx.user.findFirst({
          where: { organizationId: call.organizationId, status: 'active' },
          select: { id: true },
        })
      )?.id ?? null;
    if (!assignedTo) return;
    const task = await tx.task.upsert({
      where: { callbackForCallId: call.id },
      update: {},
      create: {
        organizationId: call.organizationId,
        assignedTo,
        createdBy: assignedTo,
        title: `Rappeler ${call.externalNumber}`,
        priority: 'high',
        status: 'todo',
        dueDate: new Date(Date.now() + 60 * 60 * 1000),
        relatedType: 'call',
        relatedId: call.id,
        callbackForCallId: call.id,
        prospectId: call.prospectId,
        clientId: call.clientId,
      },
    });
    await tx.notification.create({
      data: {
        organizationId: call.organizationId,
        userId: assignedTo,
        type: 'MISSED_CALL',
        title: 'Appel manqué — rappel requis',
        content: call.externalNumber,
        relatedType: 'task',
        relatedId: task.id,
        category: 'call',
        severity: 'warning',
        dedupeKey: `missed-call:${call.id}`,
      },
    });
  }

  private async notifyDispatchers(
    tx: Prisma.TransactionClient,
    organizationId: string,
    callId: string,
    title: string,
    content: string,
  ) {
    const dispatchers = await tx.user.findMany({
      where: {
        organizationId,
        status: 'active',
        userRoles: {
          some: {
            role: {
              rolePermissions: {
                some: {
                  permission: { resource: 'callCenter', action: 'dispatch' },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    if (dispatchers.length > 0) {
      await tx.notification.createMany({
        data: dispatchers.map(({ id }) => ({
          organizationId,
          userId: id,
          type: 'INBOUND_CALL',
          title,
          content,
          relatedType: 'call',
          relatedId: callId,
          category: 'call',
          dedupeKey: `inbound-call:${callId}`,
        })),
        skipDuplicates: true,
      });
    }
  }

  private async touchContact(
    tx: Prisma.TransactionClient,
    prospectId: string | null,
    clientId: string | null,
    occurredAt: Date,
  ) {
    if (prospectId) {
      await tx.prospect.update({
        where: { id: prospectId },
        data: { lastInteractionAt: occurredAt },
      });
    } else if (clientId) {
      await tx.client.update({
        where: { id: clientId },
        data: { lastInteractionAt: occurredAt },
      });
    }
  }

  private async resolveChannel(
    providerKey: string,
    kind: CompanyChannelKind,
    companyNumber: string,
    expectedOrganizationId?: string,
  ) {
    const normalizedNumber = this.contacts.normalizePhone(companyNumber);
    const channels = await this.prisma.companyChannel.findMany({
      where: {
        providerKey,
        channel: kind,
        normalizedNumber,
        active: true,
        ...(expectedOrganizationId
          ? { organizationId: expectedOrganizationId }
          : {}),
      },
      take: 2,
    });
    if (channels.length !== 1)
      throw new NotFoundException('Company channel not found');
    return channels[0];
  }

  private callInclude() {
    return {
      prospect: {
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      client: {
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      dispatcher: { select: { id: true, firstName: true, lastName: true } },
      handlingEmployee: {
        select: { id: true, firstName: true, lastName: true },
      },
      channel: true,
    } as const;
  }
}
