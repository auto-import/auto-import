import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const front = process.env.UI_POLISH_FRONTEND_URL ?? "http://localhost:3211";
const api = process.env.UI_POLISH_API_URL ?? "http://localhost:3210/api";
const debug = process.env.UI_POLISH_DEBUG_URL ?? "http://localhost:9333";
const originalPassword = process.env.DEMO_SEED_PASSWORD;
if (!originalPassword) throw new Error("DEMO_SEED_PASSWORD is required");
const nextPassword = process.env.UI_POLISH_NEXT_PASSWORD;
if (!nextPassword) throw new Error("UI_POLISH_NEXT_PASSWORD is required");
const browserVin = `BROWSER${Date.now()}`;
const artifactDir = resolve("..", ".codex-browser-artifacts-ui-polish");
await mkdir(artifactDir, { recursive: true });
const imagePaths = [
  resolve("..", "docs", "ui-references", "dashboard.jpeg"),
  resolve("..", "docs", "ui-references", "offres-chines.jpeg"),
  resolve("..", "docs", "ui-references", "vehicles-grid.jpeg"),
];

const sleep = (ms) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const unwrap = async (response) => {
  const type = response.headers.get("content-type") ?? "";
  const body = type.includes("json")
    ? await response.json()
    : await response.arrayBuffer();
  return { response, body, data: body?.data };
};
async function loginApi(email, password = originalPassword) {
  const result = await unwrap(
    await fetch(`${api}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  if (!result.response.ok)
    throw new Error(`API login failed ${email}: ${result.response.status}`);
  return {
    token: result.data.accessToken,
    cookie: result.response.headers.get("set-cookie")?.split(";")[0] ?? "",
  };
}
async function apiJson(path, token, options = {}) {
  const response = await fetch(`${api}${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...(options.body && !(options.body instanceof FormData)
        ? { "content-type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const result = await unwrap(response);
  return result;
}
async function connectTarget() {
  const target = await fetch(
    `${debug}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT" },
  ).then((response) => response.json());
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
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
      const next = ++id;
      pending.set(next, { resolve: resolveSend, reject });
      socket.send(JSON.stringify({ id: next, method, params }));
    });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("DOM.enable");
  return { send, events, socket };
}
async function evaluate(browser, expression) {
  const result = await browser.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text,
    );
  return result.result.value;
}
async function waitUntil(browser, expression, label, attempts = 120) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      if (await evaluate(browser, expression)) return;
    } catch {
      // Navigation can briefly replace the execution context/body.
    }
    await sleep(200);
  }
  const body = await evaluate(
    browser,
    "document.body?.innerText?.slice(0,3000)",
  );
  throw new Error(`timeout: ${label}\n${body}`);
}
async function navigate(browser, path, text) {
  await browser.send("Page.navigate", { url: `${front}${path}` });
  await waitUntil(
    browser,
    `document.readyState === 'complete' && document.body.innerText.includes(${JSON.stringify(text)})`,
    `${path} ${text}`,
  );
}
async function setInput(browser, selector, value) {
  const ok = await evaluate(
    browser,
    `(() => { const input=document.querySelector(${JSON.stringify(selector)}); if(!input)return false; const proto=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`,
  );
  if (!ok) throw new Error(`input missing ${selector}`);
}
async function setLabel(browser, label, value) {
  const ok = await evaluate(
    browser,
    `(() => { const el=[...document.querySelectorAll('label')].find(x=>x.innerText.includes(${JSON.stringify(label)}))?.querySelector('input,textarea,select'); if(!el)return false; const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`,
  );
  if (!ok) throw new Error(`label missing ${label}`);
}
async function clickText(browser, text, selector = "button,a") {
  const ok = await evaluate(
    browser,
    `(() => { const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x=>x.innerText.trim().includes(${JSON.stringify(text)})); if(!el)return false; el.click(); return true; })()`,
  );
  if (!ok) throw new Error(`control missing ${text}`);
}
async function setPasswordFields(browser, currentPassword, newPassword) {
  const ok = await evaluate(
    browser,
    `(() => { const fields=document.querySelectorAll('main input[type="password"]'); if(fields.length!==3)return false; const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; for(const [index,value] of [${JSON.stringify(currentPassword)},${JSON.stringify(newPassword)},${JSON.stringify(newPassword)}].entries()){setter.call(fields[index],value); fields[index].dispatchEvent(new Event('input',{bubbles:true}));} return true; })()`,
  );
  if (!ok) throw new Error("profile password fields missing");
}
async function browserLogin(browser, email, password = originalPassword) {
  await browser.send("Network.clearBrowserCookies");
  await navigate(browser, "/connexion", "Connexion");
  await waitUntil(
    browser,
    "Boolean(document.querySelector('#email') && document.querySelector('#password') && document.querySelector('form'))",
    "hydrated login form",
  );
  await sleep(300);
  await evaluate(browser, "localStorage.clear(); sessionStorage.clear(); true");
  await setInput(browser, "#email", email);
  await setInput(browser, "#password", password);
  await evaluate(
    browser,
    "document.querySelector('form').requestSubmit(); true",
  );
  await waitUntil(
    browser,
    "location.pathname !== '/connexion'",
    `login ${email}`,
  );
}
async function screenshot(browser, name) {
  const shot = await browser.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(resolve(artifactDir, name), Buffer.from(shot.data, "base64"));
}
async function setFiles(browser, paths) {
  const { root } = await browser.send("DOM.getDocument", {
    depth: -1,
    pierce: true,
  });
  const { nodeIds } = await browser.send("DOM.querySelectorAll", {
    nodeId: root.nodeId,
    selector: 'input[type="file"]',
  });
  if (nodeIds.length !== 3)
    throw new Error(`expected 3 file inputs, found ${nodeIds.length}`);
  for (let index = 0; index < 3; index += 1)
    await browser.send("DOM.setFileInputFiles", {
      nodeId: nodeIds[index],
      files: [paths[index]],
    });
}
function diagnostics(browser) {
  const consoleErrors = browser.events.filter(
    (event) =>
      event.method === "Runtime.exceptionThrown" ||
      (event.method === "Runtime.consoleAPICalled" &&
        ["error", "assert"].includes(event.params.type)),
  );
  const failed = browser.events.filter(
    (event) =>
      event.method === "Network.responseReceived" &&
      event.params.response.status >= 500,
  );
  if (consoleErrors.length || failed.length)
    throw new Error(
      `browser diagnostics console=${consoleErrors.length} server500=${failed.length}`,
    );
}

const adminBrowser = await connectTarget();
const financeBrowser = await connectTarget();
try {
  const adminSession = await loginApi("admin@demo.auto-import.invalid");
  const priorBrowserVehicles = (
    await apiJson("/vehicles?search=BrowserCar&limit=100", adminSession.token)
  ).data.items;
  for (const vehicle of priorBrowserVehicles)
    await apiJson(`/vehicles/${vehicle.id}`, adminSession.token, {
      method: "DELETE",
    });
  const dashboard = (await apiJson("/dashboard", adminSession.token)).data;
  await browserLogin(adminBrowser, "admin@demo.auto-import.invalid");
  await adminBrowser.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate(adminBrowser, "/", "Dashboard");
  await waitUntil(
    adminBrowser,
    "document.querySelectorAll('.recharts-wrapper').length>=2",
    "dashboard charts",
  );
  const dashboardEvidence = await evaluate(
    adminBrowser,
    `({ text:document.body.innerText, charts:document.querySelectorAll('.recharts-wrapper').length, overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth })`,
  );
  if (
    !dashboardEvidence.text.includes(String(dashboard.dossiers.total)) ||
    dashboardEvidence.charts < 2 ||
    dashboardEvidence.overflow
  )
    throw new Error(
      `dashboard API/chart/desktop reconciliation failed ${JSON.stringify({ total: dashboard.dossiers.total, charts: dashboardEvidence.charts, overflow: dashboardEvidence.overflow, text: dashboardEvidence.text.slice(0, 300) })}`,
    );
  await screenshot(adminBrowser, "dashboard-desktop.png");
  await adminBrowser.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await adminBrowser.send("Page.reload", { ignoreCache: true });
  await waitUntil(
    adminBrowser,
    "document.body.innerText.includes('Dashboard')",
    "mobile dashboard",
  );
  if (
    await evaluate(
      adminBrowser,
      "document.documentElement.scrollWidth>document.documentElement.clientWidth",
    )
  )
    throw new Error("dashboard mobile overflow");
  await screenshot(adminBrowser, "dashboard-mobile.png");
  console.log("UI_POLISH_STAGE dashboard");

  await adminBrowser.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const offerStats = (await apiJson("/offers/statistics", adminSession.token))
    .data;
  await navigate(adminBrowser, "/offres", "Offres Chine");
  await waitUntil(
    adminBrowser,
    `document.body.innerText.includes(${JSON.stringify(String(offerStats.total))})`,
    "offer KPI total",
  );
  const offerLinks = await evaluate(
    adminBrowser,
    "document.querySelectorAll('a[href^=\"/offres/\"]').length",
  );
  if (!offerLinks) throw new Error("offer detail actions missing");
  await setInput(adminBrowser, 'input[placeholder="Rechercher…"]', "BYD");
  await waitUntil(
    adminBrowser,
    "location.search.includes('search=BYD')",
    "offer search URL sync",
  );
  await evaluate(
    adminBrowser,
    `(() => { const select=document.querySelector('select[aria-label="Statut"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'available'); select.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`,
  );
  await waitUntil(
    adminBrowser,
    "location.search.includes('status=available')",
    "offer filter URL sync",
  );
  await adminBrowser.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  if (
    await evaluate(
      adminBrowser,
      "document.documentElement.scrollWidth>document.documentElement.clientWidth",
    )
  )
    throw new Error("offers mobile overflow");
  await screenshot(adminBrowser, "offers-mobile.png");
  console.log("UI_POLISH_STAGE offers");

  await adminBrowser.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate(adminBrowser, "/vehicules", "Véhicules / Stock");
  await clickText(adminBrowser, "Ajouter un véhicule");
  await evaluate(
    adminBrowser,
    `(() => { const fields=document.querySelectorAll('form[aria-labelledby="vehicle-form-title"] input[required]'); if(fields.length!==2)return false; const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(fields[0],'BrowserCar'); fields[0].dispatchEvent(new Event('input',{bubbles:true})); setter.call(fields[1],'TriplePhoto'); fields[1].dispatchEvent(new Event('input',{bubbles:true})); return true; })()`,
  );
  await setLabel(adminBrowser, "VIN", browserVin);
  await evaluate(
    adminBrowser,
    "document.querySelector('form').requestSubmit(); true",
  );
  await waitUntil(
    adminBrowser,
    "document.body.innerText.includes('Les trois photos distinctes sont obligatoires.')",
    "fewer than three blocked",
  );
  await setFiles(adminBrowser, imagePaths);
  await evaluate(
    adminBrowser,
    "document.querySelector('form').requestSubmit(); true",
  );
  await waitUntil(
    adminBrowser,
    "!document.querySelector('[aria-labelledby=vehicle-form-title]') && document.body.innerText.includes('BrowserCar')",
    "vehicle create persistence",
    180,
  );
  const createdPage = (
    await apiJson("/vehicles?search=BrowserCar&limit=10", adminSession.token)
  ).data;
  const created = createdPage.items[0];
  if (
    !created ||
    created.photos.length !== 3 ||
    created.photos.map((photo) => photo.sortOrder).join() !== "0,1,2"
  )
    throw new Error("created gallery metadata invalid");
  await adminBrowser.send("Page.reload", { ignoreCache: true });
  await waitUntil(
    adminBrowser,
    "document.body.innerText.includes('BrowserCar') && document.body.innerText.includes('3')",
    "vehicle reload cover/count",
  );
  await clickText(adminBrowser, "Voir détails");
  await waitUntil(
    adminBrowser,
    "document.querySelector('[role=dialog]')?.querySelectorAll('img').length>=4",
    "vehicle detail gallery",
  );
  await clickText(adminBrowser, "Modifier");
  await setFiles(adminBrowser, [imagePaths[2], imagePaths[0], imagePaths[1]]);
  await evaluate(
    adminBrowser,
    "document.querySelector('form').requestSubmit(); true",
  );
  await waitUntil(
    adminBrowser,
    "!document.querySelector('[aria-labelledby=vehicle-form-title]')",
    "vehicle replacement",
    180,
  );
  const four = new FormData();
  four.append("brand", "RejectedFour");
  four.append("model", "Photos");
  four.append("acquisitionType", "stock");
  for (const path of [
    ...imagePaths,
    resolve("..", "docs", "ui-references", "vehuclue-deaille.jpeg"),
  ])
    four.append(
      "photos",
      new Blob([await readFile(path)], { type: "image/jpeg" }),
      path.split(/[\\/]/).pop(),
    );
  const rejectedFour = await fetch(`${api}/vehicles/with-photos`, {
    method: "POST",
    headers: { authorization: `Bearer ${adminSession.token}` },
    body: four,
  });
  if (rejectedFour.status < 400)
    throw new Error("fourth vehicle photo was accepted");
  await screenshot(adminBrowser, "vehicles-desktop.png");
  console.log("UI_POLISH_STAGE vehicles");

  const audience = (
    await apiJson("/notifications/audience", adminSession.token)
  ).data;
  const financeUser = audience.users.find((user) =>
    user.email.startsWith("finance@"),
  );
  const financeRole = audience.roles.find((role) => role.name === "Finance");
  const logisticsRole = audience.roles.find(
    (role) => role.name === "Logistics",
  );
  if (!financeUser || !financeRole || !logisticsRole)
    throw new Error("required notification audiences missing");
  await navigate(
    adminBrowser,
    "/notifications",
    "Envoyer une notification ciblée",
  );
  const composeAndSend = async ({ userEmail, roleName, title }) => {
    await waitUntil(
      adminBrowser,
      `document.querySelectorAll('select[multiple]')[0]?.options.length>0 && document.querySelectorAll('select[multiple]')[1]?.options.length>0`,
      "notification audience options",
    );
    await evaluate(
      adminBrowser,
      `(() => { const selects=document.querySelectorAll('select[multiple]'); for(const option of selects[0].options) option.selected=${userEmail ? `option.text.includes(${JSON.stringify(userEmail)})` : "false"}; for(const option of selects[1].options) option.selected=${roleName ? `option.text===${JSON.stringify(roleName)}` : "false"}; selects[0].dispatchEvent(new Event('change',{bubbles:true})); selects[1].dispatchEvent(new Event('change',{bubbles:true})); return true; })()`,
    );
    await evaluate(
      adminBrowser,
      `(() => { const form=[...document.querySelectorAll('form')].find(x=>x.innerText.includes('Confirmer l’envoi')); if(!form)return false; const titleInput=form.querySelector('input[required]'); const message=form.querySelector('textarea[required]'); const inputSetter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; const areaSetter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; inputSetter.call(titleInput,${JSON.stringify(title)}); titleInput.dispatchEvent(new Event('input',{bubbles:true})); areaSetter.call(message,'Vérification ciblée depuis le navigateur.'); message.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`,
    );
    await waitUntil(
      adminBrowser,
      "![...document.querySelectorAll('button')].find(x=>x.innerText.includes(\"Confirmer l’envoi\"))?.disabled",
      `audience ${title}`,
    );
    await clickText(adminBrowser, "Confirmer l’envoi");
    await waitUntil(
      adminBrowser,
      "document.body.innerText.includes('notification(s) in-app envoyée(s).')",
      `delivery ${title}`,
    );
  };
  await composeAndSend({
    userEmail: financeUser.email,
    title: "Individuelle navigateur",
  });
  await composeAndSend({
    userEmail: financeUser.email,
    roleName: "Finance",
    title: "Finance dédupliquée",
  });
  const logisticsSend = await apiJson(
    "/notifications/send",
    adminSession.token,
    {
      method: "POST",
      body: JSON.stringify({
        userIds: [],
        roleIds: [logisticsRole.id],
        allActive: false,
        title: "Logistique navigateur",
        message: "Vérification ciblée depuis le navigateur.",
        category: "logistics",
        severity: "info",
      }),
    },
  );
  if (!logisticsSend.response.ok || logisticsSend.data.delivered < 1)
    throw new Error("Logistics-role notification failed");

  await browserLogin(financeBrowser, "finance@demo.auto-import.invalid");
  await navigate(financeBrowser, "/notifications", "Notifications");
  const beforeBadge = Number(
    await evaluate(
      financeBrowser,
      "Number(document.querySelector('button[aria-label=Notifications] span')?.innerText||0)",
    ),
  );
  const liveSend = await apiJson("/notifications/send", adminSession.token, {
    method: "POST",
    body: JSON.stringify({
      userIds: [financeUser.id],
      roleIds: [financeRole.id],
      allActive: false,
      title: "Temps réel navigateur",
      message: "Badge temps réel et déduplication.",
      category: "finance",
      severity: "info",
    }),
  });
  if (!liveSend.response.ok || liveSend.data.delivered !== 1)
    throw new Error("notification deduplication failed");
  await waitUntil(
    financeBrowser,
    `Number(document.querySelector('button[aria-label=Notifications] span')?.innerText||0)>${beforeBadge}`,
    "realtime notification badge",
  );
  await financeBrowser.send("Page.reload", { ignoreCache: true });
  await waitUntil(
    financeBrowser,
    "document.body.innerText.includes('Temps réel navigateur')",
    "notification reload",
  );
  await clickText(financeBrowser, "Temps réel navigateur", "main button");
  await sleep(500);
  const financeInbox = (
    await apiJson(
      "/notifications?limit=100",
      (await loginApi("finance@demo.auto-import.invalid")).token,
    )
  ).data;
  if (
    !financeInbox.items.some(
      (item) => item.title === "Temps réel navigateur" && item.readAt,
    )
  )
    throw new Error("notification read state did not persist");
  console.log("UI_POLISH_STAGE notifications-realtime");

  await browserLogin(adminBrowser, "readonly@demo.auto-import.invalid");
  await navigate(adminBrowser, "/notifications", "Notifications");
  if (
    await evaluate(
      adminBrowser,
      "document.body.innerText.includes('Envoyer une notification ciblée')",
    )
  )
    throw new Error("restricted notification composer visible");
  const restricted = await loginApi("readonly@demo.auto-import.invalid");
  if (
    (await apiJson("/notifications/audience", restricted.token)).response
      .status !== 403
  )
    throw new Error("restricted audience endpoint was accessible");
  if (await evaluate(adminBrowser, "document.body.innerText.includes('Audit')"))
    throw new Error("Audit visible in sidebar");
  console.log("UI_POLISH_STAGE restricted");

  await browserLogin(adminBrowser, "admin@demo.auto-import.invalid");
  await navigate(adminBrowser, "/profil", "Mon profil");
  await waitUntil(
    adminBrowser,
    "document.body.innerText.includes('Changer mon mot de passe')",
    "profile data",
  );
  await sleep(300);
  const { root } = await adminBrowser.send("DOM.getDocument", {
    depth: 1,
    pierce: true,
  });
  const avatarNode = await adminBrowser.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: 'input[type="file"]',
  });
  await adminBrowser.send("DOM.setFileInputFiles", {
    nodeId: avatarNode.nodeId,
    files: [imagePaths[0]],
  });
  await sleep(1000);
  const avatarImages = await evaluate(
    adminBrowser,
    "[...document.images].map(img=>({alt:img.alt,complete:img.complete,width:img.naturalWidth,src:img.src.slice(0,80)}))",
  );
  if (
    !avatarImages.some(
      (img) => img.alt.startsWith("Avatar de") && img.complete && img.width > 0,
    ) ||
    !avatarImages.some(
      (img) => img.alt === "Avatar du profil" && img.complete && img.width > 0,
    )
  )
    throw new Error(
      `profile/topbar avatar failed ${JSON.stringify(avatarImages)}`,
    );
  await adminBrowser.send("Page.reload", { ignoreCache: true });
  await waitUntil(
    adminBrowser,
    "Boolean(document.querySelector('img[alt^=\"Avatar de\"]') && document.querySelector('img[alt=\"Avatar du profil\"]'))",
    "avatar reload persistence",
  );
  await setPasswordFields(adminBrowser, "Wrong!Password123", nextPassword);
  await evaluate(
    adminBrowser,
    "document.querySelector('main form').requestSubmit(); true",
  );
  await waitUntil(
    adminBrowser,
    "document.body.innerText.includes('Password change unavailable')",
    "wrong current password rejection",
  );
  const oldSession = await loginApi("admin@demo.auto-import.invalid");
  await setPasswordFields(adminBrowser, originalPassword, nextPassword);
  await evaluate(
    adminBrowser,
    "document.querySelector('main form').requestSubmit(); true",
  );
  await waitUntil(
    adminBrowser,
    "document.body.innerText.includes('les autres sessions ont été révoquées')",
    "password rotation outcome",
    180,
  );
  const oldSessionCheck = await fetch(`${api}/auth/session`, {
    headers: { cookie: oldSession.cookie },
  });
  const oldSessionPayload = await oldSessionCheck.json();
  if (
    oldSessionCheck.status !== 200 ||
    oldSessionPayload.data?.authenticated !== false
  )
    throw new Error(
      `old refresh session remained valid: ${oldSessionCheck.status} ${JSON.stringify(oldSessionPayload)}`,
    );
  if (!(await loginApi("admin@demo.auto-import.invalid", nextPassword)).token)
    throw new Error("new password login failed");
  console.log("UI_POLISH_STAGE profile-security");

  const finalAdmin = await loginApi(
    "admin@demo.auto-import.invalid",
    nextPassword,
  );
  await navigate(adminBrowser, "/rapports", "Exporter PDF");
  await evaluate(
    adminBrowser,
    `(() => { const fields=document.querySelectorAll('main input[type="date"]'); if(fields.length!==2)return false; const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(fields[0],'2026-08-01'); fields[0].dispatchEvent(new Event('input',{bubbles:true})); setter.call(fields[1],'2026-08-31'); fields[1].dispatchEvent(new Event('input',{bubbles:true})); return true; })()`,
  );
  await clickText(adminBrowser, "Appliquer");
  const pdfResponse = await fetch(
    `${api}/reports/finance.pdf?from=2026-08-01T00:00:00.000Z&to=2026-08-31T23:59:59.999Z`,
    { headers: { authorization: `Bearer ${finalAdmin.token}` } },
  );
  const pdf = Buffer.from(await pdfResponse.arrayBuffer());
  if (
    !pdfResponse.ok ||
    pdfResponse.headers.get("content-type") !== "application/pdf" ||
    !pdf.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
    pdf.length < 2000
  )
    throw new Error("PDF signature/content headers invalid");
  if (
    !/attachment;.*\.pdf/i.test(
      pdfResponse.headers.get("content-disposition") ?? "",
    )
  )
    throw new Error("PDF disposition invalid");
  await writeFile(resolve(artifactDir, "rapport-finance-aout-2026.pdf"), pdf);
  await clickText(adminBrowser, "Exporter PDF");
  await waitUntil(
    adminBrowser,
    "![...document.querySelectorAll('button')].find(x=>x.innerText.includes('Exporter PDF'))?.disabled",
    "PDF browser download",
  );
  await screenshot(adminBrowser, "reports-desktop.png");
  console.log("UI_POLISH_STAGE pdf");

  await adminBrowser.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  for (const [path, text] of [
    ["/offres", "Offres Chine"],
    ["/vehicules", "Véhicules / Stock"],
    ["/notifications", "Notifications"],
    ["/profil", "Mon profil"],
    ["/rapports", "Rapports"],
  ]) {
    await navigate(adminBrowser, path, text);
    if (
      await evaluate(
        adminBrowser,
        "document.documentElement.scrollWidth>document.documentElement.clientWidth",
      )
    )
      throw new Error(`mobile overflow ${path}`);
  }
  diagnostics(adminBrowser);
  diagnostics(financeBrowser);
  const hashes = await Promise.all(
    imagePaths.map(async (path) =>
      createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    ),
  );
  console.log(
    `UI_POLISH_BROWSER_PASS viewports=1440x1000,390x844 roles=admin,finance,readonly routes=dashboard,offers,vehicles,notifications,profile,reports vehicle=${created.id} uploads=3 replacement=3 distinct=${new Set(hashes).size} notification=individual,finance,logistics,deduplicated,realtime,read-persisted avatar=persisted password=wrong-rejected,rotated PDF=${pdf.length} diagnostics=clean artifacts=${artifactDir}`,
  );
} finally {
  adminBrowser.socket.close();
  financeBrowser.socket.close();
}
