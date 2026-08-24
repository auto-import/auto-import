import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { MockTelephonyProvider } from './mock-telephony.provider';
import { MockWhatsappProvider } from './mock-whatsapp.provider';

describe('mock providers', () => {
  const config = new ConfigService({
    TELEPHONY_WEBHOOK_SECRET: 'voice-secret',
    WHATSAPP_APP_SECRET: 'message-secret',
  });

  it('verifies telephony signatures and reports simulated capabilities', () => {
    const provider = new MockTelephonyProvider(config);
    const body = '{"event":"ring"}';
    const signature = createHmac('sha256', 'voice-secret')
      .update(body)
      .digest('hex');
    expect(provider.verifyWebhook(body, `sha256=${signature}`)).toBe(true);
    expect(provider.verifyWebhook(body, 'bad')).toBe(false);
    expect(provider.capabilities().simulated).toBe(true);
  });

  it('creates a deterministic visibly simulated outbound message ID', async () => {
    const provider = new MockWhatsappProvider(config);
    const input = {
      conversationId: 'conversation-1',
      to: '+213550000000',
      text: 'Bonjour',
      idempotencyKey: 'same-request',
    };
    const first = await provider.sendText(input);
    const second = await provider.sendText(input);
    expect(first).toEqual(second);
    expect(first.providerMessageId).toMatch(/^simulated-/);
    expect(first.simulated).toBe(true);
  });
});
