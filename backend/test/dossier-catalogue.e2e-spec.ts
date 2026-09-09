import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as bcrypt from 'bcrypt';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { ALL_PERMISSIONS } from '@auto-import/contracts';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { DossiersService } from '../src/dossiers/dossiers.service';
import { CostsService } from '../src/finance/costs.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import PDFDocument from 'pdfkit';

function dataOf<T>(response: Response): T {
  const body = JSON.parse(response.text) as { success: boolean; data: T };
  if (!body.success)
    throw new Error(`HTTP ${response.status}: ${response.text}`);
  return body.data;
}

describe('Catalogue → dossier on migrated PostgreSQL', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let organizationId: string;
  let clientId: string;
  let userId: string;
  let supplierId: string;
  let storageRoot: string;
  let browserEmail: string;
  let browserPassword: string;

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
    browserEmail = user.email;
    browserPassword = password;
    const session = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password });
    token = dataOf<{ accessToken: string }>(session).accessToken;
    clientId = (
      await prisma.client.create({
        data: { organizationId, firstName: 'Regression', lastName: 'Client' },
      })
    ).id;
    supplierId = (
      await prisma.partner.create({
        data: {
          organizationId,
          name: 'Regression supplier',
          type: 'supplier',
          status: 'active',
        },
      })
    ).id;
    for (const currency of ['USD', 'CNY']) {
      await prisma.exchangeRate.create({
        data: {
          organizationId,
          baseCurrency: currency,
          quoteCurrency: 'DZD',
          rate: currency === 'USD' ? 250 : 35,
          effectiveAt: new Date('2020-01-01'),
          createdById: userId,
        },
      });
    }
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });

  async function catalogue(currency: 'USD' | 'CNY', priceBasis: 'CIF' | 'DDP') {
    const offerResponse = await request(app.getHttpServer())
      .post('/api/offers')
      .auth(token, { type: 'bearer' })
      .send({
        supplierId,
        brand: 'Geely',
        model: `Regression-${randomUUID()}`,
        condition: 'new',
        specification: { engine: '1.5' },
        supplierPrice: 8000,
        currency,
        incoterm: 'FOB',
        validFrom: '2020-01-01T00:00:00.000Z',
        validUntil: '2099-12-31T00:00:00.000Z',
        availableQuantity: 20,
      });
    const offer = dataOf<{ id: string; vehicles: Array<{ id: string }> }>(
      offerResponse,
    );
    const quotationPayload = {
      sourceOfferId: offer.id,
      sourceOfferVehicleId: offer.vehicles[0].id,
      priceBasis,
      vehicleAmount: 8000,
      vehicleCurrency: currency,
      containerPrice: 600,
      containerCurrency: currency,
      containerAllocation: 3,
      insuranceAmount: 100,
      insuranceCurrency: currency,
      transitCurrency: 'DZD',
      transitAmount: 10000,
      customsAmount: priceBasis === 'DDP' ? 500000 : 0,
      sellingPriceDzd: 3000000,
    };
    const quotationResponse = await request(app.getHttpServer())
      .post('/api/quotations')
      .auth(token, { type: 'bearer' })
      .send(quotationPayload);
    const quotation = dataOf<{ id: string; currentRevision: { id: string } }>(
      quotationResponse,
    );
    const item = await prisma.catalogueItem.findUniqueOrThrow({
      where: { sourceOfferVehicleId: offer.vehicles[0].id },
    });
    const selected = await request(app.getHttpServer())
      .get(`/api/catalogue/${item.id}`)
      .auth(token, { type: 'bearer' });
    expect(selected.status).toBe(200);
    expect(
      dataOf<{ dossierEligibility: { cif: boolean; ddp: boolean } }>(selected)
        .dossierEligibility[priceBasis === 'CIF' ? 'cif' : 'ddp'],
    ).toBe(true);
    const rawOffer = await prisma.chinaOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });
    expect(rawOffer.cifPrice).toBeNull();
    expect(rawOffer.ddpPrice).toBeNull();
    return { item, offer, quotation, quotationPayload };
  }

  function createDossier(itemId: string, basis = 'CIF') {
    return request(app.getHttpServer())
      .post('/api/dossiers')
      .auth(token, { type: 'bearer' })
      .send({
        clientId,
        type: `VEHICLE_SALE_${basis}`,
        catalogueItemId: itemId,
      });
  }

  function testContractPdf() {
    return new Promise<Buffer>((resolve) => {
      const doc = new PDFDocument();
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.text('Signed test contract - disposable regression database only');
      doc.end();
    });
  }
  async function signedDossier(currency: 'USD' | 'CNY') {
    const { item } = await catalogue(currency, 'CIF');
    const created = dataOf<{ id: string; vehicles: Array<{ id: string }> }>(
      await createDossier(item.id),
    );
    expect(created.vehicles).toHaveLength(1);
    const transition = (payload: Record<string, unknown>) =>
      request(app.getHttpServer())
        .patch(`/api/dossiers/${created.id}/status`)
        .auth(token, { type: 'bearer' })
        .send(payload);
    expect((await transition({ status: 'clientConfirmed' })).status).toBe(200);
    const pdf = await testContractPdf();
    const uploaded = await request(app.getHttpServer())
      .post('/api/documents/upload')
      .auth(token, { type: 'bearer' })
      .field('dossierId', created.id)
      .field('kind', 'CONTRACT')
      .field('documentType', 'SIGNED_CONTRACT')
      .attach('file', pdf, {
        filename: 'contract.pdf',
        contentType: 'application/pdf',
      });
    expect(uploaded.status).toBe(201);
    expect((await transition({ status: 'contractSigned' })).status).toBe(200);
    return { ...created, transition, item };
  }

  it.each(['USD', 'CNY'] as const)(
    'persists %s deposit, dossier vehicle, booking and purchase through real HTTP workflow',
    async (currency) => {
      const dossier = await signedDossier(currency);
      const rate = await prisma.exchangeRate.findFirstOrThrow({
        where: { organizationId, baseCurrency: currency, isActive: true },
        orderBy: { effectiveAt: 'desc' },
      });
      const date = new Date().toISOString().slice(0, 10);
      const deposit = await dossier.transition({
        status: 'depositReceived',
        deposit: {
          amount: 10000.25,
          currency,
          exchangeRateId: rate.id,
          paymentMethod: 'BANK_TRANSFER',
          receivedAt: date,
        },
      });
      expect(deposit.status).toBe(200);
      const unrelated = await dossier.transition({
        status: 'vehicleBooking',
        vehicleBooking: { vehicleId: randomUUID(), bookingDate: date },
      });
      expect(unrelated.status).toBe(400);
      expect(unrelated.text).toContain('ne fait pas partie');
      const bookings = await Promise.all(
        [0, 1].map(() =>
          dossier.transition({
            status: 'vehicleBooking',
            vehicleBooking: {
              vehicleId: dossier.vehicles[0].id,
              bookingDate: date,
            },
          }),
        ),
      );
      expect(bookings.map((r) => r.status).sort()).toEqual([200, 409]);
      const purchase = await dossier.transition({
        status: 'purchaseConfirmed',
        purchase: {
          invoiceNumber: `TEST-${randomUUID()}`,
          amount: 8000.15,
          currency,
          exchangeRateId: rate.id,
          supplierId,
          invoiceDate: date,
        },
      });
      expect(purchase.status).toBe(200);
      const original = await prisma.financeTransaction.findMany({
        where: { dossierId: dossier.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(original).toHaveLength(2);
      expect(original.map((row) => row.amountDzd.toString())).toEqual([
        rate.rate.mul('10000.25').toDecimalPlaces(2).toString(),
        rate.rate.mul('8000.15').toDecimalPlaces(2).toString(),
      ]);
      const changedRate = await prisma.exchangeRate.create({
        data: {
          organizationId,
          baseCurrency: currency,
          quoteCurrency: 'DZD',
          rate: rate.rate.add(5),
          effectiveAt: new Date(),
        },
      });
      const reloaded = await request(app.getHttpServer())
        .get(`/api/dossiers/${dossier.id}`)
        .auth(token, { type: 'bearer' });
      expect(
        dataOf<{
          vehicles: Array<{ id: string }>;
          vehicleBookingVehicleId: string;
        }>(reloaded),
      ).toMatchObject({
        vehicles: [{ id: dossier.vehicles[0].id }],
        vehicleBookingVehicleId: dossier.vehicles[0].id,
      });
      expect(
        await prisma.vehicle.count({
          where: { sourceOfferVehicleId: dossier.item.sourceOfferVehicleId },
        }),
      ).toBe(1);
      const stored = await prisma.financeTransaction.findMany({
        where: { dossierId: dossier.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(stored.map((row) => row.amountDzd.toString())).toEqual(
        original.map((row) => row.amountDzd.toString()),
      );
      await prisma.exchangeRate.update({
        where: { id: changedRate.id },
        data: { isActive: false },
      });
    },
  );

  it('rejects missing rates, arbitrary currencies and stale displayed rates without changing the dossier', async () => {
    const dossier = await signedDossier('USD');
    const deposit = {
      amount: 10000,
      currency: 'USD',
      paymentMethod: 'CASH',
      receivedAt: new Date().toISOString().slice(0, 10),
    };
    expect(
      (
        await dossier.transition({
          status: 'depositReceived',
          deposit: { ...deposit, currency: 'usd' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await dossier.transition({
          status: 'depositReceived',
          deposit: { ...deposit, exchangeRateId: randomUUID() },
        })
      ).status,
    ).toBe(409);
    const active = await prisma.exchangeRate.findMany({
      where: { organizationId, baseCurrency: 'USD', isActive: true },
    });
    await prisma.exchangeRate.updateMany({
      where: { id: { in: active.map((r) => r.id) } },
      data: { isActive: false },
    });
    expect(
      (await dossier.transition({ status: 'depositReceived', deposit })).status,
    ).toBe(409);
    expect(
      await prisma.payment.count({ where: { dossierId: dossier.id } }),
    ).toBe(0);
    expect(
      (await prisma.dossier.findUniqueOrThrow({ where: { id: dossier.id } }))
        .status,
    ).toBe('contractSigned');
    await prisma.exchangeRate.updateMany({
      where: { id: { in: active.map((r) => r.id) } },
      data: { isActive: true },
    });
  });

  it('backfills an existing catalogue dossier without duplicating an identifiable vehicle', async () => {
    const { item } = await catalogue('CNY', 'CIF');
    const source = await prisma.chinaOfferVehicle.findUniqueOrThrow({
      where: { id: item.sourceOfferVehicleId },
    });
    const vin = `MIGRATION-${randomUUID()}`;
    await prisma.chinaOfferVehicle.update({
      where: { id: source.id },
      data: { vin },
    });
    const existing = await prisma.vehicle.create({
      data: {
        organizationId,
        vin,
        brand: source.brand,
        model: source.model,
        currency: 'CNY',
        acquisitionType: 'chinaOffer',
      },
    });
    const legacy = await prisma.dossier.create({
      data: {
        organizationId,
        reference: `LEGACY-${randomUUID()}`,
        clientId,
        salesUserId: userId,
        catalogueItemId: item.id,
        status: 'depositReceived',
      },
    });
    const migration = await readFile(
      join(
        process.cwd(),
        'prisma/migrations/20260909180000_catalogue_dossier_vehicle_link/migration.sql',
      ),
      'utf8',
    );
    const backfill = migration.match(/DO \$\$[\s\S]*?END \$\$;/)?.[0];
    if (!backfill) throw new Error('Migration backfill block missing');
    await prisma.$executeRawUnsafe(backfill);
    await prisma.$executeRawUnsafe(backfill);
    expect(
      await prisma.dossierVehicle.findMany({ where: { dossierId: legacy.id } }),
    ).toEqual([expect.objectContaining({ vehicleId: existing.id })]);
    expect(await prisma.vehicle.count({ where: { vin } })).toBe(1);
    const detail = await request(app.getHttpServer())
      .get(`/api/dossiers/${legacy.id}`)
      .auth(token, { type: 'bearer' });
    expect(
      dataOf<{ vehicles: Array<{ id: string }> }>(detail).vehicles[0].id,
    ).toBe(existing.id);
  });

  it('preserves freight snapshots on metadata edits, and recalculates an explicit amount/currency edit', async () => {
    const date = new Date();
    const usd = await prisma.exchangeRate.findFirstOrThrow({
      where: { organizationId, baseCurrency: 'USD', isActive: true },
      orderBy: { effectiveAt: 'desc' },
    });
    const cny = await prisma.exchangeRate.findFirstOrThrow({
      where: { organizationId, baseCurrency: 'CNY', isActive: true },
      orderBy: { effectiveAt: 'desc' },
    });
    const created = await request(app.getHttpServer())
      .post('/api/shipments')
      .auth(token, { type: 'bearer' })
      .send({ totalFreightCost: 10000.25, freightCurrency: 'USD' });
    expect(created.status).toBe(201);
    const shipment = dataOf<{ id: string; freightAmountDzd: string }>(created);
    expect(shipment.freightAmountDzd).toBe(
      usd.rate.mul('10000.25').toDecimalPlaces(2).toString(),
    );
    const newer = await prisma.exchangeRate.create({
      data: {
        organizationId,
        baseCurrency: 'USD',
        quoteCurrency: 'DZD',
        rate: usd.rate.add(5),
        effectiveAt: date,
      },
    });
    const edited = await request(app.getHttpServer())
      .put(`/api/shipments/${shipment.id}`)
      .auth(token, { type: 'bearer' })
      .send({ notes: 'Updated metadata' });
    expect(edited.status).toBe(200);
    expect(
      (
        await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })
      ).freightAmountDzd?.toString(),
    ).toBe(shipment.freightAmountDzd);
    expect(
      (
        await request(app.getHttpServer())
          .put(`/api/shipments/${shipment.id}`)
          .auth(token, { type: 'bearer' })
          .send({ totalFreightCost: 100, freightCurrency: 'CNY' })
      ).status,
    ).toBe(200);
    expect(
      (
        await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })
      ).freightAmountDzd?.toString(),
    ).toBe(cny.rate.mul(100).toString());
    await prisma.exchangeRate.update({
      where: { id: newer.id },
      data: { isActive: false },
    });
  });

  it.each([
    ['USD', 'CIF'],
    ['USD', 'DDP'],
    ['CNY', 'CIF'],
    ['CNY', 'DDP'],
  ] as const)(
    'creates %s → %s dossier from catalogue without legacy offer prices',
    async (currency, basis) => {
      const { item, quotation } = await catalogue(currency, basis);
      const response = await request(app.getHttpServer())
        .post('/api/dossiers')
        .auth(token, { type: 'bearer' })
        .send({
          clientId,
          type: `VEHICLE_SALE_${basis}`,
          catalogueItemId: item.id,
        });
      expect({ status: response.status, body: response.text }).toMatchObject({
        status: 201,
      });
      const dossier = dataOf<{ id: string }>(response);
      const stored = await prisma.dossier.findUniqueOrThrow({
        where: { id: dossier.id },
      });
      expect(stored.priceCurrency).toBe('DZD');
      expect(stored.commercialQuotationRevisionId).toBe(
        quotation.currentRevision.id,
      );
      expect(
        (basis === 'CIF' ? stored.cifPrice : stored.ddpPrice)?.toString(),
      ).toBe('3000000');
      const otherPrice = basis === 'CIF' ? stored.ddpPrice : stored.cifPrice;
      expect(otherPrice).toBeNull();
      const lines = await prisma.quotationCost.findMany({
        where: { revisionId: quotation.currentRevision.id },
      });
      expect(lines.every((line) => line.originalAmount.gt(0))).toBe(true);
      expect(lines.find((line) => line.costType === 'VEHICLE')?.currency).toBe(
        currency,
      );
      const detail = await request(app.getHttpServer())
        .get(`/api/dossiers/${stored.id}`)
        .auth(token, { type: 'bearer' });
      expect({ status: detail.status, body: detail.text }).toMatchObject({
        status: 200,
      });
      expect(
        dataOf<{ pricing: { available: boolean; locked: boolean } }>(detail)
          .pricing,
      ).toMatchObject({ available: true, locked: true });
      expect(
        await prisma.dossier.findUniqueOrThrow({ where: { id: stored.id } }),
      ).toEqual(stored);
    },
  );

  it('creates a dossier when historical references are ahead of CommerceSequence', async () => {
    const { item } = await catalogue('USD', 'DDP');
    const year = new Date().getUTCFullYear();
    await prisma.dossier.create({
      data: {
        organizationId,
        clientId,
        salesUserId: userId,
        reference: `CA-${year}-00051`,
      },
    });
    await prisma.commerceSequence.upsert({
      where: { organizationId_key: { organizationId, key: `dossier:${year}` } },
      create: { organizationId, key: `dossier:${year}`, value: 50 },
      update: { value: 50 },
    });
    const response = await request(app.getHttpServer())
      .post('/api/dossiers')
      .auth(token, { type: 'bearer' })
      .send({ clientId, type: 'VEHICLE_SALE_DDP', catalogueItemId: item.id });
    expect({ status: response.status, body: response.text }).toMatchObject({
      status: 201,
    });
    expect(dataOf<{ reference: string }>(response).reference).toBe(
      `CA-${year}-00052`,
    );
    const more = await Promise.all([
      createDossier(item.id, 'DDP'),
      createDossier(item.id, 'DDP'),
      createDossier(item.id, 'DDP'),
    ]);
    expect(more.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(
      new Set(more.map((r) => dataOf<{ reference: string }>(r).reference)).size,
    ).toBe(3);
    expect(
      (await prisma.catalogueItem.findUniqueOrThrow({ where: { id: item.id } }))
        .reservedQuantity,
    ).toBe(4);
  });

  it('initializes a missing sequence without colliding with an archived historical dossier', async () => {
    const org = await prisma.organization.create({
      data: { name: 'Imported references', type: 'test' },
    });
    const year = new Date().getUTCFullYear();
    // This tests the allocator directly using real PostgreSQL; API authorization
    // is covered by the catalogue cases, and no guard is overridden.
    const service = app.get(DossiersService);
    // Invoke the real allocator through a minimal tenant-consistent create.
    const localClient = await prisma.client.create({
      data: { organizationId: org.id, firstName: 'Import', lastName: 'Test' },
    });
    const localUser = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: `${randomUUID()}@example.test`,
        firstName: 'Import',
        lastName: 'Test',
        passwordHash: 'unused',
      },
    });
    const historical = await prisma.dossier.create({
      data: {
        organizationId: org.id,
        clientId: localClient.id,
        salesUserId: localUser.id,
        reference: `CA-${year}-00001`,
        archivedAt: new Date(),
      },
    });
    const result = await service.create(
      { clientId: localClient.id },
      localUser.id,
      org.id,
    );
    expect(result.reference).toBe(`CA-${year}-00002`);
    expect(
      (await prisma.dossier.findUniqueOrThrow({ where: { id: historical.id } }))
        .reference,
    ).toBe(`CA-${year}-00001`);
  });

  it.each(['DZD', 'USD', 'CNY'])(
    'creates from a stock vehicle in %s without requiring supplier-offer prices',
    async (currency) => {
      let upload = request(app.getHttpServer())
        .post('/api/vehicles/with-photos')
        .auth(token, { type: 'bearer' })
        .field('brand', 'Toyota')
        .field('model', `Stock-${randomUUID()}`)
        .field('vin', randomUUID())
        .field('acquisitionType', 'stock')
        .field('currency', currency)
        .field('purchasePrice', '10000');
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0VQAAAAASUVORK5CYII=',
        'base64',
      );
      for (let index = 0; index < 3; index++) {
        upload = upload.attach(
          'photos',
          Buffer.concat([png, Buffer.from([index])]),
          { filename: `fixture-${index}.png`, contentType: 'image/png' },
        );
      }
      const vehicleResponse = await upload;
      const vehicle = dataOf<{ id: string }>(vehicleResponse);
      const response = await request(app.getHttpServer())
        .post('/api/dossiers')
        .auth(token, { type: 'bearer' })
        .send({ clientId, type: 'VEHICLE_SALE_CIF', vehicleIds: [vehicle.id] });
      expect(response.status).toBe(201);
      const dossier = dataOf<{ id: string; vehicles: Array<{ id: string }> }>(
        response,
      );
      expect(dossier.vehicles.map((v) => v.id)).toContain(vehicle.id);
      const stored = await prisma.dossier.findUniqueOrThrow({
        where: { id: dossier.id },
      });
      expect(stored.cifPrice).toBeNull();
      expect(stored.ddpPrice).toBeNull();
      expect(stored.priceCurrency).toBeNull();
    },
  );

  it('rejects invalid vehicle IDs and currency payloads through DTO/business validation', async () => {
    const missing = await request(app.getHttpServer())
      .post('/api/dossiers')
      .auth(token, { type: 'bearer' })
      .send({ clientId, vehicleIds: [randomUUID()] });
    expect(missing.status).toBe(404);
    const invalid = await request(app.getHttpServer())
      .post('/api/vehicles')
      .auth(token, { type: 'bearer' })
      .send({
        brand: 'Invalid',
        model: 'Currency',
        acquisitionType: 'stock',
        currency: 'NYC',
      });
    expect(invalid.status).toBe(400);
    const injected = await request(app.getHttpServer())
      .post('/api/dossiers')
      .auth(token, { type: 'bearer' })
      .send({ clientId, priceCurrency: 'USD', cifPrice: 1 });
    expect(injected.status).toBe(400);
    expect((await createDossier(randomUUID())).status).toBe(404);
  });

  it('rejects missing, unpublished, expired, invalid-currency and cross-tenant catalogue pricing without reserving stock', async () => {
    const { item, quotation, offer } = await catalogue('USD', 'CIF');
    expect((await createDossier(item.id, 'DDP')).status).toBe(409);
    await prisma.customerQuotation.update({
      where: { id: quotation.id },
      data: { cataloguePublished: false },
    });
    expect((await createDossier(item.id)).status).toBe(409);
    await prisma.customerQuotation.update({
      where: { id: quotation.id },
      data: { cataloguePublished: true, expiresAt: new Date('2020-01-01') },
    });
    expect((await createDossier(item.id)).status).toBe(409);
    await prisma.customerQuotation.update({
      where: { id: quotation.id },
      data: { expiresAt: null, currency: 'USD' },
    });
    expect((await createDossier(item.id)).status).toBe(409);
    await prisma.customerQuotation.update({
      where: { id: quotation.id },
      data: { currency: 'DZD', currentRevisionId: null },
    });
    expect((await createDossier(item.id)).status).toBe(409);
    const otherOrg = await prisma.organization.create({
      data: { name: 'Foreign catalogue', type: 'test' },
    });
    await prisma.customerQuotation.update({
      where: { id: quotation.id },
      data: {
        currentRevisionId: quotation.currentRevision.id,
        organizationId: otherOrg.id,
      },
    });
    expect((await createDossier(item.id)).status).toBe(409);
    await prisma.customerQuotation.update({
      where: { id: quotation.id },
      data: { organizationId },
    });
    await prisma.catalogueItem.update({
      where: { id: item.id },
      data: { organizationId: otherOrg.id },
    });
    expect((await createDossier(item.id)).status).toBe(404);
    expect(
      (await prisma.chinaOffer.findUniqueOrThrow({ where: { id: offer.id } }))
        .reservedQuantity,
    ).toBe(0);
    expect(
      (await prisma.catalogueItem.findUniqueOrThrow({ where: { id: item.id } }))
        .reservedQuantity,
    ).toBe(0);
  });

  it('rolls back both reservations when parent-offer availability disagrees with the vehicle line', async () => {
    const { item, offer } = await catalogue('CNY', 'DDP');
    await prisma.chinaOffer.update({
      where: { id: offer.id },
      data: { availableQuantity: 0 },
    });
    expect((await createDossier(item.id, 'DDP')).status).toBe(409);
    expect(
      (await prisma.catalogueItem.findUniqueOrThrow({ where: { id: item.id } }))
        .reservedQuantity,
    ).toBe(0);
    expect(
      (
        await prisma.chinaOfferVehicle.findUniqueOrThrow({
          where: { id: item.sourceOfferVehicleId },
        })
      ).reservedQuantity,
    ).toBe(0);
    expect(
      await prisma.dossier.count({ where: { catalogueItemId: item.id } }),
    ).toBe(0);
  });

  it('allows only one concurrent dossier to reserve the last available vehicle', async () => {
    const { item, offer } = await catalogue('USD', 'CIF');
    await prisma.catalogueItem.update({
      where: { id: item.id },
      data: { availableQuantity: 1 },
    });
    await prisma.chinaOfferVehicle.update({
      where: { id: item.sourceOfferVehicleId },
      data: { quantity: 1 },
    });
    await prisma.chinaOffer.update({
      where: { id: offer.id },
      data: { availableQuantity: 1 },
    });
    const results = await Promise.all([
      createDossier(item.id),
      createDossier(item.id),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.dossier.count({ where: { catalogueItemId: item.id } }),
    ).toBe(1);
  });

  it('rejects zero purchase costs and does not post zero customs costs', async () => {
    const costs = app.get(CostsService);
    await expect(
      prisma.$transaction((tx) =>
        costs.recordPurchaseCommitment(tx, organizationId, userId, {
          id: randomUUID(),
          purchaseNumber: 'ZERO-TEST',
          purchasePrice: 0,
          currency: 'DZD',
          supplierId,
        }),
      ),
    ).rejects.toThrow('Purchase cost amount must be positive');
    await expect(
      prisma.$transaction((tx) =>
        costs.recordCustomsActual(tx, organizationId, userId, {
          id: randomUUID(),
          reference: 'ZERO-CUSTOMS',
          customsAmount: 0,
          dossierId: randomUUID(),
        }),
      ),
    ).resolves.toBeNull();
  });

  it('uses a valid published quotation even when its original supplier offer date has elapsed', async () => {
    const { item, offer } = await catalogue('CNY', 'CIF');
    await prisma.chinaOffer.update({
      where: { id: offer.id },
      data: { validUntil: new Date('2021-01-01') },
    });
    expect((await createDossier(item.id)).status).toBe(201);
  });

  it('selects the matching revision when both CIF and DDP pricing are published', async () => {
    const { item, quotationPayload } = await catalogue('CNY', 'CIF');
    const ddp = await request(app.getHttpServer())
      .post('/api/quotations')
      .auth(token, { type: 'bearer' })
      .send({
        ...quotationPayload,
        priceBasis: 'DDP',
        customsAmount: 500000,
        sellingPriceDzd: 3500000,
      });
    expect(ddp.status).toBe(201);
    const cifDossier = await createDossier(item.id);
    const ddpDossier = await createDossier(item.id, 'DDP');
    expect(cifDossier.status).toBe(201);
    expect(ddpDossier.status).toBe(201);
    expect(dataOf<{ cifPrice: string }>(cifDossier).cifPrice).toBe('3000000');
    expect(dataOf<{ ddpPrice: string }>(ddpDossier).ddpPrice).toBe('3500000');
  });

  it('retains historical rates and dossier revision after Finance changes, offer update and quotation revision', async () => {
    const { item, offer, quotation, quotationPayload } = await catalogue(
      'USD',
      'CIF',
    );
    const created = await createDossier(item.id);
    expect(created.status).toBe(201);
    const dossierId = dataOf<{ id: string }>(created).id;
    const oldCosts = await prisma.quotationCost.findMany({
      where: { revisionId: quotation.currentRevision.id },
      orderBy: { sortOrder: 'asc' },
    });
    await prisma.exchangeRate.updateMany({
      where: { organizationId, baseCurrency: 'USD' },
      data: { isActive: false },
    });
    // The dossier uses the persisted quotation, even with no current Finance rate.
    expect((await createDossier(item.id)).status).toBe(201);
    const noRate = await request(app.getHttpServer())
      .post('/api/quotations')
      .auth(token, { type: 'bearer' })
      .send(quotationPayload);
    expect(noRate.status).toBe(409);
    await prisma.exchangeRate.create({
      data: {
        organizationId,
        baseCurrency: 'USD',
        quoteCurrency: 'DZD',
        rate: 270,
        createdById: userId,
      },
    });
    const update = await request(app.getHttpServer())
      .patch(`/api/offers/${offer.id}`)
      .auth(token, { type: 'bearer' })
      .send({
        supplierPrice: 8500,
        currency: 'USD',
        revisionReason: 'Regression update',
      });
    expect(update.status).toBe(200);
    const { sourceOfferId, sourceOfferVehicleId, priceBasis, ...amounts } =
      quotationPayload;
    void sourceOfferId;
    void sourceOfferVehicleId;
    void priceBasis;
    const revised = await request(app.getHttpServer())
      .post(`/api/quotations/${quotation.id}/revisions`)
      .auth(token, { type: 'bearer' })
      .send({
        ...amounts,
        sellingPriceDzd: 3100000,
        reason: 'Regression new rate',
      });
    expect(revised.status).toBe(201);
    const stored = await prisma.dossier.findUniqueOrThrow({
      where: { id: dossierId },
    });
    expect(stored.commercialQuotationRevisionId).toBe(
      quotation.currentRevision.id,
    );
    expect(stored.cifPrice?.toString()).toBe('3000000');
    expect(
      await prisma.quotationCost.findMany({
        where: { revisionId: quotation.currentRevision.id },
        orderBy: { sortOrder: 'asc' },
      }),
    ).toEqual(oldCosts);
  });

  it('creates another dossier and reads historical pricing after restarting the application', async () => {
    const { item } = await catalogue('CNY', 'DDP');
    const before = await createDossier(item.id, 'DDP');
    const oldId = dataOf<{ id: string }>(before).id;
    await app.close();
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
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    prisma = app.get(PrismaService);
    expect((await createDossier(item.id, 'DDP')).status).toBe(201);
    const historical = await request(app.getHttpServer())
      .get(`/api/dossiers/${oldId}`)
      .auth(token, { type: 'bearer' });
    expect(historical.status).toBe(200);
    expect(dataOf<{ ddpPrice: string }>(historical).ddpPrice).toBe('3000000');
  });

  (process.env.DOSSIER_BROWSER_URL ? it : it.skip)(
    'completes the actual catalogue → dossier form → detail in Chrome',
    async () => {
      for (const currency of ['USD', 'CNY']) {
        const configured = await request(app.getHttpServer())
          .post('/api/finance/exchange-rates')
          .auth(token, { type: 'bearer' })
          .send({
            baseCurrency: currency,
            quoteCurrency: 'DZD',
            rate: currency === 'USD' ? 250 : 35,
            isActive: true,
          });
        expect(configured.status).toBe(201);
      }
      const { item } = await catalogue('USD', 'CIF');
      await app.listen(55440, '127.0.0.1');
      const run = await promisify(execFile)(
        process.execPath,
        [join(__dirname, 'helpers/dossier-browser.mjs')],
        {
          env: {
            ...process.env,
            DOSSIER_BROWSER_EMAIL: browserEmail,
            DOSSIER_BROWSER_PASSWORD: browserPassword,
            DOSSIER_BROWSER_CLIENT: clientId,
            DOSSIER_BROWSER_ITEM: item.id,
            DOSSIER_BROWSER_CONTRACT: (await testContractPdf()).toString(
              'base64',
            ),
            DOSSIER_BROWSER_API: 'http://127.0.0.1:55440/api',
          },
          timeout: 120000,
          windowsHide: true,
        },
      );
      const result = JSON.parse(run.stdout) as {
        dossierId: string;
        post: { status: number };
        detail: { status: number };
      };
      expect(result.post.status).toBe(201);
      expect(result.detail.status).toBe(200);
      const booked = await prisma.dossier.findUniqueOrThrow({
        where: { id: result.dossierId },
        include: { dossierVehicles: true },
      });
      expect(booked.vehicleBookingVehicleId).toBe(
        booked.dossierVehicles[0].vehicleId,
      );
      expect(booked.status).toBe('vehicleBooking');
      expect(
        (
          await prisma.dossier.findUniqueOrThrow({
            where: { id: result.dossierId },
          })
        ).catalogueItemId,
      ).toBe(item.id);
    },
    120000,
  );

  (process.env.DOSSIER_CONTAINER_IMAGE ? it : it.skip)(
    'creates and reads dossiers in the rebuilt production image before and after container restart',
    async () => {
      const { item } = await catalogue('CNY', 'DDP');
      const containerName = `dossier-runtime-test-${randomUUID()}`;
      const api = 'http://127.0.0.1:55443';
      const database = new URL(process.env.DATABASE_URL!);
      database.hostname = 'host.docker.internal';
      const environment = {
        ...process.env,
        DATABASE_URL: database.toString(),
        DEPLOYMENT_ENV: 'staging',
        COOKIE_SECURE: 'false',
        CORS_ORIGIN: 'http://127.0.0.1:55441',
        PUBLIC_API_BASE_URL: `${api}/api`,
        PRIVATE_STORAGE_ROOT: '/tmp/dossier-runtime-private',
        TRUST_PROXY_HOPS: '1',
      };
      const names = [
        'DATABASE_URL',
        'DEPLOYMENT_ENV',
        'COOKIE_SECURE',
        'CORS_ORIGIN',
        'PUBLIC_API_BASE_URL',
        'PRIVATE_STORAGE_ROOT',
        'TRUST_PROXY_HOPS',
        'JWT_ACCESS_SECRET',
        'PII_ENCRYPTION_KEY',
        'PII_LOOKUP_HMAC_KEY',
        'INTEGRATION_SECRETS_ENCRYPTION_KEY',
      ];
      const docker = (args: string[]) =>
        promisify(execFile)('docker', args, {
          env: environment,
          windowsHide: true,
          timeout: 60000,
        });
      const waitHealthy = async () => {
        for (let attempt = 0; attempt < 100; attempt++) {
          const healthy = await fetch(`${api}/health`)
            .then((r) => r.ok)
            .catch(() => false);
          if (healthy) return;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        throw new Error(
          `Test runtime did not start: ${(await docker(['logs', containerName])).stdout}`,
        );
      };
      await docker([
        'run',
        '-d',
        '--name',
        containerName,
        '-p',
        '127.0.0.1:55443:3000',
        ...names.flatMap((name) => ['--env', name]),
        process.env.DOSSIER_CONTAINER_IMAGE!,
      ]);
      try {
        await waitHealthy();
        const login = await request(api).post('/api/auth/login').send({
          email: browserEmail,
          password: browserPassword,
        });
        const runtimeToken = dataOf<{ accessToken: string }>(login).accessToken;
        const create = () =>
          request(api)
            .post('/api/dossiers')
            .auth(runtimeToken, { type: 'bearer' })
            .send({
              type: 'VEHICLE_SALE_DDP',
              clientId,
              catalogueItemId: item.id,
            });
        const created = await create();
        expect(created.status).toBe(201);
        const id = dataOf<{ id: string }>(created).id;
        const read = () =>
          request(api)
            .get(`/api/dossiers/${id}`)
            .auth(runtimeToken, { type: 'bearer' });
        expect((await read()).status).toBe(200);
        await docker(['restart', containerName]);
        await waitHealthy();
        expect((await create()).status).toBe(201);
        const historical = await read();
        expect(historical.status).toBe(200);
        expect(dataOf<{ ddpPrice: string }>(historical).ddpPrice).toBe(
          '3000000',
        );
      } finally {
        await docker(['rm', '-f', containerName]);
      }
    },
    120000,
  );
});
