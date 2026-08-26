import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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
  private readonly storageRoot = path.resolve(
    process.env.PRIVATE_STORAGE_ROOT ??
      path.join(process.cwd(), 'storage', 'private'),
  );

  constructor() {
    if (!fs.existsSync(this.storageRoot)) {
      fs.mkdirSync(this.storageRoot, { recursive: true });
    }
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
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46
      ) {
        return 'image/webp';
      }
    }
    return originalMime || 'application/octet-stream';
  }

  /**
   * Save a buffer to private tenant-isolated storage
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

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const mimeType = this.detectMimeType(buffer, clientMime);

    await fs.promises.writeFile(filePath, buffer);

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
   * Get readable stream for a storage key
   */
  getReadStream(storageKey: string): fs.ReadStream {
    const filePath = this.resolveStoragePath(storageKey);
    if (!fs.existsSync(filePath)) {
      throw new BadRequestException('File not found in storage');
    }
    return fs.createReadStream(filePath);
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
