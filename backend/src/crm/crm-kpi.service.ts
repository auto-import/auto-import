import { Injectable } from '@nestjs/common';
import { CallState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CrmKpiService {
  constructor(private readonly prisma: PrismaService) {}

  async calculate(
    organizationId: string,
    from: Date,
    to: Date,
    agentId?: string,
  ) {
    const range = { gte: from, lt: to };
    const [calls, transfers, messages, callbacks, appointments, converted] =
      await Promise.all([
        this.prisma.callSession.findMany({
          where: {
            organizationId,
            receivedAt: range,
            ...(agentId
              ? {
                  OR: [
                    { dispatcherId: agentId },
                    { handlingEmployeeId: agentId },
                  ],
                }
              : {}),
          },
          include: {
            assignments: {
              select: { requestedAt: true },
              orderBy: { requestedAt: 'asc' },
            },
          },
        }),
        this.prisma.callAssignment.findMany({
          where: {
            callSession: { organizationId, receivedAt: range },
            ...(agentId
              ? { OR: [{ dispatcherId: agentId }, { toUserId: agentId }] }
              : {}),
          },
        }),
        this.prisma.whatsappMessage.findMany({
          where: {
            organizationId,
            occurredAt: range,
            ...(agentId ? { conversation: { assignedTo: agentId } } : {}),
          },
        }),
        this.prisma.task.findMany({
          where: {
            organizationId,
            callbackForCallId: { not: null },
            dueDate: range,
            ...(agentId ? { assignedTo: agentId } : {}),
          },
        }),
        this.prisma.appointment.findMany({
          where: {
            organizationId,
            scheduledStart: range,
            ...(agentId ? { assignedTo: agentId } : {}),
          },
        }),
        this.prisma.prospect.count({
          where: {
            organizationId,
            convertedAt: range,
            ...(agentId ? { assignedTo: agentId } : {}),
          },
        }),
      ]);

    const handled = calls.filter(
      (call) => !agentId || call.handlingEmployeeId === agentId,
    );
    const dispatched = calls.filter(
      (call) => !agentId || call.dispatcherId === agentId,
    );
    const answered = handled.filter((call) => call.answeredAt);
    const missed = handled.filter((call) => call.state === CallState.MISSED);
    const received = dispatched.length;
    const talkSeconds = answered.reduce(
      (sum, call) => sum + (call.durationSeconds ?? 0),
      0,
    );
    const waits = answered.map((call) => call.waitingSeconds ?? 0);
    const qualified = await this.prisma.prospect.count({
      where: {
        organizationId,
        qualification: { in: ['HOT', 'WARM'] },
        updatedAt: range,
        ...(agentId ? { assignedTo: agentId } : {}),
      },
    });

    return {
      period: {
        from: from.toISOString(),
        toExclusive: to.toISOString(),
        timezone: 'UTC',
      },
      dispatcher: {
        callsReceived: received,
        callsDispatched: dispatched.filter((call) => call.dispatcherId).length,
        averageDispatchDelaySeconds: average(
          dispatched
            .filter((call) => call.queuedAt && call.assignments[0])
            .map((call) =>
              Math.max(
                0,
                Math.round(
                  (call.assignments[0].requestedAt.getTime() -
                    call.queuedAt!.getTime()) /
                    1000,
                ),
              ),
            ),
        ),
        missedOrUnassigned: dispatched.filter(
          (call) => call.state === CallState.MISSED || !call.handlingEmployeeId,
        ).length,
        successfulTransfers: transfers.filter(
          (assignment) =>
            assignment.fromUserId && assignment.status === 'ACCEPTED',
        ).length,
        failedTransfers: transfers.filter((assignment) =>
          assignment.fromUserId
            ? ['FAILED', 'REJECTED'].includes(assignment.status)
            : false,
        ).length,
      },
      agent: {
        answeredCalls: answered.length,
        missedAssignedCalls: missed.length,
        answerRate: handled.length === 0 ? 0 : answered.length / handled.length,
        totalTalkSeconds: talkSeconds,
        averageTalkSeconds: average(
          answered.map((call) => call.durationSeconds ?? 0),
        ),
        averageWaitSeconds: average(waits),
        whatsappMessagesHandled: messages.length,
        callbacksCompleted: callbacks.filter(
          (task) => task.status === 'completed',
        ).length,
        callbacksOverdue: callbacks.filter(
          (task) =>
            !['completed', 'cancelled'].includes(task.status) &&
            task.dueDate !== null &&
            task.dueDate < new Date(),
        ).length,
        qualifiedLeads: qualified,
        appointmentsCreated: appointments.length,
        appointmentsCompleted: appointments.filter(
          (appointment) => appointment.status === 'COMPLETED',
        ).length,
        conversions: converted,
        conversionRate: qualified === 0 ? 0 : converted / qualified,
      },
    };
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}
