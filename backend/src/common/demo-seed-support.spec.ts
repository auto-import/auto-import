import { resolve } from 'node:path';
import { readDemoSeedConfig, stableId } from '../../prisma/demo-seed-support';

const validEnvironment = {
  NODE_ENV: 'test',
  ALLOW_DEMO_SEED: 'true',
  DEMO_SEED_PASSWORD: 'disposable-password',
  DEMO_SEED_SCALE: 'small',
  DEMO_SEED_ANCHOR_DATE: '2026-08-25T12:00:00.000Z',
  DATABASE_URL: 'postgresql://demo:demo@localhost:5432/codex_demo_test',
  DEMO_FILE_STORAGE_ROOT: resolve(
    process.cwd(),
    '..',
    '.codex-demo-storage-test',
  ),
} satisfies NodeJS.ProcessEnv;

describe('demo seed safety support', () => {
  it('accepts only an explicitly opted-in local disposable target', () => {
    const config = readDemoSeedConfig(validEnvironment);
    expect(config.databaseName).toBe('codex_demo_test');
    expect(config.anchor.toISOString()).toBe('2026-08-25T12:00:00.000Z');
  });

  it.each([
    ['production environment', { NODE_ENV: 'production' }],
    ['missing opt-in', { ALLOW_DEMO_SEED: 'false' }],
    [
      'remote host',
      { DATABASE_URL: 'postgresql://u:p@db.example/codex_demo_test' },
    ],
    [
      'ordinary database',
      { DATABASE_URL: 'postgresql://u:p@localhost/auto_import' },
    ],
    [
      'unsafe storage',
      { DEMO_FILE_STORAGE_ROOT: resolve(process.cwd(), '..') },
    ],
  ])('refuses %s', (_label, override) => {
    expect(() =>
      readDemoSeedConfig({ ...validEnvironment, ...override }),
    ).toThrow();
  });

  it('generates stable UUID-shaped identifiers without collisions', () => {
    expect(stableId('lead:1')).toBe(stableId('lead:1'));
    expect(stableId('lead:1')).not.toBe(stableId('lead:2'));
    expect(stableId('lead:1')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
