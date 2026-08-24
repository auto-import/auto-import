export interface ProviderCapabilities {
  transfer: boolean;
  hangup: boolean;
  presence: boolean;
  text: boolean;
  templates: boolean;
  media: boolean;
  simulated: boolean;
}

export interface NormalizedCallEvent {
  providerEventId: string;
  providerCallId: string;
  eventType: string;
  companyNumber: string;
  externalNumber: string;
  occurredAt: Date;
  state:
    | 'RINGING'
    | 'QUEUED'
    | 'ASSIGNED'
    | 'FORWARDED'
    | 'ANSWERED'
    | 'COMPLETED'
    | 'MISSED'
    | 'FAILED';
}

export interface NormalizedMessageEvent {
  providerEventId: string;
  providerMessageId: string;
  eventType: string;
  companyNumber: string;
  externalNumber: string;
  text?: string;
  occurredAt: Date;
  status: 'RECEIVED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
}

export interface TelephonyProvider {
  readonly key: string;
  capabilities(): ProviderCapabilities;
  verifyWebhook(rawBody: string, signature?: string): boolean;
  parseWebhook(payload: unknown): NormalizedCallEvent;
  transfer(callId: string, target: string): Promise<{ simulated: boolean }>;
  hangup(callId: string): Promise<{ simulated: boolean }>;
  health(): Promise<{ healthy: boolean; simulated: boolean }>;
}

export interface MessagingProvider {
  readonly key: string;
  capabilities(): ProviderCapabilities;
  verifyWebhook(rawBody: string, signature?: string): boolean;
  parseWebhook(payload: unknown): NormalizedMessageEvent;
  sendText(input: {
    conversationId: string;
    to: string;
    text: string;
    idempotencyKey: string;
  }): Promise<{ providerMessageId: string; simulated: boolean }>;
  sendTemplate(): Promise<never>;
  sendMedia(): Promise<never>;
  health(): Promise<{ healthy: boolean; simulated: boolean }>;
}
