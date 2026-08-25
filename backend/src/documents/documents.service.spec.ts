import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from './documents.service';
import { StorageProvider } from './storage.provider';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: PrismaService;
  let storage: StorageProvider;

  const mockPrisma = {
    dossier: {
      findFirst: jest.fn(),
    },
    dossierDocumentAsset: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    fileAsset: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockStorage = {
    saveBuffer: jest.fn(),
    getReadStream: jest.fn(),
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
});
