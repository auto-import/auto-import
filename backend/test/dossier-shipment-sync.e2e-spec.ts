import { ALL_PERMISSIONS } from '@auto-import/contracts';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as bcrypt from 'bcrypt';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { DocumentsService } from '../src/documents/documents.service';
import { ShipmentsService } from '../src/shipments/shipments.service';
import { CustomsService } from '../src/customs/customs.service';
import { ConflictException } from '@nestjs/common';

function dataOf<T>(response: Response): T {
  const body = JSON.parse(response.text) as { success: boolean; data: T };
  if (!body.success)
    throw new Error(`HTTP ${response.status}: ${response.text}`);
  return body.data;
}

describe('Section 1: dossier and maritime shipment on PostgreSQL', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let organizationId: string;
  let clientId: string;
  let userId: string;
  let storageRoot: string;
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
    const password = randomBytes(24).toString('base64url');
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
    clientId = (
      await prisma.client.create({
        data: { organizationId, firstName: 'Regression', lastName: 'Client' },
      })
    ).id;
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });

  async function fixture(
    status = 'inTransit',
    type: 'VEHICLE_SALE_DDP' | 'SHIPPING_ONLY' = 'VEHICLE_SALE_DDP',
    shipmentStatus = 'inTransit',
  ) {
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId,
        acquisitionType: 'stock',
        brand: 'Regression',
        model: 'Maritime',
        status: 'inTransit',
      },
    });
    const dossier = await prisma.dossier.create({
      data: {
        organizationId,
        reference: `SYNC-${randomUUID()}`,
        clientId,
        salesUserId: userId,
        status,
        type,
        dossierVehicles: { create: { vehicleId: vehicle.id } },
      },
    });
    const shipment = await prisma.shipment.create({
      data: {
        organizationId,
        shipmentNumber: `SYNC-${randomUUID()}`,
        status: shipmentStatus,
        containerType: 'THREE_VEHICLES',
        vehicles: { create: { vehicleId: vehicle.id, addedBy: userId } },
      },
    });
    return { dossier, vehicle, shipment };
  }
  function transition(id: string, status: string) {
    return request(app.getHttpServer())
      .patch(`/api/dossiers/${id}/status`)
      .auth(token, { type: 'bearer' })
      .send({ status });
  }
  async function arrivalPhoto(dossierId: string, vehicleId: string) {
    const buffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX9sAAAAASUVORK5CYII=',
      'base64',
    );
    await app.get(DocumentsService).uploadCheckpointEvidence(
      organizationId,
      dossierId,
      userId,
      {
        originalname: 'arrival.png',
        mimetype: 'image/png',
        buffer,
      },
      { vehicleId, checkpoint: 'ARRIVAL_AT_PORT' },
    );
  }

  it('advances the shared voyage on DDP arrival, creates customs once, and refuses both backwards transitions', async () => {
    const { dossier, vehicle, shipment } = await fixture();
    const otherVehicle = await prisma.vehicle.create({
      data: {
        organizationId,
        acquisitionType: 'stock',
        brand: 'Other',
        model: 'Vehicle',
        status: 'reserved',
      },
    });
    const otherDossier = await prisma.dossier.create({
      data: {
        organizationId,
        reference: `OTHER-${randomUUID()}`,
        clientId,
        salesUserId: userId,
        status: 'shipmentBooking',
        type: 'VEHICLE_SALE_DDP',
        dossierVehicles: { create: { vehicleId: otherVehicle.id } },
      },
    });
    await prisma.shipmentVehicle.create({
      data: { shipmentId: shipment.id, vehicleId: otherVehicle.id },
    });
    // Evidence is still mandatory and denial changes neither side.
    await transition(dossier.id, 'arrivedAtPort').expect(409);
    expect(
      (await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }))
        .status,
    ).toBe('inTransit');
    await arrivalPhoto(dossier.id, vehicle.id);
    await transition(dossier.id, 'arrivedAtPort').expect(200);
    const result = dataOf<any>(
      await request(app.getHttpServer())
        .get(`/api/shipments/${shipment.id}`)
        .auth(token, { type: 'bearer' })
        .expect(200),
    );
    expect(result.status).toBe('arrived');
    expect(result.actualArrivalDate).toBeTruthy();
    expect(result.statusHistory).toHaveLength(1);
    expect(result.statusHistory[0]).toMatchObject({
      fromStatus: 'inTransit',
      toStatus: 'arrived',
      changedBy: userId,
    });
    expect(result.statusHistory[0].comment).toContain(dossier.id);
    expect(
      await prisma.customsFile.count({ where: { shipmentId: shipment.id } }),
    ).toBe(2);
    expect(
      (
        await prisma.dossier.findUniqueOrThrow({
          where: { id: otherDossier.id },
        })
      ).status,
    ).toBe('shipmentBooking');
    await transition(otherDossier.id, 'loading').expect(200);
    expect(
      (await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }))
        .status,
    ).toBe('arrived');
    expect(
      await prisma.shipmentStatusHistory.count({
        where: { shipmentId: shipment.id },
      }),
    ).toBe(1);
    await transition(dossier.id, 'inTransit').expect(409);
    await request(app.getHttpServer())
      .post(`/api/shipments/${shipment.id}/transition`)
      .auth(token, { type: 'bearer' })
      .send({ status: 'inTransit' })
      .expect(409);
  });

  it('synchronizes shipping-only loading and arrival without requiring DDP checkpoint evidence', async () => {
    const loading = await fixture('booking', 'SHIPPING_ONLY', 'booked');
    await transition(loading.dossier.id, 'loading').expect(200);
    expect(
      (
        await prisma.shipment.findUniqueOrThrow({
          where: { id: loading.shipment.id },
        })
      ).status,
    ).toBe('loading');
    const arriving = await fixture('inTransit', 'SHIPPING_ONLY');
    await transition(arriving.dossier.id, 'arrived').expect(200);
    expect(
      (
        await prisma.shipment.findUniqueOrThrow({
          where: { id: arriving.shipment.id },
        })
      ).status,
    ).toBe('arrived');
  });

  it('rolls back dossier, vehicle, shipment, history and customs if the arrival automation fails', async () => {
    const { dossier, vehicle, shipment } = await fixture(
      'inTransit',
      'SHIPPING_ONLY',
    );
    const service = app.get(ShipmentsService);
    const spy = jest
      .spyOn(service as any, 'createCustomsFilesInTransaction')
      .mockRejectedValueOnce(
        new ConflictException('Injected arrival conflict'),
      );
    try {
      await transition(dossier.id, 'arrived').expect(409);
    } finally {
      spy.mockRestore();
    }
    expect(
      (await prisma.dossier.findUniqueOrThrow({ where: { id: dossier.id } }))
        .status,
    ).toBe('inTransit');
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } }))
        .status,
    ).toBe('inTransit');
    expect(
      (await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }))
        .status,
    ).toBe('inTransit');
    expect(
      await prisma.dossierStatusHistory.count({
        where: { dossierId: dossier.id },
      }),
    ).toBe(0);
    expect(
      await prisma.shipmentStatusHistory.count({
        where: { shipmentId: shipment.id },
      }),
    ).toBe(0);
    expect(
      await prisma.customsFile.count({ where: { shipmentId: shipment.id } }),
    ).toBe(0);
  });

  it('does not touch another tenant even if a legacy shipment link crosses tenants', async () => {
    const { dossier, vehicle } = await fixture(
      'booking',
      'SHIPPING_ONLY',
      'booked',
    );
    const foreign = await prisma.organization.create({
      data: { name: 'Other maritime tenant', type: 'test' },
    });
    const shipment = await prisma.shipment.create({
      data: {
        organizationId: foreign.id,
        shipmentNumber: `FOREIGN-${randomUUID()}`,
        status: 'booked',
        vehicles: { create: { vehicleId: vehicle.id } },
      },
    });
    await transition(dossier.id, 'loading').expect(200);
    expect(
      (await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }))
        .status,
    ).toBe('booked');
    await request(app.getHttpServer())
      .get(`/api/shipments/${shipment.id}`)
      .auth(token, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/dossiers/${dossier.id}/status`)
      .send({ status: 'inTransit' })
      .expect(401);
  });

  it('serializes concurrent arrivals from two dossiers in the same container without duplicate history or customs', async () => {
    const first = await fixture('inTransit', 'SHIPPING_ONLY');
    const second = await fixture('inTransit', 'SHIPPING_ONLY');
    await prisma.shipmentVehicle.deleteMany({
      where: { shipmentId: second.shipment.id },
    });
    await prisma.shipmentVehicle.create({
      data: { shipmentId: first.shipment.id, vehicleId: second.vehicle.id },
    });
    const responses = await Promise.all([
      transition(first.dossier.id, 'arrived'),
      transition(second.dossier.id, 'arrived'),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(
      await prisma.shipmentStatusHistory.count({
        where: { shipmentId: first.shipment.id },
      }),
    ).toBe(1);
    expect(
      await prisma.customsFile.count({
        where: { shipmentId: first.shipment.id },
      }),
    ).toBe(2);
    expect(
      await prisma.dossier.count({
        where: {
          id: { in: [first.dossier.id, second.dossier.id] },
          status: 'arrived',
        },
      }),
    ).toBe(2);
  });

  it('synchronizes the explicit CustomsFile link when customs advances the parent DDP dossier', async () => {
    const { dossier, shipment } = await fixture('arrivedAtPort');
    await prisma.shipmentVehicle.deleteMany({
      where: { shipmentId: shipment.id },
    });
    const file = await prisma.customsFile.create({
      data: {
        organizationId,
        reference: `CUSTOMS-${randomUUID()}`,
        dossierId: dossier.id,
        shipmentId: shipment.id,
        status: 'open',
        v2Status: 'FILE_TRANSMITTED',
        responsibleUserId: userId,
      },
    });
    await app
      .get(CustomsService)
      .transition(file.id, organizationId, userId, {
        status: 'CLEARANCE_IN_PROGRESS',
      });
    expect(
      (await prisma.dossier.findUniqueOrThrow({ where: { id: dossier.id } }))
        .status,
    ).toBe('customsClearance');
    expect(
      (await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }))
        .status,
    ).toBe('arrived');
  });
});
