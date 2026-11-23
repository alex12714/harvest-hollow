// HH_BASE_PATH (server/base-path.js): the whole game under a path prefix. Every route, page, file and the socket answer
// under the prefix and nothing answers outside it; the pages point every local URL under the prefix and every one of
// them loads; no prefix changes nothing. Also the lock-down switches that ride along: HH_FRAME_ANCESTORS, HH_IDEAS=off,
// HH_TELEMETRY_RECEIVE=off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpDataDir, testServer } from './helpers/server.js';
import { loadConfig, multiConfig, ConfigError, frameAncestorsOf } from '../server/config.js';
import { basePathOf } from '../server/base-path.js';
import { telemetryConfig } from '../server/telemetry/config.js';
import { url, pagePath } from '../public/js/net/base.js';
import { PROTOCOL_VERSION, MSG } from '../shared/net/protocol.js';

const BASE = '/g/farm';

async function multiServer(extra = {}) {
  const { startServer } = await import('../server/index.js');
  const dataDir = tmpDataDir('bp');
  const cfg = { ...loadConfig({}), mode: 'multi', multi: multiConfig({}), port: 0, host: '127.0.0.1', dataDir,
    quiet: true, awayGraceMs: 0, basePath: BASE, ...extra };
  const s = await startServer(cfg);
  return { ...s, origin: `http://127.0.0.1:${s.port}`,
    close: async () => { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); } };
}

/** A socket to `path`; resolves { ws, next, send } or rejects with the upgrade's HTTP status (or the error). */
async function socket(port, path) {
  const { WebSocket } = await import('ws');
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  const msgs = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    for (const x of m.t === 'b' ? m.list : [m]) {
      msgs.push(x);
      for (const w of waiters.slice()) if (w.pred(x)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(x); }
    }
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', (err) => reject(Object.assign(err, { status: 0 })));
    ws.once('unexpected-response', (_req, res) => reject(Object.assign(new Error(`upgrade ${res.statusCode}`), { status: res.statusCode })));
  });
  return {
    ws,
    send: (m) => ws.send(JSON.stringify(m)),
    next(pred, ms = 3000) {
      const seen = msgs.find(pred);
      if (seen) return Promise.resolve(seen);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), ms);
        waiters.push({ pred, resolve: (m) => { clearTimeout(t); resolve(m); } });
      });
    },
  };
}

/** Every local URL a rendered page names: href/src/srcset attributes and the import map's values. */
function pageUrls(html) {
  const out = new Set();
  for (const m of html.matchAll(/\b(?:href|src|action)=["']([^"']+)["']/g)) out.add(m[1]);
  for (const m of html.matchAll(/\bsrcset=["']([^"']+)["']/g)) for (const p of m[1].split(',')) out.add(p.trim().split(/\s+/)[0]);
  const map = /<script type="importmap">\s*([\s\S]*?)\s*<\/script>/.exec(html);
  if (map) for (const v of Object.values(JSON.parse(map[1]).imports)) out.add(v);
  return [...out].filter((u) => u.startsWith('/') && !u.startsWith('//'));
}

test('HH_BASE_PATH: normalised to "" or /seg[/seg]; anything else refuses the boot', () => {
  for (const [raw, want] of [[undefined, ''], ['', ''], ['/', ''], ['/g/farm', '/g/farm'], ['/g/farm/', '/g/farm'], [' /games ', '/games'],
    ['/a.b/c_d~e-f', '/a.b/c_d~e-f']]) assert.equal(basePathOf(raw), want, String(raw));
  for (const raw of ['g/farm', '/g//farm', '/g/../farm', '/g/./farm', '/g farm', '/g?x=1', '/g#x', '/%2e%2e', '/g/farm\\x',
    '/assets', '/js/game', '/api/farm', '/f']) {
    assert.throws(() => basePathOf(raw), /HH_BASE_PATH/, raw);
    assert.throws(() => loadConfig({ HH_BASE_PATH: raw }), ConfigError, raw);
  }
  assert.equal(loadConfig({}).basePath, '');
  assert.equal(loadConfig({ HH_BASE_PATH: '/g/farm/' }).basePath, '/g/farm');
  // option 2's host layout under a prefix is not built yet: refused, not half-working
  assert.throws(() => loadConfig({ HH_BASE_PATH: '/g/farm', HH_ASSET_ORIGIN: 'https://assets.example.com' }), ConfigError);
});

test('the client helpers: url() prefixes root paths only, pagePath() takes the prefix off', () => {
  assert.equal(url('/api/farms', ''), '/api/farms');
  assert.equal(url('/api/farms', BASE), '/g/farm/api/farms');
  assert.equal(url('//cdn.example/x', BASE), '//cdn.example/x');
  assert.equal(url('https://x.example/a', BASE), 'https://x.example/a');
  assert.equal(url('rel/x', BASE), 'rel/x');
  assert.equal(pagePath('/g/farm/f/abc123def4', BASE), '/f/abc123def4');
  assert.equal(pagePath('/g/farm', BASE), '/');
  assert.equal(pagePath('/g/farm/', BASE), '/');
  assert.equal(pagePath('/g/farmx/f/abc', BASE), '/g/farmx/f/abc');
  assert.equal(pagePath('/f/abc', ''), '/f/abc');
});

test('multi mode under a prefix: pages, API, files and the socket live under it; nothing answers outside it', async () => {
  const s = await multiServer();
  try {
    const at = (p, init) => fetch(s.origin + p, init);
    // outside the prefix: plain 404s (another app owns those paths behind the proxy)
    for (const p of ['/', '/api/status', '/ws', '/f/abcdefghij', '/js/main.js', '/g/farmx', '/g/farmx/api/status', '/g']) {
      assert.equal((await at(p)).status, 404, p);
    }
    assert.equal((await at('/api/farms', { method: 'POST' })).status, 404);
    // the landing page and the API under it
    const landing = await at(`${BASE}/`);
    assert.equal(landing.status, 200);
    assert.equal((await at(BASE)).status, 200, 'the prefix without its slash is the landing page too');
    const st = await at(`${BASE}/api/status`);
    assert.equal(st.status, 200);
    assert.equal((await st.json()).mode, 'multi');
    const idx = await at(`${BASE}/index.html`, { redirect: 'manual' });
    assert.equal(idx.status, 302);
    assert.equal(idx.headers.get('location'), `${BASE}/`);
    // a farm: create, page, manifest
    const made = await at(`${BASE}/api/farms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(made.status, 201);
    const { id, secret } = await made.json();
    const page = await at(`${BASE}/f/${id}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<meta name="hh-base" content="\/g\/farm">/);
    const mf = await (await at(`${BASE}/f/${id}/manifest.webmanifest`)).json();
    assert.equal(mf.start_url, `${BASE}/f/${id}`);
    assert.equal(mf.id, `${BASE}/f/${id}`);
    assert.equal(mf.scope, `${BASE}/`);
    const lm = await (await at(`${BASE}/manifest.webmanifest`)).json();
    assert.equal(lm.start_url, `${BASE}/`);
    assert.equal(lm.scope, `${BASE}/`);
    assert.ok(lm.icons.every((i) => i.src.startsWith(`${BASE}/assets/pwa/`)), JSON.stringify(lm.icons));
    assert.equal((await at(lm.icons[0].src)).status, 200);
    // every local URL of the three pages is under the prefix, and loads
    const pages = { game: html, landing: await landing.text(), privacy: await (await at(`${BASE}/privacy`)).text() };
    const all = new Set();
    for (const [name, h] of Object.entries(pages)) {
      const urls = pageUrls(h);
      assert.ok(urls.length > 5, name);
      const outside = urls.filter((u) => !u.startsWith(`${BASE}/`));
      assert.deepEqual(outside, [], `${name}: local URLs outside the prefix`);
      for (const u of urls) all.add(u);
    }
    const missing = [];
    for (const u of all) {
      // an import-map prefix (three/addons/): a file under it
      const r = await at(u.endsWith('/examples/jsm/') ? `${u}controls/OrbitControls.js` : u);
      if (r.status !== 200) missing.push(`${r.status} ${u}`);
      await r.arrayBuffer();
    }
    assert.deepEqual(missing, [], 'every URL a page names loads');
    // a module's '../../../shared' import lands on the shared mount under the prefix (the clamping the /public layout fixes)
    const shared = new URL('../../../shared/brand.js', `http://x${BASE}/public/js/net/farm.js`).pathname;
    assert.equal(shared, `${BASE}/shared/brand.js`);
    assert.equal((await at(shared)).status, 200);
    // the public alias never serves a page
    assert.equal((await at(`${BASE}/public/index.html`)).status, 404);
    // the socket: under the prefix it seats the farm's creator; at the root (or another prefix) there is none
    const c = await socket(s.port, `${BASE}/ws?farm=${id}`);
    c.send({ t: 'hello', proto: PROTOCOL_VERSION, cid: 'crea01', token: secret });
    assert.equal((await c.next((m) => m.t === MSG.SLOTS || m.t === MSG.WELCOME || m.t === MSG.DENY)).t, MSG.SLOTS);
    c.send({ t: 'hello', proto: PROTOCOL_VERSION, cid: 'crea01', token: secret, claim: { slot: 'p1', name: 'Rowan' } });
    assert.equal((await c.next((m) => m.t === MSG.WELCOME || m.t === MSG.DENY)).t, MSG.WELCOME);
    c.ws.close();
    for (const p of [`/ws?farm=${id}`, `/g/farmx/ws?farm=${id}`]) await assert.rejects(socket(s.port, p), undefined, p);
    await assert.rejects(socket(s.port, `${BASE}/ws?farm=zzzzzzzzzz`), (err) => err.status === 404);
  } finally { await s.close(); }
});

test('single mode under a prefix: the game page, the status and the socket; the root is 404', async () => {
  const s = await testServer({ basePath: BASE });
  try {
    const origin = `http://127.0.0.1:${s.port}`;
    assert.equal((await fetch(`${origin}/`)).status, 404);
    assert.equal((await fetch(`${origin}/api/status`)).status, 404);
    const page = await fetch(`${origin}${BASE}/`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<meta name="hh-base" content="\/g\/farm">/);
    assert.deepEqual(pageUrls(html).filter((u) => !u.startsWith(`${BASE}/`)), []);
    assert.equal((await fetch(`${origin}${BASE}/api/status`)).status, 200);
    const c = await socket(s.port, `${BASE}/ws`);
    c.send({ t: 'hello', proto: PROTOCOL_VERSION, cid: 'aaaaaa', claim: { slot: 'p1', name: 'Rowan' } });
    assert.equal((await c.next((m) => m.t === MSG.WELCOME || m.t === MSG.DENY)).t, MSG.WELCOME);
    c.ws.close();
    await assert.rejects(socket(s.port, '/ws'));
  } finally { await s.close(); }
});

test('no prefix: no hh-base meta, the root serves as before', async () => {
  const s = await testServer({});
  try {
    const html = await (await fetch(`http://127.0.0.1:${s.port}/`)).text();
    assert.doesNotMatch(html, /<meta name="hh-base" content=/);
    assert.ok(pageUrls(html).some((u) => u.startsWith('/js/main.js?v=')));
  } finally { await s.close(); }
});

test('HH_FRAME_ANCESTORS: validated, and sent as CSP frame-ancestors on the pages; unset sends none', async () => {
  assert.equal(frameAncestorsOf(undefined), null);
  assert.equal(frameAncestorsOf('self https://call.example.com https://*.example.com'),
    "'self' https://call.example.com https://*.example.com");
  assert.equal(frameAncestorsOf('none'), "'none'");
  for (const bad of ['https://a.example;script-src *', 'none self', '"x"', 'https://a.example,https://b.example']) {
    assert.throws(() => frameAncestorsOf(bad), ConfigError, bad);
  }
  const fa = frameAncestorsOf('self https://call.example.com');
  const s = await multiServer({ frameAncestors: fa });
  const plain = await multiServer();
  try {
    for (const p of ['/', '/privacy']) {
      assert.equal((await fetch(`${s.origin}${BASE}${p}`)).headers.get('content-security-policy'), `frame-ancestors ${fa}`, p);
      assert.equal((await fetch(`${plain.origin}${BASE}${p}`)).headers.get('content-security-policy'), null, p);
    }
    const { id } = await (await fetch(`${s.origin}${BASE}/api/farms`, { method: 'POST' })).json();
    assert.equal((await fetch(`${s.origin}${BASE}/f/${id}`)).headers.get('content-security-policy'), `frame-ancestors ${fa}`);
  } finally { await s.close(); await plain.close(); }
  const single = await testServer({ frameAncestors: "'none'" });
  try {
    assert.equal((await fetch(`http://127.0.0.1:${single.port}/`)).headers.get('content-security-policy'), "frame-ancestors 'none'");
  } finally { await single.close(); }
});

test('HH_IDEAS=off and HH_TELEMETRY_RECEIVE=off: the ideas box and the telemetry receiver are gone; on by default', async () => {
  const idea = { kind: 'feature', text: 'A bigger pond for the ducks, please' };
  const off = await multiServer({ ideas: { enabled: false }, telemetry: { ...telemetryConfig({ HH_TELEMETRY: 'off' }), receive: false } });
  const on = await multiServer();
  try {
    const post = (s, p, body) => fetch(`${s.origin}${BASE}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body) });
    assert.equal((await post(off, '/api/ideas', idea)).status, 404);
    assert.equal((await post(off, '/api/telemetry', {})).status, 404);
    assert.notEqual((await post(on, '/api/ideas', idea)).status, 404);
    assert.notEqual((await post(on, '/api/telemetry', {})).status, 404);
    // the pages tell the client to hide the entry
    assert.match(await (await fetch(`${off.origin}${BASE}/`)).text(), /<meta name="hh-ideas" content="off">/);
    assert.doesNotMatch(await (await fetch(`${on.origin}${BASE}/`)).text(), /<meta name="hh-ideas" content=/);
  } finally { await off.close(); await on.close(); }
});
