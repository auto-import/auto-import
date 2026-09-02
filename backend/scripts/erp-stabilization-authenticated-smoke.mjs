import { randomUUID } from 'node:crypto';

const required = [
  'ERP_STABILIZATION_BASE_URL',
  'ERP_STABILIZATION_ADMIN_EMAIL',
  'ERP_STABILIZATION_ADMIN_PASSWORD',
];
if (process.env.ERP_STABILIZATION_CONFIRM !== 'RUN_DISPOSABLE_MUTATION_SMOKE') {
  throw new Error('Refusing to mutate without the disposable smoke confirmation');
}
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const baseUrl = process.env.ERP_STABILIZATION_BASE_URL.replace(/\/$/, '');
const parsed = new URL(baseUrl);
if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) {
  throw new Error('The mutation smoke is restricted to localhost');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, { token, method = 'GET', body, form } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(form ? {} : { 'content-type': 'application/json' }),
    },
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    throw new Error(
      `${method} ${path} returned HTTP ${response.status}: ${JSON.stringify(payload)}`,
    );
  }
  return payload.data;
}

const login = await api('/auth/login', {
  method: 'POST',
  body: {
    email: process.env.ERP_STABILIZATION_ADMIN_EMAIL,
    password: process.env.ERP_STABILIZATION_ADMIN_PASSWORD,
  },
});
const token = login.accessToken;
assert(token, 'Authentication did not return an access token');

const references = await api('/crm/reference-data', { token });
const manual = references.find(
  (item) => item.kind === 'ENTRY_CHANNEL' && item.code === 'MANUAL',
);
const other = references.find(
  (item) => item.kind === 'MARKETING_SOURCE' && item.code === 'OTHER',
);
assert(manual && other, 'CRM channel/source references are missing');
const assignees = await api('/prospects/assignees', { token });
assert(assignees.length > 0, 'No active lead assignee exists');

const nonce = Date.now();
const phone = `055${String(nonce).slice(-7)}`;
const leadBody = {
  firstName: 'Smoke',
  lastName: `ERP-${nonce}`,
  phone,
  entryChannelId: manual.id,
  marketingSourceId: other.id,
  assignedTo: assignees[0].id,
  qualification: 'HOT',
  nextAction: 'Rappeler pour finaliser le besoin',
  nextActionAt: new Date(Date.now() + 86_400_000).toISOString(),
  requirement: {
    brand: 'BYD',
    model: 'Seal',
    minYear: 2025,
    currency: 'DZD',
    requirements: 'Automatique, couleur claire',
  },
};
const lead = await api('/prospects', { token, method: 'POST', body: leadBody });
const duplicate = await api('/prospects', {
  token,
  method: 'POST',
  body: { ...leadBody, entryChannelId: manual.id },
});
assert(lead.id === duplicate.id, 'Duplicate phone created a second lead');
assert(
  [lead.matchState, duplicate.matchState].includes('MATCHED'),
  'Duplicate lead was not reported as a match',
);

for (const status of [
  'CONTACTED',
  'QUALIFIED',
  'APPOINTMENT',
]) {
  const transitioned = await api(`/prospects/${lead.id}/transition`, {
    token,
    method: 'POST',
    body: { status, reason: 'ERP stabilization mutation smoke' },
  });
  assert(transitioned.crmStatus === status, `Lead transition ${status} failed`);
}

const converted = await api(`/prospects/${lead.id}/convert`, {
  token,
  method: 'POST',
  body: {},
});
const replay = await api(`/prospects/${lead.id}/convert`, {
  token,
  method: 'POST',
  body: {},
});
assert(converted.id === replay.id, 'Lead conversion was not idempotent');
const clientId = converted.id;
const timeline = await api(`/crm/timeline/client/${clientId}`, { token });
assert(timeline.items.length > 0, 'Converted client timeline is empty');

const dossierOne = await api('/dossiers', {
  token,
  method: 'POST',
  body: { clientId, type: 'VEHICLE_SALE_DDP', salesUserId: assignees[0].id },
});
const dossierTwo = await api('/dossiers', {
  token,
  method: 'POST',
  body: { clientId, type: 'VEHICLE_SALE_CIF', salesUserId: assignees[0].id },
});
assert(dossierOne.id !== dossierTwo.id, 'Client could not receive two dossiers');

const supplier = await api('/partners', {
  token,
  method: 'POST',
  body: {
    name: `Smoke Supplier ${nonce}`,
    type: 'supplier',
    supplierType: 'vehicle_exporter',
    country: 'CN',
    preferredCurrency: 'DZD',
    incoterms: ['FOB', 'CIF'],
    averageLeadTimeDays: 35,
    paymentTerms: '30% acompte, solde avant embarquement',
    deliveryTerms: 'Port de départ convenu',
  },
});
await api(`/partners/${supplier.id}/contacts`, {
  token,
  method: 'POST',
  body: {
    name: 'Export Desk',
    role: 'Commercial',
    phone: '+8613800000000',
    whatsapp: '+8613800000000',
    wechat: `smoke_${nonce}`,
    preferred: true,
  },
});
const supplierTransitions =
  supplier.supplierStatus === 'TO_VERIFY'
    ? ['VERIFIED', 'ACTIVE']
    : supplier.supplierStatus === 'VERIFIED'
      ? ['ACTIVE']
      : [];
for (const status of supplierTransitions) {
  await api(`/partners/${supplier.id}/status`, {
    token,
    method: 'POST',
    body: { status, reason: 'Smoke supplier verification' },
  });
}
const bank = await api(`/partners/${supplier.id}/bank-accounts`, {
  token,
  method: 'POST',
  body: {
    label: 'Compte fournisseur test',
    bankName: 'Smoke Bank',
    currency: 'DZD',
    details: { accountNumber: `TEST-${nonce}`, beneficiary: 'Smoke Supplier' },
  },
});
await api(`/partners/${supplier.id}/bank-accounts/${bank.id}`, {
  token,
  method: 'PATCH',
  body: { bankName: 'Smoke Bank Updated' },
});

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nZQAAAAASUVORK5CYII=',
  'base64',
);
const offerForm = new FormData();
for (const [key, value] of Object.entries({
  supplierId: supplier.id,
  brand: 'BYD',
  model: 'Seal',
  version: 'Comfort',
  year: '2026',
  condition: 'new',
  mileage: '12',
  specification: JSON.stringify({ transmission: 'automatic', color: 'white' }),
  supplierPrice: '2000000',
  currency: 'DZD',
  incoterm: 'FOB',
  location: 'Shanghai',
  availableQuantity: '2',
  leadTimeDays: '35',
  validFrom: new Date(Date.now() - 60_000).toISOString(),
  validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  paymentConditions: '30/70',
})) {
  offerForm.append(key, value);
}
for (let index = 0; index < 3; index += 1) {
  offerForm.append(
    'photos',
    new Blob([Buffer.concat([onePixelPng, Buffer.from([index])])], {
      type: 'image/png',
    }),
    `offer-${index + 1}.png`,
  );
}
const offer = await api('/offers/with-photos', {
  token,
  method: 'POST',
  form: offerForm,
});
assert(
  !('cifPrice' in offer) && !('ddpPrice' in offer) && !('purchasePrice' in offer),
  'Supplier offer API exposed customer or legacy pricing fields',
);
await api(`/offers/${offer.id}`, {
  token,
  method: 'PATCH',
  body: { supplierPrice: 2050000, revisionReason: 'Supplier updated price' },
});
const offerDetail = await api(`/offers/${offer.id}`, { token });
assert(offerDetail.revisions.length >= 2, 'Offer price history was overwritten');
for (const status of ['UNDER_VERIFICATION', 'VALIDATED']) {
  await api(`/offers/${offer.id}/status`, {
    token,
    method: 'POST',
    body: { status, reason: 'Smoke offer verification' },
  });
}

const quote = await api('/quotations', {
  token,
  method: 'POST',
  body: {
    dossierId: dossierOne.id,
    sourceOfferId: offer.id,
    priceBasis: 'DDP',
    currency: 'DZD',
    vehicleAmount: 2050000,
    freightAmount: 200000,
    customsAmount: 300000,
    transitAmount: 50000,
    marginAmount: 400000,
    finalCustomerPrice: 3000000,
    paymentConditions: '30% acompte, solde avant livraison',
  },
});
await api(`/quotations/${quote.id}/revisions`, {
  token,
  method: 'POST',
  body: {
    reason: 'Customer pricing revision',
    vehicleAmount: 2050000,
    freightAmount: 210000,
    customsAmount: 300000,
    transitAmount: 50000,
    marginAmount: 410000,
    finalCustomerPrice: 3020000,
  },
});
const quoteDetail = await api(`/quotations/${quote.id}`, { token });
assert(quoteDetail.revisions.length === 2, 'Quotation revision was not appended');

await api(`/offers/${offer.id}/assign`, {
  token,
  method: 'POST',
  body: { dossierId: dossierOne.id },
});

const contractDocumentForm = new FormData();
contractDocumentForm.append('title', `Contrat signé smoke ${nonce}`);
contractDocumentForm.append('sensitivity', 'RESTRICTED_CONTRACT');
contractDocumentForm.append('dossierId', dossierOne.id);
contractDocumentForm.append(
  'file',
  new Blob(
    [Buffer.from('%PDF-1.4\n% Synthetic signed contract for ERP smoke test\n%%EOF\n')],
    { type: 'application/pdf' },
  ),
  'contract.pdf',
);
const document = await api('/ged/documents', {
  token,
  method: 'POST',
  form: contractDocumentForm,
});
await api(`/ged/documents/${document.id}/links`, {
  token,
  method: 'POST',
  body: { clientId },
});
await api(`/ged/documents/${document.id}/validation`, {
  token,
  method: 'POST',
  body: { status: 'VALIDATED' },
});
const contract = await api('/contracts', {
  token,
  method: 'POST',
  body: {
    clientId,
    dossierId: dossierOne.id,
    totalAmount: 3000000,
    currency: 'DZD',
    requiredDeposit: 900000,
    schedule: [
      { label: 'Acompte', amount: 900000 },
      { label: 'Solde', amount: 2100000 },
    ],
  },
});
await api(`/contracts/${contract.id}/sign`, {
  token,
  method: 'POST',
  body: { signedDocumentId: document.id },
});

let accounts = await api('/finance/treasury/accounts', { token });
let dzdAccount = accounts.find(
  (account) => account.currency === 'DZD' && account.status === 'ACTIVE',
);
if (!dzdAccount) {
  dzdAccount = await api('/finance/treasury/accounts', {
    token,
    method: 'POST',
    body: {
      code: `SMOKE-${String(nonce).slice(-6)}`,
      name: 'Compte smoke DZD',
      type: 'BANK',
      currency: 'DZD',
      openingBalance: 0,
    },
  });
}
const collection = await api(`/contracts/${contract.id}/collections`, {
  token,
  method: 'POST',
  body: {
    amount: 900000,
    currency: 'DZD',
    paymentMethod: 'BANK_TRANSFER',
    reference: `CLIENT-${nonce}`,
    idempotencyKey: randomUUID(),
  },
});
await api(`/finance/payments/${collection.id}/confirm`, {
  token,
  method: 'POST',
  body: { treasuryAccountId: dzdAccount.id, supportingDocumentId: document.id },
});
const contractAfterCollection = await api(`/contracts/${contract.id}`, { token });
assert(contractAfterCollection.totalPaid === '900000', 'Contract paid total is wrong');
assert(
  contractAfterCollection.remainingBalance === '2100000',
  'Contract remaining balance is wrong',
);

for (let index = 0; index < 3; index += 1) {
  await api(`/dossiers/${dossierOne.id}/advance-status`, {
    token,
    method: 'POST',
    body: { comment: 'Smoke workflow advance' },
  });
}
const materialized = await api(`/offers/${offer.id}/create-purchase`, {
  token,
  method: 'POST',
  body: {
    dossierId: dossierOne.id,
    vin: `SMOKE${String(nonce).padStart(12, '0').slice(-12)}`,
  },
});
const purchase = materialized.purchase ?? materialized;
const vehicleId = materialized.vehicle?.id ?? purchase.vehicleId;
assert(purchase.sourceOfferRevisionId, 'Purchase did not freeze offer revision');
assert(vehicleId, 'Offer materialization did not create a vehicle');

const supplierPayment = await api('/finance/supplier-payments', {
  token,
  method: 'POST',
  body: {
    supplierId: supplier.id,
    purchaseId: purchase.id,
    paymentKind: 'DEPOSIT',
    amount: 500000,
    currency: 'DZD',
    paymentMethod: 'BANK_TRANSFER',
    reference: `SUPPLIER-${nonce}`,
    idempotencyKey: randomUUID(),
  },
});
await api(`/finance/supplier-payments/${supplierPayment.id}/confirm`, {
  token,
  method: 'POST',
  body: { treasuryAccountId: dzdAccount.id, supportingDocumentId: document.id },
});
const supplierPaymentDetail = await api(
  `/finance/supplier-payments/${supplierPayment.id}`,
  { token },
);
assert(
  supplierPaymentDetail.purchaseRemaining === '1550000.00',
  `Supplier remaining balance is wrong: ${supplierPaymentDetail.purchaseRemaining}`,
);

const shipment = await api('/shipments', {
  token,
  method: 'POST',
  body: {
    blNumber: `BL-${nonce}`,
    vesselName: 'Smoke Vessel',
    containerNumber: `CONT-${nonce}`,
    departurePort: 'Shanghai',
    arrivalPort: 'Alger',
    vehicleIds: [vehicleId],
  },
});
for (const status of ['booked', 'loading', 'inTransit', 'arrived']) {
  await api(`/shipments/${shipment.id}/transition`, {
    token,
    method: 'POST',
    body: { status, comment: 'Smoke maritime workflow' },
  });
}
const customsPage = await api(`/customs?shipmentId=${shipment.id}`, { token });
assert(customsPage.items.length === 1, 'Arrival did not create one customs file per vehicle');
const customs = customsPage.items[0];
assert(
  customs.vehicleId === vehicleId && customs.dossierId === dossierOne.id,
  'Customs vehicle/dossier linkage is wrong',
);
for (const status of [
  'FILE_TRANSMITTED',
  'CLEARANCE_IN_PROGRESS',
  'INSPECTION',
  'DUTIES_TAXES',
  'RELEASE',
  'PORT_EXIT',
  'CLOSED',
]) {
  await api(`/customs/${customs.id}/transition`, {
    token,
    method: 'POST',
    body: { status, comment: 'Smoke customs workflow' },
  });
}

const dossierFinance = await api(`/finance/dossiers/${dossierOne.id}/summary`, {
  token,
});
assert(dossierFinance.revenue.collected === '900000', 'Dossier collection KPI is wrong');
assert(dossierFinance.costs.purchaseCost === '2050000', 'Committed purchase cost is missing');
const kpis = await api('/call-center/kpis', { token });
assert(kpis.callCenter && kpis.crm, 'Database-backed KPI groups are missing');
const audit = await api('/audit?page=1&limit=100', { token });
assert(
  audit.items.some((entry) => entry.action === 'SUPPLIER_BANK_UPDATED'),
  'Sensitive supplier-bank update was not audited',
);

const call = await api('/call-center/simulator/calls/inbound', {
  token,
  method: 'POST',
  body: {
    providerEventId: `evt-${nonce}`,
    providerCallId: `call-${nonce}`,
    companyNumber: '+21321000000',
    externalNumber: phone,
    state: 'QUEUED',
  },
});
assert(
  call.call?.clientId === clientId && call.call?.prospectId === null,
  'Caller lookup did not select the canonical converted Client',
);

process.stdout.write(
  `${JSON.stringify({
    status: 'PASS',
    authentication: true,
    leadDuplicateDetection: true,
    leadConversion: true,
    multipleDossiers: true,
    supplierAudit: true,
    offerRevisionSnapshot: true,
    quotationRevision: true,
    contractCollection: true,
    supplierPayment: true,
    shipmentCustomsAutomation: true,
    gedEncryptionPath: true,
    financeMargin: true,
    kpis: true,
    callCenterStub: true,
  })}\n`,
);
