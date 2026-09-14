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
import { ALL_PERMISSIONS, Permission } from '@auto-import/contracts';
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
  const treasuryAccounts: Record<string, string> = {};
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
    const office = await prisma.office.create({
      data: {
        organizationId,
        name: 'Bureau test',
        country: 'DZ',
        status: 'active',
      },
    });
    for (const currency of ['DZD', 'USD', 'CNY'])
      treasuryAccounts[currency] = (
        await prisma.treasuryAccount.create({
          data: {
            organizationId,
            officeId: office.id,
            code: `TEST-${currency}`,
            name: `Compte ${currency}`,
            currency,
            type: 'BANK',
          },
        })
      ).id;
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

  it('publishes stock through the shared quotation engine, filters supplier and reserves the same vehicle once', async () => {
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId,
        brand: 'Toyota',
        model: 'Corolla',
        acquisitionType: 'stock',
        supplierId,
        status: 'available',
      },
    });
    const payload = {
      sourceVehicleId: vehicle.id,
      priceBasis: 'CIF',
      vehicleAmount: 1800000,
      vehicleCurrency: 'DZD',
      containerPrice: 0,
      containerCurrency: 'USD',
      containerAllocation: 3,
      insuranceAmount: 0,
      insuranceCurrency: 'USD',
      transitAmount: 0,
      transitCurrency: 'DZD',
      sellingPriceDzd: 3000000,
    };
    const before = await prisma.vehicle.count({ where: { organizationId } });
    const quoteResponse = await request(app.getHttpServer())
      .post('/api/quotations')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(quoteResponse.status).toBe(201);
    const quotation = dataOf<{ id: string; sourceVehicleId: string }>(
      quoteResponse,
    );
    expect(quotation.sourceVehicleId).toBe(vehicle.id);
    const list = await request(app.getHttpServer())
      .get(`/api/catalogue?sourceType=VEHICLE&supplierId=${supplierId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    const item = dataOf<{
      items: Array<{
        id: string;
        sourceId: string;
        sourceType: string;
        supplier: { id: string };
      }>;
    }>(list).items.find((row) => row.sourceId === vehicle.id)!;
    expect(item.sourceType).toBe('VEHICLE');
    expect(item.supplier.id).toBe(supplierId);
    const attempts = await Promise.all([
      createDossier(item.id),
      createDossier(item.id),
    ]);
    expect(attempts.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const created = dataOf<{ id: string }>(
      attempts.find((response) => response.status === 201)!,
    );
    const dossier = await prisma.dossier.findUniqueOrThrow({
      where: { id: created.id },
      include: { dossierVehicles: true },
    });
    expect(dossier.catalogueItemId).toBe(item.id);
    expect(dossier.commercialQuotationId).toBe(quotation.id);
    expect(dossier.dossierVehicles.map((link) => link.vehicleId)).toEqual([
      vehicle.id,
    ]);
    expect(await prisma.vehicle.count({ where: { organizationId } })).toBe(
      before,
    );
    expect(
      await prisma.financeTransaction.count({
        where: { organizationId, sourceRecordId: quotation.id },
      }),
    ).toBe(0);
    const sourceCounts = await prisma.chinaOffer.aggregate({
      where: { organizationId },
      _sum: { reservedQuantity: true },
    });
    await request(app.getHttpServer())
      .patch(`/api/dossiers/${created.id}/status`)
      .auth(token, { type: 'bearer' })
      .send({ status: 'cancelled', comment: 'Annulation test stock' })
      .expect(200);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } }))
        .status,
    ).toBe('available');
    expect(
      (await prisma.catalogueItem.findUniqueOrThrow({ where: { id: item.id } }))
        .reservedQuantity,
    ).toBe(0);
    await request(app.getHttpServer())
      .post(`/api/dossiers/${created.id}/restore`)
      .auth(token, { type: 'bearer' })
      .send({})
      .expect(201);
    expect(
      (await prisma.catalogueItem.findUniqueOrThrow({ where: { id: item.id } }))
        .reservedQuantity,
    ).toBe(1);
    expect(
      await prisma.chinaOffer.aggregate({
        where: { organizationId },
        _sum: { reservedQuantity: true },
      }),
    ).toEqual(sourceCounts);
    const stockPurchase = await prisma.purchase.create({
      data: {
        organizationId,
        supplierId,
        vehicleId: vehicle.id,
        purchaseNumber: randomUUID(),
        purchasePrice: 1800000,
        currency: 'DZD',
        status: 'confirmed',
      },
    });
    await prisma.$transaction((tx) =>
      app
        .get(CostsService)
        .recordPurchaseCommitment(tx, organizationId, userId, stockPurchase),
    );
    const financialBefore = await prisma.financeTransaction.count({
      where: { organizationId },
    });
    await prisma.dossier.update({
      where: { id: created.id },
      data: { status: 'inspection', vehicleBookingVehicleId: vehicle.id },
    });
    await request(app.getHttpServer())
      .patch(`/api/dossiers/${created.id}/status`)
      .auth(token, { type: 'bearer' })
      .send({ status: 'purchaseConfirmed' })
      .expect(200);
    expect(
      await prisma.purchase.count({ where: { vehicleId: vehicle.id } }),
    ).toBe(1);
    expect(
      await prisma.financeTransaction.count({ where: { organizationId } }),
    ).toBe(financialBefore);
    const financial = dataOf<any>(
      await request(app.getHttpServer())
        .get(`/api/finance/dossiers/${created.id}/summary`)
        .auth(token, { type: 'bearer' })
        .expect(200),
    );
    expect(financial.costs.purchaseCost).toBe('1800000');
  });

  it('synchronizes customer collections, supplier settlements, actual costs, treasury, reversals and historical rates', async () => {
    const get = async (path: string) => {
      const response = await request(app.getHttpServer())
        .get(`/api/${path}`)
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(200);
      return JSON.parse(response.text).data;
    };
    const post = async (path: string, body: object) => {
      const response = await request(app.getHttpServer())
        .post(`/api/${path}`)
        .auth(token, { type: 'bearer' })
        .send(body);
      if (response.status !== 201)
        throw new Error(`Unexpected ${response.status}: ${response.text}`);
      return JSON.parse(response.text).data;
    };
    const overviewBefore = await get('finance/summary');
    const treasuryBefore = await get('finance/treasury/accounts');
    const balanceBefore = Number(
      treasuryBefore.find((a) => a.id === treasuryAccounts.DZD).balance,
    );
    const { item } = await catalogue('USD', 'CIF');
    const dossier = dataOf<{ id: string; vehicles: Array<{ id: string }> }>(
      await createDossier(item.id),
    );
    const contract = await post('contracts', {
      dossierId: dossier.id,
      clientId,
      totalAmount: 3000000,
      currency: 'DZD',
      requiredDeposit: 900000,
      schedule: [{ amount: 900000 }, { amount: 2100000 }],
    });
    await prisma.contract.update({
      where: { id: contract.id },
      data: { status: 'SIGNED', signedAt: new Date() },
    });
    const payment = await post('finance/payments', {
      clientId,
      dossierId: dossier.id,
      contractId: contract.id,
      amount: 900000,
      currency: 'DZD',
      idempotencyKey: randomUUID(),
    });
    const noAccount = await request(app.getHttpServer())
      .post(`/api/finance/payments/${payment.id}/confirm`)
      .auth(token, { type: 'bearer' })
      .send({});
    expect(noAccount.status).toBe(400);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }))
        .status,
    ).toBe('PENDING');
    await post(`finance/payments/${payment.id}/confirm`, {
      treasuryAccountId: treasuryAccounts.DZD,
    });
    await post(`finance/payments/${payment.id}/confirm`, {
      treasuryAccountId: treasuryAccounts.DZD,
    });
    expect(
      await prisma.financeTransaction.count({
        where: { customerPaymentId: payment.id },
      }),
    ).toBe(1);
    let overview = await get('finance/summary');
    expect(
      Number(overview.totalCollected) - Number(overviewBefore.totalCollected),
    ).toBe(900000);
    expect(
      Number(overview.totalOutstanding) -
        Number(overviewBefore.totalOutstanding),
    ).toBe(2100000);
    let summary = await get(`finance/dossiers/${dossier.id}/summary`);
    expect(summary.revenue.collected).toBe('900000');
    expect(summary.revenue.outstanding).toBe('2100000');
    expect(
      (await get('finance/treasury/accounts')).find(
        (a) => a.id === treasuryAccounts.DZD,
      ).balance,
    ).toBe(String(balanceBefore + 900000));
    const purchase = await prisma.purchase.create({
      data: {
        organizationId,
        purchaseNumber: randomUUID(),
        supplierId,
        vehicleId: dossier.vehicles[0].id,
        dossierId: dossier.id,
        purchasePrice: 20000,
        currency: 'USD',
        status: 'confirmed',
      },
    });
    await prisma.$transaction((tx) =>
      app
        .get(CostsService)
        .recordPurchaseCommitment(tx, organizationId, userId, purchase),
    );
    for (const amount of [10000, 5000]) {
      const supplierPayment = await post('finance/supplier-payments', {
        supplierId,
        purchaseId: purchase.id,
        paymentKind: 'COMPLEMENT',
        amount,
        currency: 'USD',
        idempotencyKey: randomUUID(),
      });
      await post(`finance/supplier-payments/${supplierPayment.id}/confirm`, {
        treasuryAccountId: treasuryAccounts.USD,
      });
    }
    const supplierRows = await get('finance/supplier-payments?limit=100');
    const supplierRow = supplierRows.items.find(
      (r) => r.purchase.id === purchase.id,
    );
    expect(supplierRow.purchasePaid).toBe('15000.00');
    expect(supplierRow.purchaseRemaining).toBe('5000.00');
    summary = await get(`finance/dossiers/${dossier.id}/summary`);
    expect(summary.costs.purchaseCost).toBe('5000000');
    await post('finance/costs', {
      type: 'CUSTOMS',
      costScope: 'DIRECT',
      dossierId: dossier.id,
      amount: 250000,
      currency: 'DZD',
    });
    await post('finance/costs', {
      type: 'RENT',
      costScope: 'OPERATING',
      amount: 50000,
      currency: 'DZD',
      treasuryAccountId: treasuryAccounts.DZD,
    });
    summary = await get(`finance/dossiers/${dossier.id}/summary`);
    expect(summary.costs.totalInBaseCurrency).toBe('5250000');
    expect(summary.profitability.grossMargin).toBe('-2250000');
    const frozen = await prisma.financeTransaction.findMany({
      where: { dossierId: dossier.id },
      orderBy: { id: 'asc' },
    });
    const rate = await post('finance/exchange-rates', {
      baseCurrency: 'USD',
      quoteCurrency: 'DZD',
      rate: 999,
      rateType: 'COMMERCIAL',
    });
    expect(
      (await get(`finance/dossiers/${dossier.id}/summary`)).costs
        .totalInBaseCurrency,
    ).toBe('5250000');
    expect(
      await prisma.financeTransaction.findMany({
        where: { dossierId: dossier.id },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(frozen);
    const entry = await prisma.financeTransaction.findUniqueOrThrow({
      where: { customerPaymentId: payment.id },
    });
    await expect(
      prisma.financeTransaction.delete({ where: { id: entry.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.financeTransaction.update({
        where: { id: entry.id },
        data: { amountDzd: 1 },
      }),
    ).rejects.toThrow();
    await post(`finance/transactions/${entry.id}/reverse`, {
      reason: 'Correction test',
    });
    await post(`finance/transactions/${entry.id}/reverse`, {
      reason: 'Correction test',
    });
    expect(
      await prisma.financeTransaction.count({
        where: { reversalOfId: entry.id },
      }),
    ).toBe(1);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }))
        .status,
    ).toBe('REVERSED');
    expect(
      (await get(`finance/dossiers/${dossier.id}/summary`)).revenue.outstanding,
    ).toBe('3000000');
    expect(
      (await get('finance/treasury/accounts')).find(
        (a) => a.id === treasuryAccounts.DZD,
      ).balance,
    ).toBe(String(balanceBefore - 50000));
    const officeId = treasuryBefore.find(
      (a) => a.id === treasuryAccounts.DZD,
    ).officeId;
    const destination = await post('finance/treasury/accounts', {
      code: `TR-${randomUUID()}`,
      name: 'Destination test',
      officeId,
      currency: 'DZD',
      type: 'BANK',
      openingBalance: 0,
    });
    const beforeTransfer = await get('finance/summary');
    const transferBody = {
      sourceAccountId: treasuryAccounts.DZD,
      destinationAccountId: destination.id,
      amount: 10000,
      reference: 'Transfert test',
      idempotencyKey: randomUUID(),
    };
    const transfer = await post('finance/treasury/transfers', transferBody);
    expect(
      (await post('finance/treasury/transfers', transferBody))
        .map((e) => e.id)
        .sort(),
    ).toEqual(transfer.map((e) => e.id).sort());
    expect(await get('finance/summary')).toEqual(beforeTransfer);
    expect(
      (await get('finance/treasury/accounts')).find(
        (a) => a.id === destination.id,
      ).balance,
    ).toBe('10000');
    await post(`finance/transactions/${transfer[0].id}/reverse`, {
      reason: 'Annulation transfert test',
    });
    expect(
      (await get('finance/treasury/accounts')).find(
        (a) => a.id === destination.id,
      ).balance,
    ).toBe('0');
    expect(await get('finance/summary')).toEqual(beforeTransfer);
    await request(app.getHttpServer())
      .patch(`/api/finance/exchange-rates/${rate.id}/status`)
      .auth(token, { type: 'bearer' })
      .send({ isActive: false })
      .expect(200);
  });

  it('enforces sales/China financial visibility and protects treasury administration at the API', async () => {
    async function sessionWith(allowed: string[]) {
      const permissions = (await prisma.permission.findMany()).filter((p) =>
        allowed.includes(`${p.resource}:${p.action}`),
      );
      const role = await prisma.role.create({
        data: {
          organizationId,
          name: randomUUID(),
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
          firstName: 'Permission',
          lastName: 'Test',
          passwordHash: await bcrypt.hash(password, 4),
          status: 'active',
          userRoles: { create: { roleId: role.id } },
        },
      });
      return dataOf<{ accessToken: string }>(
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: user.email, password }),
      ).accessToken;
    }
    const { item } = await catalogue('USD', 'CIF');
    const sales = await sessionWith([
      Permission.VEHICLES_READ,
      Permission.PAYMENTS_WRITE,
      Permission.DOSSIERS_READ,
    ]);
    const response = await request(app.getHttpServer())
      .get(`/api/catalogue/${item.id}`)
      .auth(sales, { type: 'bearer' })
      .expect(200);
    const commercial = dataOf<{ pricing: { cif: Record<string, unknown> } }>(
      response,
    ).pricing.cif;
    expect(commercial.sellingPriceDzd).toBeTruthy();
    expect(commercial).not.toHaveProperty('estimatedCosts');
    expect(commercial).not.toHaveProperty('estimatedProfitDzd');
    expect(commercial).not.toHaveProperty('actual');
    await request(app.getHttpServer())
      .get('/api/finance/summary')
      .auth(sales, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/finance/treasury/accounts')
      .auth(sales, { type: 'bearer' })
      .expect(403);
    const accounts = dataOf<Array<Record<string, unknown>>>(
      await request(app.getHttpServer())
        .get('/api/finance/treasury/payment-accounts')
        .auth(sales, { type: 'bearer' })
        .expect(200),
    );
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts[0]).not.toHaveProperty('balance');
    expect(accounts[0]).not.toHaveProperty('openingBalance');
    const dossier = dataOf<any>(await createDossier(item.id));
    const salesDossier = dataOf<any>(
      await request(app.getHttpServer())
        .get(`/api/dossiers/${dossier.id}`)
        .auth(sales, { type: 'bearer' })
        .expect(200),
    );
    expect(salesDossier.commercialQuotation.currentRevision).not.toHaveProperty(
      'vehicleAmount',
    );
    expect(salesDossier.commercialQuotation.currentRevision).not.toHaveProperty(
      'snapshot',
    );
    expect(salesDossier.commercialQuotation.currentRevision).not.toHaveProperty(
      'costItems',
    );
    const china = await sessionWith([
      Permission.PURCHASES_READ,
      Permission.VEHICLES_READ,
    ]);
    await request(app.getHttpServer())
      .get('/api/finance/payments')
      .auth(china, { type: 'bearer' })
      .expect(403);
  });

  it('uses rate types, rejects contradictory effective rates and synchronizes supplier and direct-cost reversals', async () => {
    const post = async (path: string, body: object) =>
      dataOf<any>(
        await request(app.getHttpServer())
          .post(`/api/${path}`)
          .auth(token, { type: 'bearer' })
          .send(body)
          .expect(201),
      );
    const bankRate = {
      baseCurrency: 'USD',
      quoteCurrency: 'DZD',
      rateType: 'BANK',
      rate: 240,
      effectiveAt: '2020-01-01T00:00:00.000Z',
    };
    await post('finance/exchange-rates', bankRate);
    await request(app.getHttpServer())
      .post('/api/finance/exchange-rates')
      .auth(token, { type: 'bearer' })
      .send({ ...bankRate, rate: 241 })
      .expect(409);
    const { item } = await catalogue('USD', 'CIF');
    const dossier = dataOf<any>(await createDossier(item.id));
    const purchase = await prisma.purchase.create({
      data: {
        organizationId,
        purchaseNumber: randomUUID(),
        supplierId,
        vehicleId: dossier.vehicles[0].id,
        dossierId: dossier.id,
        purchasePrice: 10000,
        currency: 'USD',
        status: 'confirmed',
      },
    });
    await prisma.$transaction((tx) =>
      app
        .get(CostsService)
        .recordPurchaseCommitment(tx, organizationId, userId, purchase),
    );
    const attempts = await Promise.all(
      [6000, 6000].map((amount) =>
        request(app.getHttpServer())
          .post('/api/finance/supplier-payments')
          .auth(token, { type: 'bearer' })
          .send({
            supplierId,
            purchaseId: purchase.id,
            paymentKind: 'COMPLEMENT',
            amount,
            currency: 'USD',
            idempotencyKey: randomUUID(),
          }),
      ),
    );
    expect(attempts.map((r) => r.status).sort()).toEqual([201, 409]);
    const payment = dataOf<any>(attempts.find((r) => r.status === 201)!);
    await request(app.getHttpServer())
      .post(`/api/finance/supplier-payments/${payment.id}/confirm`)
      .auth(token, { type: 'bearer' })
      .send({ treasuryAccountId: treasuryAccounts.DZD })
      .expect(404);
    await post(`finance/supplier-payments/${payment.id}/confirm`, {
      treasuryAccountId: treasuryAccounts.USD,
      rateType: 'BANK',
    });
    const journal = await prisma.financeTransaction.findUniqueOrThrow({
      where: { supplierPaymentId: payment.id },
    });
    expect(journal.exchangeRateSnapshot.toString()).toBe('240');
    expect(journal.amountDzd.toString()).toBe('1440000');
    await post(`finance/transactions/${journal.id}/reverse`, {
      reason: 'Paiement fournisseur erroné',
    });
    expect(
      (
        await prisma.supplierPayment.findUniqueOrThrow({
          where: { id: payment.id },
        })
      ).status,
    ).toBe('REVERSED');
    const cost = await post('finance/costs', {
      type: 'INSURANCE',
      costScope: 'DIRECT',
      dossierId: dossier.id,
      amount: 10000,
      currency: 'DZD',
      treasuryAccountId: treasuryAccounts.DZD,
    });
    const entry = await prisma.financeTransaction.findUniqueOrThrow({
      where: { costId: cost.id },
    });
    await post(`finance/transactions/${entry.id}/reverse`, {
      reason: 'Assurance corrigée',
    });
    expect(
      (await prisma.cost.findUniqueOrThrow({ where: { id: cost.id } })).status,
    ).toBe('REVERSED');
    await request(app.getHttpServer())
      .patch(`/api/finance/treasury/accounts/${treasuryAccounts.DZD}`)
      .auth(token, { type: 'bearer' })
      .send({ openingBalance: 999 })
      .expect(400);
  });

  it('records a standalone deposit once and applies it without another treasury movement', async () => {
    const post = async (path: string, body: object) =>
      dataOf<any>(
        await request(app.getHttpServer())
          .post(`/api/${path}`)
          .auth(token, { type: 'bearer' })
          .send(body)
          .expect(201),
      );
    const { item } = await catalogue('USD', 'CIF');
    const dossier = dataOf<any>(await createDossier(item.id));
    const invoice = await prisma.invoice.create({
      data: {
        organizationId,
        clientId,
        dossierId: dossier.id,
        invoiceNumber: randomUUID(),
        currency: 'DZD',
        subtotal: 100000,
        total: 100000,
        amountDzd: 100000,
        exchangeRateSnapshot: 1,
        status: 'ISSUED',
      },
    });
    const deposit = await post('finance/customer-deposits', {
      clientId,
      dossierId: dossier.id,
      amount: 90000,
      currency: 'DZD',
      treasuryAccountId: treasuryAccounts.DZD,
    });
    expect(deposit.paymentId).toBeTruthy();
    await post(`finance/customer-deposits/${deposit.id}/apply`, {
      amount: 90000,
      invoiceId: invoice.id,
    });
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
      ).paidAmount.toString(),
    ).toBe('90000');
    expect(
      await prisma.financeTransaction.count({
        where: { customerPaymentId: deposit.paymentId },
      }),
    ).toBe(1);
    const entry = await prisma.financeTransaction.findUniqueOrThrow({
      where: { customerPaymentId: deposit.paymentId },
    });
    await post(`finance/transactions/${entry.id}/reverse`, {
      reason: 'Acompte corrigé',
    });
    expect(
      (
        await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
      ).paidAmount.toString(),
    ).toBe('0');
    expect(
      (
        await prisma.customerDeposit.findUniqueOrThrow({
          where: { id: deposit.id },
        })
      ).status,
    ).toBe('REVERSED');
    const legacy = await prisma.customerDeposit.create({
      data: {
        organizationId,
        clientId,
        dossierId: dossier.id,
        amount: 10000,
        unappliedAmount: 10000,
        currency: 'DZD',
        status: 'CONFIRMED',
      },
    });
    await request(app.getHttpServer())
      .post(`/api/finance/customer-deposits/${legacy.id}/apply`)
      .auth(token, { type: 'bearer' })
      .send({ amount: 10000, invoiceId: invoice.id })
      .expect(400);
    const reconciled = await post(
      `finance/customer-deposits/${legacy.id}/apply`,
      {
        amount: 10000,
        invoiceId: invoice.id,
        treasuryAccountId: treasuryAccounts.DZD,
        reason: 'Rapprochement documenté test',
      },
    );
    expect(
      await prisma.financeTransaction.count({
        where: { customerPaymentId: reconciled.paymentId },
      }),
    ).toBe(1);
  });

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
      const reservedLine = await prisma.chinaOfferVehicle.findUniqueOrThrow({
        where: { id: dossier.item.sourceOfferVehicleId! },
        include: { offer: true },
      });
      expect(reservedLine.status).toBe('RESERVED');
      expect(reservedLine.reservedQuantity).toBe(1);
      expect(reservedLine.offer.offerStatus).toBe('RESERVED');
      const rate = await prisma.exchangeRate.findFirstOrThrow({
        where: { organizationId, baseCurrency: currency, isActive: true },
        orderBy: { effectiveAt: 'desc' },
      });
      const date = new Date().toISOString().slice(0, 10);
      const deposit = await dossier.transition({
        status: 'depositReceived',
        deposit: {
          treasuryAccountId: treasuryAccounts[currency],
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
      expect(
        (
          await dossier.transition({
            status: 'inspection',
            inspection: { url: 'https://example.test/inspection.pdf' },
          })
        ).status,
      ).toBe(200);
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
      const purchasedItem = await prisma.catalogueItem.findUniqueOrThrow({
        where: { id: dossier.item.id },
      });
      const purchasedLine = await prisma.chinaOfferVehicle.findUniqueOrThrow({
        where: { id: dossier.item.sourceOfferVehicleId! },
        include: { offer: true },
      });
      expect(purchasedItem).toMatchObject({
        availableQuantity: 19,
        reservedQuantity: 0,
      });
      expect(purchasedLine).toMatchObject({
        status: 'VALIDATED',
        purchasedQuantity: 1,
        reservedQuantity: 0,
      });
      expect(purchasedLine.offer).toMatchObject({
        offerStatus: 'VALIDATED',
        availableQuantity: 19,
        reservedQuantity: 0,
      });
      expect(
        await prisma.chinaOfferStatusHistory.findFirst({
          where: { offerId: purchasedLine.offerId },
          orderBy: { createdAt: 'desc' },
        }),
      ).toMatchObject({ fromStatus: 'RESERVED', toStatus: 'VALIDATED' });
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
      treasuryAccountId: treasuryAccounts.USD,
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
      where: { id: item.sourceOfferVehicleId! },
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
      .send({
        containerType: 'THREE_VEHICLES',
        totalFreightCost: 10000.25,
        freightCurrency: 'USD',
      });
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
    'requires a published quotation for stock priced in %s',
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
      expect(response.status).toBe(409);
      expect(
        await prisma.dossierVehicle.count({ where: { vehicleId: vehicle.id } }),
      ).toBe(0);
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
          where: { id: item.sourceOfferVehicleId! },
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
      where: { id: item.sourceOfferVehicleId! },
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
            DOSSIER_BROWSER_TREASURY: treasuryAccounts.USD,
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
