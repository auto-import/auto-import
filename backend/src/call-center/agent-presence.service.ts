import { Injectable, NotFoundException } from '@nestjs/common';
import { AgentPresenceStatus, PresenceSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const STALE_AFTER_MS = 2 * 60 * 1000;

@Injectable()
export class AgentPresenceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
    await this.prisma.agentPresence.updateMany({
      where: {
        organizationId,
        lastHeartbeatAt: { lt: staleBefore },
        status: { not: AgentPresenceStatus.OFFLINE },
      },
      data: {
        status: AgentPresenceStatus.OFFLINE,
        currentCallId: null,
      },
    });
    return this.prisma.agentPresence.findMany({
      where: { organizationId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, officeId: true },
        },
        currentCall: {
          select: { id: true, externalNumber: true, state: true },
        },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async setManual(
    organizationId: string,
    userId: string,
    status: AgentPresenceStatus,
  ) {
    await this.assertUser(organizationId, userId);
    return this.prisma.agentPresence.upsert({
      where: { userId },
      update: {
        status,
        source: PresenceSource.MANUAL,
        lastHeartbeatAt: new Date(),
        ...(status === AgentPresenceStatus.BUSY ? {} : { currentCallId: null }),
      },
      create: {
        organizationId,
        userId,
        status,
        source: PresenceSource.MANUAL,
        lastHeartbeatAt: new Date(),
      },
    });
  }

  async heartbeat(organizationId: string, userId: string) {
    await this.assertUser(organizationId, userId);
    return this.prisma.agentPresence.upsert({
      where: { userId },
      update: { lastHeartbeatAt: new Date() },
      create: {
        organizationId,
        userId,
        status: AgentPresenceStatus.AVAILABLE,
        source: PresenceSource.MANUAL,
        lastHeartbeatAt: new Date(),
      },
    });
  }

  busy(organizationId: string, userId: string, callId: string) {
    return this.prisma.agentPresence.upsert({
      where: { userId },
      update: {
        status: AgentPresenceStatus.BUSY,
        currentCallId: callId,
        lastHeartbeatAt: new Date(),
      },
      create: {
        organizationId,
        userId,
        status: AgentPresenceStatus.BUSY,
        source: PresenceSource.MANUAL,
        currentCallId: callId,
        lastHeartbeatAt: new Date(),
      },
    });
  }

  available(organizationId: string, userId: string) {
    return this.prisma.agentPresence.upsert({
      where: { userId },
      update: {
        status: AgentPresenceStatus.AVAILABLE,
        currentCallId: null,
        lastHeartbeatAt: new Date(),
      },
      create: {
        organizationId,
        userId,
        status: AgentPresenceStatus.AVAILABLE,
        source: PresenceSource.MANUAL,
        lastHeartbeatAt: new Date(),
      },
    });
  }

  private async assertUser(organizationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, status: 'active' },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Employee not found');
  }
}
