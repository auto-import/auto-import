import { validateProductionEnvironment } from './production-environment';

const valid = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://erp:disposable-only@postgres:5432/erp',
  CORS_ORIGIN: 'https://erp.invalid',
  PUBLIC_API_BASE_URL: 'https://erp.invalid/api',
  PRIVATE_STORAGE_ROOT: '/app/storage/private',
  TRUST_PROXY_HOPS: '1',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  PII_ENCRYPTION_KEY: 'b'.repeat(48),
  PII_LOOKUP_HMAC_KEY: 'c'.repeat(48),
  INTEGRATION_SECRETS_ENCRYPTION_KEY: 'd'.repeat(48),
};

describe('production environment validation', () => {
  it('accepts explicit production-safe settings', () => {
    expect(() => validateProductionEnvironment(valid)).not.toThrow();
  });

  it('fails closed without printing secret values', () => {
    const weak = { ...valid, JWT_ACCESS_SECRET: 'change-me' };
    let message = '';
    try {
      validateProductionEnvironment(weak);
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain('JWT_ACCESS_SECRET');
    expect(message).not.toContain('change-me');
  });

  it('rejects HTTP public origins because production refresh cookies are secure', () => {
    expect(() =>
      validateProductionEnvironment({
        ...valid,
        CORS_ORIGIN: 'http://erp.invalid',
        PUBLIC_API_BASE_URL: 'http://erp.invalid/api',
      }),
    ).toThrow(/https:/);
  });
});
