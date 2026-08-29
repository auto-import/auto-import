import * as path from 'path';

const requiredSecrets = [
  'JWT_ACCESS_SECRET',
  'PII_ENCRYPTION_KEY',
  'PII_LOOKUP_HMAC_KEY',
  'INTEGRATION_SECRETS_ENCRYPTION_KEY',
] as const;

const placeholder =
  /change|replace|example|placeholder|default|secret_here|password_here/i;

export function validateProductionEnvironment(
  environment: NodeJS.ProcessEnv,
): void {
  if (environment.NODE_ENV !== 'production') return;
  const errors: string[] = [];
  const required = [
    'DATABASE_URL',
    'CORS_ORIGIN',
    'PUBLIC_API_BASE_URL',
    'PRIVATE_STORAGE_ROOT',
    ...requiredSecrets,
  ] as const;
  for (const name of required) {
    if (!environment[name]?.trim()) errors.push(`${name} is required`);
  }
  for (const name of requiredSecrets) {
    const value = environment[name] ?? '';
    if (value && (value.length < 32 || placeholder.test(value))) {
      errors.push(
        `${name} must be at least 32 random non-placeholder characters`,
      );
    }
  }
  validateUrl(
    environment.DATABASE_URL,
    'DATABASE_URL',
    ['postgres:', 'postgresql:'],
    errors,
  );
  validateUrl(
    environment.PUBLIC_API_BASE_URL,
    'PUBLIC_API_BASE_URL',
    ['http:', 'https:'],
    errors,
  );
  for (const origin of (environment.CORS_ORIGIN ?? '').split(',')) {
    if (!origin.trim()) continue;
    validateUrl(origin.trim(), 'CORS_ORIGIN', ['http:', 'https:'], errors, true);
  }
  if ((environment.CORS_ORIGIN ?? '').includes('*')) {
    errors.push('CORS_ORIGIN must not contain wildcards');
  }
  const storageRoot = environment.PRIVATE_STORAGE_ROOT ?? '';
  if (
    storageRoot &&
    !path.isAbsolute(storageRoot) &&
    !path.posix.isAbsolute(storageRoot)
  ) {
    errors.push('PRIVATE_STORAGE_ROOT must be an absolute path');
  }
  const trustProxy = environment.TRUST_PROXY_HOPS ?? '';
  if (!/^[1-3]$/.test(trustProxy)) {
    errors.push('TRUST_PROXY_HOPS must be an integer from 1 to 3');
  }
  if (errors.length) {
    throw new Error(
      `Invalid production environment:\n- ${errors.join('\n- ')}`,
    );
  }
}

function validateUrl(
  raw: string | undefined,
  name: string,
  protocols: string[],
  errors: string[],
  originOnly = false,
) {
  if (!raw) return;
  try {
    const value = new URL(raw);
    if (!protocols.includes(value.protocol)) {
      errors.push(`${name} must use ${protocols.join(' or ')}`);
    }
    if (originOnly && value.origin !== raw.replace(/\/$/, '')) {
      errors.push(`${name} entries must be origins without paths`);
    }
  } catch {
    errors.push(`${name} must be a valid URL`);
  }
}
