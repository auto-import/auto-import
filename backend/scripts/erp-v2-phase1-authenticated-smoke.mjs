import { randomInt } from 'node:crypto';

const requiredEnvironment = [
  'PHASE1_SMOKE_BASE_URL',
  'PHASE1_SMOKE_ADMIN_EMAIL',
  'PHASE1_SMOKE_ADMIN_PASSWORD',
  'PHASE1_SMOKE_RESTRICTED_EMAIL',
  'PHASE1_SMOKE_RESTRICTED_PASSWORD',
  'PHASE1_SMOKE_CROSS_TENANT_CLIENT_ID',
];

if (process.env.PHASE1_SMOKE_CONFIRM !== 'RUN_PHASE1_STAGING_SMOKE') {
  throw new Error(
    'Refusing to run without PHASE1_SMOKE_CONFIRM=RUN_PHASE1_STAGING_SMOKE',
  );
}
for (const name of requiredEnvironment) {
  if (!process.env[name])
    throw new Error(`Required environment variable ${name} is missing`);
}

const baseUrl = process.env.PHASE1_SMOKE_BASE_URL.replace(/\/$/, '');
const parsedBaseUrl = new URL(baseUrl);
if (
  parsedBaseUrl.protocol !== 'https:' &&
  !['127.0.0.1', 'localhost'].includes(parsedBaseUrl.hostname)
) {
  throw new Error(
    'The smoke API must use HTTPS unless it is reached through localhost',
  );
}

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.success !== true) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned HTTP ${response.status}`,
    );
  }
  return { status: response.status, data: payload.data };
}

async function login(email, password) {
  const response = await api('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (!response.data?.accessToken)
    throw new Error('Authentication did not return an access token');
  return response.data.accessToken;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let adminToken;
let leadId;
let clientId;
let clientArchived = false;

try {
  adminToken = await login(
    process.env.PHASE1_SMOKE_ADMIN_EMAIL,
    process.env.PHASE1_SMOKE_ADMIN_PASSWORD,
  );
  const restrictedToken = await login(
    process.env.PHASE1_SMOKE_RESTRICTED_EMAIL,
    process.env.PHASE1_SMOKE_RESTRICTED_PASSWORD,
  );

  const references = (await api('/crm/reference-data', { token: adminToken }))
    .data;
  assert(Array.isArray(references), 'Reference-data response is not an array');
  const entryChannel = references.find(
    (value) =>
      value.kind === 'ENTRY_CHANNEL' && value.code === 'MANUAL' && value.active,
  );
  const marketingSource = references.find(
    (value) =>
      value.kind === 'MARKETING_SOURCE' &&
      value.code === 'OTHER' &&
      value.active,
  );
  assert(
    entryChannel && marketingSource,
    'Required MANUAL/OTHER CRM references are missing',
  );

  const phone = `055${String(Date.now()).slice(-7)}`;
  const leadBody = {
    firstName: 'Smoke',
    lastName: 'Phase1',
    phone,
    entryChannelId: entryChannel.id,
    marketingSourceId: marketingSource.id,
  };
  const leadResponses = await Promise.all([
    api('/prospects', { method: 'POST', token: adminToken, body: leadBody }),
    api('/prospects', { method: 'POST', token: adminToken, body: leadBody }),
  ]);
  const leadStates = leadResponses
    .map((response) => response.data.matchState)
    .sort();
  assert(
    leadResponses.every((response) => response.status === 201),
    'Lead create status changed',
  );
  assert(
    new Set(leadResponses.map((response) => response.data.id)).size === 1,
    'Concurrent Lead creation returned different canonical records',
  );
  assert(
    JSON.stringify(leadStates) === JSON.stringify(['CREATED', 'MATCHED']),
    'Concurrent Lead creation did not return CREATED/MATCHED',
  );
  leadId = leadResponses[0].data.id;

  for (const status of [
    'CONTACTED',
    'QUALIFIED',
    'APPOINTMENT',
  ]) {
    const transitioned = await api(`/prospects/${leadId}/transition`, {
      method: 'POST',
      token: adminToken,
      body: { status, reason: 'Authenticated Phase 1 staging smoke' },
    });
    assert(
      transitioned.data.crmStatus === status,
      `Transition to ${status} failed`,
    );
  }

  const conversionResponses = await Promise.all([
    api(`/prospects/${leadId}/convert`, {
      method: 'POST',
      token: adminToken,
      body: {},
    }),
    api(`/prospects/${leadId}/convert`, {
      method: 'POST',
      token: adminToken,
      body: {},
    }),
  ]);
  assert(
    conversionResponses.every((response) => response.status === 201),
    'Conversion status changed',
  );
  assert(
    new Set(conversionResponses.map((response) => response.data.id)).size === 1,
    'Concurrent conversion returned different Clients',
  );
  assert(
    conversionResponses.filter((response) => response.data.converted).length ===
      1 &&
      conversionResponses.filter((response) => response.data.idempotentReplay)
        .length === 1,
    'Conversion success/idempotent response contract failed',
  );
  clientId = conversionResponses[0].data.id;

  const detail = (await api(`/clients/${clientId}`, { token: adminToken }))
    .data;
  for (const tab of [
    'dossiers',
    'orders',
    'documents',
    'tasks',
    'payments',
    'history',
  ]) {
    assert(
      Array.isArray(detail[tab]),
      `Client ${tab} tab projection is missing`,
    );
  }
  await api(`/crm/timeline/client/${clientId}`, { token: adminToken });
  await api(`/clients/${clientId}/dossiers`, { token: adminToken });
  await api(`/clients/${clientId}/orders`, { token: adminToken });

  const syntheticNin = Array.from({ length: 18 }, () => randomInt(0, 10)).join(
    '',
  );
  await api(`/clients/${clientId}`, {
    method: 'PATCH',
    token: adminToken,
    body: { nin: syntheticNin },
  });
  const restrictedDetail = (
    await api(`/clients/${clientId}`, { token: restrictedToken })
  ).data;
  assert(
    restrictedDetail.identityConfigured?.nin === true,
    'Synthetic identity was not configured',
  );
  for (const forbiddenField of ['nin', 'ninEncrypted', 'ninLookupHash']) {
    assert(
      !(forbiddenField in restrictedDetail),
      `Restricted response exposed ${forbiddenField}`,
    );
  }

  const foreignResponse = await fetch(
    `${baseUrl}/clients/${process.env.PHASE1_SMOKE_CROSS_TENANT_CLIENT_ID}`,
    { headers: { authorization: `Bearer ${adminToken}` } },
  );
  assert(
    foreignResponse.status === 404,
    'Cross-tenant Client lookup was not denied as 404',
  );

  await api(`/clients/${clientId}/archive`, {
    method: 'POST',
    token: adminToken,
    body: { reason: 'Authenticated Phase 1 staging smoke cleanup' },
  });
  const repeatArchive = await api(`/clients/${clientId}/archive`, {
    method: 'POST',
    token: adminToken,
    body: { reason: 'Authenticated Phase 1 staging smoke idempotency' },
  });
  assert(
    repeatArchive.data.message === 'Client already archived',
    'Archive is not idempotent',
  );
  clientArchived = true;
  const clients = (
    await api('/clients?page=1&limit=100', { token: adminToken })
  ).data;
  assert(
    !clients.items.some((client) => client.id === clientId),
    'Archived Client remains in the default list',
  );

  process.stdout.write(
    `${JSON.stringify({
      status: 'PASS',
      authentication: true,
      referenceData: true,
      leadConcurrency: leadStates,
      conversionConcurrency: ['SUCCESS', 'IDEMPOTENT_REPLAY'],
      clientTabs: true,
      tenantIsolation: true,
      identityMasking: true,
      archive: true,
    })}\n`,
  );
} finally {
  if (adminToken && clientId && !clientArchived) {
    await api(`/clients/${clientId}/archive`, {
      method: 'POST',
      token: adminToken,
      body: { reason: 'Failed Phase 1 staging smoke cleanup' },
    }).catch(() => undefined);
  } else if (adminToken && leadId && !clientId) {
    await api(`/prospects/${leadId}/archive`, {
      method: 'POST',
      token: adminToken,
      body: { reason: 'Failed Phase 1 staging smoke cleanup' },
    }).catch(() => undefined);
  }
}
