import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ALL_PERMISSIONS } from '@auto-import/contracts';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Section 3: vehicle color and paint on PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let organizationId: string;
  let userId: string;
  let token: string;
  let storageRoot: string;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !url.pathname.startsWith('/codex_dossier_fix_')
    )
      throw new Error('Disposable local database required');
    process.env.NODE_ENV = 'test';
    for (const key of [
      'JWT_ACCESS_SECRET',
      'PII_ENCRYPTION_KEY',
      'PII_LOOKUP_HMAC_KEY',
      'INTEGRATION_SECRETS_ENCRYPTION_KEY',
    ])
      process.env[key] = randomBytes(48).toString('base64url');
    storageRoot = await mkdtemp(join(tmpdir(), 'vehicle-paint-test-'));
    process.env.PRIVATE_STORAGE_ROOT = storageRoot;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    const org = await prisma.organization.create({
      data: { name: 'Paint tests', type: 'test' },
    });
    organizationId = org.id;
    await prisma.permission.createMany({
      data: ALL_PERMISSIONS.map((value) => ({
        resource: value.split(':')[0],
        action: value.split(':')[1],
      })),
      skipDuplicates: true,
    });
    const permissions = await prisma.permission.findMany();
    const role = await prisma.role.create({
      data: {
        organizationId,
        name: 'Paint tester',
        scope: 'tenant',
        rolePermissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    const password = randomBytes(24).toString('base64url');
    const user = await prisma.user.create({
      data: {
        organizationId,
        email: `${randomUUID()}@example.test`,
        firstName: 'Paint',
        lastName: 'Test',
        passwordHash: await bcrypt.hash(password, 4),
        userRoles: { create: { roleId: role.id } },
      },
    });
    userId = user.id;
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password })
      .expect(200);
    token = response.body.data.accessToken;
  }, 60000);
  afterAll(async () => {
    if (app) await app.close();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });
  async function fixture() {
    return prisma.vehicle.create({
      data: {
        organizationId,
        acquisitionType: 'stock',
        brand: 'Test',
        model: 'Paint',
        status: 'prePurchase',
        color: 'OTHER',
        specs: { create: { color: 'Bleu nuit métallisé' } },
      },
    });
  }
  function patch(id: string, body: object) {
    return request(app.getHttpServer())
      .patch(`/api/vehicles/${id}`)
      .auth(token, { type: 'bearer' })
      .send(body);
  }
  it('creates with photos and persists both fields independently', async () => {
    let call = request(app.getHttpServer())
      .post('/api/vehicles/with-photos')
      .auth(token, { type: 'bearer' })
      .field('brand', 'Test')
      .field('model', 'Color')
      .field('acquisitionType', 'stock')
      .field('status', 'prePurchase')
      .field('color', 'BLUE')
      .field('paintCondition', 'TOUCHED_UP');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX9sAAAAASUVORK5CYII=',
      'base64',
    );
    for (let i = 0; i < 3; i++)
      call = call.attach('photos', Buffer.concat([png, Buffer.from([i])]), {
        filename: `photo-${i}.png`,
        contentType: 'image/png',
      });
    const response = await call.expect(201);
    expect(response.body.data).toMatchObject({
      color: 'BLUE',
      paintCondition: 'TOUCHED_UP',
      specs: { color: 'Bleu' },
    });
    const read = await request(app.getHttpServer())
      .get(`/api/vehicles/${response.body.data.id}`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(read.body.data).toMatchObject({
      color: 'BLUE',
      paintCondition: 'TOUCHED_UP',
    });
  });
  it('preserves legacy text when changing paint alone and synchronizes explicit color changes', async () => {
    const vehicle = await fixture();
    const paint = await patch(vehicle.id, {
      paintCondition: 'SCRATCHED',
    }).expect(200);
    expect(paint.body.data).toMatchObject({
      color: 'OTHER',
      paintCondition: 'SCRATCHED',
      specs: { color: 'Bleu nuit métallisé' },
    });
    const color = await patch(vehicle.id, { color: 'WHITE' }).expect(200);
    expect(color.body.data).toMatchObject({
      color: 'WHITE',
      paintCondition: 'SCRATCHED',
      specs: { color: 'Blanc' },
    });
    const cleared = await patch(vehicle.id, { color: null }).expect(200);
    expect(cleared.body.data).toMatchObject({
      color: null,
      paintCondition: 'SCRATCHED',
      specs: { color: null },
    });
  });
  it('supports legacy specs writes without touching paint', async () => {
    const vehicle = await fixture();
    await request(app.getHttpServer())
      .put(`/api/vehicles/${vehicle.id}/specs`)
      .auth(token, { type: 'bearer' })
      .send({ color: 'ARGENTÉ' })
      .expect(200);
    expect(
      await prisma.vehicle.findUnique({
        where: { id: vehicle.id },
        include: { specs: true },
      }),
    ).toMatchObject({
      color: 'SILVER',
      paintCondition: 'UNKNOWN',
      specs: { color: 'ARGENTÉ' },
    });
  });
  it.each([
    { color: 'SCRATCHED' },
    { paintCondition: 'BLUE' },
    { paintCondition: null },
    { color: 'invalid' },
  ])('rejects mixed/invalid values %j without server errors', async (body) => {
    const vehicle = await fixture();
    await patch(vehicle.id, body).expect(400);
    expect(
      await prisma.vehicle.findUnique({ where: { id: vehicle.id } }),
    ).toMatchObject({ color: 'OTHER', paintCondition: 'UNKNOWN' });
  });
  it('rejects cross-tenant and unauthorized writes', async () => {
    const org = await prisma.organization.create({
      data: { name: 'Other paint tenant', type: 'test' },
    });
    const other = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        brand: 'Other',
        model: 'Test',
        acquisitionType: 'stock',
        status: 'prePurchase',
      },
    });
    await patch(other.id, { color: 'BLACK' }).expect(404);
    await request(app.getHttpServer())
      .put(`/api/vehicles/${other.id}/specs`)
      .auth(token, { type: 'bearer' })
      .send({ color: 'Black' })
      .expect(404);
    const vehicle = await fixture();
    await prisma.userRole.deleteMany({ where: { userId } });
    await patch(vehicle.id, { color: 'BLACK' }).expect(403);
  });
});
