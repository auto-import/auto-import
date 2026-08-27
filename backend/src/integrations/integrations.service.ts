import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SensitiveFieldService } from '../common/security/sensitive-field.service';
import { ProviderRegistryService } from '../call-center/providers/provider-registry.service';
import type { UpdateIntegrationDto } from './dto/integration.dto';

@Injectable()
export class IntegrationsService {
  private readonly sensitive = new SensitiveFieldService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderRegistryService,
  ) {}

  async list(user: AuthenticatedUser) {
    const configs = await this.prisma.integrationConfig.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { kind: 'asc' },
    });
    const configured = new Map(
      configs.map((config) => [config.kind, this.publicConfig(config)]),
    );
    return ['telephony', 'whatsapp'].map(
      (kind) =>
        configured.get(kind) ?? {
          kind,
          providerName: 'unconfigured',
          configured: false,
          enabled: false,
          liveStatus: 'NOT_CONFIGURED',
          webhookUrl: this.webhookUrl(kind),
        },
    );
  }

  async save(user: AuthenticatedUser, dto: UpdateIntegrationDto) {
    await this.assertRecentAuthentication(user);
    this.assertMetadata(dto.publicIdentifiers);
    this.assertCredentials(dto.credentials);
    if (dto.enabled && dto.providerName !== 'mock') {
      throw new BadRequestException({
        code: 'PROVIDER_ADAPTER_NOT_INSTALLED',
        message:
          'A provider adapter must be installed before it can be enabled',
      });
    }
    const existing = await this.prisma.integrationConfig.findFirst({
      where: { organizationId: user.organizationId, kind: dto.kind },
    });
    const providerChanged =
      Boolean(existing) && existing?.providerName !== dto.providerName;
    const encryptedCredentials: string | null | undefined = dto.credentials
      ? this.sensitive.encrypt(JSON.stringify(dto.credentials), 'integration')
      : providerChanged
        ? null
        : undefined;
    const config = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.integrationConfig.upsert({
        where: {
          organizationId_kind: {
            organizationId: user.organizationId,
            kind: dto.kind,
          },
        },
        update: {
          providerName: dto.providerName,
          displayName: dto.displayName,
          baseUrl: dto.baseUrl,
          publicIdentifiers: dto.publicIdentifiers,
          ...(encryptedCredentials !== undefined
            ? { encryptedCredentials }
            : {}),
          enabled: dto.enabled,
          updatedBy: user.id,
        },
        create: {
          organizationId: user.organizationId,
          kind: dto.kind,
          providerName: dto.providerName,
          displayName: dto.displayName,
          baseUrl: dto.baseUrl,
          publicIdentifiers: dto.publicIdentifiers,
          encryptedCredentials,
          enabled: dto.enabled,
          updatedBy: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: 'INTEGRATION_CONFIG_UPDATED',
          entityType: 'IntegrationConfig',
          entityId: saved.id,
          newValues: {
            kind: dto.kind,
            providerName: dto.providerName,
            enabled: dto.enabled,
            credentials: dto.credentials ? '[REDACTED]' : '[UNCHANGED]',
          },
        },
      });
      return saved;
    });
    return this.publicConfig(config);
  }

  async revoke(user: AuthenticatedUser, kind: string) {
    await this.assertRecentAuthentication(user);
    const config = await this.prisma.integrationConfig.findFirst({
      where: { organizationId: user.organizationId, kind },
    });
    if (!config) throw new NotFoundException('Integration not found');
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.integrationConfig.update({
        where: { id: config.id },
        data: {
          encryptedCredentials: null,
          enabled: false,
          updatedBy: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: 'INTEGRATION_CREDENTIALS_REVOKED',
          entityType: 'IntegrationConfig',
          entityId: config.id,
          newValues: { credentials: '[REDACTED]', enabled: false },
        },
      });
      return result;
    });
    return this.publicConfig(updated);
  }

  async test(user: AuthenticatedUser, kind: string) {
    await this.assertRecentAuthentication(user);
    const config = await this.prisma.integrationConfig.findFirst({
      where: { organizationId: user.organizationId, kind },
    });
    if (!config) return { status: 'NOT_CONFIGURED', live: false };
    if (config.providerName !== 'mock') {
      return {
        status: 'NOT_RUN',
        live: false,
        reason: 'PROVIDER_ADAPTER_NOT_INSTALLED',
      };
    }
    const result =
      kind === 'telephony'
        ? await this.providers.telephony('mock').health()
        : await this.providers.messaging('mock').health();
    return {
      status: result.healthy ? 'SIMULATOR_OK' : 'SIMULATOR_UNAVAILABLE',
      live: false,
      simulated: true,
    };
  }

  private async assertRecentAuthentication(user: AuthenticatedUser) {
    const account = await this.prisma.user.findFirst({
      where: { id: user.id, organizationId: user.organizationId },
      select: { lastLoginAt: true },
    });
    if (
      !account?.lastLoginAt ||
      Date.now() - account.lastLoginAt.getTime() > 15 * 60_000
    ) {
      throw new ForbiddenException({
        code: 'RECENT_AUTHENTICATION_REQUIRED',
        message: 'Sign in again to manage integrations',
      });
    }
  }

  private assertMetadata(values?: Record<string, string>) {
    if (!values) return;
    for (const [key, value] of Object.entries(values)) {
      if (!key || typeof value !== 'string' || value.length > 500)
        throw new BadRequestException('Invalid public identifier');
    }
  }

  private assertCredentials(values?: Record<string, string>) {
    if (!values) return;
    if (!Object.keys(values).length)
      throw new BadRequestException('Credentials cannot be empty');
    for (const [key, value] of Object.entries(values)) {
      if (!key || typeof value !== 'string' || !value || value.length > 4096)
        throw new BadRequestException('Invalid credential payload');
    }
  }

  private publicConfig(config: {
    id: string;
    kind: string;
    providerName: string;
    displayName: string | null;
    baseUrl: string | null;
    publicIdentifiers: Prisma.JsonValue | null;
    encryptedCredentials: string | null;
    enabled: boolean;
    encryptionKeyVersion: number;
    webhookLastEventAt: Date | null;
    webhookLastStatus: string | null;
    updatedAt: Date;
  }) {
    return {
      id: config.id,
      kind: config.kind,
      providerName: config.providerName,
      displayName: config.displayName,
      baseUrl: config.baseUrl,
      publicIdentifiers: config.publicIdentifiers,
      configured:
        Boolean(config.encryptedCredentials) || config.providerName === 'mock',
      credentialsMasked: config.encryptedCredentials ? '••••••••' : null,
      enabled: config.enabled,
      encryptionKeyVersion: config.encryptionKeyVersion,
      webhookLastEventAt: config.webhookLastEventAt,
      webhookLastStatus: config.webhookLastStatus,
      updatedAt: config.updatedAt,
      liveStatus:
        config.providerName === 'mock' ? 'SIMULATOR' : 'ADAPTER_REQUIRED',
      webhookUrl: this.webhookUrl(config.kind),
    };
  }

  private webhookUrl(kind: string) {
    const base = (
      process.env.PUBLIC_API_BASE_URL ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
    return `${base}/call-center/webhooks/${kind}/:providerKey`;
  }
}
