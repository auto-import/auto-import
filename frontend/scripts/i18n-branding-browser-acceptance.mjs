import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const frontendUrl =
  process.env.I18N_UAT_FRONTEND_URL ?? "http://localhost:3221";
const apiUrl = process.env.I18N_UAT_API_URL ?? "http://localhost:3220/api";
const debugUrl = process.env.I18N_UAT_DEBUG_URL ?? "http://localhost:9334";
const password = process.env.DEMO_SEED_PASSWORD;
const storageRoot = process.env.I18N_UAT_STORAGE_ROOT;
const artifactRoot = resolve(
  process.env.I18N_UAT_ARTIFACT_ROOT ??
    "../.codex-production-browser-artifacts/i18n-branding",
);

if (!password || !storageRoot) {
  throw new Error("DEMO_SEED_PASSWORD and I18N_UAT_STORAGE_ROOT are required");
}
mkdirSync(artifactRoot, { recursive: true });

const sleep = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function filesUnder(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) files.push(...filesUnder(path));
    else files.push(path);
  }
  return files;
}

const sourcePng = filesUnder(resolve(storageRoot)).find((path) =>
  path.toLowerCase().endsWith(".png"),
);
assert(sourcePng, "A disposable PNG fixture is required");

function brandingPng(size) {
  const bytes = Buffer.from(readFileSync(sourcePng));
  bytes.writeUInt32BE(size, 16);
  bytes.writeUInt32BE(size, 20);
  return bytes;
}

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
    : Buffer.from(await response.arrayBuffer());
  return { response, payload, contentType };
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

async function setLocale(token, locale) {
  return request("/profile/locale", {
    method: "PATCH",
    token,
    body: { locale },
  });
}

async function uploadLogo(token, bytes, name) {
  const form = new FormData();
  form.append("logo", new Blob([bytes], { type: "image/png" }), name);
  return request("/profile/branding/logo", { method: "POST", token, form });
}

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
    if (message.error) {
      callback.reject(
        new Error(`${callback.method}: ${message.error.message}`),
      );
    } else callback.resolve(message.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolvePromise, rejectPromise) => {
      const id = ++nextId;
      pending.set(id, {
        resolve: resolvePromise,
        reject: rejectPromise,
        method,
      });
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
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.text ?? "Browser evaluation failed",
    );
  }
  return result.result.value;
}

async function waitUntil(expression, description, attempts = 150) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return;
    await sleep(200);
  }
  throw new Error(
    `Timed out waiting for ${description}: ${await evaluate("(document.body?.innerText ?? '').slice(0, 2000)")}`,
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

async function browserLogin(email, locale) {
  await browser.send("Network.clearBrowserCookies");
  await browser.send("Page.navigate", { url: `${frontendUrl}/connexion` });
  await waitUntil("Boolean(document.querySelector('#email'))", "login form");
  await evaluate("localStorage.clear(); sessionStorage.clear(); true");
  await sleep(750);
  await setInput("#email", email);
  await setInput("#password", password);
  await waitUntil(
    `document.querySelector('#email')?.value === ${JSON.stringify(email)} && document.querySelector('#password')?.value.length > 0`,
    `stable login inputs for ${email}`,
  );
  await sleep(100);
  await evaluate("document.querySelector('form')?.requestSubmit(); true");
  await waitUntil(
    `location.pathname !== '/connexion' && document.documentElement.lang === ${JSON.stringify(locale)}`,
    `${locale} login for ${email}`,
  );
}

async function navigate(path) {
  await browser.send("Page.navigate", { url: `${frontendUrl}${path}` });
  await waitUntil(
    `location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete' && !document.querySelector('[data-loading="true"]')`,
    path,
  );
  await sleep(350);
}

async function setViewport(width, height) {
  await browser.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
}

const users = [
  ["admin", "admin@demo.auto-import.invalid"],
  ["finance", "finance@demo.auto-import.invalid"],
  ["logistics", "logistics@demo.auto-import.invalid"],
  ["read-only", "readonly@demo.auto-import.invalid"],
  ["secondary-admin", "secondary-admin@demo.auto-import.invalid"],
];
const directRouteRequirements = [
  ["/crm/clients", "prospects:read"],
  ["/crm/leads", "prospects:read"],
  ["/dossiers/creer", "dossiers:write"],
  ["/profil", "dashboard:read"],
  ["/audit", "audit:read"],
];
const sessions = new Map();
for (const [role, email] of users) sessions.set(role, await login(email));

const originalProfiles = new Map();
for (const [role, session] of sessions) {
  originalProfiles.set(
    role,
    await request("/profile", { token: session.accessToken }),
  );
}

const adminToken = sessions.get("admin").accessToken;
const financeToken = sessions.get("finance").accessToken;
const readonlyToken = sessions.get("read-only").accessToken;
const secondaryToken = sessions.get("secondary-admin").accessToken;
const originalAdmin = originalProfiles.get("admin");
const originalSecondary = originalProfiles.get("secondary-admin");
let originalLogo;
let originalLogoType;

if (originalAdmin.branding.logoUrl) {
  const result = await rawRequest("/profile/branding/logo", {
    token: adminToken,
  });
  assert(result.response.ok, "Existing tenant logo could not be preserved");
  originalLogo = result.payload;
  originalLogoType = result.contentType;
}

const testName = `Codex Tenant UAT ${Date.now()}`;
const uiName = `${testName} UI`;

try {
  const forbidden = await rawRequest("/profile/branding", {
    method: "PATCH",
    token: readonlyToken,
    body: { companyName: "Forbidden tenant rename" },
  });
  assert(
    forbidden.response.status === 403,
    "Read-only branding update was not denied",
  );

  await request("/profile/branding", {
    method: "PATCH",
    token: adminToken,
    body: { companyName: testName },
  });
  const firstLogo = await uploadLogo(
    adminToken,
    brandingPng(16),
    "tenant-logo-16.png",
  );
  const firstLogoUrl = firstLogo.branding.logoUrl;
  assert(firstLogoUrl, "First tenant logo URL is missing");
  const replacedLogo = await uploadLogo(
    adminToken,
    brandingPng(32),
    "tenant-logo-32.png",
  );
  assert(
    replacedLogo.branding.logoUrl &&
      replacedLogo.branding.logoUrl !== firstLogoUrl,
    "Logo replacement did not rotate its private URL",
  );

  const financeProfile = await request("/profile", { token: financeToken });
  const secondaryProfile = await request("/profile", { token: secondaryToken });
  assert(
    financeProfile.branding.companyName === testName &&
      financeProfile.branding.logoUrl === replacedLogo.branding.logoUrl,
    "Branding did not propagate within the tenant",
  );
  assert(
    secondaryProfile.branding.companyName ===
      originalSecondary.branding.companyName &&
      secondaryProfile.branding.logoUrl === originalSecondary.branding.logoUrl,
    "Branding crossed the tenant boundary",
  );

  await browser.send("Page.enable");
  await browser.send("Runtime.enable");
  await browser.send("Network.enable");
  await setViewport(1440, 1000);

  const routeCounts = {};
  for (const [role, email] of users) {
    const session = sessions.get(role);
    const currentUser = await request("/auth/me", {
      token: session.accessToken,
    });
    await setLocale(session.accessToken, "en");
    await browserLogin(email, "en");
    const sidebarRoutes = await evaluate(
      "[...new Set([...document.querySelectorAll('aside a[href]')].map((item) => new URL(item.href).pathname))]",
    );
    const routes = [
      ...new Set([
        ...sidebarRoutes,
        ...directRouteRequirements
          .filter(([, permission]) =>
            currentUser.permissions.includes(permission),
          )
          .map(([route]) => route),
      ]),
    ];
    assert(routes.length > 0, `${role} has no permission-filtered navigation`);
    routeCounts[role] = routes.length;
    for (const locale of ["en", "fr"]) {
      await setLocale(session.accessToken, locale);
      await browserLogin(email, locale);
      for (const route of routes) {
        console.log(
          `I18N_BROWSER_ROUTE role=${role} locale=${locale} route=${route}`,
        );
        await navigate(route);
        const snapshot = await evaluate(`({
          lang: document.documentElement.lang,
          text: document.body?.innerText ?? '',
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        })`);
        assert(
          snapshot.lang === locale,
          `${role} ${route} did not remain ${locale}`,
        );
        assert(
          !snapshot.overflow,
          `${role} ${route} overflows at desktop width`,
        );
        const oppositeResidue =
          locale === "en"
            ? snapshot.text.match(
                /\b(Tableau de bord|Dossiers r[ée]cents|Cr[ée]er|V[ée]hicules|Fournisseurs|Exp[ée]ditions|Facturation|Param[èe]tres|Mon profil|Utilisateurs|D[ée]connexion|Aucune donn[ée]e|Rechercher)\b/i,
              )
            : snapshot.text.match(
                /\b(My profile|Company branding|Change password|Dashboard|Recent dossiers|Create|Vehicles|Suppliers|Shipments|Billing|Settings|Users|No data|Search|Save|Upload|Remove|Offers|All statuses|Loading|Available|Reserved|Expired|Pending|Reports|Tasks|Read-only)\b/i,
              );
        assert(
          !oppositeResidue,
          `${role} ${route} contains ${locale === "en" ? "French" : "English"} UI copy in ${locale} mode: ${oppositeResidue ? snapshot.text.slice(Math.max(0, oppositeResidue.index - 80), oppositeResidue.index + oppositeResidue[0].length + 80) : "unknown"}`,
        );
      }
    }
  }

  await setLocale(adminToken, "en");
  await browserLogin("admin@demo.auto-import.invalid", "en");
  await navigate("/profil");
  await waitUntil(
    `Boolean((document.body?.innerText ?? '').includes(${JSON.stringify(testName)}) && document.querySelector('img[alt="Company logo"]'))`,
    "tenant name and private logo in profile",
  );
  const brandingInput = await evaluate(`(() => {
    const input = document.querySelector('input[required][minlength="2"][maxlength="120"]');
    if (!input) return null;
    input.setAttribute('data-branding-uat', 'true');
    return input.value;
  })()`);
  assert(
    brandingInput === testName,
    "Branding form did not load the tenant name",
  );
  await setInput('[data-branding-uat="true"]', uiName);
  await evaluate(
    "document.querySelector('[data-branding-uat=true]')?.closest('form')?.requestSubmit(); true",
  );
  await waitUntil(
    `([...document.querySelectorAll('aside *')].some((item) => item.textContent?.trim() === ${JSON.stringify(uiName)}))`,
    "immediate sidebar branding refresh",
  );
  const uiSaved = await request("/profile", { token: adminToken });
  assert(
    uiSaved.branding.companyName === uiName,
    "Branding UI did not persist its update",
  );

  await setViewport(390, 844);
  for (const route of ["/", "/profil", "/dossiers", "/documents"]) {
    await navigate(route);
    assert(
      !(await evaluate(
        "document.documentElement.scrollWidth > document.documentElement.clientWidth",
      )),
      `${route} overflows at 390x844`,
    );
  }

  await setLocale(adminToken, "fr");
  await browserLogin("admin@demo.auto-import.invalid", "fr");
  await navigate("/profil");
  const french = await evaluate(
    "({lang: document.documentElement.lang, text: document.body?.innerText ?? ''})",
  );
  assert(
    french.lang === "fr" && french.text.includes("Mon profil"),
    "French profile copy or document language is missing",
  );
  assert(
    !/\b(My profile|Company branding|Change password|Sign out)\b/i.test(
      french.text,
    ),
    "French mode contains English profile UI copy",
  );

  const switchedToEnglish = await evaluate(`(() => {
    const controls = [...document.querySelectorAll('[role="radio"]')];
    controls[1]?.click();
    return controls.map((control) => (control.innerText ?? '').trim());
  })()`);
  assert(
    switchedToEnglish.length === 2,
    `Language controls are incomplete: ${JSON.stringify(switchedToEnglish)}`,
  );
  await waitUntil(
    `document.documentElement.lang === 'en' && (document.body?.innerText ?? '').includes('My profile')`,
    "immediate English locale switch",
  );
  await browser.send("Page.reload", { ignoreCache: true });
  await waitUntil(
    `document.documentElement.lang === 'en' && (document.body?.innerText ?? '').includes('My profile')`,
    "English locale persistence after reload",
  );
  await browserLogin("admin@demo.auto-import.invalid", "en");
  await navigate("/profil");
  assert(
    await evaluate(
      "document.documentElement.lang === 'en' && (document.body?.innerText ?? '').includes('My profile')",
    ),
    "English locale did not persist into a second login",
  );

  await setLocale(adminToken, "en");
  const englishPdf = await rawRequest("/reports/finance.pdf", {
    token: adminToken,
  });
  assert(
    englishPdf.response.ok &&
      englishPdf.contentType.includes("application/pdf") &&
      englishPdf.payload.subarray(0, 5).toString() === "%PDF-",
    "English PDF report did not produce a valid PDF response",
  );
  await setLocale(adminToken, "fr");
  const frenchPdf = await rawRequest("/reports/finance.pdf", {
    token: adminToken,
  });
  assert(
    frenchPdf.response.ok &&
      frenchPdf.contentType.includes("application/pdf") &&
      frenchPdf.payload.subarray(0, 5).toString() === "%PDF-" &&
      !frenchPdf.payload.equals(englishPdf.payload),
    "French PDF report was not generated independently from English",
  );
  writeFileSync(join(artifactRoot, "finance-en.pdf"), englishPdf.payload);
  writeFileSync(join(artifactRoot, "finance-fr.pdf"), frenchPdf.payload);

  const fatalBrowserEvents = browser.events.filter(
    (event) =>
      event.method === "Runtime.exceptionThrown" ||
      (event.method === "Network.responseReceived" &&
        event.params?.response?.status >= 500),
  );
  const fatalSummaries = fatalBrowserEvents.map((event) =>
    event.method === "Runtime.exceptionThrown"
      ? (event.params?.exceptionDetails?.exception?.description ??
        event.params?.exceptionDetails?.text ??
        "browser exception")
      : `${event.params?.response?.status} ${event.params?.response?.url}`,
  );
  assert(
    fatalBrowserEvents.length === 0,
    `Browser diagnostics contain ${fatalBrowserEvents.length} fatal event(s): ${JSON.stringify(fatalSummaries)}`,
  );

  console.log(
    `I18N_BRANDING_BROWSER_ACCEPTANCE_PASS roles=${users.length} route-counts=${JSON.stringify(routeCounts)} viewports=1440x1000,390x844 locales=fr,en branding=upload-replace-remove-and-restore tenant-isolation=passed pdf=fr,en diagnostics=clean`,
  );
} finally {
  await rawRequest("/profile/branding/logo", {
    method: "DELETE",
    token: adminToken,
  });
  if (originalLogo) {
    const form = new FormData();
    form.append(
      "logo",
      new Blob([originalLogo], { type: originalLogoType }),
      "restored-tenant-logo",
    );
    await rawRequest("/profile/branding/logo", {
      method: "POST",
      token: adminToken,
      form,
    });
  }
  await rawRequest("/profile/branding", {
    method: "PATCH",
    token: adminToken,
    body: { companyName: originalAdmin.branding.companyName },
  });
  for (const [role, session] of sessions) {
    await rawRequest("/profile/locale", {
      method: "PATCH",
      token: session.accessToken,
      body: { locale: originalProfiles.get(role).locale },
    });
  }
  browser.socket.close();
}
