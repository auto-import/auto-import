const frontendUrl =
  process.env.UI_SMOKE_FRONTEND_URL ?? "http://localhost:3001";
const apiUrl = process.env.UI_SMOKE_API_URL ?? "http://localhost:3000/api";
const debugUrl = process.env.UI_SMOKE_DEBUG_URL ?? "http://localhost:9222";
const adminEmail = process.env.UI_SMOKE_ADMIN_EMAIL ?? "admin@example.com";
const adminPassword = process.env.UI_SMOKE_ADMIN_PASSWORD;
if (!adminPassword) throw new Error("UI_SMOKE_ADMIN_PASSWORD is required");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runId = `gate-a-${Date.now()}`;

async function rawRequest(path, { method = "GET", body, headers = {} } = {}) {
  const multipart = body instanceof FormData;
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    body: multipart
      ? body
      : body === undefined
        ? undefined
        : JSON.stringify(body),
    headers: {
      Accept: "application/json",
      ...(body !== undefined && !multipart
        ? { "Content-Type": "application/json" }
        : {}),
      ...headers,
    },
  });
  const payload = (response.headers.get("content-type") ?? "").includes(
    "application/json",
  )
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
  return { socket, send, events };
}

const login = await request("/auth/login", {
  method: "POST",
  body: { email: adminEmail, password: adminPassword },
});
const headers = { Authorization: `Bearer ${login.accessToken}` };
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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(expression)) return;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function navigate(path, expectedText) {
  await browser.send("Page.navigate", { url: `${frontendUrl}${path}` });
  await waitUntil(
    `document.readyState === 'complete' && (document.body?.innerText ?? '').includes(${JSON.stringify(expectedText)})`,
    `${path} / ${expectedText}`,
  );
}

async function setInput(selector, value) {
  const ok = await evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    if (!field) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`Input not found: ${selector}`);
}

try {
  await browser.send("Page.enable");
  await browser.send("Runtime.enable");
  await browser.send("Network.enable");
  await browser.send("Network.clearBrowserCookies");
  await navigate("/connexion", "Connexion");
  await setInput("#email", adminEmail);
  await setInput("#password", adminPassword);
  await evaluate("document.querySelector('form')?.requestSubmit()");
  await waitUntil(
    "location.pathname !== '/connexion'",
    "successful browser login",
  );
  await browser.send("Page.reload", { ignoreCache: true });
  await waitUntil(
    "location.pathname !== '/connexion'",
    "session restoration after reload",
  );
  // The anonymous login page is expected to probe refresh once and receive 401.
  // Diagnostics below cover the authenticated application journey only.
  browser.events.length = 0;

  const prospect = await request("/prospects", {
    method: "POST",
    headers,
    body: {
      firstName: "Élodie",
      lastName: `Navigatrice ${runId}`,
      phone: `+21355${String(Date.now()).slice(-7)}`,
      email: `${runId}@example.test`,
      source: "browser-acceptance",
    },
  });
  await request(`/prospects/${prospect.id}/activities`, {
    method: "POST",
    headers,
    body: {
      type: "note",
      title: "Appel de qualification",
      description: "Activité persistée depuis le parcours navigateur",
      prospectId: prospect.id,
    },
  });
  await navigate("/crm/leads", "Élodie");
  const client = await request(`/prospects/${prospect.id}/convert`, {
    method: "POST",
    headers,
    body: { nationality: "Algérienne", address: "Alger" },
  });
  await navigate("/crm/clients", "Élodie");

  const channels = await request("/call-center/channels", { headers });
  const voiceChannel =
    channels.find((item) => item.channel === "VOICE") ??
    (await request("/call-center/channels", {
      method: "POST",
      headers,
      body: {
        channel: "VOICE",
        displayName: "Gate A voix",
        normalizedNumber: "+21321000000",
        providerKey: `mock-voice-${runId}`,
      },
    }));
  const whatsappChannel =
    channels.find((item) => item.channel === "WHATSAPP") ??
    (await request("/call-center/channels", {
      method: "POST",
      headers,
      body: {
        channel: "WHATSAPP",
        displayName: "Gate A WhatsApp",
        normalizedNumber: "+21321000001",
        providerKey: `mock-whatsapp-${runId}`,
      },
    }));
  for (const [kind, externalNumber] of [
    ["known", prospect.phone],
    ["unknown", "+213599999999"],
  ]) {
    await request("/call-center/simulator/calls/inbound", {
      method: "POST",
      headers,
      body: {
        providerEventId: `${runId}-call-event-${kind}`,
        providerCallId: `${runId}-call-${kind}`,
        companyNumber: voiceChannel.normalizedNumber,
        externalNumber,
        state: "QUEUED",
      },
    });
    await request("/call-center/simulator/whatsapp/inbound", {
      method: "POST",
      headers,
      body: {
        providerEventId: `${runId}-message-event-${kind}`,
        providerMessageId: `${runId}-message-${kind}`,
        companyNumber: whatsappChannel.normalizedNumber,
        externalNumber,
        text: `Message ${kind} — vérification accents`,
      },
    });
  }
  await navigate("/crm/call-center", "Call Center");

  const supplier = await request("/partners", {
    method: "POST",
    headers,
    body: {
      name: `Fournisseur ${runId}`,
      type: "supplier",
      country: "Chine",
      city: "Shanghai",
      email: `${runId}-supplier@example.test`,
    },
  });
  const carrier = await request("/partners", {
    method: "POST",
    headers,
    body: {
      name: `Transporteur ${runId}`,
      type: "carrier",
      country: "Algérie",
    },
  });
  const broker = await request("/partners", {
    method: "POST",
    headers,
    body: {
      name: `Transitaire ${runId}`,
      type: "customsBroker",
      country: "Algérie",
    },
  });
  const offer = await request("/offers", {
    method: "POST",
    headers,
    body: {
      supplierId: supplier.id,
      brand: "Geely",
      model: `Coolray ${runId}`,
      year: 2026,
      condition: "new",
      specification: { engine: "1.5T", color: "Bleu" },
      purchasePrice: 12000,
      cifPrice: 14500,
      ddpPrice: 19500,
      currency: "USD",
      validFrom: new Date(Date.now() - 86400000).toISOString(),
      validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
      availableQuantity: 6,
    },
  });
  const vehicle = await request("/vehicles", {
    method: "POST",
    headers,
    body: {
      vin: `GATEA${String(Date.now()).slice(-12)}`,
      brand: "Chery",
      model: `Tiggo ${runId}`,
      year: 2026,
      condition: "new",
      purchasePrice: 13000,
      sellingPrice: 18500,
      currency: "USD",
      acquisitionType: "stock",
      supplierId: supplier.id,
    },
  });
  const vehicleDdp = await request("/vehicles", {
    method: "POST",
    headers,
    body: {
      vin: `DDP${String(Date.now()).slice(-14)}`,
      brand: "Chery",
      model: `Arrizo ${runId}`,
      year: 2026,
      condition: "new",
      purchasePrice: 14000,
      sellingPrice: 20500,
      currency: "USD",
      acquisitionType: "stock",
      supplierId: supplier.id,
    },
  });
  await navigate("/fournisseurs", `Fournisseur ${runId}`);
  await navigate("/offres", `Coolray ${runId}`);
  await navigate("/vehicules", `Tiggo ${runId}`);

  const releasedReservation = await request(
    `/offers/${offer.id}/reservations`,
    { method: "POST", headers, body: { clientId: client.id, quantity: 1 } },
  );
  await request(`/offers/reservations/${releasedReservation.id}/release`, {
    method: "POST",
    headers,
    body: { reason: "Vérification de libération Gate A" },
  });
  const releasedOffer = await request(`/offers/${offer.id}`, { headers });
  if (
    !releasedOffer.reservations.some(
      (item) =>
        item.id === releasedReservation.id && item.status === "released",
    )
  )
    throw new Error("Released reservation was not persisted");
  const purchaseReservation = await request(
    `/offers/${offer.id}/reservations`,
    { method: "POST", headers, body: { clientId: client.id, quantity: 1 } },
  );
  const purchase = await request(
    `/offers/reservations/${purchaseReservation.id}/materialize`,
    {
      method: "POST",
      headers,
      body: {
        vin: `BUY${String(Date.now()).slice(-14)}`,
        purchasePrice: 12000,
        sellingPrice: 19000,
      },
    },
  );

  const dossiers = {};
  for (const type of [
    "VEHICLE_SALE_CIF",
    "VEHICLE_SALE_DDP",
    "SHIPPING_ONLY",
  ]) {
    dossiers[type] = await request("/dossiers", {
      method: "POST",
      headers,
      body: {
        clientId: client.id,
        type,
        ...(type === "VEHICLE_SALE_CIF"
          ? { vehicleIds: [vehicle.id] }
          : type === "VEHICLE_SALE_DDP"
            ? { vehicleIds: [vehicleDdp.id] }
            : {}),
      },
    });
  }
  await navigate("/dossiers", dossiers.VEHICLE_SALE_CIF.reference);

  const cif = dossiers.VEHICLE_SALE_CIF;
  for (const status of [
    "clientConfirmed",
    "contractSigned",
    "depositReceived",
  ]) {
    await request(`/dossiers/${cif.id}/status`, {
      method: "PATCH",
      headers,
      body: { status, comment: `Gate A ${status}` },
    });
  }
  const plan = await request("/finance/payment-plans", {
    method: "POST",
    headers,
    body: {
      clientId: client.id,
      dossierId: cif.id,
      totalAmount: 1000000,
      currency: "DZD",
      strategy: "THIRTY_SEVENTY",
    },
  });
  const blocked = await rawRequest(`/dossiers/${cif.id}/status`, {
    method: "PATCH",
    headers,
    body: { status: "purchaseConfirmed", comment: "Doit être bloqué" },
  });
  if (blocked.response.status !== 400)
    throw new Error(
      `Financial gate did not fail safely: ${blocked.response.status}`,
    );
  const payment = await request("/finance/payments", {
    method: "POST",
    headers,
    body: {
      clientId: client.id,
      dossierId: cif.id,
      amount: 300000,
      currency: "DZD",
      paymentMethod: "bank_transfer",
      reference: `${runId}-deposit`,
      idempotencyKey: `${runId}-payment`,
      allocations: [{ installmentId: plan.installments[0].id, amount: 300000 }],
    },
  });
  await request(`/finance/payments/${payment.id}/confirm`, {
    method: "POST",
    headers,
  });
  await request(`/dossiers/${cif.id}/status`, {
    method: "PATCH",
    headers,
    body: { status: "purchaseConfirmed", comment: "Acompte confirmé" },
  });
  const invoice = await request("/finance/invoices", {
    method: "POST",
    headers,
    body: {
      clientId: client.id,
      dossierId: cif.id,
      currency: "DZD",
      items: [
        {
          description: "Véhicule importé",
          quantity: 1,
          unitPrice: 1000000,
          tax: 0,
        },
      ],
    },
  });
  await request(`/finance/invoices/${invoice.id}/issue`, {
    method: "POST",
    headers,
  });
  await request("/finance/costs", {
    method: "POST",
    headers,
    body: {
      type: "SHIPPING",
      amount: 75000,
      currency: "DZD",
      dossierId: cif.id,
      description: "Fret maritime",
    },
  });
  const supplierPayment = await request("/finance/supplier-payments", {
    method: "POST",
    headers,
    body: {
      supplierId: supplier.id,
      purchaseId: purchase.id,
      amount: 12000,
      currency: "USD",
      paymentMethod: "bank_transfer",
      reference: `${runId}-supplier-payment`,
      idempotencyKey: `${runId}-supplier-payment`,
    },
  });
  await request(`/finance/supplier-payments/${supplierPayment.id}/confirm`, {
    method: "POST",
    headers,
  });
  await navigate("/finance", "Finance & Rentabilité");

  const shipment = await request("/shipments", {
    method: "POST",
    headers,
    body: {
      carrierPartnerId: carrier.id,
      blNumber: `BL-${runId}`,
      vesselName: "MV Vérification",
      containerNumber: `CONT-${String(Date.now()).slice(-8)}`,
      departurePort: "Shanghai",
      arrivalPort: "Alger",
      vehicleIds: [vehicle.id],
    },
  });
  for (const status of ["booked", "loading", "inTransit", "arrived"]) {
    await request(`/shipments/${shipment.id}/transition`, {
      method: "POST",
      headers,
      body: { status, comment: `Gate A ${status}` },
    });
  }
  const customs = await request("/customs", {
    method: "POST",
    headers,
    body: {
      shipmentId: shipment.id,
      dossierId: dossiers.VEHICLE_SALE_DDP.id,
      vehicleId: vehicle.id,
      brokerPartnerId: broker.id,
      declarationNumber: `DEC-${runId}`,
      customsValue: 2000000,
      dutyAmount: 300000,
      taxAmount: 190000,
      feesAmount: 25000,
      currency: "DZD",
    },
  });
  for (const status of ["inInspection", "cleared", "released"]) {
    await request(`/customs/${customs.id}/transition`, {
      method: "POST",
      headers,
      body: { status, comment: `Gate A ${status}` },
    });
  }
  await navigate("/expeditions", shipment.shipmentNumber);

  const form = new FormData();
  form.set("dossierId", cif.id);
  form.set("kind", "CONTRACT");
  form.set("documentType", "contrat");
  form.set("title", `Contrat signé ${runId}`);
  form.set(
    "file",
    new Blob(["%PDF-1.4\nGate A disposable document\n%%EOF"], {
      type: "application/pdf",
    }),
    `${runId}.pdf`,
  );
  const document = await request("/documents/upload", {
    method: "POST",
    headers,
    body: form,
  });
  const download = await rawRequest(`/documents/${document.id}/download`, {
    headers,
  });
  if (!download.response.ok || download.payload.byteLength === 0)
    throw new Error("Authorized document download failed");
  await navigate("/documents", `Contrat signé ${runId}`);

  await navigate(`/dossiers/${cif.id}`, cif.reference);
  await browser.send("Page.reload", { ignoreCache: true });
  await waitUntil(
    `(document.body?.innerText ?? '').includes(${JSON.stringify(cif.reference)})`,
    "dossier persistence after reload",
  );

  const dashboard = await request("/dashboard", { headers });
  await navigate("/", "Tableau de bord");
  await waitUntil(
    `(document.body?.innerText ?? '').includes(${JSON.stringify(String(dashboard.dossiers.active))})`,
    "dashboard KPI reconciliation",
  );

  const taskTitle = `Relance finale ${runId}`;
  const task = await request("/tasks", {
    method: "POST",
    headers,
    body: {
      title: taskTitle,
      type: "follow_up",
      priority: "high",
      dossierId: cif.id,
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    },
  });
  await navigate("/tasks", taskTitle);
  const completedInBrowser = await evaluate(`(() => {
    const card = [...document.querySelectorAll('article')].find((node) => node.textContent?.includes(${JSON.stringify(taskTitle)}));
    const button = card?.querySelector('button');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!completedInBrowser)
    throw new Error("Task completion control was not available in the browser");
  await waitUntil(
    `fetch(${JSON.stringify(`${apiUrl}/tasks?status=completed&limit=100`)}, { headers: { Authorization: ${JSON.stringify(`Bearer ${login.accessToken}`)} } }).then((response) => response.json()).then((payload) => payload.data.items.some((item) => item.id === ${JSON.stringify(task.id)}))`,
    "persisted task completion",
  );

  const inbox = await request("/notifications?limit=100", { headers });
  const taskNotification = inbox.items.find(
    (item) => item.relatedType === "task" && item.relatedId === task.id,
  );
  if (!taskNotification || taskNotification.readAt)
    throw new Error("Persistent unread task notification was not created");
  await navigate("/notifications", taskNotification.title);
  const readInBrowser = await evaluate(`(() => {
    const node = [...document.querySelectorAll('a,button')].find((item) => item.textContent?.includes(${JSON.stringify(taskNotification.title)}));
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!readInBrowser)
    throw new Error(
      "Notification read control was not available in the browser",
    );
  await waitUntil(
    `fetch(${JSON.stringify(`${apiUrl}/notifications?limit=100`)}, { headers: { Authorization: ${JSON.stringify(`Bearer ${login.accessToken}`)} } }).then((response) => response.json()).then((payload) => Boolean(payload.data.items.find((item) => item.id === ${JSON.stringify(taskNotification.id)})?.readAt))`,
    "persisted notification read state",
  );

  const audit = await request("/audit?entityType=tasks&limit=100", { headers });
  const taskAudit = audit.items.find(
    (item) => item.entityId === task.id || item.entityId === "collection",
  );
  if (!taskAudit) throw new Error("Task mutation audit entry missing");
  const auditText = JSON.stringify(taskAudit).toLowerCase();
  if (
    ["password", "token", "authorization", "cookie", "file", "secret"].some(
      (key) => auditText.includes(key),
    )
  )
    throw new Error("Audit entry leaked a sensitive field name");
  await navigate("/audit", "Journal d’audit");

  await navigate("/rapports", "Rapports");
  const csv = await rawRequest("/reports/finance.csv", { headers });
  if (!csv.response.ok)
    throw new Error(`CSV export failed: ${csv.response.status}`);
  const csvBytes = new Uint8Array(csv.payload);
  const csvText = new TextDecoder("utf-8").decode(csvBytes);
  const hasUtf8Bom =
    csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf;
  if (
    !hasUtf8Bom ||
    !csvText.includes("Généré le") ||
    !csvText.includes("Reste à encaisser")
  )
    throw new Error("CSV export is not deterministic UTF-8 French content");

  const displayName = `AutoImport Vérifié ${runId}`;
  await navigate("/parametres", "Paramètres");
  const settingChanged = await evaluate(`(() => {
    const label = [...document.querySelectorAll('label')].find((node) => node.textContent?.includes('Nom affiché'));
    const input = label?.querySelector('input');
    if (!input) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(displayName)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (!settingChanged) throw new Error("Allowed setting field not found");
  const saved = await evaluate(
    `(() => { const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('Enregistrer les modifications')); if (!button) return false; button.click(); return true; })()`,
  );
  if (!saved) throw new Error("Settings save control not found");
  await waitUntil(
    `(document.body?.innerText ?? '').includes('Modifications enregistrées.')`,
    "settings save confirmation",
  );
  await browser.send("Page.reload", { ignoreCache: true });
  await waitUntil(
    `document.querySelector('label') && [...document.querySelectorAll('label')].some((node) => node.textContent?.includes('Nom affiché') && node.querySelector('input')?.value === ${JSON.stringify(displayName)})`,
    "settings persistence after reload",
  );
  const lockedCurrency = await rawRequest("/settings", {
    method: "PATCH",
    headers,
    body: { baseCurrency: "USD" },
  });
  if (lockedCurrency.response.status !== 400)
    throw new Error(
      `Base currency protection failed: ${lockedCurrency.response.status}`,
    );

  await browser.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  if (await evaluate("document.documentElement.scrollWidth > innerWidth + 2"))
    throw new Error("Phase 3 settings page overflows at mobile viewport");
  if (
    !(await evaluate(
      "[...document.querySelectorAll('option')].some((node) => node.textContent?.includes('العربية'))",
    ))
  )
    throw new Error("Arabic locale label is corrupted or missing");
  await browser.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const unexpectedConsole = browser.events.filter(
    (event) =>
      event.method === "Runtime.exceptionThrown" ||
      (event.method === "Runtime.consoleAPICalled" &&
        ["error", "assert"].includes(event.params.type)),
  );
  const unexpectedResponses = browser.events.filter(
    (event) =>
      event.method === "Network.responseReceived" &&
      ["XHR", "Fetch"].includes(event.params.type) &&
      event.params.response.status >= 400,
  );
  if (unexpectedConsole.length || unexpectedResponses.length) {
    throw new Error(
      `Browser diagnostics failed: console=${unexpectedConsole.length} network=${unexpectedResponses.map((event) => `${event.params.response.status}:${event.params.response.url}`).join(",")}`,
    );
  }
  console.log(
    `FINAL_BROWSER_ACCEPTANCE_PASS run=${runId} lead-client calls-messages supplier-offer-vehicle dossiers=CIF,DDP,SHIPPING reservation-release finance shipment-customs document=${document.file.storageKey} gate=blocked-then-passed task=${task.id}:completed notification=${taskNotification.id}:read audit=redacted dashboard=reconciled report=utf8-csv settings=persisted-currency-locked viewports=desktop-mobile diagnostics=clean`,
  );
} finally {
  browser.socket.close();
}
