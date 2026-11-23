#!/usr/bin/env node
// The world layer end to end (OnFire "Hollow Valley", phase 1), against a RUNNING multi-farm host with HH_WORLD_SECRET:
//   HH_MODE=multi HH_WORLD_SECRET=test HH_DATA_DIR=<scratch> PORT=3394 node server/index.js
//   BASE=http://127.0.0.1:3394 HH_WORLD_SECRET=test CHROME=<chrome> OUT=<dir> node tools/e2e-world.mjs
// Three people of one call: the world is made server-to-server (signed PUT), each opens their farm from a join token
// (Ana and Ben in a browser via /join#t=, Cleo with a plain POST), Ben visits Ana's farm from the neighbours panel and
// sees her planting live; Ben's own action on her farm is refused by the server (rej SELF_ONLY). Screenshots go to OUT.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { WebSocket } from 'ws';
import { parseKeys } from '../server/world/config.js';
import { signJoinToken } from '../server/world/token.js';
import { signS2s } from '../server/world/s2s.js';
import { PROTOCOL_VERSION } from '../shared/net/protocol.js';

const BASE = (process.env.BASE || 'http://127.0.0.1:3394').replace(/\/+$/, '');
const OUT = process.env.OUT || 'e2e-world-out';
const keys = parseKeys(process.env.HH_WORLD_SECRET);
const KEY = keys.k1 ?? Object.values(keys)[0];
fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (what, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${info ? `  ${info}` : ''}`); if (!ok) fails++; };
const mint = (wid, n, name) => {
  const now = Math.floor(Date.now() / 1000);
  return signJoinToken({ v: 1, kid: 'k1', iss: 'call.onfire.so', aud: 'harvest', wid, fid: `u:00000000-0000-4000-8000-00000000000${n}`, name,
    role: n === 1 ? 'host' : 'farmer', guest: false, surf: 'phone', iat: now, exp: now + 120, jti: crypto.randomUUID() }, KEY);
};

// 1. the world of a call room, server to server (what the OnFire backend would do; the SQL lane mints tokens itself)
const room = `room-${Date.now()}`;
const p = `/api/s2s/worlds/${room}`;
const body = JSON.stringify({ title: 'E2E call' });
const put = await fetch(BASE + p, { method: 'PUT', headers: { 'content-type': 'application/json', ...signS2s(KEY, { method: 'PUT', path: p, body }) }, body });
const world = await put.json();
check('s2s PUT world -> 201 { wid }', put.status === 201 && /^[0-9a-f-]{36}$/.test(world.wid), `${put.status}`);
const wid = world.wid;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800', '--mute-audio'],
});
try {
  const ctxA = await browser.createBrowserContext();
  const ctxB = await browser.createBrowserContext();
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  for (const pg of [A, B]) { await pg.setViewport({ width: 1280, height: 800 }); pg.on('pageerror', (e) => console.log('pageerror', e.message)); }

  // 2. Ana and Ben open their farms from the phone link (/join#t=...): straight in as p1, named, no slot picker
  for (const [pg, n, name] of [[A, 1, 'Ana'], [B, 2, 'Ben']]) {
    await pg.goto(`${BASE}/join#t=${mint(wid, n, name)}`);
    await pg.waitForFunction(() => /\/f\/[a-z2-7]{12}$/.test(location.pathname) && window.__hh?.state?.players?.p1, { timeout: 90_000, polling: 100 });
    const got = await pg.evaluate(() => ({ pid: window.__hh.pid, name: window.__hh.state.players.p1.name, url: location.href,
      picker: !document.getElementById('slot-picker') || document.getElementById('slot-picker').hidden }));
    check(`${name}: /join -> own farm as p1 "${name}", no slot picker, no key left in the address`, got.pid === 'p1' && got.name === name
      && got.picker && !/#k=|#t=/.test(got.url), JSON.stringify(got));
  }
  const farmA = await A.evaluate(() => location.pathname.split('/').pop());
  const farmB = await B.evaluate(() => location.pathname.split('/').pop());
  check('two people, two farms', farmA !== farmB);

  // 3. Cleo with curl-style POST (the third farm of the world)
  const c = await fetch(`${BASE}/api/w/launch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: mint(wid, 3, 'Cleo') }) });
  const cleo = await c.json();
  check('Cleo: POST /api/w/launch -> 201, seat 3', c.status === 201 && cleo.seat === 3, `${c.status}`);

  // 4. the neighbours panel on Ben's farm lists all three; Visit Ana
  await B.waitForSelector('.hhw-pill', { timeout: 30_000 });
  await B.click('.hhw-pill');
  await B.waitForFunction(() => document.querySelectorAll('.hhw-row').length === 3, { timeout: 15_000 });
  const rows = await B.evaluate(() => [...document.querySelectorAll('.hhw-row')].map((r) => r.innerText.replace(/\s+/g, ' ')));
  check('Ben\'s neighbours panel: Ana, Ben (You), Cleo', rows.length === 3 && /Ana/.test(rows[0]) && /Ben/.test(rows[1]) && /Cleo/.test(rows[2]), JSON.stringify(rows));
  await B.screenshot({ path: path.join(OUT, '1-ben-home-neighbours.png') });
  await Promise.all([B.waitForNavigation({ timeout: 30_000 }), B.click(`.hhw-go[data-farm="${farmA}"]`)]);
  await B.waitForFunction(() => window.__hhVisit?.state?.players?.p1, { timeout: 90_000, polling: 100 });
  const v = await B.evaluate(() => ({ owner: window.__hhVisit.owner, name: window.__hhVisit.state.players.p1.name, path: location.pathname,
    banner: document.getElementById('hhw-visit-banner').textContent }));
  check('Ben visits Ana: her farm, read-only banner', v.owner === 'p1' && v.name === 'Ana' && v.path.endsWith(farmA) && /only Ana can change it/.test(v.banner), JSON.stringify(v));

  // 5. Ana plants; Ben sees the crop on his screen
  const before = await B.evaluate(() => Boolean(window.__hhVisit.state.farm.objects['home.0.0']?.crop));
  const t0 = Date.now();
  await A.evaluate(() => window.__hh.act('plant', { id: 'home.0.0', crop: 'wheat' }));
  await B.waitForFunction(() => window.__hhVisit.state.farm.objects['home.0.0']?.crop?.def === 'wheat', { timeout: 10_000, polling: 10 });
  check('Ana plants wheat; Ben sees it live', !before, `${Date.now() - t0} ms from Ana's act to Ben's state (incl. polling)`);
  await A.evaluate((x) => window.__hh.view.focus(x.x, x.z), { x: 20, z: 20 });
  await new Promise((r) => setTimeout(r, 2500));
  await B.click('.hhw-pill');
  await new Promise((r) => setTimeout(r, 800));
  await B.screenshot({ path: path.join(OUT, '2-ben-visits-ana.png') });
  await A.screenshot({ path: path.join(OUT, '3-ana-home.png') });

  // 6. Ben's world key on Ana's farm socket: his act is refused by the server
  const ben = await fetch(`${BASE}/api/w/launch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: mint(wid, 2, 'Ben') }) }).then((r) => r.json());
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws?farm=${farmA}`);
  const msgs = [];
  ws.on('message', (raw) => { const m = JSON.parse(String(raw)); msgs.push(...(m.t === 'b' ? m.list : [m])); });
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ t: 'hello', proto: PROTOCOL_VERSION, cid: 'benws1', token: ben.worldKey }));
  await new Promise((r) => setTimeout(r, 500));
  ws.send(JSON.stringify({ t: 'act', seq: 1, type: 'plant', args: { id: 'home.0.1', crop: 'wheat' } }));
  await new Promise((r) => setTimeout(r, 500));
  const rej = msgs.find((m) => m.t === 'rej');
  check('a visitor\'s act on Ana\'s farm -> rej SELF_ONLY', msgs[0]?.visitor?.name === 'Ben' && rej?.code === 'SELF_ONLY', JSON.stringify(rej));
  ws.close();

  // 7. the roster, as Cleo sees it
  const r = await fetch(`${BASE}/api/w/roster`, { headers: { authorization: `Bearer ${cleo.worldKey}` } }).then((x) => x.json());
  check('roster: Ana online with a visitor, Ben visiting Ana', r.members[0].online && r.members[0].visitors >= 1 && r.members[1].visiting === farmA,
    JSON.stringify(r.members.map((m) => [m.name, m.online, m.visiting === farmA, m.visitors])));
  // a replayed token
  const tok = mint(wid, 3, 'Cleo');
  await fetch(`${BASE}/api/w/launch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: tok }) });
  const again = await fetch(`${BASE}/api/w/launch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: tok }) });
  check('a replayed join token -> 401 invalid_token', again.status === 401);
} finally {
  await browser.close();
}
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
