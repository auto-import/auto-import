import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { CrmModule } from '../crm/crm.module';
import { AgentPresenceService } from './agent-presence.service';
import { CallCenterController } from './call-center.controller';
import { CallCenterGateway } from './call-center.gateway';
import { CallCenterService } from './call-center.service';
import { ProviderWebhooksController } from './provider-webhooks.controller';
import { SimulatorController } from './simulator.controller';
import { WebhookInboxService } from './webhook-inbox.service';
import { MockTelephonyProvider } from './providers/mock-telephony.provider';
import { MockWhatsappProvider } from './providers/mock-whatsapp.provider';
import { ProviderRegistryService } from './providers/provider-registry.service';

@Module({
  imports: [
    AuthModule,
    CrmModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [
    CallCenterController,
    SimulatorController,
    ProviderWebhooksController,
  ],
  providers: [
    AgentPresenceService,
    CallCenterGateway,
    CallCenterService,
    WebhookInboxService,
    MockTelephonyProvider,
    MockWhatsappProvider,
    ProviderRegistryService,
  ],
  exports: [CallCenterService, CallCenterGateway],
})
export class CallCenterModule {}
