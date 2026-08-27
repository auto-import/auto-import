import { Injectable, NotImplementedException } from '@nestjs/common';
import { MockTelephonyProvider } from './mock-telephony.provider';
import { MockWhatsappProvider } from './mock-whatsapp.provider';
import type {
  MessagingProvider,
  TelephonyProvider,
} from './provider.interfaces';

@Injectable()
export class ProviderRegistryService {
  constructor(
    private readonly mockTelephony: MockTelephonyProvider,
    private readonly mockWhatsapp: MockWhatsappProvider,
  ) {}

  telephony(key: string): TelephonyProvider {
    if (key === 'mock' && process.env.NODE_ENV !== 'production')
      return this.mockTelephony;
    throw new NotImplementedException(
      `Telephony provider adapter '${key}' is not installed`,
    );
  }

  messaging(key: string): MessagingProvider {
    if (key === 'mock' && process.env.NODE_ENV !== 'production')
      return this.mockWhatsapp;
    throw new NotImplementedException(
      `Messaging provider adapter '${key}' is not installed`,
    );
  }
}
