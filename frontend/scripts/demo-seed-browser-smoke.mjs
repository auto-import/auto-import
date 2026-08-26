const frontendUrl =
  process.env.DEMO_SMOKE_FRONTEND_URL ?? "http://localhost:3101";
const apiUrl = process.env.DEMO_SMOKE_API_URL ?? "http://localhost:3100/api";
const debugUrl = process.env.DEMO_SMOKE_DEBUG_URL ?? "http://localhost:9333";
const password = process.env.DEMO_SEED_PASSWORD;
if (!password) throw new Error("DEMO_SEED_PASSWORD is required");

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function rawRequest(path, { method = "GET", body, token } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
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

async function login(email) {
  return request("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

function items(page, label) {
  const records = Array.isArray(page)
    ? page
    : Array.isArray(page?.items)
      ? page.items
      : null;
  if (!records) throw new Error(`${label} has an unexpected collection shape`);
  if (records.length === 0) throw new Error(`${label} has no demo rows`);
  return records;
}

const admin = await login("admin@demo.auto-import.invalid");
const adminToken = admin.accessToken;
const [
  dashboard,
  prospectsPage,
  clientsPage,
  callsPage,
  conversationsPage,
  partnersPage,
  vehiclesPage,
  offersPage,
  dossiersPage,
  invoicesPage,
  shipmentsPage,
  customsPage,
  documentsPage,
  tasksPage,
  notificationsPage,
  report,
  settings,
] = await Promise.all([
  request("/dashboard", { token: adminToken }),
  request("/prospects?limit=100", { token: adminToken }),
  request("/clients?limit=100", { token: adminToken }),
  request("/call-center/calls?limit=100", { token: adminToken }),
  request("/call-center/whatsapp/conversations?limit=100", {
    token: adminToken,
  }),
  request("/partners?limit=100", { token: adminToken }),
  request("/vehicles?limit=100", { token: adminToken }),
  request("/offers?limit=100", { token: adminToken }),
  request("/dossiers?limit=100", { token: adminToken }),
  request("/finance/invoices?limit=100", { token: adminToken }),
  request("/shipments?limit=100", { token: adminToken }),
  request("/customs?limit=100", { token: adminToken }),
  request("/documents?limit=100", { token: adminToken }),
  request("/tasks?limit=100", { token: adminToken }),
  request("/notifications?limit=100", { token: adminToken }),
  request(
    "/reports/summary?from=2025-08-01T00:00:00.000Z&to=2026-09-30T23:59:59.999Z",
    { token: adminToken },
  ),
  request("/settings", { token: adminToken }),
]);

const prospects = items(prospectsPage, "prospects");
const clients = items(clientsPage, "clients");
const calls = items(callsPage, "calls");
const conversations = items(conversationsPage, "WhatsApp conversations");
const partners = items(partnersPage, "partners");
const vehicles = items(vehiclesPage, "vehicles");
const offers = items(offersPage, "offers");
const dossiers = items(dossiersPage, "dossiers");
const invoices = items(invoicesPage, "invoices");
const shipments = items(shipmentsPage, "shipments");
const customs = items(customsPage, "customs");
const documents = items(documentsPage, "documents");
const tasks = items(tasksPage, "tasks");
const notifications = items(notificationsPage, "notifications");

if (
  dashboard.dossiers.total < 1 ||
  dashboard.finance.collected === "0.00" ||
  report.finance.costs === "0.00" ||
  settings.displayName !== "Atlas Import Démonstration"
) {
  throw new Error(
    `Dashboard/report/settings demo reconciliation failed: dossiers=${dashboard.dossiers?.total}, collected=${dashboard.finance?.collected}, reportCosts=${report.finance?.costs}, displayName=${settings.displayName}`,
  );
}
const timeline = await request(`/crm/timeline/client/${clients[0].id}`, {
  token: adminToken,
});
if (!Array.isArray(timeline?.items) || timeline.items.length === 0) {
  throw new Error("Client timeline has no persisted demo events");
}
const kpis = await request("/call-center/kpis", { token: adminToken });
if (!kpis || calls.length < 6 || conversations.length < 4) {
  throw new Error("Call Center states/KPIs are not meaningful");
}
const download = await rawRequest(`/documents/${documents[0].id}/download`, {
  token: adminToken,
});
if (!download.response.ok || download.payload.byteLength === 0) {
  throw new Error("Private demo document download failed");
}

const logistics = await login("logistics@demo.auto-import.invalid");
items(
  await request("/shipments?limit=100", { token: logistics.accessToken }),
  "logistics shipments",
);
items(
  await request("/customs?limit=100", { token: logistics.accessToken }),
  "logistics customs",
);

const readOnly = await login("readonly@demo.auto-import.invalid");
items(
  await request("/dossiers?limit=100", { token: readOnly.accessToken }),
  "read-only dossiers",
);
const forbiddenWrite = await rawRequest("/partners", {
  method: "POST",
  token: readOnly.accessToken,
  body: { name: "Must never be created", type: "supplier" },
});
if (forbiddenWrite.response.status !== 403) {
  throw new Error(`Read-only write returned ${forbiddenWrite.response.status}`);
}

const secondary = await login("secondary-admin@demo.auto-import.invalid");
const secondaryDossiers = items(
  await request("/dossiers?limit=100", { token: secondary.accessToken }),
  "secondary dossiers",
);
if (
  !secondaryDossiers.every((dossier) => dossier.reference.startsWith("ISO-")) ||
  secondaryDossiers.some((dossier) => dossier.reference.startsWith("DEMO-"))
) {
  throw new Error("Secondary tenant received primary dossier rows");
}
const crossTenant = await rawRequest(`/dossiers/${dossiers[0].id}`, {
  token: secondary.accessToken,
});
if (crossTenant.response.status !== 404) {
  throw new Error(
    `Cross-tenant dossier lookup returned ${crossTenant.response.status}`,
  );
}
const inactive = await rawRequest("/auth/login", {
  method: "POST",
  body: { email: "inactive@demo.auto-import.invalid", password },
});
if (inactive.response.status !== 401) {
  throw new Error(
    `Inactive demo user login returned ${inactive.response.status}`,
  );
}
console.log(
  `DEMO_API_SMOKE_PASS primary=${dossiers.length} secondary=${secondaryDossiers.length} isolation=passed roles=admin,logistics,read-only,secondary-admin`,
);

async function connectBrowser() {
  const target = await fetch(
    `${debugUrl}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT" },
  ).then((response) => response.json());
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
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
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  return { events, send, socket };
}

const browser = await connectBrowser();
console.log("DEMO_BROWSER_CONNECTED");

async function evaluate(expression) {
  const result = await browser.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.text ?? "Browser evaluation failed",
    );
  }
  return result.result.value;
}

async function waitUntil(expression, description) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(expression)) return;
    await sleep(200);
  }
  const body = await evaluate(
    "(document.body?.innerText ?? '').slice(0, 2000)",
  );
  throw new Error(`Timed out waiting for ${description}\n${body}`);
}

async function navigate(path, expectedText, absentText) {
  await browser.send("Page.navigate", { url: `${frontendUrl}${path}` });
  await waitUntil(
    `document.readyState === 'complete' && (document.body?.innerText ?? '').includes(${JSON.stringify(expectedText)})${absentText ? ` && !(document.body?.innerText ?? '').includes(${JSON.stringify(absentText)})` : ""}`,
    `${path} / ${expectedText}`,
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
  if (!changed) throw new Error(`Missing browser input ${selector}`);
}

async function browserLogin(email) {
  await browser.send("Network.clearBrowserCookies");
  await navigate("/connexion", "Connexion");
  await evaluate("localStorage.clear(); sessionStorage.clear(); true");
  await setInput("#email", email);
  await setInput("#password", password);
  await evaluate("document.querySelector('form')?.requestSubmit(); true");
  await waitUntil(
    "location.pathname !== '/connexion'",
    `browser login ${email}`,
  );
}

try {
  await browser.send("Page.enable");
  await browser.send("Runtime.enable");
  await browser.send("Network.enable");

  await browserLogin("admin@demo.auto-import.invalid");
  console.log("DEMO_BROWSER_PERSONA admin");
  const adminRoutes = [
    ["/", "Tableau de bord"],
    ["/crm/leads", "Prospect Démo"],
    ["/crm/clients", "Client Démo"],
    [`/crm/clients/${clients[0].id}`, "Timeline omnicanale"],
    ["/crm/call-center", "Call Center"],
    ["/fournisseurs", "Guangzhou Horizon Motors"],
    ["/vehicules", "Véhicules"],
    ["/offres", "OFF-DEMO"],
    ["/dossiers", "DEMO-"],
    ["/dossiers/creer", "Nouveau dossier"],
    [`/dossiers/${dossiers[0].id}`, dossiers[0].reference],
    ["/facturation", "FAC-DEMO"],
    ["/finance", "Finance & Rentabilité"],
    ["/expeditions", "EXP-DEMO"],
    ["/documents", "demo"],
    ["/tasks", "Action opérationnelle"],
    ["/notifications", "Notification"],
    ["/rapports", "Rapports"],
    ["/parametres", "Paramètres"],
  ];
  for (const [path, text] of adminRoutes) await navigate(path, text);

  await browserLogin("logistics@demo.auto-import.invalid");
  console.log("DEMO_BROWSER_PERSONA logistics");
  await navigate("/expeditions", "EXP-DEMO");
  await navigate("/documents", "demo");

  await browserLogin("readonly@demo.auto-import.invalid");
  console.log("DEMO_BROWSER_PERSONA read-only");
  await navigate("/dossiers", "DEMO-");
  await navigate("/dossiers/creer", "Accès interdit");

  await browserLogin("secondary-admin@demo.auto-import.invalid");
  console.log("DEMO_BROWSER_PERSONA secondary-admin");
  await navigate("/dossiers", "ISO-CIF-001", "DEMO-CIF");
  await navigate(
    "/tasks",
    "Tâche privée tenant secondaire",
    "Action opérationnelle",
  );

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
  if (consoleErrors.length || serverErrors.length) {
    throw new Error(
      `Browser diagnostics failed console=${consoleErrors.length} server=${serverErrors.length}`,
    );
  }
  console.log(
    `DEMO_BROWSER_SMOKE_PASS api=dashboard,crm,timeline,call-center,partners,vehicles,offers,dossiers,finance,shipping,customs,documents,tasks,notifications,reports,settings counts=${prospects.length}/${clients.length}/${calls.length}/${partners.length}/${vehicles.length}/${offers.length}/${dossiers.length}/${invoices.length}/${shipments.length}/${customs.length}/${documents.length}/${tasks.length}/${notifications.length} personas=admin,logistics,read-only,secondary-admin isolation=passed private-download=${download.payload.byteLength} browser-routes=${adminRoutes.length + 6} diagnostics=clean`,
  );
} finally {
  browser.socket.close();
}
