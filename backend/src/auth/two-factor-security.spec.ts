import { UnauthorizedException } from '@nestjs/common';
import { generateSync, verifySync } from 'otplib';
import { assertAccessToken } from './access-token';
import { SensitiveFieldService } from '../common/security/sensitive-field.service';

describe('2FA protocol and encrypted storage', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // RFC 6238 SHA-1 test key
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('matches the RFC vector at %s', (epoch, expected) => {
    expect(
      generateSync({
        secret,
        epoch: Number(epoch),
        digits: 8,
        algorithm: 'sha1',
      }),
    ).toBe(expected);
  });
  it('uses six digits, a 30-second window and rejects the last used time step', () => {
    const epoch = 1234567890;
    const code = generateSync({ secret, epoch });
    expect(code).toMatch(/^\d{6}$/);
    const result = verifySync({
      secret,
      token: code,
      epoch: epoch + 30,
      epochTolerance: 30,
    });
    expect(result.valid).toBe(true);
    expect(
      verifySync({ secret, token: code, epoch: epoch + 60, epochTolerance: 30 })
        .valid,
    ).toBe(false);
    expect(
      verifySync({
        secret,
        token: code,
        epoch,
        afterTimeStep: Math.floor(epoch / 30),
        epochTolerance: 30,
      }).valid,
    ).toBe(false);
  });
  it('binds ciphertext to the user and purpose while preserving the existing integration encryption format', () => {
    const previous = process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY;
    process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY =
      'local-test-key-for-two-factor-context-binding';
    try {
      const service = new SensitiveFieldService();
      const encrypted = service.encrypt(secret, 'totp', 'user-a');
      expect(encrypted).not.toContain(secret);
      expect(service.decrypt(encrypted, 'totp', 'user-a')).toBe(secret);
      expect(() => service.decrypt(encrypted, 'totp', 'user-b')).toThrow();
      expect(() => service.decrypt(encrypted, 'integration')).toThrow();
      expect(
        service.decrypt(
          service.encrypt('existing-integration', 'integration'),
          'integration',
        ),
      ).toBe('existing-integration');
    } finally {
      if (previous === undefined)
        delete process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY;
      else process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY = previous;
    }
  });
  it('accepts legacy access tokens and refuses pre-2FA and malformed version claims', () => {
    expect(() => assertAccessToken({ sub: 'user' })).not.toThrow();
    expect(() =>
      assertAccessToken({ sub: 'user', purpose: 'access', authVersion: 2 }),
    ).not.toThrow();
    expect(() =>
      assertAccessToken({ sub: 'user', purpose: 'two-factor' }),
    ).toThrow(UnauthorizedException);
    expect(() => assertAccessToken({ sub: 'user', authVersion: -1 })).toThrow(
      UnauthorizedException,
    );
  });
});
