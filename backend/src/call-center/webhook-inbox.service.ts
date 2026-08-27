import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, WebhookProcessingStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebhookInboxService {
  constructor(private readonly prisma: PrismaService) {}

  async begin(input: {
    organizationId: string;
    channelId: string;
    providerKey: string;
    providerEventId: string;
    eventType: string;
    payload: unknown;
  }) {
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(input.payload))
      .digest('hex');
    try {
      const receipt = await this.prisma.webhookInbox.create({
        data: {
          organizationId: input.organizationId,
          channelId: input.channelId,
          providerKey: input.providerKey,
          providerEventId: input.providerEventId,
          eventType: input.eventType,
          payloadHash,
          metadata: { simulated: input.providerKey === 'mock' },
          status: WebhookProcessingStatus.PROCESSING,
        },
      });
      return { receipt, replay: false };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const receipt = await this.prisma.webhookInbox.findUniqueOrThrow({
          where: {
            organizationId_providerKey_providerEventId: {
              organizationId: input.organizationId,
              providerKey: input.providerKey,
              providerEventId: input.providerEventId,
            },
          },
        });
        if (receipt.payloadHash !== payloadHash) {
          throw new ConflictException(
            'Provider event ID was reused with a different payload',
          );
        }
        return { receipt, replay: true };
      }
      throw error;
    }
  }

  processed(id: string) {
    return this.prisma.webhookInbox.update({
      where: { id },
      data: {
        status: WebhookProcessingStatus.PROCESSED,
        processedAt: new Date(),
        lastError: null,
      },
    });
  }

  failed(id: string, error: unknown) {
    return this.prisma.webhookInbox.update({
      where: { id },
      data: {
        status: WebhookProcessingStatus.FAILED,
        retryCount: { increment: 1 },
        lastError:
          error instanceof Error
            ? error.message.slice(0, 500)
            : 'Unknown error',
      },
    });
  }
}
