import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProviderRegistryService } from '../call-center/providers/provider-registry.service';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from './integrations.service';

describe('IntegrationsService', () => {
  const previousEnvironment = { ...process.env };
  const now = new Date();
  const user: AuthenticatedUser = {
    id: 'user-a',
    email: 'admin@example.test',
    firstName: 'Admin',
    lastName: 'Test',
    organizationId: 'org-a',
    locale: 'fr',
    office: null,
    roles: [],
    permissions: [],
  };
  const savedConfig = {
    id: 'config-a',
    organizationId: 'org-a',
    kind: 'telephony',
    providerName: 'mock',
    displayName: 'Simulator',
    baseUrl: null,
    publicIdentifiers: null,
    encryptedCredentials: null as string | null,
    encryptionKeyVersion: 1,
    enabled: true,
    webhookLastEventAt: null,
    webhookLastStatus: null,
    updatedBy: 'user-a',
    createdAt: now,
    updatedAt: now,
  };
  const integrationConfig = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  };
  const auditLog = { create: jest.fn() };
  const prismaShape = {
    integrationConfig,
    auditLog,
    user: { findFirst: jest.fn() },
    $transaction: jest.fn(
      async (
        callback: (tx: {
          integrationConfig: typeof integrationConfig;
          auditLog: typeof auditLog;
        }) => Promise<unknown>,
      ) => callback({ integrationConfig, auditLog }),
    ),
  };
  const providersShape = {
    telephony: jest.fn().mockReturnValue({
      health: jest.fn().mockResolvedValue({ healthy: true }),
    }),
    messaging: jest.fn().mockReturnValue({
      health: jest.fn().mockResolvedValue({ healthy: true }),
    }),
  };
  const service = new IntegrationsService(
    prismaShape as unknown as PrismaService,
    providersShape as unknown as ProviderRegistryService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY =
      'test-only-integration-key-with-at-least-32-characters';
    process.env.PUBLIC_API_BASE_URL = 'http://127.0.0.1:3100';
    prismaShape.user.findFirst.mockResolvedValue({ lastLoginAt: new Date() });
  });

  afterAll(() => {
    process.env = previousEnvironment;
  });

  it('scopes reads to the authenticated organization', async () => {
    integrationConfig.findMany.mockResolvedValue([]);
    await service.list(user);
    expect(integrationConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-a' } }),
    );
  });

  it('encrypts credentials and returns only masked metadata with redacted audit data', async () => {
    integrationConfig.findFirst.mockResolvedValue(null);
    integrationConfig.upsert.mockImplementation(
      (query: { create: { encryptedCredentials?: string } }) =>
        Promise.resolve({
          ...savedConfig,
          encryptedCredentials: query.create.encryptedCredentials ?? null,
        }),
    );
    auditLog.create.mockResolvedValue({ id: 'audit-a' });

    const response = await service.save(user, {
      kind: 'telephony',
      providerName: 'provider-pending-adapter',
      displayName: 'Pending adapter',
      credentials: { apiKey: 'test-secret-never-returned' },
      enabled: false,
    });

    const [upsert] = integrationConfig.upsert.mock.calls[0] as unknown as [
      { create: { organizationId: string; encryptedCredentials: string } },
    ];
    expect(upsert.create.organizationId).toBe('org-a');
    expect(upsert.create.encryptedCredentials).toMatch(/^v1\./);
    expect(upsert.create.encryptedCredentials).not.toContain(
      'test-secret-never-returned',
    );
    expect(JSON.stringify(response)).not.toContain(
      'test-secret-never-returned',
    );
    expect(response.credentialsMasked).toBeTruthy();
    expect(JSON.stringify(auditLog.create.mock.calls)).not.toContain(
      'test-secret-never-returned',
    );
  });

  it('does not enable a provider until its real adapter is installed', async () => {
    await expect(
      service.save(user, {
        kind: 'telephony',
        providerName: 'provider-pending-adapter',
        credentials: { apiKey: 'test-secret-never-returned' },
        enabled: true,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(integrationConfig.upsert).not.toHaveBeenCalled();
  });

  it('clears credentials when switching providers without replacement credentials', async () => {
    integrationConfig.findFirst.mockResolvedValue({
      ...savedConfig,
      encryptedCredentials: 'v1.old-provider-ciphertext',
    });
    integrationConfig.upsert.mockImplementation(
      (query: { update: { encryptedCredentials?: string | null } }) =>
        Promise.resolve({
          ...savedConfig,
          providerName: 'another-pending-provider',
          encryptedCredentials: query.update.encryptedCredentials ?? null,
        }),
    );
    auditLog.create.mockResolvedValue({ id: 'audit-a' });

    await service.save(user, {
      kind: 'telephony',
      providerName: 'another-pending-provider',
      enabled: false,
    });

    const [upsert] = integrationConfig.upsert.mock.calls[0] as unknown as [
      { update: { encryptedCredentials: string | null } },
    ];
    expect(upsert.update).toEqual(
      expect.objectContaining({ encryptedCredentials: null }),
    );
  });

  it('requires recent authentication for writes', async () => {
    prismaShape.user.findFirst.mockResolvedValue({
      lastLoginAt: new Date(Date.now() - 16 * 60_000),
    });
    await expect(
      service.save(user, {
        kind: 'whatsapp',
        providerName: 'mock',
        enabled: true,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(integrationConfig.upsert).not.toHaveBeenCalled();
  });

  it('runs only the simulator and reports live adapters as not installed', async () => {
    integrationConfig.findFirst.mockResolvedValueOnce(savedConfig);
    await expect(service.test(user, 'telephony')).resolves.toEqual({
      status: 'SIMULATOR_OK',
      live: false,
      simulated: true,
    });

    integrationConfig.findFirst.mockResolvedValueOnce({
      ...savedConfig,
      providerName: 'provider-pending-adapter',
    });
    await expect(service.test(user, 'telephony')).resolves.toEqual({
      status: 'NOT_RUN',
      live: false,
      reason: 'PROVIDER_ADAPTER_NOT_INSTALLED',
    });
  });
});
