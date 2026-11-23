// The page a call opens (OnFire "Hollow Valley"): it trades a one-time join token for this person's own farm in the
// call's world, then opens that farm. Two ways in (02-call-web-integration.md §3.4 and §5):
//   /join#t=<token>        a phone (the QR): the token is in the fragment, never sent to a server, wiped at once
//   /embed?n=<nonce>       the call panel's iframe: the page says harvest:ready to its parent, the panel answers
//                          harvest:token; only an allowed origin (GET /api/w/config), the parent window itself, and
//                          the same nonce count
// POST /api/w/launch { t } -> { farmId, key, worldKey, ... }: the world entry is kept for the neighbours panel
// (base.js saveWorld) and the page goes to /f/<farmId>#k=<key> (the game's own personal-link path takes it from there).
import { ready as i18nReady, t } from '../i18n/index.js';
import { url, farmPath, saveWorld } from './base.js';

const NONCE_RE = /^[A-Za-z0-9_-]{16,128}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const statusEl = document.getElementById('hhw-launch-status');
const say = (key) => { if (statusEl) statusEl.textContent = t(key); };
const embed = /\/embed\/?$/.test(location.pathname);
const nonce = new URLSearchParams(location.search).get('n');

let parentOrigin = null;
const toParent = (msg) => {
  if (!embed || window.parent === window || !parentOrigin) return;
  try { window.parent.postMessage({ ...msg, n: nonce }, parentOrigin); } catch { /* the call went away */ }
};

async function launch(token) {
  say('world.launch.opening');
  toParent({ type: 'harvest:status', state: 'connecting' });
  let r;
  let body = null;
  try {
    r = await fetch(url('/api/w/launch'), { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ t: token }) });
    body = await r.json().catch(() => null);
  } catch {
    say('world.launch.failed');
    toParent({ type: 'harvest:status', state: 'error', code: 'network' });
    return;
  }
  if (r.status === 201 && body && body.farmId && body.key) {
    saveWorld(body);
    toParent({ type: 'harvest:status', state: 'playing' });
    location.replace(farmPath(body.farmId, `#k=${encodeURIComponent(body.key)}`));
    return;
  }
  if (r.status === 401) {
    say('world.launch.invalid');
    toParent({ type: 'harvest:status', state: 'invalid_token' });
    toParent({ type: 'harvest:need_token', reason: 'expired' });
  } else if (r.status === 409) {
    say('world.launch.full');
    toParent({ type: 'harvest:status', state: 'full' });
  } else if (r.status === 429) {
    say('world.launch.rate');
    toParent({ type: 'harvest:status', state: 'error', code: 'rate_limited' });
  } else {
    say('world.launch.failed');
    toParent({ type: 'harvest:status', state: 'error', code: 'unavailable' });
  }
}

async function main() {
  await i18nReady();
  if (!embed) {
    const tok = new URLSearchParams(location.hash.replace(/^#/, '')).get('t');
    try { history.replaceState(null, '', location.pathname); } catch { /* the token stays visible until we leave */ }
    if (!tok || !TOKEN_RE.test(tok)) { say('world.launch.invalid'); return; }
    await launch(tok);
    return;
  }
  say('world.launch.waiting');
  if (!nonce || !NONCE_RE.test(nonce) || window.parent === window) { say('world.launch.invalid'); return; }
  let origins = [];
  try { origins = (await (await fetch(url('/api/w/config'), { cache: 'no-store' })).json()).embedOrigins || []; } catch { origins = []; }
  let busy = false;
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!origins.includes(e.origin) || e.source !== window.parent || !m || typeof m !== 'object' || m.n !== nonce) return;
    parentOrigin ??= e.origin;
    if (e.origin !== parentOrigin) return;
    if (m.type === 'harvest:token' && typeof m.token === 'string' && TOKEN_RE.test(m.token) && m.token.length <= 4096 && !busy) {
      busy = true;
      launch(m.token).finally(() => { busy = false; });
    }
  });
  // the panel waits for this; it carries nothing but the panel's own nonce, so it may go to every allowed origin
  for (const o of origins) {
    try { window.parent.postMessage({ type: 'harvest:ready', n: nonce, v: 1 }, o); } catch { /* not that origin */ }
  }
}

main().catch(() => say('world.launch.failed'));
