import { ServiceUnavailableException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'crypto';

export class SensitiveFieldService {
  private key(
    name: 'PII_ENCRYPTION_KEY' | 'INTEGRATION_SECRETS_ENCRYPTION_KEY',
  ) {
    const value = process.env[name];
    if (!value || value.length < 32) {
      throw new ServiceUnavailableException({
        code: 'ENCRYPTION_KEY_UNAVAILABLE',
        message: `${name} must be configured with at least 32 random characters`,
      });
    }
    return createHash('sha256').update(value, 'utf8').digest();
  }

  encrypt(value: string, purpose: 'pii' | 'integration'): string {
    const keyName =
      purpose === 'pii'
        ? 'PII_ENCRYPTION_KEY'
        : 'INTEGRATION_SECRETS_ENCRYPTION_KEY';
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(keyName), iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(payload: string, purpose: 'pii' | 'integration'): string {
    const [version, iv, tag, ciphertext] = payload.split('.');
    if (version !== 'v1' || !iv || !tag || !ciphertext)
      throw new Error('Invalid encrypted payload');
    const keyName =
      purpose === 'pii'
        ? 'PII_ENCRYPTION_KEY'
        : 'INTEGRATION_SECRETS_ENCRYPTION_KEY';
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(keyName),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  blindHash(organizationId: string, normalized: string): string {
    const secret =
      process.env.PII_LOOKUP_HMAC_KEY ?? process.env.PII_ENCRYPTION_KEY;
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException({
        code: 'ENCRYPTION_KEY_UNAVAILABLE',
        message: 'PII_LOOKUP_HMAC_KEY must be configured',
      });
    }
    return createHmac('sha256', secret)
      .update(`${organizationId}\0${normalized}`)
      .digest('hex');
  }
}

export function normalizeNin(value: string): string {
  const normalized = value.trim().replace(/[ -]/g, '');
  if (!/^\d{18}$/.test(normalized))
    throw new Error('NIN must contain exactly 18 digits');
  return normalized;
}

export function normalizePassport(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z0-9]{6,12}$/.test(normalized))
    throw new Error('Passport number must contain 6 to 12 letters or digits');
  return normalized;
}

export function maskIdentity(value?: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}
