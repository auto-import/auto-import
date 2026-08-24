const frontendUrl =
  process.env.UI_SMOKE_FRONTEND_URL ?? "http://localhost:3001";
const apiUrl = process.env.UI_SMOKE_API_URL ?? "http://localhost:3000/api";
const debugUrl = process.env.UI_SMOKE_DEBUG_URL ?? "http://localhost:9222";
const adminEmail = process.env.UI_SMOKE_ADMIN_EMAIL ?? "admin@example.com";
const adminPassword = process.env.UI_SMOKE_ADMIN_PASSWORD;

if (!adminPassword) throw new Error("UI_SMOKE_ADMIN_PASSWORD is required");

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function api(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(`${options.method ?? "GET"} ${path}: ${response.status}`);
  }
  return { data: payload.data, response };
}

function refreshCookie(response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = /auto_import_refresh=([^;]+)/.exec(setCookie);
  if (!match) throw new Error("Refresh cookie missing from login response");
  return match[1];
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
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message));
    else callback.resolve(message.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const messageId = ++id;
      pending.set(messageId, { resolve, reject });
      socket.send(JSON.stringify({ id: messageId, method, params }));
    });
  return { socket, send };
}

const adminLogin = await api("/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
});
const adminCookie = refreshCookie(adminLogin.response);
const adminToken = adminLogin.data.accessToken;
const adminHeaders = { Authorization: `Bearer ${adminToken}` };
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

async function waitForText(text, present = true) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const body = await evaluate("document.body?.innerText ?? ''");
    if (body.includes(text) === present) return;
    await sleep(200);
  }
  throw new Error(
    `Timed out waiting for ${present ? "" : "absence of "}${text}`,
  );
}

async function waitForButton(text, present = true) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const found = await evaluate(`[...document.querySelectorAll('button')]
      .some((node) => node.textContent?.trim() === ${JSON.stringify(text)})`);
    if (found === present) return;
    await sleep(200);
  }
  throw new Error(
    `Timed out waiting for ${present ? "" : "absence of "}button ${text}`,
  );
}

async function clickButton(text) {
  const clicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((node) => node.textContent?.trim().includes(${JSON.stringify(text)}));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Button not found: ${text}`);
  await sleep(150);
}

async function setField(label, value, selector = "input") {
  const updated = await evaluate(`(() => {
    const label = [...document.querySelectorAll('label')]
      .find((node) => node.textContent?.includes(${JSON.stringify(label)}));
    const field = label?.querySelector(${JSON.stringify(selector)});
    if (!field) return false;
    const prototype = field instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!updated) throw new Error(`Field not found: ${label}`);
}

async function selectOption(label, optionText) {
  const selected = await evaluate(`(() => {
    const label = [...document.querySelectorAll('label')]
      .find((node) => node.textContent?.includes(${JSON.stringify(label)}));
    const field = label?.querySelector('select');
    const option = field && [...field.options]
      .find((item) => item.textContent?.trim() === ${JSON.stringify(optionText)});
    if (!field || !option) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(field, option.value);
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!selected) throw new Error(`Option not found: ${label} / ${optionText}`);
}

async function checkLabel(text) {
  const checked = await evaluate(`(() => {
    const label = [...document.querySelectorAll('label')]
      .find((node) => node.textContent?.trim() === ${JSON.stringify(text)});
    const input = label?.querySelector('input[type=checkbox]');
    if (!input) return false;
    if (!input.checked) input.click();
    return true;
  })()`);
  if (!checked) throw new Error(`Checkbox not found: ${text}`);
}

try {
  await browser.send("Network.enable");
  await browser.send("Network.setCookie", {
    name: "auto_import_refresh",
    value: adminCookie,
    url: apiUrl,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  });
  await browser.send("Page.enable");
  await browser.send("Page.navigate", { url: `${frontendUrl}/utilisateurs` });
  await waitForText("Utilisateurs et accès");
  await waitForText(adminEmail);

  await clickButton("Bureaux");
  await clickButton("Nouveau bureau");
  await setField("Nom", "Smoke UI Office");
  await setField("Ville", "Alger");
  await setField("Pays", "Algérie");
  await clickButton("Enregistrer");
  await waitForText("Smoke UI Office");

  await clickButton("Rôles");
  await clickButton("Nouveau rôle");
  await setField("Nom", "Smoke UI Reader");
  await setField("Description", "Browser smoke role", "textarea");
  await checkLabel("users:read");
  await clickButton("Enregistrer");
  await waitForText("Smoke UI Reader");

  await clickButton("Utilisateurs");
  await clickButton("Nouvel utilisateur");
  await setField("Prénom", "Browser");
  await setField("Nom", "Reader");
  await setField("Email", "browser.reader@example.test");
  await selectOption("Bureau", "Smoke UI Office");
  await checkLabel("Smoke UI Reader");
  await setField("Mot de passe initial", "Browser-Reader-Smoke-2026!");
  await clickButton("Enregistrer");
  await waitForText("Browser Reader");

  const limitedLogin = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "browser.reader@example.test",
      password: "Browser-Reader-Smoke-2026!",
    }),
  });
  await browser.send("Network.setCookie", {
    name: "auto_import_refresh",
    value: refreshCookie(limitedLogin.response),
    url: apiUrl,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  });
  await browser.send("Page.reload", { ignoreCache: true });
  await waitForText("Browser Reader");
  await waitForButton("Nouvel utilisateur", false);
  await waitForButton("Bureaux", false);
  await waitForButton("Rôles", false);

  console.log(
    "BROWSER_SMOKE admin=user-role-office-create limited=read-only-controls-hidden",
  );
} finally {
  const users = (
    await api("/users?search=browser.reader&limit=20", {
      headers: adminHeaders,
    })
  ).data.items;
  const roles = (await api("/roles", { headers: adminHeaders })).data;
  const offices = (
    await api("/offices?search=Smoke%20UI%20Office&limit=20", {
      headers: adminHeaders,
    })
  ).data.items;
  const user = users.find(
    (item) => item.email === "browser.reader@example.test",
  );
  const role = roles.find((item) => item.name === "Smoke UI Reader");
  const office = offices.find((item) => item.name === "Smoke UI Office");
  if (user)
    await api(`/users/${user.id}`, { method: "DELETE", headers: adminHeaders });
  if (role)
    await api(`/roles/${role.id}`, { method: "DELETE", headers: adminHeaders });
  if (office)
    await api(`/offices/${office.id}`, {
      method: "DELETE",
      headers: adminHeaders,
    });
  browser.socket.close();
}
