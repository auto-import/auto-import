import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

const frontendUrl =
  process.env.POST_UAT_FRONTEND_URL ?? "http://localhost:3101";
const apiUrl = process.env.POST_UAT_API_URL ?? "http://localhost:3100/api";
const debugUrl = process.env.POST_UAT_DEBUG_URL ?? "http://localhost:9333";
const password = process.env.DEMO_SEED_PASSWORD;
const storageRoot = process.env.POST_UAT_STORAGE_ROOT;
const artifactRoot = resolve(
  process.env.POST_UAT_ARTIFACT_ROOT ??
    "../.codex-browser-artifacts-post-uat/evidence",
);
if (!password || !storageRoot) {
  throw new Error("DEMO_SEED_PASSWORD and POST_UAT_STORAGE_ROOT are required");
}
mkdirSync(artifactRoot, { recursive: true });

const sleep = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function filesUnder(root) {
  const results = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) results.push(...filesUnder(path));
    else results.push(path);
  }
  return results;
}

const fixtureFiles = filesUnder(resolve(storageRoot));
const pdfPath = fixtureFiles.find((path) =>
  path.toLowerCase().endsWith(".pdf"),
);
const pngPaths = fixtureFiles
  .filter((path) => path.toLowerCase().endsWith(".png"))
  .filter(
    (path, index, values) =>
      values.findIndex(
        (candidate) =>
          sha256(readFileSync(candidate)) === sha256(readFileSync(path)),
      ) === index,
  )
  .slice(0, 3);
assert(
  pdfPath && pngPaths.length === 3,
  "Disposable PDF/PNG fixtures are missing",
);
const pdfBytes = readFileSync(pdfPath);
const pngBytes = pngPaths.map((path) => readFileSync(path));

async function rawRequest(path, { method = "GET", body, token, form } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.arrayBuffer();
  return { response, payload };
}

async function request(path, options = {}) {
  const result = await rawRequest(path, options);
  if (!result.response.ok || !result.payload?.success) {
    throw new Error(
      `${options.method ?? "GET"} ${path}: ${result.response.status} ${JSON.stringify(result.payload)}`,
    );
  }
  return result.payload.data;
}

async function expectStatus(path, status, options = {}) {
  const result = await rawRequest(path, options);
  assert(
    result.response.status === status,
    `${options.method ?? "GET"} ${path}: expected ${status}, received ${result.response.status}`,
  );
  return result.payload;
}

async function login(email) {
  return request("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

function collection(value, label) {
  const records = Array.isArray(value) ? value : value?.items;
  assert(Array.isArray(records), `${label} is not a collection`);
  return records;
}

function multipart(fields, files) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, String(value));
  }
  for (const file of files) {
    form.append(
      file.field,
      new Blob([file.bytes], { type: file.type }),
      file.name,
    );
  }
  return form;
}

const admin = await login("admin@demo.auto-import.invalid");
const financeUser = await login("finance@demo.auto-import.invalid");
const logistics = await login("logistics@demo.auto-import.invalid");
const restricted = await login("readonly@demo.auto-import.invalid");
const secondary = await login("secondary-admin@demo.auto-import.invalid");
const token = admin.accessToken;

await request("/finance/summary", { token: financeUser.accessToken });
await request("/customs?limit=5", { token: logistics.accessToken });
await expectStatus("/settings/integrations", 403, {
  token: restricted.accessToken,
});

await expectStatus("/clients", 400, {
  method: "POST",
  token,
  body: {
    firstName: "NIN",
    lastName: "Required",
    nationality: "DZ",
  },
});
const foreignClient = await request("/clients", {
  method: "POST",
  token,
  body: {
    firstName: "Foreign",
    lastName: `UAT-${Date.now()}`,
    nationality: "CN",
  },
});
assert(!foreignClient.ninMasked, "Foreign client unexpectedly required a NIN");

const identitySuffix = String(Date.now()).slice(-8);
const identityForm = multipart(
  {
    firstName: "Nadia",
    lastName: `UAT-${identitySuffix}`,
    nationality: "DZ",
    nin: `1260826000${identitySuffix}`.slice(0, 18),
    passportNumber: `0UAT${identitySuffix.slice(-4)}`,
    identityIssueDate: "2025-01-10T00:00:00.000Z",
    passportExpiry: "2030-01-10T00:00:00.000Z",
  },
  [
    {
      field: "passportScan",
      bytes: pdfBytes,
      type: "application/pdf",
      name: "passeport-signé-عقد.pdf",
    },
  ],
);
const identityCreated = await request("/clients/with-passport", {
  method: "POST",
  token,
  form: identityForm,
});
const client = identityCreated.client;
assert(
  client.ninMasked?.endsWith(identitySuffix.slice(-4)),
  "NIN was not masked",
);
assert(
  client.passportNumberMasked?.endsWith(identitySuffix.slice(-4)),
  "Passport was not masked",
);
assert(
  !JSON.stringify(client).includes("Encrypted"),
  "Encrypted identity leaked from create",
);

const clientRead = await request(`/clients/${client.id}`, { token });
assert(
  clientRead.ninMasked && clientRead.passportNumberMasked,
  "Masked identity missing",
);
assert(
  !JSON.stringify(clientRead).match(
    /ninEncrypted|ninHash|passportEncrypted|passportHash/,
  ),
  "Sensitive storage fields leaked",
);
const passportDocuments = collection(
  await request(`/documents?clientId=${client.id}&limit=20`, { token }),
  "passport documents",
);
const passportDocument = passportDocuments.find(
  (document) => document.documentType === "PASSPORT_SCAN",
);
assert(
  passportDocument?.client?.id === client.id,
  "Passport/client association missing",
);
const passportDownload = await rawRequest(
  `/documents/${passportDocument.id}/download`,
  { token },
);
assert(passportDownload.response.ok, "Passport download failed");
assert(
  sha256(Buffer.from(passportDownload.payload)) === sha256(pdfBytes),
  "Passport download checksum mismatch",
);
assert(
  passportDownload.response.headers
    .get("content-disposition")
    ?.includes("filename*=UTF-8''"),
  "UTF-8 filename header is missing",
);
await expectStatus(`/documents/${passportDocument.id}/download`, 404, {
  token: secondary.accessToken,
});

const suppliers = collection(
  await request("/partners?type=supplier&limit=20", { token }),
  "suppliers",
);
const supplier = suppliers[0];
assert(supplier, "No supplier fixture is available");
const offerFields = {
  supplierId: supplier.id,
  brand: "UAT Motors",
  model: `Evidence ${identitySuffix}`,
  version: "Secure Gallery",
  year: "2026",
  condition: "new",
  specification: JSON.stringify({
    engine: "Electric",
    fuelType: "electric",
    transmission: "automatic",
    color: "Silver",
  }),
  purchasePrice: "15000",
  cifPrice: "18000",
  ddpPrice: "23000",
  currency: "USD",
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2027-12-31T23:59:59.000Z",
  availableQuantity: "1",
};
await expectStatus("/offers/with-photos", 400, {
  method: "POST",
  token,
  form: multipart(
    offerFields,
    pngBytes.slice(0, 2).map((bytes, index) => ({
      field: "photos",
      bytes,
      type: "image/png",
      name: `offer-${index + 1}.png`,
    })),
  ),
});
await expectStatus("/offers/with-photos", 400, {
  method: "POST",
  token,
  form: multipart(
    offerFields,
    [0, 1, 2].map((index) => ({
      field: "photos",
      bytes: pngBytes[0],
      type: "image/png",
      name: `duplicate-${index + 1}.png`,
    })),
  ),
});
const offer = await request("/offers/with-photos", {
  method: "POST",
  token,
  form: multipart(
    offerFields,
    pngBytes.map((bytes, index) => ({
      field: "photos",
      bytes,
      type: "image/png",
      name: `véhicule-${index + 1}.png`,
    })),
  ),
});
assert(offer.photos?.length === 3, "Offer gallery is not exactly three photos");
for (const photo of offer.photos) {
  const downloaded = await rawRequest(`/offers/photos/${photo.id}`, { token });
  assert(
    downloaded.response.ok && downloaded.payload.byteLength > 0,
    "Private offer photo failed",
  );
}
await expectStatus(`/offers/photos/${offer.photos[0].id}`, 404, {
  token: secondary.accessToken,
});
const reservation = await request(`/offers/${offer.id}/reservations`, {
  method: "POST",
  token,
  body: { clientId: client.id, quantity: 1 },
});
const purchase = await request(
  `/offers/reservations/${reservation.id}/materialize`,
  {
    method: "POST",
    token,
    body: {
      vin: `UATVIN${identitySuffix}`,
      purchasePrice: 15000,
      sellingPrice: 23000,
    },
  },
);
const materializedVehicle = await request(`/vehicles/${purchase.vehicleId}`, {
  token,
});
assert(
  materializedVehicle.photos?.length === 3,
  "Materialized gallery was not retained",
);
assert(
  materializedVehicle.photos.every((photo) =>
    offer.photos.some((offerPhoto) => offerPhoto.fileId === photo.fileId),
  ),
  "Materialization duplicated or changed gallery assets",
);

let eligiblePageOne = await request(
  "/vehicles/eligible-for-dossier?type=VEHICLE_SALE_DDP&page=1&limit=5",
  { token },
);
if ((eligiblePageOne.pagination?.totalItems ?? 0) <= 5) {
  for (let index = 0; index < 7; index += 1) {
    await request("/vehicles/with-photos", {
      method: "POST",
      token,
      form: multipart(
        {
          vin: `UATSTOCK${identitySuffix}${index}`,
          brand: "UAT Stock",
          model: `Selector ${index + 1}`,
          trim: "Operations",
          bodyType: "SUV",
          drivetrain: "AWD",
          displacement: "1998 cc",
          steeringSide: "left",
          interiorColor: "Black",
          warranty: "24 months",
          year: "2026",
          mileage: String(index),
          condition: "new",
          purchasePrice: "14000",
          sellingPrice: "22000",
          currency: "USD",
          status: "available",
          acquisitionType: "stock",
          supplierId: supplier.id,
        },
        pngBytes.map((bytes, photoIndex) => ({
          field: "photos",
          bytes,
          type: "image/png",
          name: `selector-${index + 1}-${photoIndex + 1}.png`,
        })),
      ),
    });
  }
  eligiblePageOne = await request(
    "/vehicles/eligible-for-dossier?type=VEHICLE_SALE_DDP&page=1&limit=5",
    { token },
  );
}
const eligiblePageTwo = await request(
  "/vehicles/eligible-for-dossier?type=VEHICLE_SALE_DDP&page=2&limit=5",
  { token },
);
assert(
  collection(eligiblePageTwo, "eligible page two").length > 0,
  "Eligible selector stopped at page one",
);
const eligible = [
  ...collection(eligiblePageOne, "eligible page one"),
  ...collection(eligiblePageTwo, "eligible page two"),
];
assert(
  eligible.length >= 2,
  "Two eligible vehicles are required for evidence acceptance",
);
const excludedPage = await request(
  "/vehicles/eligible-for-dossier?type=VEHICLE_SALE_DDP&page=1&limit=50&includeExcluded=true",
  { token },
);
assert(
  collection(excludedPage, "selector diagnostics").some(
    (vehicle) => !vehicle.eligibility.eligible && vehicle.eligibility.reason,
  ),
  "Selector exclusion diagnostics are missing",
);
const searchTarget = eligiblePageTwo.items[0];
const searchResult = await request(
  `/vehicles/eligible-for-dossier?type=VEHICLE_SALE_DDP&page=1&limit=5&search=${encodeURIComponent(searchTarget.vin ?? searchTarget.model)}`,
  { token },
);
assert(
  collection(searchResult, "eligible search").some(
    (vehicle) => vehicle.id === searchTarget.id,
  ),
  "Server search did not find a page-two vehicle",
);

const dossier = await request("/dossiers", {
  method: "POST",
  token,
  body: {
    clientId: client.id,
    type: "VEHICLE_SALE_DDP",
    vehicleIds: eligible.slice(0, 2).map((vehicle) => vehicle.id),
  },
});
await expectStatus("/dossiers", 409, {
  method: "POST",
  token,
  body: {
    clientId: foreignClient.id,
    type: "VEHICLE_SALE_DDP",
    vehicleIds: [eligible[0].id],
  },
});
await request(`/dossiers/${dossier.id}/status`, {
  method: "PATCH",
  token,
  body: { status: "clientConfirmed" },
});
const contractBlocked = await expectStatus(
  `/dossiers/${dossier.id}/status`,
  409,
  {
    method: "PATCH",
    token,
    body: { status: "contractSigned" },
  },
);
assert(
  contractBlocked.error?.code === "DOSSIER_SIGNED_CONTRACT_REQUIRED" ||
    contractBlocked.code === "DOSSIER_SIGNED_CONTRACT_REQUIRED",
  "Signed-contract gate did not return its stable code",
);
const contractDocument = await request("/documents/upload", {
  method: "POST",
  token,
  form: multipart(
    {
      dossierId: dossier.id,
      kind: "CONTRACT",
      documentType: "SIGNED_CONTRACT",
      title: "Contrat signé UAT",
    },
    [
      {
        field: "file",
        bytes: pdfBytes,
        type: "application/pdf",
        name: "contrat-signé-عقد.pdf",
      },
    ],
  ),
});
assert(
  contractDocument.client?.id === client.id,
  "Dossier client was not derived for its document",
);
await request(`/dossiers/${dossier.id}/status`, {
  method: "PATCH",
  token,
  body: { status: "contractSigned" },
});

const plan = await request("/finance/payment-plans", {
  method: "POST",
  token,
  body: {
    clientId: client.id,
    dossierId: dossier.id,
    totalAmount: 100000,
    currency: "DZD",
    strategy: "FULL_UPFRONT",
  },
});
const installment = plan.installments[0];
const payment = await request("/finance/payments", {
  method: "POST",
  token,
  body: {
    clientId: client.id,
    dossierId: dossier.id,
    installmentId: installment.id,
    amount: 100000,
    currency: "DZD",
    paymentMethod: "bank_transfer",
    reference: `UAT-${identitySuffix}`,
    idempotencyKey: `post-uat-${identitySuffix}`,
  },
});
await request(`/finance/payments/${payment.id}/confirm`, {
  method: "POST",
  token,
});
const paidSummary = await request(`/finance/dossiers/${dossier.id}/summary`, {
  token,
});
assert(
  Number(paidSummary.revenue.collected) === 100000,
  "Dossier finance did not reconcile",
);
assert(
  paidSummary.revenue.state === "PAID",
  "Dossier finance state is not PAID",
);
const afterPayment = await request(`/dossiers/${dossier.id}`, { token });
assert(
  afterPayment.status === "contractSigned",
  "Payment auto-advanced the dossier",
);

const beforeTransit = [
  "depositReceived",
  "purchaseConfirmed",
  "supplierPaid",
  "inspection",
  "booking",
  "loading",
  "billOfLadingIssued",
  "inTransit",
];
for (const status of beforeTransit) {
  await request(`/dossiers/${dossier.id}/status`, {
    method: "PATCH",
    token,
    body: { status },
  });
}
const checkpoints = [
  ["ARRIVAL_AT_PORT", "arrivedAtPort"],
  ["CUSTOMS", "customsClearance"],
  ["PORT_EXIT", "portExit"],
  ["LOCAL_TRANSPORT", "localTransport"],
];
for (const [checkpoint, targetStatus] of checkpoints) {
  if (checkpoint === "PORT_EXIT") {
    await request(`/dossiers/${dossier.id}/status`, {
      method: "PATCH",
      token,
      body: { status: "customsReleased" },
    });
  }
  const missingAll = await expectStatus(`/dossiers/${dossier.id}/status`, 409, {
    method: "PATCH",
    token,
    body: { status: targetStatus },
  });
  const firstMissing =
    missingAll.error?.missingVehicleIds ?? missingAll.missingVehicleIds;
  assert(
    firstMissing?.length === 2,
    `${checkpoint} did not report both missing vehicles`,
  );
  for (let index = 0; index < 2; index += 1) {
    await request(`/documents/dossiers/${dossier.id}/evidence`, {
      method: "POST",
      token,
      form: multipart(
        {
          vehicleId: eligible[index].id,
          checkpoint,
          note: "Post-UAT acceptance",
        },
        [
          {
            field: "file",
            bytes: pngBytes[index],
            type: "image/png",
            name: `${checkpoint.toLowerCase()}-${index + 1}.png`,
          },
        ],
      ),
    });
    if (index === 0) {
      const missingOne = await expectStatus(
        `/dossiers/${dossier.id}/status`,
        409,
        {
          method: "PATCH",
          token,
          body: { status: targetStatus },
        },
      );
      const missingIds =
        missingOne.error?.missingVehicleIds ?? missingOne.missingVehicleIds;
      assert(
        missingIds?.length === 1,
        `${checkpoint} did not retain its per-vehicle gate`,
      );
    }
  }
  await request(`/dossiers/${dossier.id}/status`, {
    method: "PATCH",
    token,
    body: { status: targetStatus },
  });
}
const evidenceSummary = await request(
  `/documents/dossiers/${dossier.id}/evidence`,
  { token },
);
assert(evidenceSummary.evidence.length === 8, "Evidence matrix is incomplete");
assert(
  evidenceSummary.evidence.every((item) => item.reliedAt),
  "Relied evidence is not immutable",
);

await request(`/finance/payments/${payment.id}/reverse`, {
  method: "POST",
  token,
  body: { reason: "Post-UAT relock proof" },
});
const reversedSummary = await request(
  `/finance/dossiers/${dossier.id}/summary`,
  { token },
);
assert(
  Number(reversedSummary.revenue.collected) === 0,
  "Reversal did not recompute finance",
);
await expectStatus(`/dossiers/${dossier.id}/status`, 400, {
  method: "PATCH",
  token,
  body: { status: "deliveredToClient" },
});
const replacementPayment = await request("/finance/payments", {
  method: "POST",
  token,
  body: {
    clientId: client.id,
    dossierId: dossier.id,
    installmentId: installment.id,
    amount: 100000,
    currency: "DZD",
    paymentMethod: "bank_transfer",
    reference: `UAT-REPLACEMENT-${identitySuffix}`,
    idempotencyKey: `post-uat-replacement-${identitySuffix}`,
  },
});
await request(`/finance/payments/${replacementPayment.id}/confirm`, {
  method: "POST",
  token,
});
await request(`/dossiers/${dossier.id}/status`, {
  method: "PATCH",
  token,
  body: { status: "deliveredToClient" },
});
const organizationFinance = await request("/finance/summary", { token });
assert(
  Number(organizationFinance.totalCollected) >= 100000 &&
    organizationFinance.paymentCount > 0,
  "Organization finance authority is unavailable",
);

await request("/settings/integrations", {
  method: "PUT",
  token,
  body: {
    kind: "telephony",
    providerName: "mock",
    displayName: "Post-UAT simulator",
    enabled: true,
  },
});
const simulatorTest = await request("/settings/integrations/telephony/test", {
  method: "POST",
  token,
});
assert(
  simulatorTest.status === "SIMULATOR_OK" && simulatorTest.live === false,
  "Simulator failed",
);
const secretValue = `task-only-${identitySuffix}`;
const pendingConfig = await request("/settings/integrations", {
  method: "PUT",
  token,
  body: {
    kind: "whatsapp",
    providerName: "provider-pending-adapter",
    displayName: "Pending official adapter",
    publicIdentifiers: { accountId: "task-only-account" },
    credentials: { apiKey: secretValue },
    enabled: false,
  },
});
assert(
  pendingConfig.credentialsMasked &&
    !JSON.stringify(pendingConfig).includes(secretValue),
  "Secret masking failed",
);
const integrationList = await request("/settings/integrations", { token });
assert(
  !JSON.stringify(integrationList).includes(secretValue),
  "Secret leaked from integration list",
);
await expectStatus("/settings/integrations", 400, {
  method: "PUT",
  token,
  body: {
    kind: "whatsapp",
    providerName: "provider-pending-adapter",
    enabled: true,
  },
});
const pendingTest = await request("/settings/integrations/whatsapp/test", {
  method: "POST",
  token,
});
assert(
  pendingTest.status === "NOT_RUN" && pendingTest.live === false,
  "Uninstalled adapter was treated as live",
);
const secondaryIntegrations = await request("/settings/integrations", {
  token: secondary.accessToken,
});
assert(
  secondaryIntegrations.every((item) => item.providerName === "unconfigured"),
  "Integration configuration crossed tenant boundaries",
);

await request("/profile/locale", {
  method: "PATCH",
  token,
  body: { locale: "en" },
});
const sameSession = await request("/auth/me", { token });
assert(
  sameSession.locale === "en",
  "Locale did not update in the current session",
);
const secondSession = await login("admin@demo.auto-import.invalid");
const secondSessionMe = await request("/auth/me", {
  token: secondSession.accessToken,
});
assert(
  secondSessionMe.locale === "en",
  "Locale did not persist to a second session",
);
await request("/profile/locale", {
  method: "PATCH",
  token,
  body: { locale: "fr" },
});

console.log(
  `POST_UAT_API_ACCEPTANCE_PASS dossier=${dossier.reference} vehicles=2 checkpoints=4 evidence=8 documents=${passportDocuments.length + 1} offerPhotos=3 materializedPhotos=3 selectorPages=2 finance=confirm-reverse-reconfirm locale=two-sessions integrations=simulator-only tenants=isolated`,
);

async function connectBrowser() {
  const target = await fetch(
    `${debugUrl}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT" },
  ).then((response) => response.json());
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, rejectPromise) => {
    socket.addEventListener("open", resolvePromise, { once: true });
    socket.addEventListener("error", rejectPromise, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const events = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return void events.push(message);
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message));
    else callback.resolve(message.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolvePromise, rejectPromise) => {
      const id = ++nextId;
      pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
      socket.send(JSON.stringify({ id, method, params }));
    });
  return { events, send, socket };
}

const browser = await connectBrowser();
async function evaluate(expression) {
  const result = await browser.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(
      result.exceptionDetails.text ?? "Browser evaluation failed",
    );
  return result.result.value;
}
async function waitUntil(expression, description) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await evaluate(expression)) return;
    await sleep(200);
  }
  throw new Error(
    `Timed out waiting for ${description}: ${await evaluate("(document.body?.innerText ?? '').slice(0, 1600)")}`,
  );
}
async function navigate(path, expectedText, absentText) {
  await browser.send("Page.navigate", { url: `${frontendUrl}${path}` });
  await waitUntil(
    `document.readyState === 'complete' && (document.body?.innerText ?? '').includes(${JSON.stringify(expectedText)})${absentText ? ` && !(document.body?.innerText ?? '').includes(${JSON.stringify(absentText)})` : ""}`,
    `${path} containing ${expectedText}`,
  );
}
async function setInput(selector, value) {
  const changed = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  assert(changed, `Browser input is missing: ${selector}`);
}
async function browserLogin(email) {
  await browser.send("Network.clearBrowserCookies");
  await browser.send("Page.navigate", { url: `${frontendUrl}/connexion` });
  await waitUntil("document.querySelector('#email')", "login form");
  await evaluate("localStorage.clear(); sessionStorage.clear(); true");
  await sleep(500);
  await setInput("#email", email);
  await setInput("#password", password);
  await waitUntil(
    `document.querySelector('#email')?.value === ${JSON.stringify(email)} && document.querySelector('#password')?.value.length > 0`,
    `stable login inputs for ${email}`,
  );
  await sleep(100);
  await evaluate("document.querySelector('form')?.requestSubmit(); true");
  await waitUntil("location.pathname !== '/connexion'", `login ${email}`);
}
async function setViewport(width, height) {
  await browser.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
}
async function screenshot(name) {
  const result = await browser.send("Page.captureScreenshot", {
    format: "png",
  });
  writeFileSync(join(artifactRoot, name), Buffer.from(result.data, "base64"));
}

try {
  await browser.send("Page.enable");
  await browser.send("Runtime.enable");
  await browser.send("Network.enable");
  await browser.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: artifactRoot,
  });
  await setViewport(1440, 1000);
  await browserLogin("admin@demo.auto-import.invalid");
  await navigate(`/dossiers/${dossier.id}`, dossier.reference);
  const openedDocumentsTab = await evaluate(`(() => {
    const tab = [...document.querySelectorAll('button')].find((candidate) =>
      (candidate.innerText ?? '').trim() === 'Documents');
    tab?.click();
    return Boolean(tab);
  })()`);
  assert(openedDocumentsTab, "Dossier Documents tab is missing");
  await waitUntil(
    `(document.body?.innerText ?? '').includes('Photos & preuves') && (document.body?.innerText ?? '').includes('2/2 véhicules')`,
    "dossier evidence completeness",
  );
  await screenshot("dossier-desktop.png");
  await navigate(`/offres/${offer.id}`, offer.reference);
  await waitUntil(
    "document.querySelectorAll('main img').length >= 3",
    "three authenticated offer gallery images",
  );
  await navigate("/vehicules", materializedVehicle.model);
  const openedVehicle = await evaluate(`(() => {
    for (const button of document.querySelectorAll('button')) {
      if (!/Voir détails|View details/.test(button.innerText ?? '')) continue;
      let container = button;
      for (let depth = 0; depth < 8 && container; depth += 1) {
        if ((container.innerText ?? '').includes(${JSON.stringify(materializedVehicle.model)})) {
          button.click();
          return true;
        }
        container = container.parentElement;
      }
    }
    return false;
  })()`);
  assert(openedVehicle, "Materialized vehicle detail action is missing");
  await waitUntil(
    `(document.body?.innerText ?? '').includes(${JSON.stringify(materializedVehicle.vin)}) && (document.body?.innerText ?? '').includes('Electric')`,
    "richer materialized vehicle details",
  );
  assert(
    await evaluate(
      "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
    ),
    "Vehicle desktop view overflows horizontally",
  );
  await navigate("/documents", client.lastName);
  const clickedDownload = await evaluate(`(() => {
    const row = [...document.querySelectorAll('tr')].find((candidate) =>
      (candidate.innerText ?? '').includes(${JSON.stringify(client.lastName)}));
    const button = row && [...row.querySelectorAll('button')].find((candidate) =>
      /Télécharger|Download/.test(candidate.innerText ?? ''));
    button?.click();
    return Boolean(button);
  })()`);
  assert(
    clickedDownload,
    "Authenticated Documents download button was not found",
  );
  let downloadedPath;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    downloadedPath = readdirSync(artifactRoot)
      .map((name) => join(artifactRoot, name))
      .find(
        (path) =>
          statSync(path).isFile() &&
          !path.endsWith(".png") &&
          !path.endsWith(".crdownload"),
      );
    if (downloadedPath) break;
    await sleep(250);
  }
  assert(
    downloadedPath && existsSync(downloadedPath),
    "Chrome did not save the authenticated document",
  );
  assert(
    readFileSync(downloadedPath).length > 0,
    "Chrome download cannot be reopened",
  );
  assert(
    !basename(downloadedPath).includes(".."),
    "Unsafe browser filename was emitted",
  );
  await navigate(`/crm/clients/${client.id}`, client.lastName);
  await waitUntil(
    `(document.body?.innerText ?? '').includes(${JSON.stringify(client.ninMasked)}) && (document.body?.innerText ?? '').includes(${JSON.stringify(client.passportNumberMasked)})`,
    "masked client identity",
  );
  await navigate("/parametres", "Intégrations");
  await waitUntil(
    `(document.body?.innerText ?? '').includes('SIMULATOR') && !(document.body?.innerText ?? '').includes(${JSON.stringify(secretValue)})`,
    "masked integration settings",
  );
  await navigate("/profil", "Mon profil");
  const switchedToEnglish = await evaluate(`(() => {
    const choice = [...document.querySelectorAll('[role="radio"]')].find(
      (candidate) => (candidate.innerText ?? '').trim() === 'Anglais');
    choice?.click();
    return Boolean(choice);
  })()`);
  assert(switchedToEnglish, "English locale choice is missing");
  await waitUntil(
    `(document.body?.innerText ?? '').includes('My profile') && [...document.querySelectorAll('aside a')].some((item) => item.textContent?.trim() === 'Vehicles') && document.documentElement.lang === 'en'`,
    "immediate English profile and navigation",
  );
  await browser.send("Page.reload", { ignoreCache: true });
  await waitUntil(
    `document.documentElement.lang === 'en' && [...document.querySelectorAll('aside a')].some((item) => item.textContent?.trim() === 'Vehicles')`,
    "English locale after reload",
  );
  await setViewport(390, 844);
  await navigate(`/dossiers/${dossier.id}`, dossier.reference);
  assert(
    await evaluate(
      "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
    ),
    "Dossier mobile view overflows horizontally",
  );
  await screenshot("dossier-mobile.png");
  await navigate("/documents", client.lastName);
  assert(
    await evaluate(
      "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
    ),
    "Documents mobile view overflows horizontally",
  );

  await setViewport(1440, 1000);
  await browserLogin("readonly@demo.auto-import.invalid");
  await navigate("/parametres", "Paramètres", "Intégrations");
  await browserLogin("secondary-admin@demo.auto-import.invalid");
  await navigate("/dossiers", "ISO-CIF-001", dossier.reference);

  const bodyText = await evaluate("document.body?.innerText ?? ''");
  assert(!/Ã.|Â.|â€|�/.test(bodyText), "Mojibake detected in the browser");
  const consoleErrors = browser.events.filter(
    (event) =>
      event.method === "Runtime.exceptionThrown" ||
      (event.method === "Runtime.consoleAPICalled" &&
        ["error", "assert"].includes(event.params.type)),
  );
  const serverErrors = browser.events.filter(
    (event) =>
      event.method === "Network.responseReceived" &&
      event.params.response.status >= 500,
  );
  assert(
    consoleErrors.length === 0,
    `Browser console errors: ${consoleErrors.length}`,
  );
  assert(
    serverErrors.length === 0,
    `Browser HTTP 5xx responses: ${serverErrors.length}`,
  );
  console.log(
    `POST_UAT_BROWSER_ACCEPTANCE_PASS roles=admin,finance,logistics,read-only,secondary-admin routes=dossier,offer,vehicles,documents,client,settings,profile viewports=1440x1000,390x844 download=reopened locale=reload-and-second-login isolation=passed diagnostics=clean screenshots=2`,
  );
} finally {
  browser.socket.close();
}
