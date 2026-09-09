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
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const handler = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) handler?.reject(new Error(message.error.message));
      else handler?.resolve(message.result);
    }
    if (message.method === 'Network.requestWillBeSent') {
      const r = message.params.request;
      if (new URL(r.url).pathname.startsWith('/api/dossiers')) {
        requests.set(message.params.requestId, {
          method: r.method,
          url: new URL(r.url).pathname,
          payload: r.postData,
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
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression, label) => {
    for (let i = 0; i < 200; i++) {
      if (await evaluate(expression)) return;
      await pause(150);
    }
    throw new Error(
      `Timed out: ${label}. ${await evaluate('document.body.innerText.slice(0, 1800)')}`,
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
  await send('Network.enable');
  await navigate('/connexion');
  await waitFor(
    `location.origin===${JSON.stringify(origin)}&&location.pathname==='/connexion'&&document.readyState==='complete'`,
    'login page',
  );
  const credentials = JSON.stringify({
    email: process.env.DOSSIER_BROWSER_EMAIL,
    password: process.env.DOSSIER_BROWSER_PASSWORD,
  });
  const login = await evaluate(
    `fetch(${JSON.stringify(`${api}/auth/login`)},{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(${credentials})}).then(r=>r.status)`,
  );
  if (login !== 201 && login !== 200)
    throw new Error(`Browser login returned ${login}`);
  await navigate(`/catalogue/${process.env.DOSSIER_BROWSER_ITEM}`);
  await waitFor(
    "document.body.innerText.includes('Tarification CIF')",
    'catalogue pricing',
  );
  // The current catalogue detail has no create CTA; use the existing dossier wizard.
  await navigate('/dossiers/creer');
  await click('Continuer');
  await select('Client existant', process.env.DOSSIER_BROWSER_CLIENT);
  await click('Continuer');
  await select('Demande de sourcing', process.env.DOSSIER_BROWSER_ITEM);
  await click('Continuer');
  await click('Continuer');
  await click('Créer le dossier');
  await waitFor(
    '/^\\/dossiers\\/[0-9a-f-]{36}$/.test(location.pathname)',
    'created dossier detail',
  );
  await waitFor("document.body.innerText.includes('CA-')", 'dossier rendered');
  const body = await evaluate('document.body.innerText');
  if (body.includes('Internal server error'))
    throw new Error('Dossier detail displays Internal server error.');
  const dossierId = await evaluate("location.pathname.split('/').at(-1)");
  const post = responses.find(
    (r) => r.method === 'POST' && r.url === '/api/dossiers',
  );
  const detail = responses.find(
    (r) => r.method === 'GET' && r.url === `/api/dossiers/${dossierId}`,
  );
  if (post?.status !== 201 || detail?.status !== 200)
    throw new Error(JSON.stringify(responses));
  console.log(JSON.stringify({ dossierId, post, detail }));
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
