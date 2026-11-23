// Public valleys (server/world/valley.js; doc onfiremobile docs/PRD/harvest-hollow/05-valley-map.md): farms started on
// the public host join the newest valley with room, a full valley opens the next one, a farm can opt out (and back
// in), a call world's farm never joins one, the roster shows strangers only what they may see, and the valley map's
// thumbnails are tile kinds of the key's own world only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { tmpDataDir } from './helpers/server.js';
import { loadConfig, multiConfig } from '../server/config.js';
import { worldConfig } from '../server/world/config.js';
import { signJoinToken } from '../server/world/token.js';
import { farmThumb } from '../server/world/thumb.js';
import { createFarm } from '../shared/rules/state.js';
import { PROTOCOL_VERSION, MSG } from '../shared/net/protocol.js';

const KEY = 'test-world-secret-0123456789abcdef';
const DAY = 86_400_000;

async function valleyServer(env = {}, mc = {}) {
  const { startServer } = await import('../server/index.js');
  const dataDir = tmpDataDir('valley');
  const cfg = { ...loadConfig({}), mode: 'multi', multi: { ...multiConfig({}), createPerHour: 1000, createPerDay: 1000, ...mc }, port: 0,
    host: '127.0.0.1', dataDir, quiet: true, dev: true, awayGraceMs: 0, world: worldConfig({ HH_WORLD_SECRET: KEY, ...env }) };
  const s = await startServer(cfg);
  return { ...s, dataDir, reg: s.hh.reg, world: s.hh.world, base: `http://127.0.0.1:${s.port}`,
    close: async () => { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); } };
}

async function req(base, method, url, { body, headers = {} } = {}) {
  const raw = body === undefined ? undefined : JSON.stringify(body);
  const r = await fetch(base + url, { method, headers: { ...(raw ? { 'content-type': 'application/json' } : {}), ...headers }, body: raw });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: r.status, headers: r.headers, body: json, text };
}

async function sock(port, id) {
  const { WebSocket } = await import('ws');
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?farm=${id}`);
  const msgs = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    for (const x of m.t === 'b' ? m.list : [m]) {
      msgs.push(x);
      for (const w of waiters.slice()) if (w.pred(x)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(x); }
    }
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return {
    msgs,
    send: (m) => ws.send(JSON.stringify(m)),
    next(pred, ms = 3000) {
      const seen = msgs.find(pred);
      if (seen) { msgs.splice(msgs.indexOf(seen), 1); return Promise.resolve(seen); }
      return new Promise((resolve, reject) => {
        const w = { pred, resolve: (m) => { clearTimeout(t); msgs.splice(msgs.indexOf(m), 1); resolve(m); } };
        const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error('timeout')); }, ms);
        waiters.push(w);
      });
    },
    close: () => ws.close(),
  };
}
const answer = (m) => m.t === MSG.WELCOME || m.t === MSG.DENY || m.t === MSG.SLOTS;

/** A farm started on the landing page and opened once by its creator (named): { id, secret, name, c? }. */
async function standalone(s, name, { keepOpen = false } = {}) {
  const r = await req(s.base, 'POST', '/api/farms', { body: {} });
  assert.equal(r.status, 201, r.text);
  const c = await sock(s.port, r.body.id);
  c.send({ t: 'hello', proto: PROTOCOL_VERSION, cid: `c${crypto.randomBytes(3).toString('hex')}`, token: r.body.secret, claim: { slot: 'p1', name } });
  const w = await c.next(answer);
  assert.equal(w.t, MSG.WELCOME, JSON.stringify(w).slice(0, 200));
  if (!keepOpen) c.close();
  return { id: r.body.id, secret: r.body.secret, name, c: keepOpen ? c : null };
}
const join = (s, f, body = {}) => req(s.base, 'POST', '/api/w/valley/join', { body: { farmId: f.id, ...body }, headers: { authorization: `Bearer ${f.secret}` } });
const leave = (s, f) => req(s.base, 'POST', '/api/w/valley/leave', { body: { farmId: f.id }, headers: { authorization: `Bearer ${f.secret}` } });
const roster = (s, worldKey) => req(s.base, 'GET', '/api/w/roster', { headers: { authorization: `Bearer ${worldKey}` } });

test('valley: farms started on the host land in one public valley; joining again keeps the seat and the key', async () => {
  const s = await valleyServer();
  try {
    const farms = [];
    for (const n of ['Ana', 'Ben', 'Cleo']) farms.push(await standalone(s, n));
    const js = [];
    for (const f of farms) {
      const r = await join(s, f);
      assert.equal(r.status, 200, r.text);
      js.push(r.body);
    }
    assert.equal(new Set(js.map((j) => j.wid)).size, 1, 'one valley');
    assert.deepEqual(js.map((j) => j.seat), [1, 2, 3]);
    assert.ok(js.every((j) => j.kind === 'public' && j.created && /^[a-f0-9]{64}$/.test(j.worldKey)));
    // the same device again (its key in hand): same seat, same key, nothing new
    const again = await join(s, farms[0], { worldKey: js[0].worldKey });
    assert.deepEqual(again.body, { ...js[0], created: false });
    // another device of the same farm (no key): same seat, a new key; both work
    const other = await join(s, farms[0]);
    assert.equal(other.body.seat, 1);
    assert.notEqual(other.body.worldKey, js[0].worldKey);
    for (const k of [js[0].worldKey, other.body.worldKey]) assert.equal((await roster(s, k)).status, 200);
    const r = await roster(s, js[1].worldKey);
    assert.equal(r.body.kind, 'public');
    assert.deepEqual(r.body.members.map((m) => [m.seat, m.name, m.self]), [[1, 'Ana', false], [2, 'Ben', true], [3, 'Cleo', false]]);
    // a neighbour can look at the farm read-only (the world layer's visitor socket)
    const V = await sock(s.port, farms[0].id);
    V.send({ t: 'hello', proto: PROTOCOL_VERSION, cid: 'benvis1', token: js[1].worldKey });
    const w = await V.next(answer);
    assert.equal(w.t, MSG.WELCOME);
    assert.equal(w.pid, null);
    assert.equal(w.visitor.seat, 2);
    V.close();
    // the world file is an ordinary world, kind public, with hashes only
    const file = fs.readFileSync(path.join(s.dataDir, 'worlds', `${js[0].wid}.json`), 'utf8');
    assert.equal(JSON.parse(file).kind, 'public');
    for (const f of farms) assert.ok(!file.includes(f.secret));
    for (const j of js) assert.ok(!file.includes(j.worldKey));
  } finally {
    await s.close();
  }
});

test('valley: a full valley opens the next one; a newcomer takes the newest valley that has room', async () => {
  const s = await valleyServer({ HH_VALLEY_MAX: '2' });
  try {
    const f = [];
    for (let i = 0; i < 5; i++) f.push(await standalone(s, `F${i}`));
    const w = [];
    for (let i = 0; i < 4; i++) w.push((await join(s, f[i])).body);
    assert.equal(w[0].wid, w[1].wid);
    assert.equal(w[2].wid, w[3].wid);
    assert.notEqual(w[0].wid, w[2].wid, 'the third farm opened a second valley');
    // concurrent joins never put more than two in a valley
    const extra = [];
    for (let i = 0; i < 4; i++) extra.push(await standalone(s, `X${i}`));
    const got = await Promise.all(extra.map((x) => join(s, x)));
    const count = new Map();
    for (const g of got) count.set(g.body.wid, (count.get(g.body.wid) || 0) + 1);
    assert.ok([...count.values()].every((n) => n <= 2), JSON.stringify([...count]));
    // the first valley loses a farm: the next newcomer goes to the newest valley with room (here the first)
    assert.equal((await leave(s, f[0])).status, 200);
    const late = (await join(s, f[4])).body;
    assert.equal(late.wid, w[0].wid);
    assert.equal(late.seat, 1, 'the free seat is reused');
  } finally {
    await s.close();
  }
});

test('valley: opt-out removes the farm at once and sticks; rejoin brings it back', async () => {
  const s = await valleyServer();
  try {
    const a = await standalone(s, 'Ana');
    const b = await standalone(s, 'Ben');
    const ja = (await join(s, a)).body;
    const jb = (await join(s, b)).body;
    assert.equal((await roster(s, jb.worldKey)).body.members.length, 2);
    const out = await leave(s, a);
    assert.deepEqual(out.body, { ok: true, out: true });
    assert.equal((await roster(s, ja.worldKey)).status, 401, 'its world keys stop working');
    assert.deepEqual((await roster(s, jb.worldKey)).body.members.map((m) => m.name), ['Ben']);
    // a visitor socket with the old key is refused; Ben cannot open Ana's thumbnail either
    const thumb = await req(s.base, 'GET', `/api/w/thumb/${a.id}`, { headers: { authorization: `Bearer ${jb.worldKey}` } });
    assert.equal(thumb.status, 404);
    // the next visit does not put it back (it is remembered across a restart too: the opt-out file)
    assert.deepEqual((await join(s, a)).body, { out: true });
    assert.ok(JSON.parse(fs.readFileSync(path.join(s.dataDir, 'worlds', '.valley.json'), 'utf8')).out.includes(a.id));
    const back = await join(s, a, { rejoin: true });
    assert.equal(back.status, 200);
    assert.equal(back.body.wid, jb.wid);
    assert.equal((await roster(s, jb.worldKey)).body.members.length, 2);
  } finally {
    await s.close();
  }
});

test('valley: only a farmer of the farm joins or leaves; a call world\'s farm never joins a public valley', async () => {
  const s = await valleyServer();
  try {
    const a = await standalone(s, 'Ana');
    const b = await standalone(s, 'Ben');
    assert.equal((await req(s.base, 'POST', '/api/w/valley/join', { body: { farmId: a.id } })).status, 401);
    assert.equal((await req(s.base, 'POST', '/api/w/valley/join', { body: { farmId: a.id }, headers: { authorization: `Bearer ${b.secret}` } })).status, 401);
    assert.equal((await req(s.base, 'POST', '/api/w/valley/leave', { body: { farmId: a.id }, headers: { authorization: `Bearer ${b.secret}` } })).status, 401);
    assert.equal((await req(s.base, 'POST', '/api/w/valley/join', { body: { farmId: 'aaaaaaaaaaaa' }, headers: { authorization: `Bearer ${a.secret}` } })).status, 404);
    assert.equal((await req(s.base, 'POST', '/api/w/valley/join', { body: { farmId: a.id }, headers: { authorization: `Bearer ${a.secret}`, origin: 'https://evil.example' } })).status, 403);
    // a farm made by a call launch
    const now = Math.floor(Date.now() / 1000);
    const t = signJoinToken({ v: 1, kid: 'k1', iss: 'call.onfire.so', aud: 'harvest', wid: 'call-world-0001', fid: 'u:00000000-0000-0000-0000-000000000001',
      name: 'Cleo', role: 'farmer', guest: false, surf: 'panel', iat: now, exp: now + 60, jti: crypto.randomUUID() }, KEY);
    const l = await req(s.base, 'POST', '/api/w/launch', { body: { t } });
    assert.equal(l.status, 201, l.text);
    const call = await join(s, { id: l.body.farmId, secret: l.body.key });
    assert.equal(call.status, 409);
    assert.deepEqual(call.body, { error: 'CALL' });
    assert.equal((await roster(s, l.body.worldKey)).body.kind, undefined, 'still its call world');
  } finally {
    await s.close();
  }
});

test('valley: the roster shows strangers only names, colour and counts; a valley visitor gets no chat', async () => {
  const s = await valleyServer();
  try {
    const a = await standalone(s, 'Ana', { keepOpen: true });
    const b = await standalone(s, 'Ben');
    const ja = (await join(s, a)).body;
    const jb = (await join(s, b)).body;
    a.c.send({ t: 'chat', text: 'our secret plans' });
    await new Promise((r) => setTimeout(r, 100));
    const r = await roster(s, jb.worldKey);
    assert.deepEqual(Object.keys(r.body).sort(), ['kind', 'max', 'me', 'members', 'title', 'wid']);
    for (const m of r.body.members) {
      assert.deepEqual(Object.keys(m).sort(), ['color', 'farmId', 'farmName', 'name', 'online', 'seat', 'self', 'visiting', 'visitors']);
      assert.equal(m.visiting, null, 'no "who visits whom" among strangers');
    }
    const ana = r.body.members.find((m) => m.seat === ja.seat);
    assert.equal(ana.online, true);
    assert.match(ana.color, /^#[0-9a-fA-F]{6}$/);
    for (const secret of [a.secret, b.secret, ja.worldKey, jb.worldKey]) assert.ok(!r.text.includes(secret));
    // Ben looks at Ana's farm: no chat log, no live chat
    const V = await sock(s.port, a.id);
    V.send({ t: 'hello', proto: PROTOCOL_VERSION, cid: 'benvis2', token: jb.worldKey });
    const w = await V.next(answer);
    assert.deepEqual(w.chat, []);
    a.c.send({ t: 'chat', text: 'still private' });
    await assert.rejects(V.next((m) => m.t === MSG.CHAT, 400));
    V.close();
    a.c.close();
  } finally {
    await s.close();
  }
});

test('valley: farms age out like any farm (no world exemption); the sweep drops them from their valley', async () => {
  const s = await valleyServer({}, { ttlDays: 7 });
  try {
    const a = await standalone(s, 'Ana');
    const b = await standalone(s, 'Ben');
    const ja = (await join(s, a)).body;
    const jb = (await join(s, b)).body;
    assert.equal(s.world.keep(a.id), false);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal((await req(s.base, 'POST', `/api/f/${a.id}/dev/unload`)).status, 200);
    // Ana's farm was last seen 8 days ago
    s.reg.rec(a.id).meta.lastSeenAt = Date.now() - 8 * DAY;
    s.reg.rec(a.id).leaseUntil = 0;
    await s.reg.sweep();
    assert.equal(s.reg.has(a.id), false, 'deleted by the farm sweep');
    assert.equal((await roster(s, ja.worldKey)).status, 401);
    assert.deepEqual((await roster(s, jb.worldKey)).body.members.map((m) => m.name), ['Ben']);
  } finally {
    await s.close();
  }
});

test('valley thumbnails: tile kinds of the key\'s own world only, with an ETag', async () => {
  const s = await valleyServer();
  try {
    const a = await standalone(s, 'Ana');
    const b = await standalone(s, 'Ben');
    const ja = (await join(s, a)).body;
    await join(s, b);
    const auth = { authorization: `Bearer ${ja.worldKey}` };
    const t = await req(s.base, 'GET', `/api/w/thumb/${b.id}`, { headers: auth });
    assert.equal(t.status, 200, t.text);
    assert.equal(t.body.tiles.length, t.body.w * t.body.h);
    assert.match(t.body.tiles, /^[.,=_#%^*+a-zA-Z]+$/);
    assert.ok(t.body.tiles.includes('#'), 'the farmhouse');
    const again = await req(s.base, 'GET', `/api/w/thumb/${b.id}`, { headers: { ...auth, 'if-none-match': t.headers.get('etag') } });
    assert.equal(again.status, 304);
    assert.equal((await req(s.base, 'GET', `/api/w/thumb/${a.id}`, { headers: auth })).status, 200, 'the own farm too');
    assert.equal((await req(s.base, 'GET', `/api/w/thumb/${b.id}`)).status, 401);
    const c = await standalone(s, 'Cleo');           // started, but not in the valley yet
    assert.equal((await req(s.base, 'GET', `/api/w/thumb/${c.id}`, { headers: auth })).status, 404);
  } finally {
    await s.close();
  }
});

test('farmThumb: a starter farm is grass, paths, plots and buildings; crops carry their colour', () => {
  const st = createFarm(7, 1_000_000);
  const t = farmThumb(st, 1_000_000);
  assert.ok(t.w >= 24 && t.w <= 48 && t.w === t.h);
  assert.ok(t.tiles.includes('_') && t.tiles.includes('=') && t.tiles.includes(','));
  const plot = Object.values(st.farm.objects).find((o) => o.def === 'plot');
  plot.crop = { def: 'wheat', plantedAt: 1_000_000, readyAt: 1_060_000 };
  const g = farmThumb(st, 1_000_000);
  assert.deepEqual(g.crops, ['#E8B84A']);
  assert.equal(g.tiles[(plot.z - t.z0) * t.w + (plot.x - t.x0)], 'a');
  assert.equal(farmThumb(st, 1_070_000).tiles[(plot.z - t.z0) * t.w + (plot.x - t.x0)], 'A', 'ripe');
});
