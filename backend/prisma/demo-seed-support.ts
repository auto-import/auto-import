import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, parse, resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';

export const DEMO_NAMESPACE = 'auto-import-demo-v1';
export const PRIMARY_ORG_ID = stableId('organization:atlas');
export const SECONDARY_ORG_ID = stableId('organization:sahara');
export const DEMO_EMAIL_DOMAIN = 'demo.auto-import.invalid';

export interface DemoSeedConfig {
  anchor: Date;
  connectionString: string;
  databaseName: string;
  environment: 'development' | 'test';
  password: string;
  scale: 'small' | 'medium';
  storageRoot: string;
}

export function stableId(key: string): string {
  const hex = createHash('sha256')
    .update(`${DEMO_NAMESPACE}:${key}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function at(anchor: Date, days = 0, hours = 0): Date {
  return new Date(anchor.getTime() + days * 86_400_000 + hours * 3_600_000);
}

export function readDemoSeedConfig(
  environment: NodeJS.ProcessEnv = process.env,
  workingDirectory = process.cwd(),
): DemoSeedConfig {
  const nodeEnvironment = environment.NODE_ENV ?? 'development';
  if (nodeEnvironment !== 'development' && nodeEnvironment !== 'test') {
    throw new Error(
      'Demo seeding is restricted to NODE_ENV=development or test',
    );
  }
  if (environment.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Demo seeding requires ALLOW_DEMO_SEED=true');
  }

  const password = environment.DEMO_SEED_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error(
      'DEMO_SEED_PASSWORD is required and must be at least 12 characters',
    );
  }

  const rawAnchor =
    environment.DEMO_SEED_ANCHOR_DATE ?? '2026-08-25T12:00:00.000Z';
  const anchor = new Date(rawAnchor);
  if (
    !Number.isFinite(anchor.getTime()) ||
    anchor.toISOString() !== rawAnchor
  ) {
    throw new Error(
      'DEMO_SEED_ANCHOR_DATE must be an exact ISO-8601 UTC timestamp',
    );
  }

  const scale = environment.DEMO_SEED_SCALE ?? 'small';
  if (scale !== 'small' && scale !== 'medium') {
    throw new Error('DEMO_SEED_SCALE must be small or medium');
  }

  const connectionString = environment.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const parsed = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Demo seeding requires PostgreSQL');
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    throw new Error('Demo seeding only permits a local PostgreSQL host');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/^codex_demo_[a-z0-9_]+$/.test(databaseName)) {
    throw new Error(
      'Disposable database name must match codex_demo_[a-z0-9_]+',
    );
  }

  const configuredRoot = environment.DEMO_FILE_STORAGE_ROOT;
  if (!configuredRoot || !isAbsolute(configuredRoot)) {
    throw new Error('DEMO_FILE_STORAGE_ROOT must be an absolute path');
  }
  const storageRoot = resolve(configuredRoot);
  const workspace = resolve(workingDirectory, '..');
  const root = parse(storageRoot).root;
  if (
    storageRoot === root ||
    storageRoot === resolve(workingDirectory) ||
    storageRoot === workspace ||
    !/^\.codex-demo-storage-[a-z0-9_-]+$/i.test(parse(storageRoot).base)
  ) {
    throw new Error(
      'DEMO_FILE_STORAGE_ROOT must end in .codex-demo-storage-<task-name> and cannot be a workspace root',
    );
  }
  if (existsSync(storageRoot) && !statSync(storageRoot).isDirectory()) {
    throw new Error('DEMO_FILE_STORAGE_ROOT exists and is not a directory');
  }

  return {
    anchor,
    connectionString,
    databaseName,
    environment: nodeEnvironment,
    password,
    scale,
    storageRoot,
  };
}

export async function assertDisposableDatabase(
  prisma: PrismaClient,
  config: DemoSeedConfig,
): Promise<void> {
  const identity = await prisma.$queryRaw<
    Array<{ database: string; port: number }>
  >`
    SELECT current_database() AS database, inet_server_port() AS port
  `;
  if (
    identity.length !== 1 ||
    identity[0].database !== config.databaseName ||
    !Number.isInteger(identity[0].port)
  ) {
    throw new Error(
      'Connected database identity does not match guarded DATABASE_URL',
    );
  }
  const migrations = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
  `;
  if (!migrations[0] || migrations[0].count === 0n) {
    throw new Error('Demo database has not had the migration chain deployed');
  }
}

export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
