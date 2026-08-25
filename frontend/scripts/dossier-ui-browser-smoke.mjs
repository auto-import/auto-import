import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const frontendUrl =
  process.env.UI_SMOKE_FRONTEND_URL ?? "http://localhost:3001";
const apiUrl = process.env.UI_SMOKE_API_URL ?? "http://localhost:3000/api";
const debugUrl = process.env.UI_SMOKE_DEBUG_URL ?? "http://localhost:9222";
const password = process.env.UI_SMOKE_ADMIN_PASSWORD;
if (!password) throw new Error("UI_SMOKE_ADMIN_PASSWORD is required");

const sleep = (ms) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
async function api(path, { method = "GET", body, token } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok || !payload.success)
    throw new Error(
      `${method} ${path}: ${response.status} ${JSON.stringify(payload)}`,
    );
  return { data: payload.data, response };
}

const login = await api("/auth/login", {
  method: "POST",
  body: { email: "admin@example.com", password },
});
const token = login.data.accessToken;
const refresh = /auto_import_refresh=([^;]+)/.exec(
  login.response.headers.get("set-cookie") ?? "",
)?.[1];
if (!refresh) throw new Error("Refresh cookie missing");
const supplierPage = (await api("/partners?type=supplier&limit=1", { token }))
  .data;
const supplier =
  supplierPage.items[0] ??
  (
    await api("/partners", {
      method: "POST",
      token,
      body: { name: "Fournisseur Gate B", type: "supplier", country: "Chine" },
    })
  ).data;
await api("/vehicles", {
  method: "POST",
  token,
  body: {
    vin: `GB${String(Date.now()).slice(-15)}`,
    brand: "BYD",
    model: "Song Plus Gate B",
    year: 2026,
    condition: "new",
    purchasePrice: 15000,
    sellingPrice: 22000,
    currency: "USD",
    acquisitionType: "stock",
    supplierId: supplier.id,
  },
});
const target = await fetch(
  `${debugUrl}/json/new?${encodeURIComponent("about:blank")}`,
  { method: "PUT" },
).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveOpen, reject) => {
  socket.addEventListener("open", resolveOpen, { once: true });
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
  new Promise((resolveSend, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve: resolveSend, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(expression)) return;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${description}`);
}
async function waitText(text, present = true) {
  try {
    await waitUntil(
      `(document.body?.innerText ?? '').includes(${JSON.stringify(text)}) === ${present}`,
      `${present ? "text" : "absence"} ${text}`,
    );
  } catch (error) {
    const body = await evaluate(
      "(document.body?.innerText ?? '').slice(0, 2000)",
    );
    throw new Error(`${error.message}\nBrowser text:\n${body}`);
  }
}
async function click(text) {
  const clicked = await evaluate(
    `(() => { const node = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim().includes(${JSON.stringify(text)}) && !item.disabled); if (!node) return false; node.click(); return true; })()`,
  );
  if (!clicked) throw new Error(`Button not found: ${text}`);
  await sleep(250);
}
async function select(label, mode = "first") {
  const value = await evaluate(
    `(() => { const field = [...document.querySelectorAll('select')].find((item) => item.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!field) return ''; const options = [...field.options].filter((option) => option.value); if (!options.length) return ''; const option = ${mode === "last" ? "options.at(-1)" : "options[0]"}; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(field, option.value); field.dispatchEvent(new Event('change', { bubbles: true })); return option.value; })()`,
  );
  if (!value) throw new Error(`No selectable option for ${label}`);
  return value;
}
async function screenshot(name, width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
  await sleep(250);
  const layout = await evaluate(
    `({ width: document.documentElement.scrollWidth, viewport: innerWidth, h1: document.querySelector('h1')?.textContent, body: document.body?.innerText })`,
  );
  if (layout.width > layout.viewport + 2)
    throw new Error(
      `${name} horizontal overflow ${layout.width}/${layout.viewport}`,
    );
  const image = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const directory = resolve("..", ".codex-browser-artifacts");
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, `${name}.png`),
    Buffer.from(image.data, "base64"),
  );
  return `${name}:${width}x${height}`;
}

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.clearBrowserCookies");
  await send("Network.setCookie", {
    name: "auto_import_refresh",
    value: refresh,
    url: apiUrl,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  });
  await send("Page.navigate", { url: `${frontendUrl}/dossiers/creer` });
  await waitText("Type de dossier");
  events.length = 0;
  const desktopWizard = await screenshot("gate-b-wizard-desktop", 1440, 1000);
  await click("Continuer");
  await waitText("Client existant");
  await click("Continuer");
  await waitText("Sélectionnez un client existant.");
  await select("Client existant");
  await click("Continuer");
  await waitText("Véhicule et source");
  const vehicleId = await select("Véhicule disponible");
  await click("Continuer");
  await waitText("Équipe responsable");
  const opsUserId = await select("Responsable opérations", "last");
  await click("Précédent");
  const retainedVehicle = await evaluate(
    "document.querySelector('select[aria-label=\"Véhicule disponible\"]')?.value",
  );
  if (retainedVehicle !== vehicleId)
    throw new Error("Vehicle selection was not retained after back navigation");
  await click("Continuer");
  const retainedOps = await evaluate(
    "document.querySelector('select[aria-label=\"Responsable opérations\"]')?.value",
  );
  if (retainedOps !== opsUserId)
    throw new Error("Team selection was not retained after forward navigation");
  await click("Continuer");
  await waitText("Récapitulatif");
  await waitText("Vente véhicule — CIF");
  await click("Créer le dossier");
  await waitUntil(
    "location.pathname.startsWith('/dossiers/') && !location.pathname.endsWith('/creer')",
    "successful dossier creation",
  );
  const dossierId = await evaluate("location.pathname.split('/').at(-1)");
  await waitText("Progression du dossier");
  const dossier = (await api(`/dossiers/${dossierId}`, { token })).data;
  await send("Page.reload", { ignoreCache: true });
  await waitText(dossier.reference);
  for (const [tab, expected] of [
    ["Finance", "TOTAL ENCAISSÉ"],
    ["Logistique", "Expédition"],
    ["Documents", "Documents du dossier"],
    ["Historique", "Historique du dossier"],
    ["Vue d’ensemble", "Informations générales"],
  ]) {
    await click(tab);
    await waitText(expected);
  }
  for (const next of ["Client confirmé", "Contrat signé", "Acompte reçu"]) {
    await click(next);
    await waitText(next);
  }
  const plan = (
    await api("/finance/payment-plans", {
      method: "POST",
      token,
      body: {
        clientId: dossier.clientId,
        dossierId,
        totalAmount: 1000000,
        currency: "DZD",
        strategy: "THIRTY_SEVENTY",
      },
    })
  ).data;
  await click("Achat confirmé");
  await waitText("Payment Gate Failed");
  const payment = (
    await api("/finance/payments", {
      method: "POST",
      token,
      body: {
        clientId: dossier.clientId,
        dossierId,
        amount: 300000,
        currency: "DZD",
        paymentMethod: "bank_transfer",
        idempotencyKey: `gate-b-${dossierId}`,
        allocations: [
          { installmentId: plan.installments[0].id, amount: 300000 },
        ],
      },
    })
  ).data;
  await api(`/finance/payments/${payment.id}/confirm`, {
    method: "POST",
    token,
  });
  await click("Achat confirmé");
  await waitUntil(
    `(document.body?.innerText ?? '').includes('Achat confirmé') && !(document.body?.innerText ?? '').includes('Payment Gate Failed')`,
    "successful transition after satisfying gate",
  );
  const desktopDetail = await screenshot("gate-b-detail-desktop", 1440, 1100);
  const mobileDetail = await screenshot("gate-b-detail-mobile", 390, 844);
  const badConsole = events.filter(
    (event) =>
      event.method === "Runtime.exceptionThrown" ||
      (event.method === "Runtime.consoleAPICalled" &&
        ["error", "assert"].includes(event.params.type)),
  );
  const badNetwork = events.filter(
    (event) =>
      event.method === "Network.responseReceived" &&
      ["XHR", "Fetch"].includes(event.params.type) &&
      event.params.response.status >= 400 &&
      !event.params.response.url.endsWith(`/dossiers/${dossierId}/status`),
  );
  if (badConsole.length || badNetwork.length)
    throw new Error(
      `Gate B diagnostics failed console=${badConsole.length} network=${badNetwork.map((event) => `${event.params.response.status}:${event.params.response.url}`).join(",")}`,
    );
  console.log(
    `DOSSIER_UI_BROWSER_PASS id=${dossierId} steps=5 validation=blocked retention=passed creation=passed tabs=5 gate=blocked-then-passed viewports=${desktopWizard},${desktopDetail},${mobileDetail} diagnostics=clean`,
  );
} finally {
  socket.close();
}
