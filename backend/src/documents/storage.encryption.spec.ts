import { BadRequestException } from '@nestjs/common';
import { promises as fsp, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as crypto from 'crypto';
import { StorageProvider } from './storage.provider';

/**
 * Comprehensive test suite for AES-256-GCM encryption at rest.
 *
 * Tests cover:
 *  - Encrypted bytes on disk are NOT plaintext
 *  - Round-trip: upload → download returns original plaintext
 *  - Wrong key → decryption fails
 *  - Corrupted ciphertext → authentication failure
 *  - Tampered auth tag → failure
 *  - Unique IV per file
 *  - Legacy plaintext backward compatibility
 *  - Large file handling
 *  - Missing encryption key behavior
 */
describe('StorageProvider — AES-256-GCM Encryption', () => {
  let storageRoot: string;
  const TEST_KEY = crypto.randomBytes(32).toString('base64');
  const WRONG_KEY = crypto.randomBytes(32).toString('base64');
  const PDF_MAGIC = Buffer.from('%PDF-1.7\n');
  const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // Helper to create a StorageProvider with a specific key (or no key)
  function makeProvider(key?: string): StorageProvider {
    if (key !== undefined) {
      process.env.DOCUMENT_ENCRYPTION_KEY = key;
    } else {
      delete process.env.DOCUMENT_ENCRYPTION_KEY;
    }
    process.env.PRIVATE_STORAGE_ROOT = storageRoot;
    return new StorageProvider();
  }

  // Helper to collect a Readable into a Buffer
  function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    savedEnv.PRIVATE_STORAGE_ROOT = process.env.PRIVATE_STORAGE_ROOT;
    savedEnv.DOCUMENT_ENCRYPTION_KEY = process.env.DOCUMENT_ENCRYPTION_KEY;
    storageRoot = await fsp.mkdtemp(join(tmpdir(), 'auto-import-enc-test-'));
  });

  afterAll(async () => {
    // Restore env
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fsp.rm(storageRoot, { recursive: true, force: true });
  });

  // ──────────────────────────────────────────────
  // 1. Encrypted bytes on disk are NOT plaintext
  // ──────────────────────────────────────────────
  it('stores encrypted bytes on disk that do NOT contain the original plaintext', async () => {
    const provider = makeProvider(TEST_KEY);
    const plaintext = Buffer.concat([PDF_MAGIC, Buffer.from('Sensitive contract data 12345')]);

    const result = await provider.saveBuffer(
      'org-enc-1',
      'contract',
      'contract.pdf',
      'application/pdf',
      plaintext,
    );

    const rawDisk = readFileSync(result.absolutePath);

    // The raw disk bytes must NOT contain the plaintext
    expect(rawDisk.includes(plaintext)).toBe(false);
    expect(rawDisk.includes(Buffer.from('Sensitive contract data'))).toBe(false);

    // First byte should be the encryption version marker
    expect(rawDisk[0]).toBe(0x01);

    // File on disk must be larger than plaintext (header + ciphertext)
    expect(rawDisk.length).toBe(1 + 12 + 16 + plaintext.length);
  });

  // ──────────────────────────────────────────────
  // 2. Round-trip: encrypted upload → download returns exact plaintext
  // ──────────────────────────────────────────────
  it('round-trips: encrypted file can be downloaded as original plaintext', async () => {
    const provider = makeProvider(TEST_KEY);
    const plaintext = Buffer.concat([PDF_MAGIC, Buffer.from('Contract body content')]);

    const result = await provider.saveBuffer(
      'org-enc-2',
      'contract',
      'signed.pdf',
      'application/pdf',
      plaintext,
    );

    const stream = provider.getReadStream(result.storageKey);
    const downloaded = await streamToBuffer(stream);

    expect(downloaded).toEqual(plaintext);
  });

  // ──────────────────────────────────────────────
  // 3. Wrong key → decryption fails
  // ──────────────────────────────────────────────
  it('fails to decrypt with a wrong encryption key', async () => {
    const provider = makeProvider(TEST_KEY);
    const plaintext = Buffer.concat([PDF_MAGIC, Buffer.from('Secret document')]);

    const result = await provider.saveBuffer(
      'org-enc-3',
      'contract',
      'secret.pdf',
      'application/pdf',
      plaintext,
    );

    // Create a new provider with a different key
    const wrongProvider = makeProvider(WRONG_KEY);
    const stream = wrongProvider.getReadStream(result.storageKey);

    await expect(streamToBuffer(stream)).rejects.toThrow();
  });

  // ──────────────────────────────────────────────
  // 4. Corrupted ciphertext → authentication failure
  // ──────────────────────────────────────────────
  it('fails authentication when ciphertext bytes are corrupted', async () => {
    const provider = makeProvider(TEST_KEY);
    const plaintext = Buffer.concat([PDF_MAGIC, Buffer.from('Important data')]);

    const result = await provider.saveBuffer(
      'org-enc-4',
      'contract',
      'important.pdf',
      'application/pdf',
      plaintext,
    );

    // Corrupt a byte in the ciphertext area (after the 29-byte header)
    const rawDisk = readFileSync(result.absolutePath);
    const corruptedBuf = Buffer.from(rawDisk);
    const ciphertextOffset = 29 + Math.floor((corruptedBuf.length - 29) / 2);
    corruptedBuf[ciphertextOffset] ^= 0xff;
    await fsp.writeFile(result.absolutePath, corruptedBuf);

    const stream = provider.getReadStream(result.storageKey);
    await expect(streamToBuffer(stream)).rejects.toThrow();
  });

  // ──────────────────────────────────────────────
  // 5. Tampered auth tag → failure
  // ──────────────────────────────────────────────
  it('fails when the authentication tag is tampered', async () => {
    const provider = makeProvider(TEST_KEY);
    const plaintext = Buffer.concat([PDF_MAGIC, Buffer.from('Auth tag test')]);

    const result = await provider.saveBuffer(
      'org-enc-5',
      'contract',
      'authtag.pdf',
      'application/pdf',
      plaintext,
    );

    // Tamper the auth tag (bytes 13-28, i.e. offset 13 in the header)
    const rawDisk = readFileSync(result.absolutePath);
    const tampered = Buffer.from(rawDisk);
    tampered[13] ^= 0xff; // Flip a bit in the auth tag
    await fsp.writeFile(result.absolutePath, tampered);

    const stream = provider.getReadStream(result.storageKey);
    await expect(streamToBuffer(stream)).rejects.toThrow();
  });

  // ──────────────────────────────────────────────
  // 6. Unique IV per file (same content → different IVs)
  // ──────────────────────────────────────────────
  it('generates a unique IV for each file even with identical content', async () => {
    const provider = makeProvider(TEST_KEY);
    const plaintext = Buffer.concat([PDF_MAGIC, Buffer.from('Same content')]);

    const result1 = await provider.saveBuffer(
      'org-enc-6',
      'contract',
      'file1.pdf',
      'application/pdf',
      plaintext,
    );
    const result2 = await provider.saveBuffer(
      'org-enc-6',
      'contract',
      'file2.pdf',
      'application/pdf',
      plaintext,
    );

    const raw1 = readFileSync(result1.absolutePath);
    const raw2 = readFileSync(result2.absolutePath);

    // Extract IVs (bytes 1-12)
    const iv1 = raw1.subarray(1, 13);
    const iv2 = raw2.subarray(1, 13);

    expect(iv1.equals(iv2)).toBe(false);

    // Both should still decrypt to the same plaintext
    const buf1 = await streamToBuffer(provider.getReadStream(result1.storageKey));
    const buf2 = await streamToBuffer(provider.getReadStream(result2.storageKey));
    expect(buf1).toEqual(plaintext);
    expect(buf2).toEqual(plaintext);
  });

  // ──────────────────────────────────────────────
  // 7. Legacy plaintext files remain readable
  // ──────────────────────────────────────────────
  it('reads legacy plaintext files transparently', async () => {
    // Write a file WITHOUT encryption
    const noKeyProvider = makeProvider('');
    // Empty string won't pass validation, so delete the key
    delete process.env.DOCUMENT_ENCRYPTION_KEY;
    const legacyProvider = makeProvider(undefined);

    const plaintext = Buffer.concat([PDF_MAGIC, Buffer.from('Legacy document content')]);
    const result = await legacyProvider.saveBuffer(
      'org-legacy',
      'contract',
      'legacy.pdf',
      'application/pdf',
      plaintext,
    );

    // Verify it's stored as plaintext
    const rawDisk = readFileSync(result.absolutePath);
    expect(rawDisk).toEqual(plaintext);

    // Now create a provider WITH encryption key and read the legacy file
    const encProvider = makeProvider(TEST_KEY);
    const stream = encProvider.getReadStream(result.storageKey);
    const downloaded = await streamToBuffer(stream);
    expect(downloaded).toEqual(plaintext);
  });

  // ──────────────────────────────────────────────
  // 8. Legacy plaintext verify still works
  // ──────────────────────────────────────────────
  it('verifies legacy plaintext files correctly', async () => {
    delete process.env.DOCUMENT_ENCRYPTION_KEY;
    const legacyProvider = makeProvider(undefined);
    const plaintext = Buffer.concat([PDF_MAGIC, Buffer.from('Verify legacy')]);

    const result = await legacyProvider.saveBuffer(
      'org-verify-legacy',
      'contract',
      'verify-legacy.pdf',
      'application/pdf',
      plaintext,
    );

    // Verify with encryption-capable provider
    const encProvider = makeProvider(TEST_KEY);
    await expect(
      encProvider.verify(result.storageKey, result.checksum),
    ).resolves.toBe(true);

    // Tamper the file
    await fsp.writeFile(result.absolutePath, Buffer.concat([PDF_MAGIC, Buffer.from('Tampered')]));
    await expect(
      encProvider.verify(result.storageKey, result.checksum),
    ).resolves.toBe(false);
  });

  // ──────────────────────────────────────────────
  // 9. Verify works for encrypted files
  // ──────────────────────────────────────────────
  it('verifies encrypted files against plaintext checksum', async () => {
    const provider = makeProvider(TEST_KEY);
    const plaintext = Buffer.concat([PDF_MAGIC, Buffer.from('Checksum test encrypted')]);

    const result = await provider.saveBuffer(
      'org-verify-enc',
      'contract',
      'checksum.pdf',
      'application/pdf',
      plaintext,
    );

    // Should verify successfully
    await expect(
      provider.verify(result.storageKey, result.checksum),
    ).resolves.toBe(true);

    // Wrong checksum should fail
    await expect(
      provider.verify(result.storageKey, 'deadbeef'.repeat(8)),
    ).resolves.toBe(false);
  });

  // ──────────────────────────────────────────────
  // 10. Verify fails for encrypted files with wrong key
  // ──────────────────────────────────────────────
  it('verify returns false when using the wrong key on an encrypted file', async () => {
    const provider = makeProvider(TEST_KEY);
    const plaintext = Buffer.concat([PDF_MAGIC, Buffer.from('Wrong key verify')]);

    const result = await provider.saveBuffer(
      'org-verify-wrongkey',
      'contract',
      'wrongkey.pdf',
      'application/pdf',
      plaintext,
    );

    const wrongProvider = makeProvider(WRONG_KEY);
    await expect(
      wrongProvider.verify(result.storageKey, result.checksum),
    ).resolves.toBe(false);
  });

  // ──────────────────────────────────────────────
  // 11. Large file (1MB+) does not cause issues
  // ──────────────────────────────────────────────
  it('handles a 1MB+ file without memory issues', async () => {
    const provider = makeProvider(TEST_KEY);
    const largeContent = crypto.randomBytes(1024 * 1024 + 512); // ~1MB
    // Prepend PDF magic so it passes any MIME check context
    const plaintext = Buffer.concat([PDF_MAGIC, largeContent]);

    const result = await provider.saveBuffer(
      'org-large',
      'contract',
      'large.pdf',
      'application/pdf',
      plaintext,
    );

    const stream = provider.getReadStream(result.storageKey);
    const downloaded = await streamToBuffer(stream);
    expect(downloaded).toEqual(plaintext);
    expect(downloaded.length).toBe(plaintext.length);
  });

  // ──────────────────────────────────────────────
  // 12. Checksum is always computed on plaintext
  // ──────────────────────────────────────────────
  it('computes checksum on plaintext, not ciphertext', async () => {
    const plaintext = Buffer.concat([PDF_MAGIC, Buffer.from('Checksum source')]);
    const expectedHash = crypto.createHash('sha256').update(plaintext).digest('hex');

    const provider = makeProvider(TEST_KEY);
    const result = await provider.saveBuffer(
      'org-checksum',
      'contract',
      'checksum-src.pdf',
      'application/pdf',
      plaintext,
    );

    expect(result.checksum).toBe(expectedHash);

    // The raw disk checksum should be DIFFERENT (it's encrypted)
    const rawDisk = readFileSync(result.absolutePath);
    const diskHash = crypto.createHash('sha256').update(rawDisk).digest('hex');
    expect(diskHash).not.toBe(expectedHash);
  });

  // ──────────────────────────────────────────────
  // 13. size field reflects plaintext size, not ciphertext
  // ──────────────────────────────────────────────
  it('reports plaintext size in the result, not encrypted blob size', async () => {
    const provider = makeProvider(TEST_KEY);
    const plaintext = Buffer.concat([PDF_MAGIC, Buffer.from('Size test')]);

    const result = await provider.saveBuffer(
      'org-size',
      'contract',
      'size.pdf',
      'application/pdf',
      plaintext,
    );

    expect(Number(result.size)).toBe(plaintext.length);
  });

  // ──────────────────────────────────────────────
  // 14. Key validation: invalid key length throws at startup
  // ──────────────────────────────────────────────
  it('throws on startup if key is not exactly 32 bytes', () => {
    const shortKey = crypto.randomBytes(16).toString('base64');
    expect(() => makeProvider(shortKey)).toThrow(/32 bytes/);
  });

  // ──────────────────────────────────────────────
  // 15. Delete works for encrypted files
  // ──────────────────────────────────────────────
  it('deletes encrypted files from disk', async () => {
    const provider = makeProvider(TEST_KEY);
    const plaintext = Buffer.concat([PDF_MAGIC, Buffer.from('Delete me')]);

    const result = await provider.saveBuffer(
      'org-delete',
      'contract',
      'deleteme.pdf',
      'application/pdf',
      plaintext,
    );

    await provider.delete(result.storageKey);

    expect(() => provider.getReadStream(result.storageKey)).toThrow(
      BadRequestException,
    );
  });
});
