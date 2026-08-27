import { ServiceUnavailableException } from '@nestjs/common';
import {
  maskIdentity,
  normalizeNin,
  normalizePassport,
  SensitiveFieldService,
} from './sensitive-field.service';

describe('SensitiveFieldService', () => {
  const previousEnvironment = { ...process.env };
  const service = new SensitiveFieldService();

  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY =
      'test-only-pii-key-with-at-least-32-characters';
    process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY =
      'test-only-integration-key-with-at-least-32-characters';
    process.env.PII_LOOKUP_HMAC_KEY =
      'test-only-lookup-key-with-at-least-32-characters';
  });

  afterAll(() => {
    process.env = previousEnvironment;
  });

  it('encrypts with authenticated randomized payloads and decrypts losslessly', () => {
    const plaintext = '0987654321AB';
    const first = service.encrypt(plaintext, 'pii');
    const second = service.encrypt(plaintext, 'pii');

    expect(first).not.toContain(plaintext);
    expect(second).not.toBe(first);
    expect(service.decrypt(first, 'pii')).toBe(plaintext);
    expect(service.decrypt(second, 'pii')).toBe(plaintext);
  });

  it('scopes lookup hashes to a tenant', () => {
    const normalized = normalizePassport('  00ab1234  ');
    expect(normalized).toBe('00AB1234');
    expect(service.blindHash('org-a', normalized)).toBe(
      service.blindHash('org-a', normalized),
    );
    expect(service.blindHash('org-a', normalized)).not.toBe(
      service.blindHash('org-b', normalized),
    );
  });

  it('validates Algerian NIN and preserves meaningful passport zeros', () => {
    expect(normalizeNin('1234 5678 9012 345678')).toBe('123456789012345678');
    expect(normalizePassport('00ab1234')).toBe('00AB1234');
    expect(() => normalizeNin('123')).toThrow('exactly 18 digits');
    expect(() => normalizePassport('bad!')).toThrow('6 to 12');
  });

  it('masks identity by default and fails closed without a key', () => {
    expect(maskIdentity('123456789012345678')).toBe('**************5678');
    delete process.env.PII_ENCRYPTION_KEY;
    expect(() => service.encrypt('sensitive', 'pii')).toThrow(
      ServiceUnavailableException,
    );
  });
});
