import {
  BadRequestException,
  Injectable,
  NotImplementedException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import type {
  MessagingProvider,
  NormalizedMessageEvent,
  ProviderCapabilities,
} from './provider.interfaces';

@Injectable()
export class MockWhatsappProvider implements MessagingProvider {
  readonly key = 'mock';

  constructor(private readonly config: ConfigService) {}

  capabilities(): ProviderCapabilities {
    return {
      transfer: false,
      hangup: false,
      presence: false,
      text: true,
      templates: false,
      media: false,
      simulated: true,
    };
  }

  verifyWebhook(rawBody: string, signature?: string): boolean {
    const secret = this.config.get<string>('WHATSAPP_APP_SECRET');
    if (!secret || !signature) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const actual = signature.replace(/^sha256=/, '');
    return (
      actual.length === expected.length &&
      timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    );
  }

  parseWebhook(payload: unknown): NormalizedMessageEvent {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid mock WhatsApp payload');
    }
    const value = payload as Record<string, unknown>;
    return {
      providerEventId: requiredString(value.providerEventId, 'providerEventId'),
      providerMessageId: requiredString(
        value.providerMessageId,
        'providerMessageId',
      ),
      eventType: optionalString(value.eventType, 'message.received'),
      companyNumber: requiredString(value.companyNumber, 'companyNumber'),
      externalNumber: requiredString(value.externalNumber, 'externalNumber'),
      text: typeof value.text === 'string' ? value.text : undefined,
      occurredAt: new Date(
        optionalString(value.occurredAt, new Date().toISOString()),
      ),
      status: optionalString(
        value.status,
        'RECEIVED',
      ) as NormalizedMessageEvent['status'],
    };
  }

  sendText(input: {
    conversationId: string;
    to: string;
    text: string;
    idempotencyKey: string;
  }): Promise<{ providerMessageId: string; simulated: boolean }> {
    const digest = createHash('sha256')
      .update(`${input.conversationId}:${input.idempotencyKey}:${input.text}`)
      .digest('hex')
      .slice(0, 24);
    return Promise.resolve({
      providerMessageId: `simulated-${digest}`,
      simulated: true,
    });
  }

  sendTemplate(): Promise<never> {
    return Promise.reject(
      new NotImplementedException('Mock templates are not supported'),
    );
  }

  sendMedia(): Promise<never> {
    return Promise.reject(
      new NotImplementedException('Mock media is not supported'),
    );
  }

  health(): Promise<{ healthy: boolean; simulated: boolean }> {
    return Promise.resolve({ healthy: true, simulated: true });
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) {
    throw new BadRequestException(`${field} is required`);
  }
  return value;
}

function optionalString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
