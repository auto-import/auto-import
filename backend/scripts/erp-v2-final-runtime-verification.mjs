import { randomUUID } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcrypt';

const required = [
  'ERP_FINAL_BASE_URL',
  'ERP_FINAL_INITIAL_EMAIL',
  'ERP_FINAL_INITIAL_PASSWORD',
  'ERP_FINAL_EMAIL',
  'ERP_FINAL_PASSWORD',
  'DATABASE_URL',
];
if (process.env.ERP_FINAL_CONFIRM !== 'RUN_LOCAL_FINAL_MUTATION_VERIFICATION') {
  throw new Error('Refusing to mutate without the local verification confirmation');
}
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}
const baseUrl = process.env.ERP_FINAL_BASE_URL.replace(/\/$/, '');
const parsedBase = new URL(baseUrl);
if (!['localhost', '127.0.0.1'].includes(parsedBase.hostname)) {
  throw new Error('Final mutation verification is restricted to localhost');
}
const database = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(database.hostname)) {
  throw new Error('Final mutation verification requires a local database');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      origin: 'http://localhost:3000',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => null);
  if (options.expectedStatus) {
    assert(
      response.status === options.expectedStatus,
      `${options.method ?? 'GET'} ${path} expected ${options.expectedStatus}, got ${response.status}`,
    );
    return { response, payload };
  }
  if (!response.ok || payload?.success !== true) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}: ${JSON.stringify(payload)}`,
    );
  }
  return {
    data: payload.data,
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
}

async function login(email, password, expectedStatus) {
  const result = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
    expectedStatus,
  });
  if (expectedStatus) return result;
  return {
    token: result.data.accessToken,
    user: result.data.user,
    cookie: result.cookie,
  };
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
let cleanupUserId;
let cleanupToken;
try {
  const initial = await login(
    process.env.ERP_FINAL_INITIAL_EMAIL,
    process.env.ERP_FINAL_INITIAL_PASSWORD,
  );
  assert(initial.user.permissions.includes('settings:write'), 'Admin lacks settings:write');
  const before = await pool.query(
    'SELECT email, "passwordHash" FROM "User" WHERE id = $1',
    [initial.user.id],
  );
  assert(before.rowCount === 1, 'Admin database row is missing');
  const initialHash = before.rows[0].passwordHash;

  const emailChange = await request('/auth/change-email', {
    method: 'POST',
    token: initial.token,
    cookie: initial.cookie,
    body: {
      currentPassword: process.env.ERP_FINAL_INITIAL_PASSWORD,
      newEmail: process.env.ERP_FINAL_EMAIL,
      confirmation: process.env.ERP_FINAL_EMAIL,
    },
  });
  assert(emailChange.data.user.email === process.env.ERP_FINAL_EMAIL, 'Email response did not change');
  const afterEmail = await pool.query(
    'SELECT email, "passwordHash" FROM "User" WHERE id = $1',
    [initial.user.id],
  );
  assert(afterEmail.rows[0].email === process.env.ERP_FINAL_EMAIL, 'Email was not persisted');
  assert(afterEmail.rows[0].passwordHash === initialHash, 'Email change modified password hash');
  await login(
    process.env.ERP_FINAL_INITIAL_EMAIL,
    process.env.ERP_FINAL_INITIAL_PASSWORD,
    401,
  );

  const passwordChange = await request('/auth/change-password', {
    method: 'POST',
    token: emailChange.data.accessToken,
    cookie: emailChange.cookie,
    body: {
      currentPassword: process.env.ERP_FINAL_INITIAL_PASSWORD,
      newPassword: process.env.ERP_FINAL_PASSWORD,
      confirmation: process.env.ERP_FINAL_PASSWORD,
    },
  });
  const afterPassword = await pool.query(
    'SELECT email, "passwordHash" FROM "User" WHERE id = $1',
    [initial.user.id],
  );
  assert(afterPassword.rows[0].passwordHash !== initialHash, 'Password hash did not change');
  assert(
    !(await bcrypt.compare(process.env.ERP_FINAL_INITIAL_PASSWORD, afterPassword.rows[0].passwordHash)),
    'Old password still matches persisted hash',
  );
  assert(
    await bcrypt.compare(process.env.ERP_FINAL_PASSWORD, afterPassword.rows[0].passwordHash),
    'New password does not match persisted hash',
  );
  await login(process.env.ERP_FINAL_EMAIL, process.env.ERP_FINAL_INITIAL_PASSWORD, 401);

  await request('/auth/logout', {
    method: 'POST',
    cookie: passwordChange.cookie,
  });
  const admin = await login(process.env.ERP_FINAL_EMAIL, process.env.ERP_FINAL_PASSWORD);
  cleanupToken = admin.token;
  assert(admin.user.id === initial.user.id, 'New login resolved a different user');

  const roles = (await request('/roles', { token: admin.token })).data;
  const limitedRole = roles.find(
    (role) =>
      role.name !== 'Admin' &&
      !role.rolePermissions.some(
        ({ permission }) =>
          permission.resource === 'settings' && permission.action === 'write',
      ),
  );
  assert(limitedRole, 'A non-settings role is missing');
  const limitedPassword = `Limited!${randomUUID()}Aa1`;
  const limited = (
    await request('/users', {
      method: 'POST',
      token: admin.token,
      body: {
        email: `limited-${randomUUID()}@local.invalid`,
        password: limitedPassword,
        firstName: 'Runtime',
        lastName: 'Limited',
        roleIds: [limitedRole.id],
      },
    })
  ).data;
  cleanupUserId = limited.id;
  const limitedSession = await login(limited.email, limitedPassword);
  await request('/auth/change-email', {
    method: 'POST',
    token: limitedSession.token,
    cookie: limitedSession.cookie,
    body: {
      currentPassword: limitedPassword,
      newEmail: `forbidden-${randomUUID()}@local.invalid`,
      confirmation: `forbidden-${randomUUID()}@local.invalid`,
    },
    expectedStatus: 403,
  });

  const references = (await request('/crm/reference-data', { token: admin.token })).data;
  const entry = references.find(
    (item) => item.kind === 'ENTRY_CHANNEL' && item.code === 'MANUAL',
  );
  const marketing = references.find(
    (item) => item.kind === 'MARKETING_SOURCE' && item.code === 'OTHER',
  );
  const agents = (await request('/prospects/assignees', { token: admin.token })).data;
  assert(entry && marketing && agents.length, 'CRM references or assignees are missing');
  const suffix = String(Date.now()).slice(-7);
  const phone = `056${suffix}`;
  const leadInput = {
    firstName: 'Final',
    lastName: `Verification-${suffix}`,
    phone,
    entryChannelId: entry.id,
    marketingSourceId: marketing.id,
    assignedTo: agents[0].id,
    qualification: 'HOT',
    nextAction: 'Relance finale',
    nextActionAt: '2026-09-01T09:00:00.000Z',
    requirement: {
      brand: 'BYD',
      model: 'Seal',
      minYear: 2025,
      currency: 'DZD',
      requirements: 'Vérification finale',
    },
  };
  const lead = (await request('/prospects', { method: 'POST', token: admin.token, body: leadInput })).data;
  const duplicate = (await request('/prospects', { method: 'POST', token: admin.token, body: leadInput })).data;
  assert(duplicate.id === lead.id, 'Normalized duplicate phone created another Lead');
  for (const status of [
    'CONTACTED',
    'QUALIFIED',
    'APPOINTMENT',
    'CONTRACT',
    'DEPOSIT',
  ]) {
    await request(`/prospects/${lead.id}/transition`, {
      method: 'POST',
      token: admin.token,
      body: { status, reason: 'Final runtime verification' },
    });
  }
  const client = (
    await request(`/prospects/${lead.id}/convert`, {
      method: 'POST',
      token: admin.token,
      body: {},
    })
  ).data;
  const conversionReplay = (
    await request(`/prospects/${lead.id}/convert`, {
      method: 'POST',
      token: admin.token,
      body: {},
    })
  ).data;
  assert(conversionReplay.id === client.id, 'Lead conversion is not idempotent');

  const historicalAt = '2026-08-10T08:30:00.000Z';
  const manual = (
    await request('/call-center/calls/manual', {
      method: 'POST',
      token: admin.token,
      body: {
        phone,
        prospectId: lead.id,
        callAt: historicalAt,
        direction: 'INBOUND',
        agentId: agents[0].id,
        durationSeconds: 185,
        state: 'COMPLETED',
        subject: `Runtime manual ${suffix}`,
        outcome: 'Client joint',
        notes: 'Date historique saisie manuellement',
        nextAction: 'Envoyer le devis',
        followUpAt: '2026-09-02T10:15:00.000Z',
      },
    })
  ).data;
  assert(manual.receivedAt === historicalAt, 'Manual business date was replaced');
  assert(manual.clientId === client.id && !manual.prospectId, 'Manual call did not use canonical Client');
  const editedAt = '2026-08-11T11:45:00.000Z';
  const edited = (
    await request(`/call-center/calls/${manual.id}/manual`, {
      method: 'PATCH',
      token: admin.token,
      body: { callAt: editedAt, durationSeconds: 240, subject: `Runtime edited ${suffix}` },
    })
  ).data;
  assert(edited.receivedAt === editedAt && edited.durationSeconds === 240, 'Manual edit did not persist');
  const history = (
    await request(`/call-center/history?search=${encodeURIComponent(`Runtime edited ${suffix}`)}&page=1&pageSize=5`, {
      token: admin.token,
    })
  ).data;
  assert(history.items.some((item) => item.id === manual.id), 'Manual call is absent from filtered history');
  const leadTimeline = (
    await request(`/crm/timeline/prospect/${lead.id}`, { token: admin.token })
  ).data;
  const clientTimeline = (
    await request(`/crm/timeline/client/${client.id}`, { token: admin.token })
  ).data;
  assert(leadTimeline.items.some((item) => item.id === `call:${manual.id}`), 'Lead timeline lost call lineage');
  assert(clientTimeline.items.some((item) => item.id === `call:${manual.id}`), 'Client timeline lost converted call history');

  const voiceNumber = '+21321009999';
  await request('/call-center/channels', {
    method: 'POST',
    token: admin.token,
    body: {
      channel: 'VOICE',
      displayName: 'Runtime voice simulator',
      normalizedNumber: voiceNumber,
      providerKey: 'mock',
    },
  });
  const simulated = (
    await request('/call-center/simulator/calls/inbound', {
      method: 'POST',
      token: admin.token,
      body: {
        providerEventId: randomUUID(),
        providerCallId: randomUUID(),
        companyNumber: voiceNumber,
        externalNumber: phone,
        state: 'QUEUED',
        occurredAt: '2026-08-12T12:00:00.000Z',
      },
    })
  ).data.call;
  assert(simulated.clientId === client.id && !simulated.prospectId, 'Simulator regression retained two owners');

  const whatsappNumber = '+21321008888';
  await request('/call-center/channels', {
    method: 'POST',
    token: admin.token,
    body: {
      channel: 'WHATSAPP',
      displayName: 'Runtime WhatsApp simulator',
      normalizedNumber: whatsappNumber,
      providerKey: 'mock',
    },
  });
  await request('/call-center/simulator/whatsapp/inbound', {
      method: 'POST',
      token: admin.token,
      body: {
        providerEventId: randomUUID(),
        providerMessageId: randomUUID(),
        companyNumber: whatsappNumber,
        externalNumber: phone,
        text: 'Vérification identité canonique',
        occurredAt: '2026-08-12T12:05:00.000Z',
      },
    });
  const conversations = (
    await request('/call-center/whatsapp/conversations', { token: admin.token })
  ).data;
  const conversation = conversations.find(
    (item) => item.externalNumber.endsWith(phone.slice(-8)),
  );
  assert(
    conversation?.clientId === client.id && !conversation?.prospectId,
    'WhatsApp did not use canonical Client',
  );

  const audits = await pool.query(
    'SELECT action, "oldValues"::text AS old_values, "newValues"::text AS new_values FROM "AuditLog" WHERE "userId" = $1 AND action IN ($2,$3,$4,$5) ORDER BY "createdAt" DESC',
    [
      initial.user.id,
      'account.email.changed',
      'account.password.changed',
      'call.manual.created',
      'call.manual.updated',
    ],
  );
  const actions = new Set(audits.rows.map((row) => row.action));
  for (const action of [
    'account.email.changed',
    'account.password.changed',
    'call.manual.created',
    'call.manual.updated',
  ]) {
    assert(actions.has(action), `Missing audit action ${action}`);
  }
  const auditText = JSON.stringify(audits.rows);
  assert(!auditText.includes(process.env.ERP_FINAL_INITIAL_PASSWORD), 'Audit leaked old password');
  assert(!auditText.includes(process.env.ERP_FINAL_PASSWORD), 'Audit leaked new password');
  assert(!auditText.includes('passwordHash'), 'Audit leaked a password hash field');

  if (cleanupUserId) {
    await request(`/users/${cleanupUserId}`, { method: 'DELETE', token: admin.token });
    cleanupUserId = undefined;
  }
  process.stdout.write(
    `${JSON.stringify({
      status: 'PASS',
      authentication: {
        emailPersisted: true,
        passwordHashChanged: true,
        oldEmailRejected: true,
        oldPasswordRejected: true,
        newSessionLogin: true,
        unauthorizedEmailChangeRejected: true,
        auditRedacted: true,
      },
      callCenter: {
        manualCreate: true,
        manualHistoricalDate: true,
        manualEdit: true,
        searchAndPagination: true,
        canonicalClientOwner: true,
        leadAndClientTimeline: true,
        simulatorRegression: true,
        whatsappCanonicalMatch: true,
        audit: true,
      },
    })}\n`,
  );
} finally {
  if (cleanupUserId && cleanupToken) {
    await request(`/users/${cleanupUserId}`, {
      method: 'DELETE',
      token: cleanupToken,
    }).catch(() => undefined);
  }
  await pool.end();
}
