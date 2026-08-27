import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from './documents.service';
import { StorageProvider } from './storage.provider';

describe('DocumentsService', () => {
  let service: DocumentsService;

  const mockPrisma = {
    dossier: {
      findFirst: jest.fn(),
    },
    dossierDocumentAsset: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    dossierCheckpointEvidence: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    dossierVehicle: { findFirst: jest.fn() },
    client: { findFirst: jest.fn() },
    fileAsset: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockStorage = {
    saveBuffer: jest.fn(),
    getReadStream: jest.fn(),
    verify: jest.fn(),
    assertAllowedMime: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageProvider, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  it('should verify document requirements correctly', async () => {
    mockPrisma.dossierDocumentAsset.findMany.mockResolvedValue([
      { documentType: 'id_client', status: 'valid' },
      { documentType: 'contrat', status: 'valid' },
    ]);

    const result = await service.checkDocumentRequirements('dos-1', 'org-1', [
      'id_client',
      'contrat',
      'preuve_paiement',
    ]);

    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(['preuve_paiement']);
  });

  it('accepts only a valid signed-contract category with readable matching bytes', async () => {
    mockPrisma.dossierDocumentAsset.findMany.mockResolvedValue([
      {
        id: 'signed-contract',
        kind: 'CONTRACT',
        documentType: 'SIGNED_CONTRACT',
        file: {
          storageKey: 'org-a/contracts/signed.pdf',
          checksum: 'checksum',
        },
      },
    ]);
    mockStorage.verify.mockResolvedValue(true);

    await expect(
      service.verifySignedContract('dos-a', 'org-a'),
    ).resolves.toEqual(expect.objectContaining({ id: 'signed-contract' }));
    expect(mockPrisma.dossierDocumentAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dossierId: 'dos-a',
          organizationId: 'org-a',
          kind: 'CONTRACT',
          documentType: 'SIGNED_CONTRACT',
        }) as unknown,
      }),
    );

    mockStorage.verify.mockResolvedValue(false);
    await expect(
      service.verifySignedContract('dos-a', 'org-a'),
    ).resolves.toBeNull();
  });

  it('reports every dossier vehicle that lacks valid checkpoint-specific bytes', async () => {
    mockPrisma.dossier.findFirst.mockResolvedValue({
      dossierVehicles: [{ vehicleId: 'vehicle-a' }, { vehicleId: 'vehicle-b' }],
    });
    mockPrisma.dossierCheckpointEvidence.findMany.mockResolvedValue([
      {
        id: 'evidence-a',
        vehicleId: 'vehicle-a',
        checkpoint: 'ARRIVAL_AT_PORT',
        file: {
          status: 'active',
          storageKey: 'arrival-a.jpg',
          checksum: 'good',
        },
      },
      {
        id: 'evidence-b',
        vehicleId: 'vehicle-b',
        checkpoint: 'ARRIVAL_AT_PORT',
        file: {
          status: 'active',
          storageKey: 'arrival-b.jpg',
          checksum: 'missing',
        },
      },
    ]);
    mockStorage.verify.mockImplementation((storageKey: string) =>
      Promise.resolve(storageKey.endsWith('arrival-a.jpg')),
    );

    await expect(
      service.verifyCheckpoint('dos-a', 'org-a', 'ARRIVAL_AT_PORT'),
    ).resolves.toEqual({
      complete: false,
      missingVehicleIds: ['vehicle-b'],
      evidenceIds: ['evidence-a'],
    });
  });

  it('does not let generic gallery metadata satisfy checkpoint evidence', async () => {
    mockPrisma.dossier.findFirst.mockResolvedValue({
      dossierVehicles: [{ vehicleId: 'vehicle-a' }],
    });
    mockPrisma.dossierCheckpointEvidence.findMany.mockResolvedValue([]);

    await expect(
      service.verifyCheckpoint('dos-a', 'org-a', 'CUSTOMS'),
    ).resolves.toEqual({
      complete: false,
      missingVehicleIds: ['vehicle-a'],
      evidenceIds: [],
    });
  });

  it('rejects wrong-tenant or wrong-dossier vehicle evidence before writing bytes', async () => {
    mockPrisma.dossierVehicle.findFirst.mockResolvedValue(null);
    mockStorage.assertAllowedMime.mockReturnValue('image/png');

    await expect(
      service.uploadCheckpointEvidence(
        'org-a',
        'dossier-a',
        'user-a',
        {
          originalname: 'checkpoint.png',
          mimetype: 'image/png',
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        },
        { vehicleId: 'vehicle-from-another-scope', checkpoint: 'CUSTOMS' },
      ),
    ).rejects.toMatchObject({
      response: { code: 'EVIDENCE_VEHICLE_NOT_IN_DOSSIER' },
    });
    expect(mockPrisma.dossierVehicle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dossierId: 'dossier-a',
          vehicleId: 'vehicle-from-another-scope',
          dossier: { organizationId: 'org-a' },
          vehicle: { organizationId: 'org-a' },
        }) as unknown,
      }),
    );
    expect(mockStorage.saveBuffer).not.toHaveBeenCalled();
  });

  it('rejects evidence metadata without a real byte buffer', async () => {
    await expect(
      service.uploadCheckpointEvidence(
        'org-a',
        'dossier-a',
        'user-a',
        {
          originalname: 'missing.png',
          mimetype: 'image/png',
          buffer: undefined as unknown as Buffer,
        },
        { vehicleId: 'vehicle-a', checkpoint: 'PORT_EXIT' },
      ),
    ).rejects.toThrow('No file buffer provided');
    expect(mockPrisma.dossierCheckpointEvidence.create).not.toHaveBeenCalled();
  });
});
