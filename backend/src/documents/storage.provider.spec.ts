import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as crypto from 'crypto';
import { StorageProvider } from './storage.provider';

describe('StorageProvider', () => {
  let storageRoot: string;
  let storage: StorageProvider;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    savedEnv.PRIVATE_STORAGE_ROOT = process.env.PRIVATE_STORAGE_ROOT;
    savedEnv.DOCUMENT_ENCRYPTION_KEY = process.env.DOCUMENT_ENCRYPTION_KEY;
    storageRoot = await fs.mkdtemp(join(tmpdir(), 'auto-import-storage-test-'));
    process.env.PRIVATE_STORAGE_ROOT = storageRoot;
    // Enable encryption for these tests
    process.env.DOCUMENT_ENCRYPTION_KEY = crypto
      .randomBytes(32)
      .toString('base64');
    storage = new StorageProvider();
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
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

    // Overwrite the file with a new encrypted blob of different content
    // (simulating corruption at the application level)
    const tamperedPlaintext = Buffer.from('%PDF-1.7\ntampered');
    const tamperedResult = await storage.saveBuffer(
      'org-a',
      'contract',
      'tampered.pdf',
      'application/pdf',
      tamperedPlaintext,
    );
    // Copy the tampered file over the original to simulate disk-level replacement
    const tamperedBytes = await fs.readFile(tamperedResult.absolutePath);
    await fs.writeFile(stored.absolutePath, tamperedBytes);
    await expect(
      storage.verify(stored.storageKey, stored.checksum),
    ).resolves.toBe(false);

    await storage.delete(stored.storageKey);
    await expect(
      storage.verify(stored.storageKey, stored.checksum),
    ).resolves.toBe(false);
  });
});
