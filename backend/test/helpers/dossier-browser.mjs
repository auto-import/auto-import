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
    `fetch(${JSON.stringify(`${api}/auth/login`)},{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(${credentials})}).then(async r=>({status:r.status,accessToken:(await r.json()).data?.accessToken}))`,
  );
  if (login.status !== 201 && login.status !== 200)
    throw new Error(`Browser login returned ${login.status}`);
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
  await click('Client confirmé');
  // Upload valid signed-contract evidence through the real API; the workflow
  // still validates the stored bytes before allowing the next transition.
  const uploadStatus = await evaluate(`(async()=>{
    const bytes=Uint8Array.from(atob(${JSON.stringify(process.env.DOSSIER_BROWSER_CONTRACT)}),c=>c.charCodeAt(0));
    const form=new FormData(); form.set('file',new Blob([bytes],{type:'application/pdf'}),'contract.pdf');
    form.set('dossierId',${JSON.stringify(dossierId)});form.set('kind','CONTRACT');form.set('documentType','SIGNED_CONTRACT');
    return (await fetch(${JSON.stringify(`${api}/documents/upload`)},{method:'POST',credentials:'include',headers:{Authorization:${JSON.stringify(`Bearer ${login.accessToken}`)}},body:form})).status;
  })()`);
  if (uploadStatus !== 201)
    throw new Error(`Contract upload returned ${uploadStatus}`);
  await click('Contrat signé');
  await click('Acompte reçu');
  await waitFor(
    "document.querySelector('[role=dialog]')!==null",
    'deposit modal',
  );
  const setField = async (label, value, tag = 'input') => {
    await evaluate(`(()=>{
      const element=[...document.querySelectorAll('[role=dialog] label')].find(l=>l.textContent.includes(${JSON.stringify(label)}))?.querySelector(${JSON.stringify(tag)});
      if(!element)throw new Error('Field missing: '+${JSON.stringify(label)});
      Object.getOwnPropertyDescriptor(${tag === 'select' ? 'HTMLSelectElement' : 'HTMLInputElement'}.prototype,'value').set.call(element,${JSON.stringify(value)});
      element.dispatchEvent(new Event(${tag === 'select' ? "'change'" : "'input'"},{bubbles:true}));
    })()`);
  };
  await setField('Montant reçu', '10000');
  await waitFor(
    "document.querySelector('[role=dialog]').innerText.includes('2500000.00 DZD')",
    'USD Finance conversion',
  );
  await setField('Devise', 'CNY', 'select');
  await waitFor(
    "document.querySelector('[role=dialog]').innerText.includes('350000.00 DZD')",
    'CNY Finance conversion',
  );
  await setField('Devise', 'USD', 'select');
  await setField('Moyen de paiement', 'BANK_TRANSFER', 'select');
  await select('Compte de trésorerie', process.env.DOSSIER_BROWSER_TREASURY);
  await click('Valider l’étape');
  await waitFor(
    "document.querySelector('[role=dialog]')===null",
    'deposit saved',
  );
  await click('Vehicle Booking');
  await waitFor(
    "document.querySelector('[role=dialog] select')?.value.length>0",
    'assigned booking vehicle',
  );
  const vehicleId = await evaluate(
    "document.querySelector('[role=dialog] select').value",
  );
  const optionCount = await evaluate(
    "document.querySelector('[role=dialog] select').options.length",
  );
  if (optionCount !== 2)
    throw new Error('Booking contains unexpected vehicles');
  await click('Valider l’étape');
  await waitFor(
    "document.querySelector('[role=dialog]')===null",
    'booking saved',
  );
  await navigate(`/dossiers/${dossierId}`);
  await waitFor("document.body.innerText.includes('CA-')", 'reloaded booking');
  const saved = await evaluate(
    `fetch(${JSON.stringify(`${api}/dossiers/${dossierId}`)},{credentials:'include',headers:{Authorization:${JSON.stringify(`Bearer ${login.accessToken}`)}}}).then(r=>r.json()).then(r=>r.data)`,
  );
  if (
    saved.vehicleBookingVehicleId !== vehicleId ||
    saved.vehicles[0]?.id !== vehicleId
  )
    throw new Error('Booking changed on reload');
  await navigate('/finance');
  await waitFor(
    "document.body.innerText.includes('Journal des Écritures')",
    'Finance dashboard',
  );
  for (const tab of [
    'Journal des Écritures',
    'Comptes & Trésorerie',
    'Règlements Fournisseurs',
    'Charges & Débours',
    'Cours de Change',
  ]) {
    await evaluate(
      `[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(tab)})).click()`,
    );
    await pause(300);
    const content = await evaluate('document.body.innerText');
    if (
      content.includes('Internal server error') ||
      content.includes('Application error')
    )
      throw new Error(`Finance tab failed: ${tab}`);
  }
  if (serverErrors.length)
    throw new Error(
      `Server errors in browser: ${JSON.stringify(serverErrors)}`,
    );
  console.log(JSON.stringify({ dossierId, post, detail, financeTabs: 5 }));
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
