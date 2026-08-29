import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { GedService } from './ged.service';

const user = (permissions: string[] = []): AuthenticatedUser =>
  ({
    id: 'user-a',
    organizationId: 'org-a',
    email: 'admin@example.test',
    firstName: 'Admin',
    lastName: 'Test',
    locale: 'fr',
    office: null,
    roles: [],
    permissions,
  }) as AuthenticatedUser;

describe('GedService', () => {
  const prisma = {
    gedDocument: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    gedDocumentLink: { findFirst: jest.fn(), create: jest.fn() },
    gedValidationHistory: { create: jest.fn() },
    fileAsset: { update: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const storage = {
    verify: jest.fn(),
    getReadStream: jest.fn(),
  };
  let service: GedService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    service = new GedService(prisma as never, storage as never);
  });

  it('denies and audits restricted metadata without exposing document contents', async () => {
    prisma.gedDocument.findFirst.mockResolvedValue({
      id: 'doc-a',
      organizationId: 'org-a',
      sensitivity: 'RESTRICTED_IDENTITY',
      validationStatus: 'VALIDATED',
      expiryDate: null,
      versions: [],
      links: [],
    });
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-a' });

    await expect(service.detail(user(), 'doc-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'GED_SENSITIVE_ACCESS_DENIED',
        entityId: 'doc-a',
        newValues: {
          action: 'metadata',
          sensitivity: 'RESTRICTED_IDENTITY',
        },
      }),
    });
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
      'passport.pdf',
    );
  });

  it('derives EXPIRED without storing a contradictory validation state', async () => {
    prisma.gedDocument.findFirst.mockResolvedValue({
      id: 'doc-a',
      organizationId: 'org-a',
      sensitivity: 'INTERNAL',
      validationStatus: 'VALIDATED',
      expiryDate: new Date('2020-01-01T00:00:00.000Z'),
      versions: [],
      links: [],
    });

    await expect(service.detail(user(), 'doc-a')).resolves.toEqual(
      expect.objectContaining({ validationStatus: 'EXPIRED' }),
    );
  });

  it('rejects invalid validation transitions', async () => {
    prisma.gedDocument.findFirst.mockResolvedValue({
      id: 'doc-a',
      organizationId: 'org-a',
      sensitivity: 'INTERNAL',
      validationStatus: 'VALIDATED',
      archivedAt: null,
      currentVersion: null,
    });

    await expect(
      service.transition(user([Permission.GED_REJECT]), 'doc-a', {
        status: 'REJECTED',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.gedDocument.update).not.toHaveBeenCalled();
  });

  it('quarantines corrupted bytes and never returns a stream', async () => {
    prisma.gedDocument.findFirst.mockResolvedValue({
      id: 'doc-a',
      organizationId: 'org-a',
      sensitivity: 'INTERNAL',
      archivedAt: null,
      currentVersion: {
        id: 'version-a',
        file: {
          id: 'asset-a',
          status: 'active',
          quarantinedAt: null,
          scanStatus: 'CLEAN',
          storageKey: 'org-a/ged/doc.pdf',
          checksum: 'a'.repeat(64),
        },
      },
    });
    storage.verify.mockResolvedValue(false);
    prisma.fileAsset.update.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});

    await expect(
      service.content(
        user([Permission.GED_BYTES_DOWNLOAD]),
        'doc-a',
        'download',
      ),
    ).rejects.toMatchObject({ response: { code: 'GED_INTEGRITY_FAILED' } });
    expect(prisma.fileAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-a' },
      data: expect.objectContaining({
        integrityStatus: 'FAILED',
        status: 'quarantined',
      }),
    });
    expect(storage.getReadStream).not.toHaveBeenCalled();
  });

  it('requires exactly one referentially checked target per link', async () => {
    prisma.gedDocument.findFirst.mockResolvedValue({
      id: 'doc-a',
      organizationId: 'org-a',
      sensitivity: 'INTERNAL',
      currentVersion: null,
    });

    await expect(
      service.link(user(), 'doc-a', {
        clientId: 'client-a',
        dossierId: 'dossier-a',
      }),
    ).rejects.toMatchObject({
      response: { code: 'GED_EXACTLY_ONE_LINK_TARGET' },
    });
    expect(prisma.gedDocumentLink.create).not.toHaveBeenCalled();
  });
});
