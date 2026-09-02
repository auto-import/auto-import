const required = [
  'CRM_CATALOGUE_BASE_URL',
  'CRM_CATALOGUE_ADMIN_EMAIL',
  'CRM_CATALOGUE_ADMIN_PASSWORD',
];

if (process.env.CRM_CATALOGUE_CONFIRM !== 'RUN_LOCAL_MUTATION_SMOKE') {
  throw new Error('Refusing to mutate without CRM_CATALOGUE_CONFIRM');
}
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const baseUrl = process.env.CRM_CATALOGUE_BASE_URL.replace(/\/$/, '');
if (!['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname)) {
  throw new Error('This mutation smoke is restricted to localhost');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const tested = [];
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
  tested.push({ method, path, status: response.status });
  if (!response.ok || payload?.success !== true) {
    throw new Error(
      `${method} ${path} returned HTTP ${response.status}: ${JSON.stringify(payload)}`,
    );
  }
  return payload.data;
}

async function login() {
  return api('/auth/login', {
    method: 'POST',
    body: {
      email: process.env.CRM_CATALOGUE_ADMIN_EMAIL,
      password: process.env.CRM_CATALOGUE_ADMIN_PASSWORD,
    },
  });
}

const firstSession = await login();
const token = firstSession.accessToken;
assert(token, 'Login did not return an access token');

if (process.env.CRM_CATALOGUE_VERIFY_VIN) {
  const vin = process.env.CRM_CATALOGUE_VERIFY_VIN;
  const catalogue = await api(
    `/catalogue?search=${encodeURIComponent(vin)}&limit=10`,
    { token },
  );
  assert(
    catalogue.items.some((item) => item.vin === vin),
    'Purchased vehicle did not survive the server restart',
  );
  console.log(
    JSON.stringify(
      { result: 'PASS', restartPersistence: true, vin, endpoints: tested },
      null,
      2,
    ),
  );
  process.exit(0);
}

const references = await api('/crm/reference-data', { token });
const reference = (kind, code) =>
  references.find((item) => item.kind === kind && item.code === code);
const channel = reference('ENTRY_CHANNEL', 'MANUAL');
const google = reference('MARKETING_SOURCE', 'GOOGLE_ADS');
const youtube = reference('MARKETING_SOURCE', 'YOUTUBE');
assert(channel && google && youtube, 'Required CRM reference data is missing');

const assignees = await api('/prospects/assignees', { token });
assert(assignees.length > 0, 'No lead/client assignee is available');
const assignedTo = assignees[0].id;
const nonce = `${Date.now()}`;
const phone = (suffix) => `055${nonce.slice(-5)}${suffix}`;

const shippingLead = await api('/prospects', {
  token,
  method: 'POST',
  body: {
    firstName: 'Smoke',
    lastName: `Shipping-${nonce}`,
    phone: phone('01'),
    entryChannelId: channel.id,
    marketingSourceId: google.id,
    assignedTo,
    qualification: 'HOT',
    needType: 'SHIPPING',
    shippingDescription: 'Expédition test API',
    shippingCargoType: 'Véhicule en caisse',
    shippingDestination: 'Port d’Alger',
    shippingRequirements: 'Conteneur fermé',
  },
});
assert(shippingLead.needType === 'SHIPPING', 'Shipping need was not persisted');
assert(
  (shippingLead.vehicleRequests?.length ?? 0) === 0,
  'Shipping lead created a vehicle request',
);
const updatedShippingLead = await api(`/prospects/${shippingLead.id}`, {
  token,
  method: 'PATCH',
  body: { shippingRequirements: 'Conteneur fermé et assuré' },
});
assert(
  updatedShippingLead.shippingRequirements === 'Conteneur fermé et assuré',
  'Shipping lead update was not persisted',
);

const vehicleLead = await api('/prospects', {
  token,
  method: 'POST',
  body: {
    firstName: 'Smoke',
    lastName: `Vehicle-${nonce}`,
    phone: phone('02'),
    entryChannelId: channel.id,
    marketingSourceId: youtube.id,
    assignedTo,
    qualification: 'WARM',
    needType: 'VEHICLE',
    requirement: {
      brand: 'BYD',
      model: 'Seal',
      minYear: 2025,
      currency: 'USD',
      requirements: 'Automatique',
    },
  },
});
assert(vehicleLead.needType === 'VEHICLE', 'Vehicle need was not persisted');
assert(
  (vehicleLead.vehicleRequests?.length ?? 0) > 0,
  'Vehicle lead did not create a vehicle request',
);

for (const status of ['CONTACTED', 'QUALIFIED', 'APPOINTMENT']) {
  await api(`/prospects/${shippingLead.id}/transition`, {
    token,
    method: 'POST',
    body: { status, reason: 'CRM/catalogue smoke' },
  });
}
const converted = await api(`/prospects/${shippingLead.id}/convert`, {
  token,
  method: 'POST',
  body: {},
});
const conversionReplay = await api(`/prospects/${shippingLead.id}/convert`, {
  token,
  method: 'POST',
  body: {},
});
assert(converted.id === conversionReplay.id, 'Lead conversion created a duplicate');

const convertedClients = await api('/clients?convertedOnly=true&limit=100', {
  token,
});
assert(
  convertedClients.items.some((client) => client.id === converted.id),
  'Converted client is missing from the dedicated filter',
);
const convertedBeforeIdentity = convertedClients.items.find(
  (client) => client.id === converted.id,
);
assert(
  convertedBeforeIdentity.identityCompletionStatus === 'MISSING',
  'Converted client missing-information indicator is incorrect',
);

const identityForm = new FormData();
identityForm.append('identityDocumentType', 'NATIONAL_ID');
identityForm.append('nin', `1234567890${nonce.slice(-8)}`);
identityForm.append(
  'identityDocument',
  new Blob(
    [
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nZQAAAAASUVORK5CYII=',
        'base64',
      ),
    ],
    { type: 'image/png' },
  ),
  'identity-smoke.png',
);
await api(`/clients/${converted.id}/identity-document`, {
  token,
  method: 'POST',
  form: identityForm,
});
const convertedAfterIdentity = await api(`/clients/${converted.id}`, { token });
assert(
  convertedAfterIdentity.identityDocumentType === 'NATIONAL_ID' &&
    convertedAfterIdentity.identityConfigured.nin,
  'Converted client NIN metadata was not persisted securely',
);

const passportClient = await api('/clients', {
  token,
  method: 'POST',
  body: {
    firstName: 'Smoke',
    lastName: `Passport-${nonce}`,
    phone: phone('03'),
    assignedTo,
    identityDocumentType: 'PASSPORT',
    passportNumber: `P${nonce.slice(-8)}`,
    identityIssueCountry: 'DZ',
    identityIssueDate: '2025-01-01',
    passportExpiry: '2035-01-01',
  },
});
assert(
  passportClient.identityDocumentType === 'PASSPORT' &&
    passportClient.identityConfigured.passport &&
    !('passportEncrypted' in passportClient),
  'Passport identity was not protected and persisted',
);
const optionalIdentityClient = await api('/clients', {
  token,
  method: 'POST',
  body: {
    firstName: 'Smoke',
    lastName: `Optional-${nonce}`,
    phone: phone('04'),
    assignedTo,
  },
});
assert(optionalIdentityClient.id, 'Client creation incorrectly requires identity');

const partners = await api('/partners?type=supplier&limit=100', { token });
const supplier = partners.items.find(
  (item) => item.supplierStatus === 'ACTIVE' || item.status === 'active',
);
assert(supplier, 'No active supplier is available for the offer smoke');

const line = (index) => ({
  brand: index % 2 ? 'Geely' : 'BYD',
  model: `Smoke-${index}-${nonce}`,
  version: index % 2 ? 'Premium' : 'Comfort',
  year: 2026,
  condition: 'new',
  mileage: index,
  specification: {
    transmission: 'automatic',
    engine: '1.5L',
    color: index % 2 ? 'black' : 'white',
  },
  supplierPrice: 20000 + index,
  currency: 'USD',
  quantity: 1,
});
const vehicles = [1, 2, 3, 4, 5].map(line);
const rootLine = (index) => {
  const { quantity: _quantity, ...vehicle } = line(index);
  return vehicle;
};
const offer = await api('/offers', {
  token,
  method: 'POST',
  body: {
    supplierId: supplier.id,
    ...rootLine(1),
    availableQuantity: 5,
    incoterm: 'CFR',
    location: 'Shanghai',
    validFrom: new Date(Date.now() - 60_000).toISOString(),
    validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    vehicles,
  },
});
assert(offer.vehicles.length === 5, 'The offer did not persist five vehicles');
assert(
  offer.supplierReference == null,
  'Create workflow unexpectedly persisted a supplier reference',
);
await api(`/offers/${offer.id}`, {
  token,
  method: 'PATCH',
  body: { notes: 'Offer smoke updated', revisionReason: 'API update smoke' },
});
for (const status of ['UNDER_VERIFICATION', 'VALIDATED']) {
  await api(`/offers/${offer.id}/status`, {
    token,
    method: 'POST',
    body: { status, reason: 'Offer workflow smoke' },
  });
}
const validatedOffer = await api(`/offers/${offer.id}`, { token });
const purchaseLine = validatedOffer.vehicles[0];
const lostLine = validatedOffer.vehicles[1];
const vin = `SMOKE${nonce.slice(-10)}`;
const purchased = await api(
  `/offers/${offer.id}/vehicles/${purchaseLine.id}/purchase`,
  { token, method: 'POST', body: { vin } },
);
assert(
  purchased.purchase.sourceOfferVehicleId === purchaseLine.id &&
    purchased.vehicle.vin === vin,
  'Purchase did not preserve offer vehicle lineage',
);
await api(`/offers/${offer.id}/vehicles/${lostLine.id}/lost`, {
  token,
  method: 'POST',
  body: { reason: 'Supplier allocation lost during smoke' },
});
const offerAfterActions = await api(`/offers/${offer.id}`, { token });
assert(
  offerAfterActions.vehicles.find((item) => item.id === purchaseLine.id).status ===
    'PURCHASED',
  'Purchased line status is incorrect',
);
assert(
  offerAfterActions.vehicles.find((item) => item.id === lostLine.id).status ===
    'LOST_DEAL',
  'Lost line status is incorrect',
);

const lostOffer = await api('/offers', {
  token,
  method: 'POST',
  body: {
    supplierId: supplier.id,
    ...rootLine(6),
    availableQuantity: 1,
    incoterm: 'FCA',
    validFrom: new Date(Date.now() - 60_000).toISOString(),
    validUntil: new Date(Date.now() + 10 * 86_400_000).toISOString(),
  },
});
await api(`/offers/${lostOffer.id}/status`, {
  token,
  method: 'POST',
  body: { status: 'LOST_DEAL', reason: 'Not selected by purchasing' },
});

const expiredOffer = await api('/offers', {
  token,
  method: 'POST',
  body: {
    supplierId: supplier.id,
    ...rootLine(7),
    availableQuantity: 1,
    incoterm: 'DDP',
    validFrom: new Date(Date.now() - 60_000).toISOString(),
    validUntil: new Date(Date.now() + 10 * 86_400_000).toISOString(),
  },
});
await api(`/offers/${expiredOffer.id}/status`, {
  token,
  method: 'POST',
  body: { status: 'EXPIRED', reason: 'Expiry smoke' },
});

const stats = await api('/offers/statistics', { token });
assert(stats.byStatus.purchased >= 1, 'Purchased KPI is not database-backed');
assert(stats.byStatus.lost >= 1, 'Lost-deal KPI is not database-backed');
assert(stats.byStatus.expired >= 1, 'Expired KPI is not database-backed');

const catalogue = await api(`/catalogue?search=${encodeURIComponent(vin)}&limit=10`, {
  token,
});
const catalogueVehicle = catalogue.items.find((item) => item.vin === vin);
assert(catalogueVehicle, 'Purchased vehicle is missing from Catalogue');
assert(
  catalogueVehicle.supplier.id === supplier.id &&
    catalogueVehicle.purchases[0].sourceOffer.id === offer.id &&
    catalogueVehicle.purchases[0].sourceOfferVehicle.id === purchaseLine.id,
  'Catalogue did not preserve supplier/offer/purchase lineage',
);
const lostCatalogue = await api(
  `/catalogue?search=${encodeURIComponent(line(6).model)}&limit=10`,
  { token },
);
assert(lostCatalogue.items.length === 0, 'A lost offer entered Catalogue');
const expiredCatalogue = await api(
  `/catalogue?search=${encodeURIComponent(line(7).model)}&limit=10`,
  { token },
);
assert(expiredCatalogue.items.length === 0, 'An expired offer entered Catalogue');

const secondSession = await login();
const catalogueAfterLogin = await api(
  `/catalogue?search=${encodeURIComponent(vin)}&limit=10`,
  { token: secondSession.accessToken },
);
assert(
  catalogueAfterLogin.items.some((item) => item.vin === vin),
  'Catalogue purchase did not survive a new login session',
);

console.log(
  JSON.stringify(
    {
      result: 'PASS',
      assertions: {
        googleAds: true,
        youtube: true,
        shippingLead: shippingLead.id,
        vehicleLead: vehicleLead.id,
        convertedClient: converted.id,
        passportClient: passportClient.id,
        optionalIdentityClient: optionalIdentityClient.id,
        offer: offer.id,
        offerVehicles: offer.vehicles.length,
        purchasedVehicle: purchased.vehicle.id,
        catalogueVehicle: catalogueVehicle.id,
        lostOffer: lostOffer.id,
        expiredOffer: expiredOffer.id,
      },
      endpoints: tested,
      http500Count: tested.filter((item) => item.status === 500).length,
    },
    null,
    2,
  ),
);
