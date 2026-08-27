import { BadRequestException } from '@nestjs/common';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClientsService } from './clients.service';

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
  const client = { create: createClient, delete: jest.fn() };
  const tx = { user, client };
  const prismaShape = {
    ...tx,
    $transaction: jest.fn(
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const documentsShape = { uploadDossierDocument: jest.fn() };
  const service = new ClientsService(
    prismaShape as unknown as PrismaService,
    undefined,
    documentsShape as unknown as DocumentsService,
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
      ),
    ).rejects.toThrow(BadRequestException);
    expect(client.create).not.toHaveBeenCalled();
  });

  it('compensates client creation when passport byte persistence fails', async () => {
    documentsShape.uploadDossierDocument.mockRejectedValue(
      new Error('disposable storage unavailable'),
    );
    client.delete.mockResolvedValue({ id: 'client-a' });

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
    expect(client.delete).toHaveBeenCalledWith({ where: { id: 'client-a' } });
  });

  it('requires NIN for Algerian clients but keeps foreign clients possible', async () => {
    await expect(
      service.create(
        { firstName: 'Local', lastName: 'Client', nationality: 'DZA' },
        'org-a',
        'user-a',
      ),
    ).rejects.toMatchObject({
      response: { code: 'CLIENT_NIN_REQUIRED_FOR_ALGERIAN' },
    });
    await expect(
      service.create(
        { firstName: 'Foreign', lastName: 'Client', nationality: 'Tunisie' },
        'org-a',
        'user-a',
      ),
    ).resolves.toMatchObject({ identityConfigured: { nin: false } });
  });
});
