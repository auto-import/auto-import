import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StorageProvider } from './storage.provider';
import { DocumentsService } from './documents.service';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 2 Storage & Documents Comprehensive Tests', () => {
  let storageProvider: StorageProvider;
  let documentsService: DocumentsService;

  const mockPrisma: any = {
    dossier: {
      findFirst: jest.fn(),
    },
    fileAsset: {
      create: jest.fn(),
    },
    dossierDocumentAsset: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    storageProvider = new StorageProvider();
    documentsService = new DocumentsService(mockPrisma, storageProvider);
  });

  describe('Magic Byte MIME Detection & Integrity', () => {
    it('should detect PDF magic bytes regardless of client-supplied mime type', () => {
      const pdfBuffer = Buffer.from([
        0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
      ]);
      const detected = storageProvider.detectMimeType(
        pdfBuffer,
        'application/octet-stream',
      );
      expect(detected).toBe('application/pdf');
    });

    it('should detect PNG magic bytes accurately', () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const detected = storageProvider.detectMimeType(pngBuffer, 'image/jpeg');
      expect(detected).toBe('image/png');
    });

    it('should detect JPEG magic bytes accurately', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const detected = storageProvider.detectMimeType(
        jpegBuffer,
        'application/octet-stream',
      );
      expect(detected).toBe('image/jpeg');
    });
  });

  describe('Path Traversal Prevention & SHA-256 Checksum', () => {
    it('should sanitize path traversal attempts in organizationId or category', async () => {
      const dummyBuffer = Buffer.from('PDF Content Data for Test');
      const result = await storageProvider.saveBuffer(
        '../../evil_org',
        '../evil_cat',
        'safe_contract.pdf',
        'application/pdf',
        dummyBuffer,
      );

      // Verify that traversal dots were stripped out
      expect(result.storageKey).not.toContain('..');
      expect(result.checksum).toBeDefined();
      expect(result.checksum.length).toBe(64); // SHA-256 hex string length
    });
  });

  describe('Document Service Upload & Requirements Gating', () => {
    it('should reject upload if file buffer is missing or empty', async () => {
      await expect(
        documentsService.uploadDossierDocument('org-1', 'user-1', null as any, {
          dossierId: 'dos-1',
          kind: 'CONTRACT',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject document upload if dossier belongs to another tenant', async () => {
      mockPrisma.dossier.findFirst.mockResolvedValue(null);

      await expect(
        documentsService.uploadDossierDocument(
          'org-1',
          'user-1',
          {
            originalname: 'doc.pdf',
            mimetype: 'application/pdf',
            buffer: Buffer.from('sample'),
          },
          { dossierId: 'dos-other-org', kind: 'CONTRACT' },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should accurately verify required documents checklist', async () => {
      mockPrisma.dossierDocumentAsset.findMany.mockResolvedValue([
        { documentType: 'id_client', status: 'valid' },
        { documentType: 'contrat', status: 'valid' },
      ]);

      const check = await documentsService.checkDocumentRequirements(
        'dos-1',
        'org-1',
        ['id_client', 'contrat', 'preuve_paiement'],
      );

      expect(check.complete).toBe(false);
      expect(check.missing).toEqual(['preuve_paiement']);
    });
  });
});
