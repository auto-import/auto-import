import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { StorageProvider } from './storage.provider';

describe('StorageProvider', () => {
  let storageRoot: string;
  let storage: StorageProvider;
  const previousRoot = process.env.PRIVATE_STORAGE_ROOT;

  beforeAll(async () => {
    storageRoot = await fs.mkdtemp(join(tmpdir(), 'auto-import-storage-test-'));
    process.env.PRIVATE_STORAGE_ROOT = storageRoot;
    storage = new StorageProvider();
  });

  afterAll(async () => {
    if (previousRoot === undefined) delete process.env.PRIVATE_STORAGE_ROOT;
    else process.env.PRIVATE_STORAGE_ROOT = previousRoot;
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it('accepts approved magic bytes and rejects a spoofed client MIME', () => {
    const pdf = Buffer.from('%PDF-1.7\n');
    expect(
      storage.assertAllowedMime(pdf, 'application/pdf', ['application/pdf']),
    ).toBe('application/pdf');
    expect(() =>
      storage.assertAllowedMime(Buffer.from('not a pdf'), 'application/pdf', [
        'application/pdf',
      ]),
    ).toThrow(BadRequestException);
  });

  it('requires both RIFF and WEBP signatures', () => {
    const valid = Buffer.from('RIFF0000WEBP', 'ascii');
    const invalid = Buffer.from('RIFF0000NOPE', 'ascii');
    expect(storage.detectMimeType(valid, 'image/webp')).toBe('image/webp');
    expect(storage.detectMimeType(invalid, 'image/webp')).toBe(
      'application/octet-stream',
    );
  });

  it('detects missing or changed private bytes through checksum verification', async () => {
    const stored = await storage.saveBuffer(
      'org-a',
      'contract',
      'signed.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.7\nvalid'),
    );
    await expect(
      storage.verify(stored.storageKey, stored.checksum),
    ).resolves.toBe(true);
    await fs.writeFile(stored.absolutePath, Buffer.from('%PDF-1.7\ntampered'));
    await expect(
      storage.verify(stored.storageKey, stored.checksum),
    ).resolves.toBe(false);
    await storage.delete(stored.storageKey);
    await expect(
      storage.verify(stored.storageKey, stored.checksum),
    ).resolves.toBe(false);
  });
});
