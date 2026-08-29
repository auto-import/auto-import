import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomBytes, randomInt } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { ALL_PERMISSIONS, CrmLeadStatus } from '@auto-import/contracts';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  statusCode: number;
}

interface LoginPayload {
  accessToken: string;
  user: { id: string; organizationId: string };
}

interface LeadPayload {
  id: string;
  created: boolean;
  matchState: 'CREATED' | 'MATCHED' | 'AMBIGUOUS';
  crmStatus?: string;
}

interface ConversionPayload {
  id: string;
  converted: boolean;
  idempotentReplay: boolean;
}

function dataOf<T>(response: Response): T {
  const parsed = JSON.parse(response.text) as SuccessEnvelope<T>;
  expect(parsed.success).toBe(true);
  expect(parsed.statusCode).toBe(response.status);
  return parsed.data;
}

describe('ERP V2 Phase 1 authenticated release gate', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let restrictedToken: string;
  let organizationId: string;
  let foreignClientId: string;
  let entryChannelId: string;
  let marketingSourceId: string;
  let adminEmail: string;
  let restrictedEmail: string;
  let password: string;

  beforeAll(async () => {
    if (process.env.PHASE1_DISPOSABLE_TEST !== 'YES') {
      throw new Error(
        'Set PHASE1_DISPOSABLE_TEST=YES only for the isolated release-gate database',
      );
    }
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('base64url');
    process.env.JWT_ACCESS_TTL = '15m';
    process.env.JWT_REFRESH_TTL = '1h';
    process.env.PII_ENCRYPTION_KEY = randomBytes(48).toString('base64url');
    process.env.PII_LOOKUP_HMAC_KEY = randomBytes(48).toString('base64url');
    process.env.INTEGRATION_SECRETS_ENCRYPTION_KEY =
      randomBytes(48).toString('base64url');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health', 'ping'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
        exceptionFactory: (errors) =>
          new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: errors.map((error) =>
              Object.values(error.constraints || {}).join(', '),
            ),
          }),
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    prisma = app.get(PrismaService);

    const databaseRows = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    if (!/^phase1_release_gate_[a-z0-9_]+$/.test(databaseRows[0]?.database)) {
      throw new Error(
        `Refusing non-disposable database ${databaseRows[0]?.database ?? '<unknown>'}`,
      );
    }

    const suffix = randomBytes(6).toString('hex');
    password = `Gate-${randomBytes(18).toString('base64url')}`;
    adminEmail = `phase1-admin-${suffix}@example.invalid`;
    restrictedEmail = `phase1-restricted-${suffix}@example.invalid`;
    const passwordHash = await bcrypt.hash(password, 4);

    const organization = await prisma.organization.create({
      data: {
        name: `Phase 1 release gate ${suffix}`,
        type: 'test',
        status: 'active',
      },
    });
    organizationId = organization.id;
    const foreignOrganization = await prisma.organization.create({
      data: {
        name: `Phase 1 foreign tenant ${suffix}`,
        type: 'test',
        status: 'active',
      },
    });

    await prisma.permission.createMany({
      data: ALL_PERMISSIONS.map((permission) => {
        const separator = permission.indexOf(':');
        return {
          resource: permission.slice(0, separator),
          action: permission.slice(separator + 1),
        };
      }),
      skipDuplicates: true,
    });
    const permissions = await prisma.permission.findMany({
      select: { id: true, resource: true, action: true },
    });
    const adminRole = await prisma.role.create({
      data: {
        organizationId,
        name: `Release Gate Admin ${suffix}`,
        scope: 'tenant',
      },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: adminRole.id,
        permissionId: permission.id,
      })),
    });
    const clientRead = permissions.find(
      (permission) =>
        permission.resource === 'clients' && permission.action === 'read',
    );
    if (!clientRead) throw new Error('clients:read permission missing');
    const restrictedRole = await prisma.role.create({
      data: {
        organizationId,
        name: `Release Gate Restricted ${suffix}`,
        scope: 'tenant',
      },
    });
    await prisma.rolePermission.create({
      data: { roleId: restrictedRole.id, permissionId: clientRead.id },
    });

    await prisma.user.create({
      data: {
        organizationId,
        firstName: 'Release',
        lastName: 'Administrator',
        email: adminEmail,
        passwordHash,
        status: 'active',
        userRoles: { create: { roleId: adminRole.id } },
      },
    });
    await prisma.user.create({
      data: {
        organizationId,
        firstName: 'Restricted',
        lastName: 'Reader',
        email: restrictedEmail,
        passwordHash,
        status: 'active',
        userRoles: { create: { roleId: restrictedRole.id } },
      },
    });

    const [entryChannel, marketingSource] = await Promise.all([
      prisma.crmReferenceValue.create({
        data: {
          organizationId,
          kind: 'ENTRY_CHANNEL',
          code: `RELEASE_GATE_MANUAL_${suffix}`,
          labelFr: 'Saisie test release gate',
          sortOrder: 1,
        },
      }),
      prisma.crmReferenceValue.create({
        data: {
          organizationId,
          kind: 'MARKETING_SOURCE',
          code: `RELEASE_GATE_OTHER_${suffix}`,
          labelFr: 'Source test release gate',
          sortOrder: 1,
        },
      }),
      prisma.crmReferenceValue.create({
        data: {
          organizationId,
          kind: 'COUNTRY',
          code: `RELEASE_GATE_DZ_${suffix}`,
          labelFr: 'Algérie test release gate',
          metadata: {
            callingCode: '213',
            nationalLengths: [9],
            defaultForPhone: true,
          },
        },
      }),
    ]);
    entryChannelId = entryChannel.id;
    marketingSourceId = marketingSource.id;

    const foreignClient = await prisma.client.create({
      data: {
        organizationId: foreignOrganization.id,
        firstName: 'Foreign',
        lastName: 'Tenant',
        status: 'active',
      },
    });
    foreignClientId = foreignClient.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('authenticates an administrator and exposes tenant reference data', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);
    const login = dataOf<LoginPayload>(loginResponse);
    adminToken = login.accessToken;
    expect(login.user.organizationId).toBe(organizationId);

    const restrictedLoginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: restrictedEmail, password })
      .expect(200);
    restrictedToken = dataOf<LoginPayload>(restrictedLoginResponse).accessToken;

    const referencesResponse = await request(app.getHttpServer())
      .get('/api/crm/reference-data')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const references =
      dataOf<Array<{ id: string; organizationId: string }>>(referencesResponse);
    expect(references.some((value) => value.id === entryChannelId)).toBe(true);
    expect(
      references.every((value) => value.organizationId === organizationId),
    ).toBe(true);
  });

  it('returns CREATED/MATCHED to concurrent Lead callers without leaking a database conflict', async () => {
    const phone = `055${randomInt(1_000_000, 9_999_999)}`;
    const payload = {
      firstName: 'Concurrent',
      lastName: 'Lead',
      phone,
      entryChannelId,
      marketingSourceId,
    };
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/prospects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload),
      request(app.getHttpServer())
        .post('/api/prospects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(201);
      expect(response.text).not.toMatch(/P2002|P2034|unique constraint/i);
    }
    const leads = responses.map((response) => dataOf<LeadPayload>(response));
    expect(new Set(leads.map((lead) => lead.id)).size).toBe(1);
    expect(leads.map((lead) => lead.matchState).sort()).toEqual([
      'CREATED',
      'MATCHED',
    ]);
    expect(leads.filter((lead) => lead.created)).toHaveLength(1);

    const leadId = leads[0].id;
    const canonicalLead = await prisma.prospect.findUniqueOrThrow({
      where: { id: leadId },
      select: { phoneNormalized: true },
    });
    expect(
      await prisma.prospect.count({
        where: {
          organizationId,
          phoneNormalized: canonicalLead.phoneNormalized,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.contactPoint.count({
        where: {
          organizationId,
          kind: 'PHONE',
          normalizedValue: canonicalLead.phoneNormalized ?? undefined,
        },
      }),
    ).toBe(1);

    for (const status of [
      CrmLeadStatus.CONTACTED,
      CrmLeadStatus.QUALIFIED,
      CrmLeadStatus.APPOINTMENT,
      CrmLeadStatus.CONTRACT,
      CrmLeadStatus.DEPOSIT,
    ]) {
      const transitionResponse = await request(app.getHttpServer())
        .post(`/api/prospects/${leadId}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status, reason: 'Release-gate sequential transition' })
        .expect(201);
      expect(dataOf<{ crmStatus: string }>(transitionResponse).crmStatus).toBe(
        status,
      );
    }

    const conversionResponses = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/prospects/${leadId}/convert`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({}),
      request(app.getHttpServer())
        .post(`/api/prospects/${leadId}/convert`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({}),
    ]);
    for (const response of conversionResponses) {
      expect(response.status).toBe(201);
      expect(response.text).not.toMatch(/P2002|P2034|unique constraint/i);
    }
    const conversions = conversionResponses.map((response) =>
      dataOf<ConversionPayload>(response),
    );
    expect(new Set(conversions.map((conversion) => conversion.id)).size).toBe(
      1,
    );
    expect(
      conversions.filter((conversion) => conversion.converted),
    ).toHaveLength(1);
    expect(
      conversions.filter((conversion) => conversion.idempotentReplay),
    ).toHaveLength(1);
    expect(
      await prisma.client.count({
        where: { organizationId, prospectId: leadId },
      }),
    ).toBe(1);
    expect(
      await prisma.prospectConversion.count({
        where: { organizationId, prospectId: leadId },
      }),
    ).toBe(1);

    const clientId = conversions[0].id;
    const detailResponse = await request(app.getHttpServer())
      .get(`/api/clients/${clientId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const detail = dataOf<Record<string, unknown>>(detailResponse);
    expect(detail.id).toBe(clientId);
    for (const tab of [
      'dossiers',
      'orders',
      'documents',
      'tasks',
      'payments',
      'history',
    ]) {
      expect(Array.isArray(detail[tab])).toBe(true);
    }
    const access = detail.access as Record<string, unknown>;
    for (const tab of [
      'interactions',
      'dossiers',
      'documents',
      'payments',
      'vehicles',
      'tasks',
      'history',
    ]) {
      expect(access[tab]).toBe(true);
    }
    await request(app.getHttpServer())
      .get(`/api/crm/timeline/client/${clientId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/clients/${clientId}/dossiers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/clients/${clientId}/orders`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const syntheticNin = Array.from({ length: 18 }, () =>
      randomInt(0, 10),
    ).join('');
    await request(app.getHttpServer())
      .patch(`/api/clients/${clientId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nin: syntheticNin })
      .expect(200);
    const restrictedDetailResponse = await request(app.getHttpServer())
      .get(`/api/clients/${clientId}`)
      .set('Authorization', `Bearer ${restrictedToken}`)
      .expect(200);
    const restrictedDetail = dataOf<Record<string, unknown>>(
      restrictedDetailResponse,
    );
    expect(restrictedDetail).not.toHaveProperty('nin');
    expect(restrictedDetail).not.toHaveProperty('ninEncrypted');
    expect(restrictedDetail).not.toHaveProperty('ninLookupHash');
    expect(restrictedDetail).toMatchObject({
      identityConfigured: { nin: true },
    });

    const crossTenantResponse = await request(app.getHttpServer())
      .get(`/api/clients/${foreignClientId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(crossTenantResponse.status).toBe(404);
    expect(crossTenantResponse.text).not.toContain('Foreign Tenant');

    await request(app.getHttpServer())
      .post(`/api/clients/${clientId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Release-gate cleanup' })
      .expect(201);
    const repeatArchiveResponse = await request(app.getHttpServer())
      .post(`/api/clients/${clientId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Release-gate idempotency check' })
      .expect(201);
    expect(dataOf<{ message: string }>(repeatArchiveResponse).message).toBe(
      'Client already archived',
    );
    const legacyDeleteResponse = await request(app.getHttpServer())
      .delete(`/api/clients/${clientId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Legacy DELETE compatibility check' })
      .expect(200);
    expect(dataOf<{ message: string }>(legacyDeleteResponse).message).toBe(
      'Client already archived',
    );
    const clientsResponse = await request(app.getHttpServer())
      .get('/api/clients?page=1&limit=100')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const clients = dataOf<{ items: Array<{ id: string }> }>(clientsResponse);
    expect(clients.items.some((client) => client.id === clientId)).toBe(false);
  }, 60_000);
});
