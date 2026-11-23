// The OnFire world layer (server/world; contract onfiremobile docs/PRD/harvest-hollow/04-world-api.md): join token
// verification (02-call-web-integration.md §3.4), the signed server-to-server API, one farm per person per world,
// read-only visitors (a neighbour's act is refused by the server), the roster, and world farms' retention.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { tmpDataDir } from './helpers/server.js';
import { loadConfig, multiConfig } from '../server/config.js';
import { worldConfig, parseKeys, WorldConfigError } from '../server/world/config.js';
import { signJoinToken, verifyJoinToken, JtiSet } from '../server/world/token.js';
import { signS2s } from '../server/world/s2s.js';
import { PROTOCOL_VERSION, MSG, ERR } from '../shared/net/protocol.js';

const KEY = 'test-world-secret-0123456789abcdef';
const DAY = 86_400_000;

function claims(over = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { v: 1, kid: 'k1', iss: 'call.onfire.so', aud: 'harvest', wid: 'wid-aaaa-0001', fid: 'u:11111111-2222-3333-4444-555555555555',
    name: 'Ana', role: 'farmer', guest: false, surf: 'panel', iat: now, exp: now + 60, jti: crypto.randomUUID(), ...over };
}
const tok = (over = {}, key = KEY) => signJoinToken(claims(over), key);

test('join token: good, expired, replayed, wrong world, bad signature, and the other refusals', () => {
  const keys = { k1: KEY };
  const seen = new JtiSet();
  const good = tok();
  const ok = verifyJoinToken(good, { keys, seen });
  assert.equal(ok.ok, true);
  assert.equal(ok.claims.wid, 'wid-aaaa-0001');
  assert.equal(ok.claims.name, 'Ana');
  assert.deepEqual(verifyJoinToken(good, { keys, seen }), { ok: false, why: 'replay' }, 'single use');
  const now = Math.floor(Date.now() / 1000);
  assert.equal(verifyJoinToken(tok({ iat: now - 120, exp: now - 60 }), { keys, seen }).why, 'expired');
  assert.equal(verifyJoinToken(tok({ iat: now - 61, exp: now - 1 }), { keys, seen }).why, 'expired');
  assert.equal(verifyJoinToken(tok(), { keys, seen, wid: 'another-world-01' }).why, 'world');
  // one flipped signature byte
  const [p, s] = tok().split('.');
  const sig = Buffer.from(s, 'base64url');
  sig[0] ^= 1;
  assert.equal(verifyJoinToken(`${p}.${sig.toString('base64url')}`, { keys, seen }).why, 'sig');
  assert.equal(verifyJoinToken(tok({}, 'some-other-key-xxxxxxxx'), { keys, seen }).why, 'sig');
  // a payload swapped under a valid signature
  const [, s2] = tok().split('.');
  assert.equal(verifyJoinToken(`${Buffer.from(JSON.stringify(claims({ fid: 'u:evil-evil-evil' }))).toString('base64url')}.${s2}`, { keys, seen }).why, 'sig');
  assert.equal(verifyJoinToken(tok({ aud: 'questix' }), { keys, seen }).why, 'claims');
  assert.equal(verifyJoinToken(tok({ iss: 'evil.example' }), { keys, seen }).why, 'claims');
  assert.equal(verifyJoinToken(tok({ v: 2 }), { keys, seen }).why, 'claims');
  assert.equal(verifyJoinToken(tok({ kid: 'k9' }), { keys, seen }).why, 'kid');
  assert.equal(verifyJoinToken(tok({ iat: now + 120, exp: now + 180 }), { keys, seen }).why, 'future', 'clock skew bound: 30 s');
  assert.equal(verifyJoinToken(tok({ iat: now + 20, exp: now + 80 }), { keys, seen }).ok, true, 'within the 30 s skew');
  assert.equal(verifyJoinToken(tok({ exp: now + 601 }), { keys, seen }).why, 'life', 'exp - iat <= 600');
  assert.equal(verifyJoinToken(tok({ fid: 'x:nope' }), { keys, seen }).why, 'claims');
  for (const bad of [null, '', 'a', 'a.b.c', '!!.??', 'x'.repeat(5000)]) assert.equal(verifyJoinToken(bad, { keys, seen }).ok, false);
  // a rotation: two key ids at once
  assert.equal(verifyJoinToken(tok({ kid: 'k2' }, 'second-key-yyyyyyyy'), { keys: { k1: KEY, k2: 'second-key-yyyyyyyy' }, seen }).ok, true);
  // names: control characters stripped, at most 24 code points
  assert.equal(verifyJoinToken(tok({ name: 'A\u0000b\u200bc' + 'é'.repeat(40) }), { keys, seen }).claims.name, `Abc${'é'.repeat(21)}`);
});

test('world config: off without a key, a plain key is k1, JSON maps key ids', () => {
  assert.equal(worldConfig({}), null);
  assert.deepEqual(parseKeys('abcdefgh'), { k1: 'abcdefgh' });
  assert.deepEqual(parseKeys('{"k1":"aaaa","k2":"bbbb"}'), { k1: 'aaaa', k2: 'bbbb' });
  assert.throws(() => parseKeys('{"k1":'), WorldConfigError);
  assert.throws(() => parseKeys('{"bad id":"aaaa"}'), WorldConfigError);
  const wc = worldConfig({ HARVEST_JOIN_HMAC_KEYS: '{"k1":"zzzz"}', HH_WORLD_MAX: '3' });
  assert.equal(wc.maxMembers, 3);
  assert.equal(wc.keys.k1, 'zzzz');
});

// ---- a live host ----------------------------------------------------------------------------------------------

async function worldServer(env = {}, mc = {}) {
  const { startServer } = await import('../server/index.js');
  const dataDir = tmpDataDir('world');
  const cfg = { ...loadConfig({}), mode: 'multi', multi: { ...multiConfig({}), ...mc }, port: 0, host: '127.0.0.1', dataDir,
    quiet: true, dev: true, awayGraceMs: 0, world: worldConfig({ HH_WORLD_SECRET: KEY, ...env }) };
  const s = await startServer(cfg);
  return { ...s, dataDir, reg: s.hh.reg, world: s.hh.world, base: `http://127.0.0.1:${s.port}`,
    close: async () => { await s.close(); fs.rmSync(dataDir, { recursive: true, force: true }); } };
}

async function req(base, method, url, { body, headers = {} } = {}) {
  const raw = body === undefined ? undefined : JSON.stringify(body);
  const r = await fetch(base + url, { method, headers: { ...(raw ? { 'content-type': 'application/json' } : {}), ...headers }, body: raw });
  return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
}
const s2s = (s, method, url, body, o = {}) => {
  const raw = body === undefined ? '' : JSON.stringify(body);
  return req(s.base, method, url, { body, headers: { ...signS2s(o.key ?? KEY, { method, path: url, body: raw, ts: o.ts }), ...(o.headers || {}) } });
};
const launch = (s, t, extra = {}) => req(s.base, 'POST', '/api/w/launch', { body: { t, ...extra } });

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
    ws, msgs,
    send: (m) => ws.send(JSON.stringify(m)),
    next(pred, ms = 3000) {
      const seen = msgs.find(pred);
      if (seen) { msgs.splice(msgs.indexOf(seen), 1); return Promise.resolve(seen); }
      return new Promise((resolve, reject) => {
        const w = { pred, resolve: (m) => { clearTimeout(t); msgs.splice(msgs.indexOf(m), 1); resolve(m); } };
        const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`timeout; got ${JSON.stringify(msgs).slice(0, 300)}`)); }, ms);
        waiters.push(w);
      });
    },
    close: () => ws.close(),
  };
}
const answer = (m) => m.t === MSG.WELCOME || m.t === MSG.DENY || m.t === MSG.SLOTS;
async function hello(port, id, token, cid) {
  const c = await sock(port, id);
  c.send({ t: 'hello', proto: PROTOCOL_VERSION, cid, token });
  return { c, w: await c.next(answer) };
}

const WID = '6f1c2b9e-0d7a-4d8e-9a51-3c1f0e7b2a44';
const fidOf = (n) => `u:00000000-0000-0000-0000-00000000000${n}`;

test('s2s: create/get a world for a room key (idempotent), HMAC with skew and replay refused', async () => {
  const s = await worldServer();
  try {
    const a = await s2s(s, 'PUT', '/api/s2s/worlds/room-sid-1', { title: 'Friday call' });
    assert.equal(a.status, 201, JSON.stringify(a.body));
    assert.equal(a.body.created, true);
    assert.match(a.body.wid, /^[0-9a-f-]{36}$/);
    const again = await s2s(s, 'PUT', '/api/s2s/worlds/room-sid-1', {});
    assert.equal(again.status, 200);
    assert.equal(again.body.wid, a.body.wid, 'the same room always gets the same world');
    const named = await s2s(s, 'PUT', '/api/s2s/worlds/room-sid-2', { wid: WID });
    assert.equal(named.status, 201);
    assert.equal(named.body.wid, WID, 'OnFire may name the world (farm_worlds.id)');
    assert.equal((await s2s(s, 'PUT', '/api/s2s/worlds/room-sid-2', { wid: '7f1c2b9e-0d7a-4d8e-9a51-3c1f0e7b2a44' })).status, 409);
    const got = await s2s(s, 'GET', `/api/s2s/worlds/${WID}`);
    assert.equal(got.status, 200);
    assert.equal(got.body.roomKey, 'room-sid-2');
    assert.deepEqual(got.body.members, []);
    assert.equal((await s2s(s, 'GET', '/api/s2s/worlds/unknown-world-1')).status, 404);
    // auth
    assert.equal((await req(s.base, 'GET', `/api/s2s/worlds/${WID}`)).status, 401, 'unsigned');
    assert.equal((await s2s(s, 'GET', `/api/s2s/worlds/${WID}`, undefined, { key: 'wrong-key-wrong-key' })).status, 401, 'wrong key');
    assert.equal((await s2s(s, 'GET', `/api/s2s/worlds/${WID}`, undefined, { ts: Date.now() - 120_000 })).status, 401, 'stale ts');
    assert.equal((await s2s(s, 'GET', `/api/s2s/worlds/${WID}`, undefined, { ts: Date.now() + 120_000 })).status, 401, 'future ts');
    const h = signS2s(KEY, { method: 'GET', path: `/api/s2s/worlds/${WID}` });
    assert.equal((await req(s.base, 'GET', `/api/s2s/worlds/${WID}`, { headers: h })).status, 200);
    assert.equal((await req(s.base, 'GET', `/api/s2s/worlds/${WID}`, { headers: h })).status, 401, 'a replayed signature');
    // the signature covers the body: a changed body is refused
    const hb = signS2s(KEY, { method: 'PUT', path: '/api/s2s/worlds/room-x', body: JSON.stringify({ title: 'a' }) });
    assert.equal((await req(s.base, 'PUT', '/api/s2s/worlds/room-x', { body: { title: 'b' }, headers: hb })).status, 401);
  } finally {
    await s.close();
  }
});

test('launch: one farm per person per world (created once, reused on rejoin), seated by name, replay refused', async () => {
  const s = await worldServer();
  try {
    const t1 = tok({ wid: WID, fid: fidOf(1), name: 'Ana' });
    const a = await launch(s, t1);
    assert.equal(a.status, 201, JSON.stringify(a.body));
    assert.equal(a.body.wid, WID, 'a world OnFire named is created on its first launch');
    assert.equal(a.body.seat, 1);
    assert.equal(a.body.created, true);
    assert.match(a.body.key, /^[a-f0-9]{64}$/);
    assert.match(a.body.worldKey, /^[a-f0-9]{64}$/);
    assert.equal((await launch(s, t1)).status, 401, 'the same token twice');
    assert.deepEqual((await launch(s, t1)).body, { error: 'invalid_token' });
    // the farm key seats the person as p1, named, with no slot picker
    const A = await hello(s.port, a.body.farmId, a.body.key, 'anatab1');
    assert.equal(A.w.t, MSG.WELCOME, JSON.stringify(A.w).slice(0, 200));
    assert.equal(A.w.pid, 'p1');
    assert.equal(A.w.state.players.p1.name, 'Ana');
    A.c.close();
    // rejoin (another device, a reload): same farm, a fresh key, the old key still works
    const again = await launch(s, tok({ wid: WID, fid: fidOf(1), name: 'Ana' }));
    assert.equal(again.status, 201);
    assert.equal(again.body.farmId, a.body.farmId);
    assert.equal(again.body.created, false);
    assert.notEqual(again.body.key, a.body.key);
    for (const k of [a.body.key, again.body.key]) {
      const x = await hello(s.port, a.body.farmId, k, `tab${k.slice(0, 4)}`);
      assert.equal(x.w.t, MSG.WELCOME);
      assert.equal(x.w.pid, 'p1');
      x.c.close();
    }
    // a second person: another farm, the next seat; a wrong world named by the page is refused
    const b = await launch(s, tok({ wid: WID, fid: 'g:0123456789abcdef01234567', name: 'Guest', guest: true }));
    assert.equal(b.body.seat, 2);
    assert.notEqual(b.body.farmId, a.body.farmId);
    assert.equal((await launch(s, tok({ wid: WID, fid: fidOf(3) }), { wid: 'another-world-01' })).status, 401);
    // the disk keeps hashes: no fid, key or world key in the world file
    const file = fs.readFileSync(path.join(s.dataDir, 'worlds', `${WID}.json`), 'utf8');
    for (const secret of [fidOf(1), a.body.key, a.body.worldKey, again.body.worldKey, 'g:0123456789abcdef01234567']) {
      assert.ok(!file.includes(secret), 'only hashes on disk');
    }
  } finally {
    await s.close();
  }
});

test('a full world answers 409 FULL; concurrent launches of one person make one farm', async () => {
  const s = await worldServer({ HH_WORLD_MAX: '2' });
  try {
    const [x, y] = await Promise.all([launch(s, tok({ wid: WID, fid: fidOf(1) })), launch(s, tok({ wid: WID, fid: fidOf(1) }))]);
    assert.equal(x.status, 201);
    assert.equal(y.status, 201);
    assert.equal(x.body.farmId, y.body.farmId, 'serialised per world');
    assert.equal((await launch(s, tok({ wid: WID, fid: fidOf(2) }))).status, 201);
    const full = await launch(s, tok({ wid: WID, fid: fidOf(3) }));
    assert.equal(full.status, 409);
    assert.deepEqual(full.body, { error: 'FULL' });
    assert.equal((await launch(s, tok({ wid: WID, fid: fidOf(1) }))).status, 201, 'a member still comes back');
  } finally {
    await s.close();
  }
});

/** Three people in one world: { a, b, c } launch answers. */
async function threeFarms(s) {
  const out = [];
  for (const [n, name] of [[1, 'Ana'], [2, 'Ben'], [3, 'Cleo']]) {
    const r = await launch(s, tok({ wid: WID, fid: fidOf(n), name }));
    assert.equal(r.status, 201);
    out.push(r.body);
  }
  return out;
}

test('visiting: a neighbour sees the farm live and read-only; their actions are refused by the server', async () => {
  const s = await worldServer();
  try {
    const [a, b] = await threeFarms(s);
    const A = await hello(s.port, a.farmId, a.key, 'anatab1');
    assert.equal(A.w.pid, 'p1');
    // Ben visits Ana's farm with his world key
    const V = await hello(s.port, a.farmId, b.worldKey, 'bentab1');
    assert.equal(V.w.t, MSG.WELCOME, JSON.stringify(V.w).slice(0, 200));
    assert.equal(V.w.pid, null);
    assert.deepEqual(V.w.visitor, { seat: 2, name: 'Ben' });
    assert.equal(V.w.owner, 'p1');
    assert.equal(V.w.state.players.p1.name, 'Ana');
    assert.equal(V.w.state.server, undefined, 'the private sidecar never leaves');
    const v0 = V.w.v;
    // the visitor tries to plant on Ana's farm: refused, nothing changes
    V.c.send({ t: 'act', seq: 1, type: 'plant', args: { id: 'home.0.0', crop: 'wheat' } });
    const rej = await V.c.next((m) => m.t === MSG.REJ);
    assert.equal(rej.code, ERR.SELF_ONLY);
    assert.equal(rej.seq, 1);
    V.c.send({ t: 'acts', list: [{ seq: 2, type: 'plant', args: { id: 'home.0.1', crop: 'wheat' } }] });
    assert.equal((await V.c.next((m) => m.t === MSG.REJ)).code, ERR.SELF_ONLY);
    assert.equal(s.reg.rec(a.farmId).hh.engine.v, v0, 'nothing was applied');
    // Ana plants: Ben sees the delta live
    A.c.send({ t: 'act', seq: 1, type: 'plant', args: { id: 'home.0.0', crop: 'wheat' } });
    const ack = await A.c.next((m) => m.t === MSG.DELTA || m.t === MSG.REJ);
    assert.equal(ack.t, MSG.DELTA, JSON.stringify(ack));          // the delta doubles as the ack
    const d = await V.c.next((m) => m.t === MSG.DELTA);
    assert.ok(d.v > v0);
    // and her avatar moving (presence rows)
    A.c.send({ t: 'mv', x: 20.5, z: 21.5, f: 0, a: 'walk' });
    const pr = await V.c.next((m) => m.t === MSG.PRESENCE, 4000);
    assert.ok(pr.list.some((r) => r[0] === 'p1'));
    // ping and resync work for a visitor
    V.c.send({ t: 'ping', c: 1 });
    assert.equal((await V.c.next((m) => m.t === MSG.PONG)).c, 1);
    V.c.send({ t: 'resync' });
    assert.ok((await V.c.next((m) => m.t === MSG.WELCOME)).visitor);
    // a visitor is no farmer: the farm still has one member and Ana is the only online player
    assert.deepEqual(s.reg.rec(a.farmId).host.status().online, ['p1']);
    V.c.close();
    A.c.close();
  } finally {
    await s.close();
  }
});

test('a world key opens only the neighbours of its own world (not the own farm, not another world)', async () => {
  const s = await worldServer();
  try {
    const [a, b] = await threeFarms(s);
    const other = await launch(s, tok({ wid: 'other-world-0001', fid: fidOf(9), name: 'Zed' }));
    // own farm with the world key: not a visitor (their member key is the way in)
    assert.equal((await hello(s.port, b.farmId, b.worldKey, 'xxone')).w.code, ERR.BAD_TOKEN);
    // another world's farm
    assert.equal((await hello(s.port, other.body.farmId, a.worldKey, 'xxtwo')).w.code, ERR.BAD_TOKEN);
    assert.equal((await hello(s.port, a.farmId, other.body.worldKey, 'xxthree')).w.code, ERR.BAD_TOKEN);
    // a member key of one farm is no key of a neighbour's farm
    assert.equal((await hello(s.port, b.farmId, a.key, 'xxfour')).w.code, ERR.BAD_TOKEN);
  } finally {
    await s.close();
  }
});

test('roster: every member, online, who is visiting whom; needs a world key', async () => {
  const s = await worldServer();
  try {
    const [a, b, c] = await threeFarms(s);
    assert.equal((await req(s.base, 'GET', '/api/w/roster')).status, 401);
    assert.equal((await req(s.base, 'GET', '/api/w/roster', { headers: { authorization: `Bearer ${'0'.repeat(64)}` } })).status, 401);
    const A = await hello(s.port, a.farmId, a.key, 'anatab1');
    const V = await hello(s.port, a.farmId, c.worldKey, 'cleotab1');
    assert.ok(V.w.visitor);
    const r = await req(s.base, 'GET', '/api/w/roster', { headers: { authorization: `Bearer ${b.worldKey}` } });
    assert.equal(r.status, 200);
    assert.equal(r.body.wid, WID);
    assert.equal(r.body.me.seat, 2);
    assert.deepEqual(r.body.members.map((m) => [m.seat, m.name, m.self]), [[1, 'Ana', false], [2, 'Ben', true], [3, 'Cleo', false]]);
    const [ma, mb, mc] = r.body.members;
    assert.equal(ma.online, true);
    assert.equal(mb.online, false);
    assert.equal(ma.visitors, 1);
    assert.equal(mc.visiting, a.farmId);
    assert.equal(ma.farmId, a.farmId);
    V.c.close();
    A.c.close();
    await new Promise((res) => setTimeout(res, 100));
    const r2 = await req(s.base, 'GET', '/api/w/roster', { headers: { authorization: `Bearer ${b.worldKey}` } });
    assert.equal(r2.body.members[2].visiting, null);
    assert.equal(r2.body.members[0].visitors, 0);
  } finally {
    await s.close();
  }
});

test('retention: world farms outlive the farm TTL while the world lives; a forgotten world\'s farms age out again', async () => {
  const s = await worldServer({ HH_WORLD_TTL_DAYS: '30' }, { ttlDays: 7 });
  try {
    const [a] = await threeFarms(s);
    const loner = (await req(s.base, 'POST', '/api/farms')).body;
    for (const rec of s.reg.recs.values()) { await s.reg.unload(rec); rec.leaseUntil = 0; }
    const now = Date.now();
    await s.reg.sweep(now + 10 * DAY);
    assert.ok(s.reg.has(a.farmId), 'a world farm is kept past the 7-day farm TTL');
    assert.ok(!s.reg.has(loner.id), 'an ordinary farm still goes');
    await s.reg.sweep(now + 31 * DAY);        // the world is forgotten in this sweep (it runs after the farms)
    assert.equal(s.world.world(WID), null);
    assert.ok(!fs.existsSync(path.join(s.dataDir, 'worlds', `${WID}.json`)));
    await s.reg.sweep(now + 32 * DAY);
    assert.ok(!s.reg.has(a.farmId), 'then the farm follows the farm TTL');
  } finally {
    await s.close();
  }
});

test('s2s delete: a member (account deletion) and a whole world, farms included', async () => {
  const s = await worldServer();
  try {
    const [a, b, c] = await threeFarms(s);
    const one = await s2s(s, 'DELETE', `/api/s2s/worlds/${WID}/members/${encodeURIComponent(fidOf(2))}`);
    assert.equal(one.status, 200, JSON.stringify(one.body));
    assert.equal(one.body.farms, 1);
    assert.ok(!s.reg.has(b.farmId));
    assert.equal((await req(s.base, 'GET', '/api/w/roster', { headers: { authorization: `Bearer ${b.worldKey}` } })).status, 401);
    assert.deepEqual((await req(s.base, 'GET', '/api/w/roster', { headers: { authorization: `Bearer ${a.worldKey}` } })).body.members.map((m) => m.name), ['Ana', 'Cleo']);
    const all = await s2s(s, 'DELETE', `/api/s2s/worlds/${WID}`);
    assert.equal(all.body.farms, 2);
    assert.ok(!s.reg.has(a.farmId) && !s.reg.has(c.farmId));
    assert.equal((await s2s(s, 'GET', `/api/s2s/worlds/${WID}`)).status, 404);
  } finally {
    await s.close();
  }
});

test('pages: /join is not frameable, /embed only by the call origins, /w/visit/<id> renders; off without a key', async () => {
  const s = await worldServer();
  try {
    const j = await fetch(`${s.base}/join`);
    assert.equal(j.status, 200);
    assert.equal(j.headers.get('content-security-policy'), "frame-ancestors 'none'");
    const e = await fetch(`${s.base}/embed?n=abc`);
    assert.match(e.headers.get('content-security-policy'), /^frame-ancestors https:\/\/call\.onfire\.so /);
    const v = await fetch(`${s.base}/w/visit/abcdefghijkl`);
    assert.equal(v.status, 200);
    assert.match(await v.text(), /world\/visit\.js\?v=/);
    assert.equal((await fetch(`${s.base}/w/visit/nope`)).status, 404);
  } finally {
    await s.close();
  }
  const { startServer } = await import('../server/index.js');
  const dataDir = tmpDataDir('world-off');
  const off = await startServer({ ...loadConfig({}), mode: 'multi', multi: multiConfig({}), port: 0, host: '127.0.0.1', dataDir, quiet: true,
    world: null });
  try {
    assert.equal(off.hh.world, undefined);
    assert.equal((await fetch(`http://127.0.0.1:${off.port}/api/w/launch`, { method: 'POST' })).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${off.port}/api/s2s/worlds/x`)).status, 404);
  } finally {
    await off.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
