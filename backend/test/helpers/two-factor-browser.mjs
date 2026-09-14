import { generateSync } from 'otplib';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Called by the disposable database suite. Uses the real browser and API;
// it does not intercept or substitute any application response.
const origin = process.env.DOSSIER_BROWSER_URL;
const api = process.env.DOSSIER_BROWSER_API;
if (
  !origin ||
  !api ||
  ![origin, api].every((url) =>
    ['localhost', '127.0.0.1'].includes(new URL(url).hostname),
  )
) {
  throw new Error('Browser verification is restricted to a local frontend.');
}
const profile = await mkdtemp(join(tmpdir(), 'dossier-chrome-'));
const chrome = spawn(
  process.env.CHROME_PATH ??
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=55442',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try {
      target = await fetch('http://127.0.0.1:55442/json/new?about:blank', {
        method: 'PUT',
      }).then((r) => r.json());
      break;
    } catch {
      await pause(100);
    }
  }
  if (!target) throw new Error('Chrome did not start.');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const requests = new Map();
  const responses = [];
  const serverErrors = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const handler = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) handler?.reject(new Error(message.error.message));
      else handler?.resolve(message.result);
    }
    if (
      message.method === 'Network.responseReceived' &&
      message.params.response.status >= 500
    )
      serverErrors.push({
        url: message.params.response.url,
        status: message.params.response.status,
      });
    if (message.method === 'Network.requestWillBeSent') {
      const r = message.params.request;
      if (new URL(r.url).pathname.startsWith('/api/')) {
        requests.set(message.params.requestId, {
          method: r.method,
          url: new URL(r.url).pathname,
        });
      }
    }
    if (
      message.method === 'Network.responseReceived' &&
      requests.has(message.params.requestId)
    ) {
      responses.push({
        ...requests.get(message.params.requestId),
        status: message.params.response.status,
      });
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error('Browser evaluation failed');
    return result.result.value;
  };
  const waitFor = async (expression, label) => {
    for (let i = 0; i < 200; i++) {
      if (await evaluate(expression)) return;
      await pause(150);
    }
    throw new Error(
      `Timed out: ${label}; ${JSON.stringify(await evaluate("({path:location.pathname,alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent)})"))}; responses=${JSON.stringify(responses)}`,
    );
  };
  const navigate = (path) => send('Page.navigate', { url: `${origin}${path}` });
  const click = async (text) => {
    await waitFor(
      `[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`,
      text,
    );
    await evaluate(
      `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled).click()`,
    );
    await pause(200);
  };
  const select = async (label, value) => {
    const selector = `select[aria-label=${JSON.stringify(label)}]`;
    await waitFor(
      `document.querySelector(${JSON.stringify(selector)})?.querySelector('option[value="${value}"]') != null`,
      label,
    );
    await evaluate(
      `(()=>{const s=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(value)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await pause(200);
  };
  const fill = async (selector, value) => {
    await waitFor(
      `document.querySelector(${JSON.stringify(selector)}) != null`,
      'input available',
    );
    await evaluate(
      `(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
  };
  const submit = async (selector = 'form') => {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).requestSubmit()`,
    );
    await pause(200);
  };
  const panel = 'section[aria-labelledby="two-factor-title"]';
  const signIn = async () => {
    await navigate('/connexion');
    await waitFor("document.querySelector('#email') != null", 'login');
    await pause(400);
    await fill('#email', process.env.DOSSIER_BROWSER_EMAIL);
    await fill('#password', process.env.DOSSIER_BROWSER_PASSWORD);
    await submit();
  };
  await send('Network.enable');
  await signIn();
  await waitFor("location.pathname === '/'", 'password-only login');
  await navigate('/profil');
  await waitFor(
    `document.querySelector(${JSON.stringify(panel)}) != null`,
    'security panel',
  );
  await fill(
    `${panel} input[type="password"]`,
    process.env.DOSSIER_BROWSER_PASSWORD,
  );
  await click('Configurer la 2FA');
  await waitFor(
    `document.querySelector(${JSON.stringify(panel + ' img')})?.naturalWidth > 0`,
    'scannable QR image',
  );
  const secret = await evaluate(
    `document.querySelector(${JSON.stringify(panel + ' code')}).textContent`,
  );
  await fill(
    `${panel} input[autocomplete="one-time-code"]`,
    generateSync({ secret }),
  );
  await click('Vérifier et activer');
  await waitFor(
    `document.querySelectorAll(${JSON.stringify(panel + ' li')}).length===10`,
    'one-time recovery codes',
  );
  const codes = await evaluate(
    `[...document.querySelectorAll(${JSON.stringify(panel + ' li')})].map(e=>e.textContent)`,
  );
  await click('J’ai enregistré mes codes — me reconnecter');
  await waitFor(
    "location.pathname === '/connexion'",
    'reauthentication after activation',
  );
  await signIn();
  await waitFor(
    "document.querySelector('#two-factor-code') != null",
    'authenticator step',
  );
  await fill(
    '#two-factor-code',
    generateSync({ secret, epoch: Math.floor(Date.now() / 1000) - 120 }),
  );
  await submit();
  await waitFor(
    "document.querySelector('[role=alert]') != null",
    'invalid code error',
  );
  if (await evaluate("location.pathname !== '/connexion'"))
    throw new Error('Invalid factor granted access');
  await fill(
    '#two-factor-code',
    generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + 30 }),
  );
  await submit();
  await waitFor("location.pathname === '/'", 'TOTP login');
  await evaluate(
    "fetch('/api/auth/logout',{method:'POST',credentials:'include'})",
  );
  await signIn();
  await waitFor(
    "document.querySelector('#two-factor-code') != null",
    'second challenge',
  );
  await click('Utiliser un code de récupération');
  await fill('#two-factor-code', codes[0]);
  await submit();
  await waitFor("location.pathname === '/'", 'recovery login');
  await navigate('/profil');
  await waitFor(
    `document.querySelector(${JSON.stringify(panel)})?.textContent.includes('9 codes de récupération restants')`,
    'remaining recovery count',
  );
  await fill(
    `${panel} input[type="password"]`,
    process.env.DOSSIER_BROWSER_PASSWORD,
  );
  await fill(`${panel} input[autocomplete="one-time-code"]`, codes[1]);
  await click('Désactiver la 2FA');
  await waitFor(
    "location.pathname === '/connexion'",
    'reauthentication after disabling',
  );
  await signIn();
  await waitFor("location.pathname === '/'", 'restored password-only login');
  if (serverErrors.length)
    throw new Error(`Browser observed ${serverErrors.length} server errors`);
  console.log(
    JSON.stringify({
      passwordOnly: true,
      qrVisible: true,
      setup: true,
      totpLogin: true,
      recoveryLogin: true,
      disable: true,
      serverErrors: 0,
    }),
  );
} finally {
  socket?.close();
  chrome.kill();
  await new Promise((resolve) => {
    if (chrome.exitCode !== null) resolve();
    else chrome.once('exit', resolve);
  });
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
