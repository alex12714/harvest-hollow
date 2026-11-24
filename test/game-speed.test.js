// OnFire game speed: the farm's clock runs at the owner's speed (server/clock.js), the client maps its real-time
// estimate to the same game time (shared/net/clock.js), the scheduler waits real ms, and only the owner may change it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServerClock, SPEEDS, cleanRate, gameAt, realAt } from '../server/clock.js';
import { ClockSync } from '../shared/net/clock.js';
import { parseClientMessage, MSG } from '../shared/net/protocol.js';
import { Scheduler } from '../server/scheduler.js';
import { testServer, join, wsClient } from './helpers.js';
import { createGameSpeed, ownerOf, speedKey } from '../public/js/game/speed.js';
import en from '../public/js/i18n/en/settings.js';
import bg from '../public/js/i18n/bg/settings.js';

const T = 1_790_000_000_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('no rate is exactly the old clock; setSpeed re-anchors without a jump and accumulates segment by segment', () => {
  let wall = T;
  const side = { lastNow: 0 };
  const k = new ServerClock(side, { wall: () => wall });
  assert.equal(k.now(), T);
  assert.equal(k.speed, 1);
  assert.equal(k.rate(), null);
  wall += 1000;
  assert.equal(k.now(), T + 1000, 'identity while nobody changed the speed');

  k.setSpeed(4);
  assert.equal(k.now(), T + 1000, 'switching never jumps game time');
  wall += 1000;
  assert.equal(k.now(), T + 1000 + 4000, '1 s real at 4x = 4 s game');
  assert.equal(k.real(), T + 2000, 'real time stays real');

  k.setSpeed(0.5);
  assert.equal(k.now(), T + 5000, 'the 4x segment is kept, nothing jumps');
  wall += 1000;
  assert.equal(k.now(), T + 5500, 'then 1 s real at 0.5x = 0.5 s game');

  k.setSpeed(1);
  wall += 2000;
  assert.equal(k.now(), T + 7500, 'back at 1x the accumulated lead stays');
  assert.deepEqual(side.rate, { speed: 1, realAt: T + 3000, gameAt: T + 5500 });
});

test('the speed survives a restart: time while the server was off counts at the speed that was set', () => {
  let wall = T;
  const side = { lastNow: 0 };
  const k = new ServerClock(side, { wall: () => wall });
  k.setSpeed(2);
  wall += 1000;
  const before = k.now();
  const saved = JSON.parse(JSON.stringify(side));       // the sidecar on disk
  wall += 10_000;                                         // off for 10 s
  const k2 = new ServerClock(saved, { wall: () => wall });
  assert.equal(k2.speed, 2);
  assert.equal(k2.now(), before + 20_000);
});

test('a garbage persisted rate is dropped (identity), and setSpeed refuses anything outside SPEEDS', () => {
  for (const bad of [{ speed: 3, realAt: T, gameAt: T }, { speed: 2, realAt: 'x', gameAt: T }, { speed: 2, realAt: T }, 'fast', 7]) {
    const side = { lastNow: 0, rate: bad };
    const k = new ServerClock(side, { wall: () => T });
    assert.equal(k.speed, 1);
    assert.equal(k.now(), T);
    assert.equal('rate' in side, false);
  }
  const k = new ServerClock({ lastNow: 0 }, { wall: () => T });
  for (const bad of [0, 3, -1, 8, '2', NaN, null]) assert.throws(() => k.setSpeed(bad), /speed must be one of/);
  assert.deepEqual(SPEEDS, [0.5, 1, 2, 4]);
  assert.equal(cleanRate({ speed: 4, realAt: 1, gameAt: 2 }).speed, 4);
});

test('game <-> real conversions agree, realDelay scales the scheduler, observe raises the floor in game time', () => {
  const rate = { speed: 4, realAt: T, gameAt: T + 1000 };
  for (const g of [T + 1000, T + 1001, T + 5003, T + 99_999]) assert.ok(gameAt(rate, realAt(rate, g)) >= g);
  assert.ok(gameAt(rate, realAt(rate, T + 5003) - 1) < T + 5003, 'realAt is the earliest real instant');
  let wall = T;
  const k = new ServerClock({ lastNow: 0 }, { wall: () => wall });
  k.setSpeed(4);
  assert.equal(k.realDelay(4000), 1000);
  assert.equal(k.realDelay(1), 1);
  assert.equal(k.realDelay(0), 0);
  k.observe(k.now() + 8000);                               // a journal line 8 s of game time ahead
  assert.equal(k.now(), T + 8000, 'held at the journal floor');
  wall += 3000;
  assert.equal(k.now(), T + 12_000);
});

test('dev warp jumps game time by ms at any speed', () => {
  let wall = T;
  const k = new ServerClock({ lastNow: 0 }, { wall: () => wall, dev: true });
  k.setSpeed(4);
  const g = k.now();
  assert.equal(k.warp(60_000), g + 60_000);
});

test('ClockSync maps its real-time estimate with the farm rate exactly as the server does', () => {
  const c = new ClockSync();
  c.seed(T, 0);
  assert.equal(c.serverNow(500), T + 500, 'no rate: game time is real time');
  assert.equal(c.speed, 1);
  const rate = { speed: 2, realAt: T + 1000, gameAt: T + 9000 };
  c.setRate(rate);
  assert.equal(c.speed, 2);
  assert.equal(c.realNow(1500), T + 1500);
  assert.equal(c.serverNow(1500), gameAt(rate, T + 1500));
  c.setRate({ speed: 'x' });
  assert.equal(c.rate, null, 'garbage = real time');
  c.setRate({ speed: 0.5, realAt: T, gameAt: T });
  assert.equal(c.serverNow(1001), T + 500, 'floored like the server');
});

test('protocol: speed takes only one of SPEEDS', () => {
  for (const v of SPEEDS) assert.deepEqual(parseClientMessage({ t: 'speed', speed: v }), { t: MSG.SPEED, speed: v });
  for (const v of [0, 3, 8, '2', null, undefined, NaN, Infinity, -1]) assert.equal(parseClientMessage({ t: 'speed', speed: v }), null);
});

test('Scheduler: a system action due in game ms fires after game/speed real ms', async () => {
  let fired = 0;
  const k = new ServerClock({ lastNow: 0 });
  k.setSpeed(4);
  const dueAt = k.now() + 2000;                            // 2 s of game time = 0.5 s real at 4x
  const engine = {
    state: {}, server: {}, dirty: false,
    due: { nextSystemDueAt: (s, now) => (fired ? Infinity : dueAt > now ? dueAt : now) },
    dueEnv: () => ({}),
    runDue: () => { if (k.now() >= dueAt && !fired) { fired = Date.now(); return 1; } return 0; },
    stuckUntil: () => Infinity,
  };
  const sch = new Scheduler({ engine, persist: { syncTick() {}, snapshot: async () => {} }, clock: k, cfg: { snapshotMs: 1e9 },
    log: { info() {}, warn() {}, error() {} } });
  const t0 = Date.now();
  sch.start();
  try {
    for (let i = 0; i < 40 && !fired; i++) await sleep(50);
    assert.ok(fired, 'fired');
    assert.ok(fired - t0 < 1200, `fired after ${fired - t0} ms real (a 1x wait would be 2000)`);
    assert.ok(fired - t0 >= 400, `not before its time (${fired - t0} ms)`);
  } finally { sch.stop(); }
});

test('client: only the owner may ask; the clock frame updates the rate and tells listeners', () => {
  const sent = [];
  const clock = new ClockSync();
  let me = 'p2';
  const state = { players: { p2: {}, p1: {} } };
  const sp = createGameSpeed({ clock, send: (m) => sent.push(m), me: () => me, state: () => state, perf: () => 0 });
  assert.equal(ownerOf(state), 'p1');
  assert.equal(sp.canSet(), false);
  assert.equal(sp.set(2), false);
  me = 'p1';
  assert.equal(sp.set(1), false, 'already 1x');
  assert.equal(sp.set(3), false, 'not a speed');
  assert.equal(sp.set(2), true);
  assert.deepEqual(sent, [{ t: 'speed', speed: 2 }]);
  const seen = [];
  sp.on((e) => seen.push(e));
  sp.welcome({ serverNow: T, realNow: T, rate: null });
  sp.clockFrame({ t: 'clock', rate: { speed: 2, realAt: T, gameAt: T }, by: 'p1' });
  assert.equal(sp.speed(), 2);
  assert.equal(seen.at(-1).changed, true);
  sp.clockFrame({ t: 'clock', rate: { speed: 2, realAt: T, gameAt: T }, code: 'OWNER_ONLY' });
  assert.equal(seen.at(-1).refused, true);
});

test('every speed has words in English and Bulgarian', () => {
  for (const v of SPEEDS) { assert.ok(en[speedKey(v)], speedKey(v)); assert.ok(bg[speedKey(v)], speedKey(v)); }
  for (const k of ['settings.speed.title', 'settings.speed', 'settings.speed.help', 'settings.speed.ownerHelp', 'settings.speed.ownerOnly',
    'settings.speed.changed']) { assert.ok(en[k], k); assert.ok(bg[k], k); }
});

test('server: the owner sets the speed, everyone hears it, the partner is refused, game time runs faster, it persists', async () => {
  const s = await testServer({ keep: true });
  let dataDir = s.dataDir;
  let s2 = null;
  try {
    const { c: a, w: wa } = await join(s.port, 'p1', 'Rowan');
    const { c: b, w: wb } = await join(s.port, 'p2', 'Mia');
    assert.equal(wa.rate, null, 'a new farm runs in real time');
    assert.ok(Number.isSafeInteger(wa.realNow));
    assert.ok(Number.isSafeInteger(wb.realNow));

    // the partner cannot: only they hear the unchanged clock
    b.send({ t: 'speed', speed: 4 });
    const refused = await b.next((m) => m.t === 'clock');
    assert.equal(refused.code, 'OWNER_ONLY');
    assert.equal(refused.rate, null);
    await sleep(100);
    assert.equal(a.msgs.some((m) => m.t === 'clock'), false, 'nothing reached the owner');

    // the owner can: both hear it
    a.send({ t: 'speed', speed: 4 });
    const ca = await a.next((m) => m.t === 'clock');
    const cb = await b.next((m) => m.t === 'clock');
    assert.equal(ca.rate.speed, 4);
    assert.deepEqual(cb.rate, ca.rate);
    assert.equal(ca.by, 'p1');

    // pongs carry game (s) and real (r) time: game runs 4x
    a.send({ t: 'ping', c: 1 });
    const p1 = await a.next((m) => m.t === 'pong');
    await sleep(400);
    a.send({ t: 'ping', c: 2 });
    const p2 = await a.next((m) => m.t === 'pong');
    const dr = p2.r - p1.r;
    const dg = p2.s - p1.s;
    assert.ok(dr >= 350, `real advanced ${dr}`);
    assert.ok(Math.abs(dg - 4 * dr) <= 4, `game advanced ${dg} for ${dr} real`);

    // an invalid speed changes nothing
    a.send({ t: 'speed', speed: 3 });
    await sleep(100);
    assert.equal(a.msgs.some((m) => m.t === 'clock'), false);

    // a reconnecting farmer's welcome carries the rate
    const again = await wsClient(s.port);
    again.send({ t: 'hello', proto: wb.proto, cid: 'p2cid1', token: wb.token });
    const w2 = await again.next((m) => m.t === 'welcome');
    assert.equal(w2.rate.speed, 4);
    assert.ok(w2.serverNow > w2.realNow, 'game time is ahead of real time at 4x');
    const lastGame = p2.s;
    again.close();
    a.close(); b.close();
    await s.close();

    // restart on the same data dir: still 4x, game time continued from where it was (never backwards)
    s2 = await testServer({ dataDir, keep: true });
    const back = await wsClient(s2.port);
    back.send({ t: 'hello', proto: wa.proto, cid: 'p1cid1', token: wa.token });
    const w3 = await back.next((m) => m.t === 'welcome');
    assert.equal(w3.rate.speed, 4);
    assert.ok(w3.serverNow >= lastGame, 'never backwards');
    back.close();
  } finally {
    if (s2) await s2.close();
    else await s.close().catch(() => {});
    const fs = await import('node:fs');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('valley thumbnail of a sleeping farm reads ripeness in the farm\'s game time', async () => {
  const { snapGameNow } = await import('../server/world/valley-routes.js');
  assert.equal(snapGameNow(null, T), T);
  assert.equal(snapGameNow({ clock: { lastNow: 0, devOffset: 0 } }, T), T);
  const server = { clock: { lastNow: T, devOffset: 0, rate: { speed: 4, realAt: T, gameAt: T + 100 } } };
  assert.equal(snapGameNow(server, T + 1000), T + 100 + 4000);
});
