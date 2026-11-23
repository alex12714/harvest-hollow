// A neighbour's farm, read-only (OnFire "Hollow Valley", phase 1): /w/visit/<farmId>?from=<my farm id>. The page draws
// the neighbour's farm with the game's own renderer and keeps it live: the server's welcome (a visitor's: pid null,
// `visitor`, `owner`), every delta through the same SyncStore the game uses, the farmers' avatars from presence rows.
// Nothing here acts: no controller, no tools, no build. The server refuses a visitor's actions anyway (rej SELF_ONLY,
// server/world/sessions.js). The camera pans (drag), zooms (wheel) and turns (Q / E); the neighbours panel
// (strip.js) goes to another farm or back home.
import { view } from '../render/index.js';
import { SyncStore } from '../net/sync.js';
import { Socket } from '../net/socket.js';
import { ClockSync } from '../../../shared/net/clock.js';
import { makeCid } from '../../../shared/net/ids.js';
import { MSG, PROTOCOL_VERSION, CAPS } from '../../../shared/net/protocol.js';
import { spawnAt } from '../../../shared/rules/grid.js';
import { BRAND } from '../../../shared/brand.js';
import { ready as i18nReady, t } from '../i18n/index.js';
import { worldOf, wsUrl } from './base.js';
import { mountWorldStrip } from './strip.js';

const farmId = /\/w\/visit\/([a-z2-7]{12})\/?$/.exec(location.pathname)?.[1] ?? null;
const homeId = new URLSearchParams(location.search).get('from');
const banner = document.getElementById('hhw-visit-banner');
const say = (text) => { if (banner) banner.textContent = text; };

const cid = makeCid((n) => crypto.getRandomValues(new Uint8Array(n)));
const clock = new ClockSync();
const serverNow = () => clock.serverNow(performance.now());
let socket = null;
const store = new SyncStore({ cid, now: serverNow, send: (m) => socket?.send(m) });
let framed = false;
let owner = null;

function onWelcome(w) {
  if (!w.visitor) { say(t('world.unavailable')); socket.stop(); return; }
  clock.seed(w.serverNow, performance.now());
  store.reset(w);
  owner = w.owner;
  view.setState(store.state, { me: `visitor:${w.visitor.seat}` });
  for (const p of w.peers || []) {
    view.partner.online(p.pid, p.online);
    if (p.pose) view.partner.update([p.pose], w.serverNow);
  }
  const name = (owner && store.state.players[owner]?.name) || '';
  say(t('world.lookOnly', { name }));
  document.title = `${BRAND} · ${name}`;
  if (!framed) {
    framed = true;
    const pose = (w.peers || []).find((p) => p.pid === owner)?.pose;
    const at = pose ? { x: pose[1], z: pose[2] } : spawnAt(store.state, owner);
    if (at) view.focus(at.x, at.z);
  }
  window.__hhVisit.welcomed = (window.__hhVisit.welcomed || 0) + 1;
}

const inbox = [];
let queued = false;
function flush() {
  queued = false;
  const list = inbox.splice(0);
  let run = [];
  const done = () => { if (run.length) { store.onServerBatch(run); run = []; } };
  for (const m of list) {
    if (m.t === MSG.DELTA || m.t === MSG.REJ || m.t === MSG.ACK) { run.push(m); continue; }
    done();
    try { handle(m); } catch (err) { console.error(`visit: message ${m.t} failed`, err); }
  }
  done();
}
function onMessage(m) {
  inbox.push(m);
  if (queued) return;
  queued = true;
  requestAnimationFrame(flush);
  setTimeout(() => { if (queued) flush(); }, 30);
}

function handle(m) {
  switch (m.t) {
    case MSG.WELCOME: return onWelcome(m);
    case MSG.DENY: say(t('world.unavailable')); return socket.stop();
    case MSG.PRESENCE: return view.partner.update(m.list, m.ts);
    case MSG.PEER: return view.partner.online(m.pid, m.online);
    case MSG.GHOST: return view.partner.ghost(m.pid, m.g);
    case MSG.EMOTE: return view.emote?.(m.pid, m.id);
    case MSG.MARK: return view.ping?.(m.pid, m.x, m.z);
    default: return undefined;
  }
}

function cameraInput(canvas) {
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = 48 / Math.max(300, canvas.clientHeight);       // about 48 tiles per screen height of drag
    view.camera.pan(-(e.clientX - drag.x) * k, (e.clientY - drag.y) * k);
    drag = { x: e.clientX, y: e.clientY };
    view.interact?.();
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const ndc = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) };
    view.camera.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1, ndc);
    view.interact?.();
  }, { passive: false });
  addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.code === 'KeyQ') view.camera.rotate(-1);
    else if (e.code === 'KeyE') view.camera.rotate(1);
    else return;
    view.interact?.();
  });
}

async function boot() {
  await i18nReady();
  const w = worldOf(homeId);
  if (!farmId || !w) { say(t('world.noWorld')); return; }
  mountWorldStrip({ homeId, here: farmId });
  say(t('world.connecting'));
  const canvas = document.getElementById('world');
  await view.init(canvas, { quality: 'auto', now: serverNow, overlay: document.getElementById('overlay') });
  store.on('change', (ch) => view.sync(ch.ids, ch.topics));
  store.on('fx', ({ ev, by, local }) => view.fx.play(ev, undefined, { by, local }));
  cameraInput(canvas);
  socket = new Socket({ url: wsUrl(farmId), clock, onMessage,
    onOpen: () => socket.raw({ t: MSG.HELLO, proto: PROTOCOL_VERSION, cid, token: w.worldKey, caps: [CAPS.BATCH] }),
    onStatus: (s) => { store.setOnline(s === 'open'); if (s === 'reconnecting') say(t('world.reconnecting')); } });
  socket.connect();
}

window.__hhVisit = { store, view, get state() { return store.state; }, get owner() { return owner; } };
boot().catch((err) => { console.error('visit: boot failed', err); say(t('world.unavailable')); });
