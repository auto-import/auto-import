import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  INestApplication,
  ValidationPipe,
  ConflictException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as bcrypt from 'bcrypt';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { ALL_PERMISSIONS } from '@auto-import/contracts';
import { generateSync } from 'otplib';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { TwoFactorService } from '../src/auth/two-factor.service';
import { NotificationsGateway } from '../src/phase3/notifications.gateway';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

// These scenarios include real PostgreSQL transactions and several bcrypt calls.
jest.setTimeout(30_000);

function dataOf<T>(response: Response): T {
  if (!response.body.success)
    throw new Error(`Unexpected HTTP ${response.status}`);
  return response.body.data;
}
describe('Section 2: 2FA security on migrated PostgreSQL and HTTP', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let organizationId: string;
  let userId: string;
  let roleId: string;
  let adminPassword: string;
  let storageRoot: string;
  let address = 1;
  const password = 'Fixture-password-Only!2026';
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !url.pathname.startsWith('/codex_dossier_fix_')
    ) {
      throw new Error(
        'Use a local codex_dossier_fix_* disposable database only.',
      );
    }
    process.env.NODE_ENV = 'test';
    if (process.env.DOSSIER_BROWSER_URL)
      process.env.CORS_ORIGIN = process.env.DOSSIER_BROWSER_URL;
    process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('base64url');
    process.env.PII_ENCRYPTION_KEY = randomBytes(48).toString('base64url');
    process.env.PII_LOOKUP_HMAC_KEY = randomBytes(48).toString('base64url');
    process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY =
      randomBytes(48).toString('base64url');
    storageRoot = await mkdtemp(join(tmpdir(), 'dossier-regression-'));
    process.env.PRIVATE_STORAGE_ROOT = storageRoot;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    app.enableCors({
      origin: process.env.DOSSIER_BROWSER_URL,
      credentials: true,
    });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    prisma = app.get(PrismaService);
    const org = await prisma.organization.create({
      data: { name: 'Dossier regression', type: 'test' },
    });
    organizationId = org.id;
    await prisma.permission.createMany({
      data: ALL_PERMISSIONS.map((value) => {
        const separator = value.indexOf(':');
        return {
          resource: value.slice(0, separator),
          action: value.slice(separator + 1),
        };
      }),
      skipDuplicates: true,
    });
    const permissions = await prisma.permission.findMany();
    const role = await prisma.role.create({
      data: {
        organizationId,
        name: 'Dossier test administrator',
        scope: 'tenant',
        rolePermissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    roleId = role.id;
    const password = randomBytes(24).toString('base64url');
    adminPassword = password;
    const user = await prisma.user.create({
      data: {
        organizationId,
        email: `${randomUUID()}@example.test`,
        firstName: 'Dossier',
        lastName: 'Test',
        passwordHash: await bcrypt.hash(password, 4),
        status: 'active',
        userRoles: { create: { roleId: role.id } },
      },
    });
    userId = user.id;
    const session = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password });
    token = dataOf<{ accessToken: string }>(session).accessToken;
  }, 60000);
  afterAll(async () => {
    if (app) await app.close();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });

  const api = (path: string, bearer?: string, ip?: string) => {
    const req = request(app.getHttpServer())
      .post(`/api${path}`)
      .set(
        'X-Forwarded-For',
        ip ?? `198.51.${Math.floor(address / 240)}.${(++address % 240) + 1}`,
      );
    return bearer ? req.auth(bearer, { type: 'bearer' }) : req;
  };
  const get = (path: string, bearer: string) =>
    request(app.getHttpServer())
      .get(`/api${path}`)
      .auth(bearer, { type: 'bearer' });
  const login = (email: string, pass = password) =>
    api('/auth/login').send({ email, password: pass });
  const verify = (challengeToken: string, code: string) =>
    api('/auth/two-factor/verify').send({ challengeToken, code });
  const totp = (secret: string, offset = 0) =>
    generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + offset });
  async function account(withRole = true) {
    const user = await prisma.user.create({
      data: {
        organizationId,
        firstName: 'Two',
        lastName: 'Factor',
        email: `${randomUUID()}@example.test`,
        status: 'active',
        passwordHash: await bcrypt.hash(password, 4),
        ...(withRole ? { userRoles: { create: { roleId } } } : {}),
      },
    });
    const session = await login(user.email).expect(200);
    return {
      user,
      accessToken: session.body.data.accessToken as string,
      cookie: session.headers['set-cookie'][0] as string,
    };
  }
  async function enabled(withRole = true) {
    const item = await account(withRole);
    const response = await api('/auth/two-factor/setup', item.accessToken)
      .send({ currentPassword: password })
      .expect(200);
    const setup = dataOf<{
      secret: string;
      qrCodeDataUrl: string;
      provisioningUri: string;
    }>(response);
    const result = await api('/auth/two-factor/enable', item.accessToken)
      .send({ code: totp(setup.secret) })
      .expect(200);
    return {
      ...item,
      ...setup,
      recoveryCodes: result.body.data.recoveryCodes as string[],
    };
  }
  async function challenge(email: string) {
    const response = await login(email).expect(200);
    expect(response.body.data.twoFactorRequired).toBe(true);
    expect(response.body.data.accessToken).toBeUndefined();
    expect(response.body.data.user).toBeUndefined();
    return response.body.data.challengeToken as string;
  }

  it('preserves password-only login, refresh cookies, and legacy version-zero access tokens', async () => {
    const item = await account();
    await get('/auth/me', item.accessToken).expect(200);
    await api('/auth/refresh').set('Cookie', item.cookie).send({}).expect(200);
    const legacy = app.get(JwtService).sign({ sub: item.user.id });
    await get('/auth/me', legacy).expect(200);
    expect(
      await prisma.userTwoFactor.findUnique({
        where: { userId: item.user.id },
      }),
    ).toBeNull();
  });

  it('activates only after verification, encrypts the pending and active secret, hashes codes and revokes old sessions', async () => {
    const item = await account();
    const response = await api('/auth/two-factor/setup', item.accessToken)
      .send({ currentPassword: password })
      .expect(200);
    const setup = response.body.data;
    expect(response.headers['cache-control']).toBe('no-store');
    expect(setup.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(setup.provisioningUri).toMatch(/^otpauth:\/\/totp\//);
    let state = await prisma.userTwoFactor.findUniqueOrThrow({
      where: { userId: item.user.id },
    });
    expect(state.enabledAt).toBeNull();
    expect(state.pendingCiphertext).not.toContain(setup.secret);
    expect(state.secretCiphertext).toBeNull();
    await login(item.user.email).expect(200);
    await api('/auth/two-factor/enable', item.accessToken)
      .send({ code: totp(setup.secret, -120) })
      .expect(401);
    const result = await api('/auth/two-factor/enable', item.accessToken)
      .send({ code: totp(setup.secret) })
      .expect(200);
    expect(result.body.data.recoveryCodes).toHaveLength(10);
    state = await prisma.userTwoFactor.findUniqueOrThrow({
      where: { userId: item.user.id },
    });
    expect(state.enabledAt).not.toBeNull();
    expect(state.pendingCiphertext).toBeNull();
    expect(state.recoveryHashes).toHaveLength(10);
    expect(state.recoveryHashes.every((h) => /^[a-f0-9]{64}$/.test(h))).toBe(
      true,
    );
    for (const code of result.body.data.recoveryCodes)
      expect(JSON.stringify(state)).not.toContain(code.replace(/-/g, ''));
    expect(JSON.stringify(state)).not.toContain(setup.secret);
    await get('/auth/me', item.accessToken).expect(401);
    await api('/auth/refresh').set('Cookie', item.cookie).send({}).expect(401);
    await api('/auth/two-factor/enable', item.accessToken)
      .send({ code: totp(setup.secret) })
      .expect(401);
    const audits = await prisma.auditLog.findMany({
      where: { entityId: item.user.id },
    });
    expect(JSON.stringify(audits)).not.toContain(setup.secret);
    expect(JSON.stringify(audits)).not.toContain(
      result.body.data.recoveryCodes[0],
    );
  });

  it('refuses pre-2FA tokens on HTTP, WebSocket and refresh; does not record a completed login prematurely', async () => {
    const item = await enabled();
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: item.user.id },
    });
    const pending = await challenge(item.user.email);
    await get('/auth/me', pending).expect(401);
    await api('/auth/refresh')
      .set('Cookie', `auto_import_refresh=${pending}`)
      .send({})
      .expect(401);
    const socket: any = {
      handshake: { auth: { token: pending }, headers: {} },
      disconnect: jest.fn(),
      join: jest.fn(),
      emit: jest.fn(),
    };
    await app.get(NotificationsGateway).handleConnection(socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: item.user.id } }))
        .lastLoginAt,
    ).toEqual(before.lastLoginAt);
    expect(
      await prisma.refreshSession.count({
        where: { userId: item.user.id, revokedAt: null },
      }),
    ).toBe(0);
    await verify(item.accessToken, item.recoveryCodes[0]).expect(401);
    const expired = app
      .get(JwtService)
      .sign(
        { sub: item.user.id, purpose: 'two-factor' },
        { expiresIn: -1, audience: 'corapide:two-factor' },
      );
    await verify(expired, item.recoveryCodes[0]).expect(401);
  });

  it('consumes a recovery code and challenge exactly once under concurrent submissions', async () => {
    const item = await enabled();
    const pending = await challenge(item.user.email);
    const responses = await Promise.all([
      verify(pending, item.recoveryCodes[0]),
      verify(pending, item.recoveryCodes[0]),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
    const session = responses.find((r) => r.status === 200)!;
    await get('/auth/me', session.body.data.accessToken).expect(200);
    expect(
      await prisma.refreshSession.count({
        where: { userId: item.user.id, revokedAt: null },
      }),
    ).toBe(1);
    await verify(
      await challenge(item.user.email),
      item.recoveryCodes[0],
    ).expect(401);
    const state = await get(
      '/auth/two-factor/status',
      session.body.data.accessToken,
    ).expect(200);
    expect(state.body.data.recoveryCodesRemaining).toBe(9);
    expect(JSON.stringify(state.body)).not.toContain('Hash');
    expect(JSON.stringify(state.body)).not.toContain('Ciphertext');
    const publicUser = await get(`/users/${item.user.id}`, token).expect(200);
    expect(JSON.stringify(publicUser.body)).not.toContain(item.secret);
    expect(JSON.stringify(publicUser.body)).not.toContain('recoveryHashes');
  });

  it('accepts the standard next-step tolerance but rejects expired and replayed authenticator codes', async () => {
    const item = await enabled();
    await verify(
      await challenge(item.user.email),
      totp(item.secret, -120),
    ).expect(401);
    const code = totp(item.secret, 30);
    await verify(await challenge(item.user.email), code).expect(200);
    await verify(await challenge(item.user.email), code).expect(401);
  });

  it('persists the five-attempt user lock across new challenges and different IP addresses', async () => {
    const item = await enabled();
    let pending = '';
    for (let i = 0; i < 5; i++) {
      pending = await challenge(item.user.email);
      await verify(pending, 'invalid-factor').expect(i === 4 ? 429 : 401);
    }
    const state = await prisma.userTwoFactor.findUniqueOrThrow({
      where: { userId: item.user.id },
    });
    expect(state.failedAttempts).toBe(5);
    expect(state.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    await login(item.user.email).expect(429);
    const restartedService = new TwoFactorService(prisma, app.get(JwtService));
    await expect(
      restartedService.completeLogin(
        pending,
        item.recoveryCodes[0],
        {},
        async () => ({}),
      ),
    ).rejects.toMatchObject({ status: 429 });
    await prisma.userTwoFactor.update({
      where: { userId: item.user.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    await verify(
      await challenge(item.user.email),
      item.recoveryCodes[0],
    ).expect(200);
  });

  it('requires both the password and factor to disable, then restores password-only login and revokes sessions', async () => {
    const item = await enabled();
    const session = await verify(
      await challenge(item.user.email),
      item.recoveryCodes[0],
    ).expect(200);
    const access = session.body.data.accessToken;
    await api('/auth/two-factor/disable', access)
      .send({
        currentPassword: 'incorrect-password',
        code: item.recoveryCodes[1],
      })
      .expect(401);
    await api('/auth/two-factor/disable', access)
      .send({ currentPassword: password, code: 'invalid-factor' })
      .expect(401);
    await api('/auth/two-factor/disable', access)
      .send({ currentPassword: password, code: item.recoveryCodes[1] })
      .expect(200);
    await get('/auth/me', access).expect(401);
    const next = await login(item.user.email).expect(200);
    expect(next.body.data.accessToken).toBeTruthy();
    const state = await prisma.userTwoFactor.findUniqueOrThrow({
      where: { userId: item.user.id },
    });
    expect(state.enabledAt).toBeNull();
    expect(state.secretCiphertext).toBeNull();
    expect(state.recoveryHashes).toEqual([]);
  });

  it('restricts administrative reset to authorized users in the same organization and audits the actor and reason', async () => {
    const item = await enabled();
    const limited = await account(false);
    const path = `/auth/two-factor/users/${item.user.id}/reset`;
    const body = {
      currentPassword: adminPassword,
      reason: 'Identité vérifiée au bureau',
    };
    await api(path, limited.accessToken).send(body).expect(403);
    await api(`/auth/two-factor/users/${userId}/reset`, token)
      .send(body)
      .expect(403);
    const otherOrg = await prisma.organization.create({
      data: { name: 'Other MFA tenant', type: 'test' },
    });
    const otherUser = await prisma.user.create({
      data: {
        organizationId: otherOrg.id,
        firstName: 'Other',
        lastName: 'Tenant',
        email: `${randomUUID()}@example.test`,
        passwordHash: await bcrypt.hash(password, 4),
      },
    });
    await api(`/auth/two-factor/users/${otherUser.id}/reset`, token)
      .send(body)
      .expect(404);
    await api(path, token)
      .send({ ...body, currentPassword: 'incorrect-password' })
      .expect(401);
    await api(path, token).send(body).expect(200);
    const result = await login(item.user.email).expect(200);
    expect(result.body.data.twoFactorRequired).toBeUndefined();
    expect(
      await prisma.auditLog.findFirst({
        where: {
          action: 'account.twofactor.admin.reset',
          entityId: item.user.id,
        },
      }),
    ).toMatchObject({
      userId,
      newValues: { reason: body.reason, sessionsRevoked: true },
    });
  });

  it('invalidates a pending challenge after the password changes', async () => {
    const item = await enabled();
    const pending = await challenge(item.user.email);
    await prisma.user.update({
      where: { id: item.user.id },
      data: { passwordHash: await bcrypt.hash('Changed-password-2026!', 4) },
    });
    await verify(pending, item.recoveryCodes[0]).expect(401);
  });

  it('rolls back factor consumption when session issuance fails, so retrying cannot lose the recovery code', async () => {
    const item = await enabled();
    const pending = await challenge(item.user.email);
    const service = app.get(AuthService) as any;
    const original = service.issueSession.bind(service);
    const spy = jest
      .spyOn(service, 'issueSession')
      .mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new ConflictException('Injected session conflict');
      });
    try {
      await verify(pending, item.recoveryCodes[0]).expect(409);
    } finally {
      spy.mockRestore();
    }
    expect(
      (
        await prisma.userTwoFactor.findUniqueOrThrow({
          where: { userId: item.user.id },
        })
      ).recoveryHashes,
    ).toHaveLength(10);
    expect(
      await prisma.refreshSession.count({
        where: { userId: item.user.id, revokedAt: null },
      }),
    ).toBe(0);
    await verify(pending, item.recoveryCodes[0]).expect(200);
  });

  it('rejects an expired setup and reports encrypted-secret corruption as unavailable instead of an internal error', async () => {
    const first = await account();
    const setup = await api('/auth/two-factor/setup', first.accessToken)
      .send({ currentPassword: password })
      .expect(200);
    await prisma.userTwoFactor.update({
      where: { userId: first.user.id },
      data: { pendingExpiresAt: new Date(Date.now() - 1000) },
    });
    await api('/auth/two-factor/enable', first.accessToken)
      .send({ code: totp(setup.body.data.secret) })
      .expect(409);
    const item = await enabled();
    await prisma.userTwoFactor.update({
      where: { userId: item.user.id },
      data: { secretCiphertext: 'corrupt' },
    });
    await verify(
      await challenge(item.user.email),
      totp(item.secret, 30),
    ).expect(503);
  });

  it('enforces the IP limit even for invalid or forged challenge tokens', async () => {
    for (let i = 0; i < 11; i++) {
      await api('/auth/two-factor/verify', undefined, '203.0.113.199')
        .send({ challengeToken: 'invalid-token', code: '123456' })
        .expect(i === 10 ? 429 : 401);
    }
  });
  (process.env.DOSSIER_BROWSER_URL ? it : it.skip)(
    'verifies setup, TOTP, recovery and disabling through the real browser UI',
    async () => {
      const item = await account();
      await app.listen(55440, '127.0.0.1');
      const run = await promisify(execFile)(
        process.execPath,
        [join(__dirname, 'helpers/two-factor-browser.mjs')],
        {
          env: {
            ...process.env,
            DOSSIER_BROWSER_EMAIL: item.user.email,
            DOSSIER_BROWSER_PASSWORD: password,
            DOSSIER_BROWSER_API: 'http://127.0.0.1:55440/api',
          },
          timeout: 120000,
          windowsHide: true,
        },
      );
      expect(JSON.parse(run.stdout)).toEqual({
        passwordOnly: true,
        qrVisible: true,
        setup: true,
        totpLogin: true,
        recoveryLogin: true,
        disable: true,
        serverErrors: 0,
      });
      expect(
        (
          await prisma.userTwoFactor.findUniqueOrThrow({
            where: { userId: item.user.id },
          })
        ).enabledAt,
      ).toBeNull();
    },
    150000,
  );
});
