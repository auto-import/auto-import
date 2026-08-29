const required = [
  'ERP_V2_SMOKE_BASE_URL',
  'ERP_V2_SMOKE_ADMIN_EMAIL',
  'ERP_V2_SMOKE_ADMIN_PASSWORD',
];

if (process.env.ERP_V2_SMOKE_CONFIRM !== 'RUN_ERP_V2_READONLY_SMOKE') {
  throw new Error(
    'Refusing to run without ERP_V2_SMOKE_CONFIRM=RUN_ERP_V2_READONLY_SMOKE',
  );
}
for (const name of required) {
  if (!process.env[name]) throw new Error(`Required environment variable ${name} is missing`);
}

const baseUrl = process.env.ERP_V2_SMOKE_BASE_URL.replace(/\/$/, '');
const parsed = new URL(baseUrl);
if (parsed.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
  throw new Error('HTTPS is required except through localhost');
}

async function request(path, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    throw new Error(`GET ${path} returned HTTP ${response.status}`);
  }
  return payload.data;
}

async function login() {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ERP_V2_SMOKE_ADMIN_EMAIL,
      password: process.env.ERP_V2_SMOKE_ADMIN_PASSWORD,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true || !payload.data?.accessToken) {
    throw new Error(`POST /auth/login returned HTTP ${response.status}`);
  }
  return payload.data.accessToken;
}

const token = await login();
const checks = [
  ['/ged/references', Array.isArray],
  ['/ged/documents?page=1&limit=5', (value) => Array.isArray(value?.items)],
  ['/partners?type=supplier&page=1&limit=5', (value) => Array.isArray(value?.items)],
  ['/offers?page=1&limit=5', (value) => Array.isArray(value?.items)],
  ['/contracts', Array.isArray],
  ['/finance/transactions', Array.isArray],
  ['/finance/treasury/accounts', Array.isArray],
  ['/shipments?page=1&limit=5', (value) => Array.isArray(value?.items)],
  ['/customs?page=1&limit=5', (value) => Array.isArray(value?.items)],
];

for (const [path, validate] of checks) {
  const data = await request(path, token);
  if (!validate(data)) throw new Error(`${path} returned an unexpected contract`);
}

process.stdout.write(
  `${JSON.stringify({ status: 'PASS', mode: 'READ_ONLY', authentication: true, modules: ['GED', 'SUPPLIERS', 'OFFERS', 'CONTRACTS', 'FINANCE', 'TREASURY', 'SHIPMENTS', 'CUSTOMS'] })}\n`,
);
