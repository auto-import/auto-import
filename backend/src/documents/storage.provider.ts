import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Readable, Transform } from 'stream';

/** Version byte identifying the on-disk encryption format. */
const ENCRYPTION_VERSION_V1 = 0x01;
/** AES-256-GCM IV length in bytes. */
const IV_LENGTH = 12;
/** AES-256-GCM authentication tag length in bytes. */
const AUTH_TAG_LENGTH = 16;
/** Total header size: version(1) + IV(12) + authTag(16) = 29 bytes. */
const HEADER_LENGTH = 1 + IV_LENGTH + AUTH_TAG_LENGTH;

export interface StoredFileResult {
  storageKey: string;
  size: bigint;
  checksum: string;
  mimeType: string;
  originalName: string;
  absolutePath: string;
}

@Injectable()
export class StorageProvider {
  private readonly logger = new Logger(StorageProvider.name);
  private readonly storageRoot = path.resolve(
    process.env.PRIVATE_STORAGE_ROOT ??
      path.join(process.cwd(), 'storage', 'private'),
  );
  private readonly masterKey: Buffer | null;

  constructor() {
    if (!fs.existsSync(this.storageRoot)) {
      fs.mkdirSync(this.storageRoot, { recursive: true });
    }
    this.masterKey = this.loadMasterKey();
  }

  /**
   * Load and validate the master encryption key from environment.
   * Returns null if not configured (legacy/unencrypted mode).
   */
  private loadMasterKey(): Buffer | null {
    const raw = process.env.DOCUMENT_ENCRYPTION_KEY;
    if (!raw) {
      this.logger.warn(
        'DOCUMENT_ENCRYPTION_KEY is not set. New uploads will be stored WITHOUT encryption. ' +
          'Set a base64-encoded 32-byte key to enable encryption at rest.',
      );
      return null;
    }
    let key: Buffer;
    try {
      key = Buffer.from(raw, 'base64');
    } catch {
      throw new Error(
        'DOCUMENT_ENCRYPTION_KEY must be a valid base64-encoded string.',
      );
    }
    if (key.length !== 32) {
      throw new Error(
        `DOCUMENT_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). ` +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
      );
    }
    this.logger.log('Document encryption at rest enabled (AES-256-GCM v1).');
    return key;
  }

  /**
   * Detect MIME type from magic bytes
   */
  detectMimeType(buffer: Buffer, originalMime: string): string {
    if (buffer.length >= 4) {
      // PDF: %PDF (25 50 44 46)
      if (
        buffer[0] === 0x25 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x44 &&
        buffer[3] === 0x46
      ) {
        return 'application/pdf';
      }
      // PNG: 89 50 4E 47
      if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      ) {
        return 'image/png';
      }
      // JPEG: FF D8 FF
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
      }
      // WEBP: RIFF....WEBP
      if (
        buffer.length >= 12 &&
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
      ) {
        return 'image/webp';
      }
    }
    void originalMime;
    return 'application/octet-stream';
  }

  /**
   * Save a buffer to private tenant-isolated storage.
   * If DOCUMENT_ENCRYPTION_KEY is configured, the file is encrypted with AES-256-GCM.
   * The SHA-256 checksum is always computed on the PLAINTEXT content.
   */
  async saveBuffer(
    organizationId: string,
    category: string,
    originalName: string,
    clientMime: string,
    buffer: Buffer,
  ): Promise<StoredFileResult> {
    const year = new Date().getUTCFullYear().toString();
    const sanitizedOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '');
    const sanitizedCat = (category || 'general').replace(/[^a-zA-Z0-9_-]/g, '');

    const dir = path.join(this.storageRoot, sanitizedOrg, sanitizedCat, year);
    await fs.promises.mkdir(dir, { recursive: true });

    const ext = path.extname(originalName) || '.bin';
    const uuid = crypto.randomUUID();
    const fileName = `${uuid}${ext}`;
    const filePath = path.join(dir, fileName);

    // Checksum is ALWAYS computed on plaintext content
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const mimeType = this.detectMimeType(buffer, clientMime);

    if (this.masterKey) {
      // --- AES-256-GCM encryption ---
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
      const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
      const authTag = cipher.getAuthTag();

      // On-disk format: [version(1)][iv(12)][authTag(16)][ciphertext(N)]
      const header = Buffer.alloc(HEADER_LENGTH);
      header[0] = ENCRYPTION_VERSION_V1;
      iv.copy(header, 1);
      authTag.copy(header, 1 + IV_LENGTH);

      await fs.promises.writeFile(filePath, Buffer.concat([header, encrypted]));
    } else {
      // Legacy plaintext mode (no encryption key configured)
      await fs.promises.writeFile(filePath, buffer);
    }

    const storageKey = `${sanitizedOrg}/${sanitizedCat}/${year}/${fileName}`;

    return {
      storageKey,
      size: BigInt(buffer.length),
      checksum: hash,
      mimeType,
      originalName,
      absolutePath: filePath,
    };
  }

  /**
   * Get readable stream for a storage key.
   * Transparently decrypts AES-256-GCM encrypted files.
   * Legacy plaintext files are returned as raw streams.
   */
  getReadStream(storageKey: string): Readable {
    const filePath = this.resolveStoragePath(storageKey);
    if (!fs.existsSync(filePath)) {
      throw new BadRequestException('File not found in storage');
    }

    // Read the header to detect encryption
    const fd = fs.openSync(filePath, 'r');
    try {
      const headerBuf = Buffer.alloc(HEADER_LENGTH);
      const bytesRead = fs.readSync(fd, headerBuf, 0, HEADER_LENGTH, 0);

      if (bytesRead >= HEADER_LENGTH && headerBuf[0] === ENCRYPTION_VERSION_V1) {
        // Encrypted file — decrypt in streaming fashion
        const iv = headerBuf.subarray(1, 1 + IV_LENGTH);
        const authTag = headerBuf.subarray(1 + IV_LENGTH, HEADER_LENGTH);

        if (!this.masterKey) {
          throw new BadRequestException(
            'Encrypted file found but DOCUMENT_ENCRYPTION_KEY is not configured.',
          );
        }

        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          this.masterKey,
          iv,
        );
        decipher.setAuthTag(authTag);

        // Create a read stream starting after the header
        const fileStream = fs.createReadStream(filePath, {
          start: HEADER_LENGTH,
        });

        // Pipe through decipher. On auth failure, the stream emits an error.
        const decryptStream = fileStream.pipe(decipher);
        // Propagate stream errors for proper cleanup
        fileStream.on('error', (err) => decryptStream.destroy(err));

        return decryptStream;
      }
    } finally {
      fs.closeSync(fd);
    }

    // Legacy plaintext file — return raw stream
    return fs.createReadStream(filePath);
  }

  /**
   * Verify file integrity by comparing the SHA-256 of the plaintext content
   * against the stored checksum.
   * Transparently handles both encrypted and legacy plaintext files.
   */
  async verify(storageKey: string, expectedChecksum: string): Promise<boolean> {
    const filePath = this.resolveStoragePath(storageKey);
    try {
      const raw = await fs.promises.readFile(filePath);

      let plaintext: Buffer;
      if (raw.length >= HEADER_LENGTH && raw[0] === ENCRYPTION_VERSION_V1) {
        // Encrypted file — decrypt to get plaintext for checksum
        if (!this.masterKey) return false;
        const iv = raw.subarray(1, 1 + IV_LENGTH);
        const authTag = raw.subarray(1 + IV_LENGTH, HEADER_LENGTH);
        const ciphertext = raw.subarray(HEADER_LENGTH);

        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          this.masterKey,
          iv,
        );
        decipher.setAuthTag(authTag);
        try {
          plaintext = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
          ]);
        } catch {
          // Authentication failed — file is corrupted or tampered
          return false;
        }
      } else {
        // Legacy plaintext file
        plaintext = raw;
      }

      const checksum = crypto
        .createHash('sha256')
        .update(plaintext)
        .digest('hex');
      return Boolean(expectedChecksum) && checksum === expectedChecksum;
    } catch {
      return false;
    }
  }

  assertAllowedMime(
    buffer: Buffer,
    clientMime: string,
    allowed: string[],
  ): string {
    const detected = this.detectMimeType(buffer, clientMime);
    if (!allowed.includes(detected)) {
      throw new BadRequestException({
        code: 'FILE_TYPE_NOT_ALLOWED',
        message: `Allowed file types: ${allowed.join(', ')}`,
      });
    }
    return detected;
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = this.resolveStoragePath(storageKey);
    await fs.promises.rm(filePath, { force: true });
  }

  private resolveStoragePath(storageKey: string): string {
    const filePath = path.resolve(this.storageRoot, storageKey);
    if (!filePath.startsWith(`${this.storageRoot}${path.sep}`)) {
      throw new BadRequestException('Invalid storage key');
    }
    return filePath;
  }
}
