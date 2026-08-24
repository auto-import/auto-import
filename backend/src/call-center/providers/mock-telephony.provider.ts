import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import type {
  NormalizedCallEvent,
  ProviderCapabilities,
  TelephonyProvider,
} from './provider.interfaces';

@Injectable()
export class MockTelephonyProvider implements TelephonyProvider {
  readonly key = 'mock';

  constructor(private readonly config: ConfigService) {}

  capabilities(): ProviderCapabilities {
    return {
      transfer: true,
      hangup: true,
      presence: true,
      text: false,
      templates: false,
      media: false,
      simulated: true,
    };
  }

  verifyWebhook(rawBody: string, signature?: string): boolean {
    const secret = this.config.get<string>('TELEPHONY_WEBHOOK_SECRET');
    if (!secret || !signature) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const actual = signature.replace(/^sha256=/, '');
    return (
      actual.length === expected.length &&
      timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    );
  }

  parseWebhook(payload: unknown): NormalizedCallEvent {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid mock call payload');
    }
    const value = payload as Record<string, unknown>;
    return {
      providerEventId: requiredString(value.providerEventId, 'providerEventId'),
      providerCallId: requiredString(value.providerCallId, 'providerCallId'),
      eventType: optionalString(value.eventType, 'call.ringing'),
      companyNumber: requiredString(value.companyNumber, 'companyNumber'),
      externalNumber: requiredString(value.externalNumber, 'externalNumber'),
      occurredAt: new Date(
        optionalString(value.occurredAt, new Date().toISOString()),
      ),
      state: optionalString(
        value.state,
        'RINGING',
      ) as NormalizedCallEvent['state'],
    };
  }

  transfer(): Promise<{ simulated: boolean }> {
    return Promise.resolve({ simulated: true });
  }

  hangup(): Promise<{ simulated: boolean }> {
    return Promise.resolve({ simulated: true });
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
