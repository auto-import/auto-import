import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client as PgClient } from 'pg';
import * as bcrypt from 'bcrypt';
import request, { Response } from 'supertest';
import { ALL_PERMISSIONS } from '@auto-import/contracts';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

function data<T = any>(response: Response): T {
  if (!response.body.success)
    throw new Error(`${response.status}: ${response.text}`);
  return response.body.data as T;
}

// Fixtures are created exclusively in a new isolated regression database.
// No existing ERP records are changed or deleted by this suite.
describe('Persisted ERP reference, inventory and shipment flows', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let org: string;
  let otherOrg: string;
  let actor: string;
  let token: string;
  let otherToken: string;
  let readOnlyToken: string;
  let clientId: string;
  let departurePortId: string;
  let arrivalPortId: string;
  let countryId: string;

  async function boot() {
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
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    prisma = app.get(PrismaService);
  }

  async function account(organizationId: string, readOnly = false) {
    const permissions = await prisma.permission.findMany({
      where: readOnly ? { action: 'read' } : {},
    });
    const role = await prisma.role.create({
      data: {
        organizationId,
        name: `Regression ${randomUUID()}`,
        rolePermissions: {
          create: permissions.map((permission) => ({
            permissionId: permission.id,
          })),
        },
      },
    });
    const password = randomBytes(24).toString('base64url');
    const user = await prisma.user.create({
      data: {
        organizationId,
        email: `${randomUUID()}@example.test`,
        firstName: 'Regression',
        lastName: 'Persistence',
        passwordHash: await bcrypt.hash(password, 4),
        status: 'active',
        userRoles: { create: { roleId: role.id } },
      },
    });
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password });
    return { token: data(response).accessToken as string, id: user.id };
  }
  const get = (path: string, access = token) =>
    request(app.getHttpServer())
      .get(`/api${path}`)
      .auth(access, { type: 'bearer' });
  const post = (path: string, payload: unknown, access = token) =>
    request(app.getHttpServer())
      .post(`/api${path}`)
      .auth(access, { type: 'bearer' })
      .send(payload as object);
  const stock = (
    organizationId = org,
    status = 'available',
    acquisitionType = 'stock',
  ) =>
    prisma.vehicle.create({
      data: {
        organizationId,
        brand: 'Regression',
        model: randomUUID(),
        vin: randomUUID(),
        acquisitionType,
        status,
      },
    });
  const shipment = (
    containerType = 'THREE_VEHICLES',
    vehicleIds: string[] = [],
  ) =>
    post('/shipments', {
      containerType,
      departurePortId,
      arrivalPortId,
      vehicleIds,
      containerNumber: randomUUID(),
      vesselName: 'Regression vessel',
      blNumber: randomUUID(),
      etd: '2026-10-01',
      eta: '2026-10-20',
      totalFreightCost: 120000,
      freightCurrency: 'DZD',
    });

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !url.pathname.startsWith('/codex_dossier_fix_')
    )
      throw new Error(
        'Use an isolated local codex_dossier_fix_* database only.',
      );
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('base64url');
    process.env.PII_ENCRYPTION_KEY = randomBytes(48).toString('base64url');
    process.env.PII_LOOKUP_HMAC_KEY = randomBytes(48).toString('base64url');
    process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY =
      randomBytes(48).toString('base64url');
    await boot();
    org = (
      await prisma.organization.create({
        data: { name: 'Persistence regression A', type: 'test' },
      })
    ).id;
    otherOrg = (
      await prisma.organization.create({
        data: { name: 'Persistence regression B', type: 'test' },
      })
    ).id;
    await prisma.permission.createMany({
      data: ALL_PERMISSIONS.map((permission) => {
        const [resource, action] = permission.split(':');
        return { resource, action };
      }),
      skipDuplicates: true,
    });
    const primary = await account(org);
    actor = primary.id;
    token = primary.token;
    otherToken = (await account(otherOrg)).token;
    readOnlyToken = (await account(org, true)).token;
    clientId = data(
      await post('/clients', {
        firstName: 'Persistence',
        lastName: randomUUID(),
      }),
    ).id;
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('safely backfills legacy ports and container types without changing legacy text or inventing port codes', async () => {
    const pg = new PgClient({ connectionString: process.env.DATABASE_URL });
    await pg.connect();
    try {
      await pg.query('BEGIN');
      const schema = `migration_${randomUUID().replaceAll('-', '')}`;
      await pg.query(`CREATE SCHEMA "${schema}"`);
      await pg.query(`SET LOCAL search_path TO "${schema}"`);
      await pg.query(`CREATE TABLE "Organization" (id TEXT PRIMARY KEY);
        CREATE TABLE "ContainerPreset" (id TEXT PRIMARY KEY, "maxVehicles" INTEGER);
        CREATE TABLE "Shipment" (id TEXT PRIMARY KEY, "organizationId" TEXT, "containerPresetId" TEXT, "departurePort" TEXT, "arrivalPort" TEXT);
        INSERT INTO "Organization" VALUES ('legacy-org');
        INSERT INTO "ContainerPreset" VALUES ('preset-three', 3);
        INSERT INTO "Shipment" VALUES ('legacy-shipment', 'legacy-org', 'preset-three', 'Shanghai (CNSHA)', 'Port sans code');`);
      const sql = await readFile(
        join(
          __dirname,
          '../prisma/migrations/20260911120000_persistent_shipping_references/migration.sql',
        ),
        'utf8',
      );
      await pg.query(sql);
      const {
        rows: [row],
      } = await pg.query('SELECT * FROM "Shipment"');
      expect(row).toMatchObject({
        id: 'legacy-shipment',
        departurePort: 'Shanghai (CNSHA)',
        arrivalPort: 'Port sans code',
        containerType: 'THREE_VEHICLES',
        arrivalPortId: null,
      });
      expect(row.departurePortId).toBeTruthy();
      expect((await pg.query('SELECT name, code FROM "Port"')).rows).toEqual([
        { name: 'Shanghai', code: 'CNSHA' },
      ]);
    } finally {
      await pg.query('ROLLBACK');
      await pg.end();
    }
  });

  it('persists normalized custom ports, enforces duplicates, JWT, RBAC and tenant boundaries', async () => {
    departurePortId = data(
      await post('/ports', {
        name: 'Ningbo',
        code: ' cnngb ',
        country: 'Chine',
      }),
    ).id;
    arrivalPortId = data(
      await post('/ports', { name: 'Djen Djen', code: 'DZDJE' }),
    ).id;
    expect(data(await get('/ports'))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: departurePortId, code: 'CNNGB' }),
      ]),
    );
    expect(data(await get('/ports', otherToken))).toEqual([]);
    expect(
      (await post('/ports', { name: 'Duplicate', code: 'CNNGB' })).status,
    ).toBe(409);
    expect(
      (
        await post('/ports', {
          name: 'Invalid',
          code: 'AB',
          organizationId: otherOrg,
        })
      ).status,
    ).toBe(400);
    expect(
      (await post('/ports', { name: 'Forbidden', code: 'AB' }, readOnlyToken))
        .status,
    ).toBe(403);
    expect((await request(app.getHttpServer()).get('/api/ports')).status).toBe(
      401,
    );
    expect((await post('/ports', { name: '   ', code: 'AB' })).status).toBe(
      400,
    );
    const foreign = data(
      await post('/ports', { name: 'Other tenant', code: 'OTHER' }, otherToken),
    );
    expect(
      (
        await post('/shipments', {
          containerType: 'THREE_VEHICLES',
          departurePortId: foreign.id,
        })
      ).status,
    ).toBe(404);
  });

  it('uses the existing COUNTRY entity for residence and nationality and persists both client foreign keys', async () => {
    const country = data(
      await post('/crm/reference-data', {
        kind: 'COUNTRY',
        labelFr: 'Pays de régression',
      }),
    );
    countryId = country.id;
    expect(data(await get('/crm/reference-data'))).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: countryId })]),
    );
    expect(data(await get('/crm/reference-data', otherToken))).toEqual([]);
    expect(
      (
        await post('/crm/reference-data', {
          kind: 'COUNTRY',
          labelFr: ' PAYS DE RÉGRESSION ',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await post(
          '/crm/reference-data',
          { kind: 'COUNTRY', labelFr: 'Forbidden' },
          readOnlyToken,
        )
      ).status,
    ).toBe(403);
    const saved = data(
      await post('/clients', {
        firstName: 'Reference',
        lastName: randomUUID(),
        countryId,
        nationalityCountryId: countryId,
      }),
    );
    const persisted = await prisma.client.findUniqueOrThrow({
      where: { id: saved.id },
    });
    expect(persisted.countryId).toBe(countryId);
    expect(persisted.nationalityCountryId).toBe(countryId);
    expect(
      (
        await post(
          '/clients',
          { firstName: 'Foreign', lastName: 'Reference', countryId },
          otherToken,
        )
      ).status,
    ).toBe(404);
  });

  it.each([
    ['THREE_VEHICLES', 3],
    ['FOUR_VEHICLES', 4],
  ] as const)(
    'persists %s, ports, freight and 0..%i real vehicle relations; rejects overflow',
    async (type, capacity) => {
      expect(
        data(await get('/shipments/container-types')).map(
          (item: any) => item.code,
        ),
      ).toEqual(['THREE_VEHICLES', 'FOUR_VEHICLES']);
      const created = data(await shipment(type));
      for (let count = 0; count <= capacity; count++) {
        const loaded = data(await get(`/shipments/${created.id}`));
        expect(loaded.containerType).toBe(type);
        expect(loaded.capacity.maxVehicles).toBe(capacity);
        expect(loaded.vehicles).toHaveLength(count);
        expect(loaded.departurePortId).toBe(departurePortId);
        expect(loaded.arrivalPortId).toBe(arrivalPortId);
        expect(loaded.departurePort).toBe('Ningbo (CNNGB)');
        expect(Number(loaded.freightAmountDzd)).toBe(120000);
        if (count < capacity)
          expect(
            (
              await post(`/shipments/${created.id}/vehicles`, {
                vehicleId: (await stock()).id,
              })
            ).status,
          ).toBe(201);
      }
      const overflow = (await stock()).id;
      expect(
        (
          await post(`/shipments/${created.id}/vehicles`, {
            vehicleId: overflow,
            capacityOverride: true,
            overrideReason: 'Must still fail',
          })
        ).status,
      ).toBe(409);
      const ids = await Promise.all(
        Array.from({ length: capacity + 1 }, async () => (await stock()).id),
      );
      expect((await shipment(type, ids)).status).toBe(409);
      const initiallyAssigned = data(
        await shipment(type, ids.slice(0, capacity)),
      );
      expect(
        initiallyAssigned.vehicles.map((link: any) => link.vehicleId).sort(),
      ).toEqual(ids.slice(0, capacity).sort());
      expect(Number(initiallyAssigned.vehicles[0].freightShare)).toBe(
        120000 / capacity,
      );
      if (capacity === 4) {
        expect(
          (
            await request(app.getHttpServer())
              .put(`/api/shipments/${created.id}`)
              .auth(token, { type: 'bearer' })
              .send({ containerType: 'THREE_VEHICLES' })
          ).status,
        ).toBe(409);
      }
    },
  );

  it('serializes concurrent capacity checks and rolls back invalid initial relationships', async () => {
    const ids = await Promise.all(
      Array.from({ length: 4 }, async () => (await stock()).id),
    );
    const created = data(await shipment('THREE_VEHICLES', ids.slice(0, 2)));
    const responses = await Promise.all(
      ids
        .slice(2)
        .map((vehicleId) =>
          post(`/shipments/${created.id}/vehicles`, { vehicleId }),
        ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(data(await get(`/shipments/${created.id}`)).vehicles).toHaveLength(
      3,
    );
    const foreign = await stock(otherOrg);
    expect((await shipment('THREE_VEHICLES', [foreign.id])).status).toBe(404);
    expect((await shipment('THREE_VEHICLES', [randomUUID()])).status).toBe(404);
    expect((await shipment('THREE_VEHICLES', [ids[0]])).status).toBe(409);
  });

  it('filters available owned stock, atomically reserves its UUID, and exposes the same Vehicle in inventory and catalogue stock', async () => {
    const available = await stock();
    const reserved = await stock(org, 'reserved');
    const external = await stock(org, 'available', 'external');
    const unpurchased = await stock(org, 'available', 'chinaOffer');
    const foreign = await stock(otherOrg);
    const eligible = data(
      await get(
        `/vehicles/eligible-for-dossier?type=VEHICLE_SALE_CIF&search=${available.vin}`,
      ),
    );
    expect(eligible.items.map((item: any) => item.id)).toEqual([available.id]);
    for (const excluded of [reserved, external, unpurchased, foreign]) {
      expect(
        data(
          await get(
            `/vehicles/eligible-for-dossier?type=VEHICLE_SALE_CIF&search=${excluded.vin}`,
          ),
        ).items,
      ).toEqual([]);
    }
    const dossier = data(
      await post('/dossiers', {
        clientId,
        type: 'VEHICLE_SALE_CIF',
        vehicleIds: [available.id],
      }),
    );
    const link = await prisma.dossierVehicle.findUniqueOrThrow({
      where: {
        dossierId_vehicleId: { dossierId: dossier.id, vehicleId: available.id },
      },
    });
    expect(link.vehicleId).toBe(available.id);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: available.id } }))
        .status,
    ).toBe('reserved');
    expect(
      data(await get(`/vehicles/${available.id}`)).dossiers.map(
        (item: any) => item.id,
      ),
    ).toContain(dossier.id);
    expect(
      data(await get(`/dossiers/${dossier.id}`)).vehicles.map(
        (item: any) => item.id,
      ),
    ).toContain(available.id);
    // This is the exact endpoint used by the Catalogue stock view and inventory.
    expect(
      data(await get(`/vehicles?inventoryOnly=true&search=${available.vin}`))
        .items[0],
    ).toMatchObject({ id: available.id, status: 'reserved' });
    expect(
      data(
        await get(
          `/vehicles/eligible-for-dossier?type=VEHICLE_SALE_CIF&search=${available.vin}`,
        ),
      ).items,
    ).toEqual([]);
    expect(
      (await post('/dossiers', { clientId, vehicleIds: [available.id] }))
        .status,
    ).toBe(409);
    expect(
      (await post('/dossiers', { clientId, vehicleIds: [foreign.id] })).status,
    ).toBe(404);
    expect(
      (await post('/dossiers', { clientId, vehicleIds: [external.id] })).status,
    ).toBe(409);
    const racing = await stock();
    const responses = await Promise.all(
      [1, 2].map(() =>
        post('/dossiers', { clientId, vehicleIds: [racing.id] }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
  });

  it('moves unassigned stock into transit while preserving dossier-owned status rules', async () => {
    const vehicle = await stock();
    const created = data(await shipment('THREE_VEHICLES', [vehicle.id]));
    for (const status of ['booked', 'loading', 'inTransit'])
      expect(
        (await post(`/shipments/${created.id}/transition`, { status })).status,
      ).toBe(201);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } }))
        .status,
    ).toBe('inTransit');
    expect(
      (
        await post(`/shipments/${created.id}/vehicles`, {
          vehicleId: (await stock()).id,
        })
      ).status,
    ).toBe(409);
  });

  it('reloads ports and countries through a fresh NestJS/Prisma instance after restart', async () => {
    await app.close();
    await boot();
    expect(data(await get('/ports')).map((port: any) => port.id)).toContain(
      departurePortId,
    );
    expect(
      data(await get('/crm/reference-data')).map((country: any) => country.id),
    ).toContain(countryId);
    expect(
      data(await get('/ports', otherToken)).map((port: any) => port.id),
    ).not.toContain(departurePortId);
  }, 30000);
});
