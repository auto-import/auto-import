import { BadRequestException } from '@nestjs/common';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClientsService } from './clients.service';
import { ContactResolutionService } from '../crm/contact-resolution.service';
import { CrmReferenceService } from '../crm/crm-reference.service';

describe('ClientsService protected identity onboarding', () => {
  const previousEnvironment = { ...process.env };
  const user = { findFirst: jest.fn() };
  const createClient = jest.fn((query: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'client-a',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...query.data,
    }),
  );
  const updateClient = jest.fn((query: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'client-a', ...query.data }),
  );
  const client = {
    create: createClient,
    update: updateClient,
    findFirst: jest.fn(),
  };
  const createAudit = jest.fn((query: { data: Record<string, unknown> }) => {
    void query;
    return Promise.resolve({});
  });
  const auditLog = { create: createAudit };
  const task = { updateMany: jest.fn().mockResolvedValue({ count: 0 }) };
  const tx = { user, client, auditLog, task };
  const prismaShape = {
    ...tx,
    $transaction: jest.fn(
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const documentsShape = { uploadDossierDocument: jest.fn() };
  const contactsShape = {
    normalizePhoneForCountry: jest.fn().mockResolvedValue('+213550000000'),
    matchNormalizedPhoneInTransaction: jest
      .fn()
      .mockResolvedValue({ normalizedValue: '+213550000000', match: null }),
    syncClientContacts: jest.fn(),
  };
  const referencesShape = {
    assertReference: jest.fn().mockResolvedValue(null),
  };
  const service = new ClientsService(
    prismaShape as unknown as PrismaService,
    contactsShape as unknown as ContactResolutionService,
    documentsShape as unknown as DocumentsService,
    referencesShape as unknown as CrmReferenceService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PII_ENCRYPTION_KEY =
      'test-only-pii-key-with-at-least-32-characters';
    process.env.PII_LOOKUP_HMAC_KEY =
      'test-only-lookup-key-with-at-least-32-characters';
    user.findFirst.mockResolvedValue({ id: 'user-a' });
  });

  afterAll(() => {
    process.env = previousEnvironment;
  });

  it('stores encrypted values and returns only masks from create', async () => {
    const response = await service.create(
      {
        firstName: 'Amina',
        lastName: 'Test',
        nationality: 'Algérie',
        nin: '123456789012345678',
        passportNumber: '00ab1234',
      },
      'org-a',
      'user-a',
      true,
    );
    const stored = createClient.mock.calls[0][0].data;

    expect(stored.ninEncrypted).toMatch(/^v1\./);
    expect(stored.passportEncrypted).toMatch(/^v1\./);
    expect(JSON.stringify(stored)).not.toContain('123456789012345678');
    expect(JSON.stringify(stored)).not.toContain('00AB1234');
    expect(stored.passportNumber).toBeNull();
    expect(response).toMatchObject({
      ninMasked: '**************5678',
      passportNumberMasked: '****1234',
      identityConfigured: { nin: true, passport: true },
    });
    expect(response).not.toHaveProperty('ninEncrypted');
    expect(response).not.toHaveProperty('passportEncrypted');
    expect(response).not.toHaveProperty('ninLookupHash');
  });

  it('rejects invalid identity before creating a database row', async () => {
    await expect(
      service.create(
        {
          firstName: 'Amina',
          lastName: 'Test',
          nationality: 'Algérie',
          nin: '123',
        },
        'org-a',
        'user-a',
        true,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(client.create).not.toHaveBeenCalled();
  });

  it('compensates client creation when passport byte persistence fails', async () => {
    documentsShape.uploadDossierDocument.mockRejectedValue(
      new Error('disposable storage unavailable'),
    );
    client.update.mockResolvedValue({ id: 'client-a' });

    await expect(
      service.createWithPassport(
        {
          firstName: 'Amina',
          lastName: 'Test',
          nationality: 'France',
          passportNumber: '00ab1234',
        },
        'org-a',
        'user-a',
        {
          originalname: 'passport.pdf',
          mimetype: 'application/pdf',
          buffer: Buffer.from('%PDF-1.7\n'),
        },
      ),
    ).rejects.toThrow('disposable storage unavailable');
    expect(client.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'client-a' } }),
    );
  });

  it('keeps NIN and passport optional at initial creation for every country', async () => {
    await expect(
      service.create(
        {
          firstName: 'Local',
          lastName: 'Client',
          nationalityCountryId: 'country-dz',
        },
        'org-a',
        'user-a',
      ),
    ).resolves.toMatchObject({ identityConfigured: { nin: false } });
  });

  it('archives instead of hard-deleting a client', async () => {
    client.findFirst.mockResolvedValue({ id: 'client-a', archivedAt: null });
    client.update.mockResolvedValue({ id: 'client-a' });
    await expect(
      service.remove(
        'client-a',
        'org-a',
        'user-a',
        'Duplicate confirmed by operator',
      ),
    ).resolves.toMatchObject({ message: 'Client archived successfully' });
    const clientUpdate = client.update.mock.calls[0]?.[0];
    expect(clientUpdate.data).toMatchObject({
      status: 'archived',
      archivedById: 'user-a',
    });
    const auditCreate = auditLog.create.mock.calls[0]?.[0];
    expect(auditCreate.data).toMatchObject({ action: 'CLIENT_ARCHIVED' });
  });
});
