// The valley map (OnFire "Hollow Valley", valley step 1; 05-valley-map.md): a top-down board of every farm in this
// farm's world (its public valley, or its call's world), each a live little map of the farm (thumb-draw.js) with the
// farm's name, its farmer's name and colour, an online dot and how many are looking. Your farm is marked. A tap on a
// neighbour flies into it (the read-only visit, /w/visit/<id>); a tap on your own farm, or "Go to your farm", goes home.
// The full shared 3D valley is step 2; this is the map.
//
//   openValleyMap({ homeId, here?, doc? }) -> { close(), refresh() } | null   (null: this device has no world entry)
//
// Live: the roster every 4 s and each farm's thumbnail every 12 s (an ETag: an unchanged farm costs a 304), only while
// the map is open. Nothing here acts on a farm.
import { t } from '../i18n/index.js';
import { worldOf, fetchRoster, fetchThumb, visitPath, farmPath } from './base.js';
import { drawThumb } from './thumb-draw.js';

const ROSTER_MS = 4000;
const THUMB_MS = 12_000;
const FLY_MS = 420;
const SEAT_COLORS = ['#2BB3A3', '#FF7A6B', '#4A7FE8', '#FFC83D', '#9B6BD6', '#E8554A', '#3F8F2A', '#D99A4A'];
const SVG_NS = 'http://www.w3.org/2000/svg';

let openMap = null;

function el(doc, tag, cls, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function ensureCss(doc) {
  if (doc.getElementById('hh-world-css')) return;
  const l = doc.createElement('link');
  l.id = 'hh-world-css';
  l.rel = 'stylesheet';
  l.href = new URL('../../css/world.css', import.meta.url).href;
  doc.head.append(l);
}

/** The board's land: meadow, a river with its banks, the lanes between the plots and a few trees (two shapes:
 *  a wide board's river runs across, a tall board's runs down). */
function land(doc, tall) {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `hhv-land${tall ? ' tall' : ' wide'}`);
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const river = tall
    ? 'M52 -2 C40 14 62 26 50 40 C38 54 62 64 49 78 C40 88 56 96 50 102'
    : 'M-2 50 C14 38 26 60 40 49 C54 38 64 61 78 50 C88 42 96 56 102 49';
  const lanes = tall
    ? ['M25 0 L25 100', 'M75 0 L75 100', 'M0 25 L100 25', 'M0 50 L100 50', 'M0 75 L100 75']
    : ['M0 27 L100 27', 'M0 73 L100 73', 'M25 0 L25 100', 'M50 0 L50 100', 'M75 0 L75 100'];
  svg.innerHTML = `
    <defs><linearGradient id="hhv-meadow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#A9D877"/><stop offset="1" stop-color="#8CC460"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#hhv-meadow)"/>
    ${lanes.map((d) => `<path d="${d}" stroke="#E4C994" stroke-width="2.4" fill="none" vector-effect="non-scaling-stroke" stroke-linecap="round" opacity=".9"/>`).join('')}
    <path d="${river}" stroke="#7FB7D9" stroke-width="22" fill="none" vector-effect="non-scaling-stroke" stroke-linecap="round" opacity=".55"/>
    <path d="${river}" stroke="#4FA3D6" stroke-width="14" fill="none" vector-effect="non-scaling-stroke" stroke-linecap="round"/>
    <path d="${river}" stroke="#BFE6F7" stroke-width="2" fill="none" vector-effect="non-scaling-stroke" stroke-dasharray="6 10" opacity=".9"/>`;
  return svg;
}

const reduced = (doc) => doc.body.classList.contains('motion-reduced') || doc.body.classList.contains('motion-still')
  || Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export function openValleyMap({ homeId, here = homeId, doc = document } = {}) {
  const w = worldOf(homeId);
  if (!w) return null;
  if (openMap) { openMap.focus(); return openMap; }
  ensureCss(doc);
  const opener = doc.activeElement;
  const layer = el(doc, 'div', 'hhv-layer');
  layer.setAttribute('data-hhw', 'valley');
  const scrim = el(doc, 'div', 'hhv-scrim');
  const sheet = el(doc, 'section', 'paper hhv-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'hhv-title');
  const head = el(doc, 'header', 'hhv-head');
  const titles = el(doc, 'div', 'hhv-titles');
  const title = el(doc, 'h2', 'hhv-title', t('world.valley.title'));
  title.id = 'hhv-title';
  const lead = el(doc, 'p', 'hhv-lead', t(w.kind === 'public' ? 'world.valley.lead' : 'world.valley.leadCall'));
  titles.append(title, lead);
  const close = el(doc, 'button', 'btn btn--paper btn--small hhv-close', t('world.close'));
  close.type = 'button';
  head.append(titles, close);
  const board = el(doc, 'div', 'hhv-board');
  board.append(land(doc, false), land(doc, true));
  const plots = el(doc, 'ol', 'hhv-plots');
  board.append(plots);
  const status = el(doc, 'p', 'hhv-status', t('world.valley.loading'));
  status.setAttribute('role', 'status');
  const foot = el(doc, 'footer', 'hhv-foot');
  if (here !== homeId) {
    const home = el(doc, 'button', 'btn btn--sky hhv-home', t('world.home'));
    home.type = 'button';
    home.addEventListener('click', () => go(farmPath(homeId), null));
    foot.append(home);
  }
  sheet.append(head, board, status, foot);
  layer.append(scrim, sheet);
  doc.body.append(layer);
  if (!reduced(doc)) layer.classList.add('in');

  const thumbs = new Map();          // farmId -> { etag, body, at, canvas }
  const perf = { draws: 0, drawMs: 0, fetches: 0, notModified: 0 };
  let roster = null;
  let stopped = false;
  let rosterTimer = null;
  let thumbTimer = null;
  let flying = false;

  function go(to, from) {
    if (flying) return;
    flying = true;
    if (!from || reduced(doc)) { location.assign(to); return; }
    // fly: the tapped plot grows to the whole screen, then the page changes
    const r = from.getBoundingClientRect();
    const ghost = el(doc, 'div', 'hhv-fly');
    const c = from.querySelector('canvas');
    if (c) {
      const copy = doc.createElement('canvas');
      copy.width = c.width;
      copy.height = c.height;
      copy.getContext('2d')?.drawImage(c, 0, 0);
      ghost.append(copy);
    }
    Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    doc.body.append(ghost);
    const vw = globalThis.innerWidth;
    const vh = globalThis.innerHeight;
    const k = Math.max(vw / r.width, vh / r.height) * 1.08;
    const dx = vw / 2 - (r.left + r.width / 2);
    const dy = vh / 2 - (r.top + r.height / 2);
    const anim = ghost.animate?.([{ transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) scale(${k})`, opacity: 1 }], { duration: FLY_MS, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' });
    sheet.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: FLY_MS * 0.6, fill: 'forwards' });
    const done = () => location.assign(to);
    if (anim) anim.finished.then(done, done); else setTimeout(done, FLY_MS);
  }

  const nameOf = (m) => m.farmName || t('world.valley.farmOf', { name: m.name });

  function plotFor(m, i) {
    const li = el(doc, 'li', 'hhv-cell');
    li.style.setProperty('--i', String(i));
    if (!m) {
      const empty = el(doc, 'div', 'hhv-plot empty');
      empty.append(el(doc, 'div', 'hhv-parcel'), el(doc, 'span', 'hhv-chip', t('world.valley.empty')));
      li.append(empty);
      return li;
    }
    const color = m.color || SEAT_COLORS[(m.seat - 1) % SEAT_COLORS.length];
    const b = el(doc, 'button', `hhv-plot${m.self ? ' self' : ''}${m.farmId === here ? ' here' : ''}`);
    b.type = 'button';
    b.dataset.farm = m.farmId;
    b.dataset.seat = String(m.seat);
    b.style.setProperty('--owner', color);
    b.setAttribute('aria-label', m.self ? t('world.valley.goHome') : t('world.valley.openPlot', { farm: nameOf(m) }));
    const parcel = el(doc, 'div', 'hhv-parcel');
    let canvas = thumbs.get(m.farmId)?.canvas;
    if (!canvas) {
      canvas = doc.createElement('canvas');
      canvas.className = 'hhv-thumb';
      canvas.width = 4;
      canvas.height = 4;
      const got = thumbs.get(m.farmId);
      if (got) { got.canvas = canvas; if (got.body) drawThumb(canvas, got.body); } else thumbs.set(m.farmId, { etag: null, body: null, at: 0, canvas });
    }
    parcel.append(canvas);
    const dot = el(doc, 'span', `hhv-online${m.online ? ' on' : ''}`);
    dot.setAttribute('aria-hidden', 'true');
    parcel.append(dot);
    if (m.self) parcel.append(el(doc, 'span', 'hhv-flag', t('world.valley.yours')));
    else if (m.farmId === here) parcel.append(el(doc, 'span', 'hhv-flag here', t('world.valley.here')));
    if (m.visitors) parcel.append(el(doc, 'span', 'hhv-look', t('world.valley.looking', { n: m.visitors })));
    const chip = el(doc, 'span', 'hhv-chip');
    const sw = el(doc, 'span', 'hhv-swatch');
    sw.setAttribute('aria-hidden', 'true');
    const txt = el(doc, 'span', 'hhv-chip-t');
    txt.append(el(doc, 'strong', 'hhv-farm', nameOf(m)));
    txt.append(el(doc, 'span', 'hhv-owner', m.self ? `${m.name} (${t('world.you')})` : (m.online ? `${m.name} · ${t('world.online')}` : m.name)));
    chip.append(sw, txt);
    b.append(parcel, chip);
    b.addEventListener('click', () => {
      if (m.self) {
        if (here === homeId) { closeMap(); return; }
        go(farmPath(homeId), b);
      } else go(visitPath(m.farmId, homeId), b);
    });
    li.append(b);
    return li;
  }

  function render() {
    if (!roster) return;
    const bySeat = new Map(roster.members.filter((m) => m.farmId).map((m) => [m.seat, m]));
    const max = Math.max(roster.max || 8, ...bySeat.keys());
    const cells = [];
    for (let s = 1; s <= max; s++) cells.push(plotFor(bySeat.get(s) ?? null, s - 1));
    plots.replaceChildren(...cells);
    plots.dataset.n = String(max);
    status.textContent = bySeat.size <= 1 ? t('world.valley.alone') : '';
  }

  function draw(farmId) {
    const th = thumbs.get(farmId);
    if (!th || !th.body || !th.canvas) return;
    const t0 = performance.now();
    drawThumb(th.canvas, th.body);
    perf.drawMs += performance.now() - t0;
    perf.draws++;
  }

  async function refreshRoster() {
    clearTimeout(rosterTimer);
    const r = await fetchRoster(w.worldKey);
    if (stopped) return;
    if (r.ok) {
      const before = roster ? JSON.stringify(roster.members) : '';
      roster = r.body;
      if (JSON.stringify(roster.members) !== before) {
        render();
        refreshThumbs(false);
      }
    } else if (r.status === 401) { closeMap(); return; } else status.textContent = t('world.rosterFailed');
    rosterTimer = setTimeout(refreshRoster, ROSTER_MS);
  }

  async function refreshThumbs(all = true) {
    if (!roster) return;
    const due = roster.members.filter((m) => m.farmId && (all || !thumbs.get(m.farmId)?.body));
    let next = 0;
    const worker = async () => {
      while (next < due.length && !stopped) {
        const m = due[next++];
        const th = thumbs.get(m.farmId) ?? { etag: null, body: null, at: 0, canvas: null };
        thumbs.set(m.farmId, th);
        perf.fetches++;
        const r = await fetchThumb(w.worldKey, m.farmId, th.body ? th.etag : null);
        if (stopped) return;
        if (r.ok && r.same) { perf.notModified++; continue; }
        if (r.ok) {
          th.body = r.body;
          th.etag = r.etag;
          th.at = Date.now();
          draw(m.farmId);
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  function loopThumbs() {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(async () => { await refreshThumbs(true); if (!stopped) loopThumbs(); }, THUMB_MS);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); closeMap(); return; }
    if (e.key !== 'Tab') return;
    const f = [...sheet.querySelectorAll('button:not([disabled])')];
    if (!f.length) return;
    const i = f.indexOf(doc.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }

  function closeMap() {
    if (stopped) return;
    stopped = true;
    clearTimeout(rosterTimer);
    clearTimeout(thumbTimer);
    doc.removeEventListener('keydown', onKey, true);
    openMap = null;
    const gone = () => layer.remove();
    if (reduced(doc) || !layer.animate) gone();
    else layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-out' }).finished.then(gone, gone);
    try { opener?.focus?.({ preventScroll: true }); } catch { /* the opener went away */ }
  }

  close.addEventListener('click', closeMap);
  scrim.addEventListener('click', closeMap);
  doc.addEventListener('keydown', onKey, true);
  close.focus({ preventScroll: true });
  refreshRoster().then(() => { if (!stopped) loopThumbs(); });
  const api = { close: closeMap, refresh: refreshRoster, focus: () => close.focus(), perf, get roster() { return roster; } };
  openMap = api;
  globalThis.__hhValley = api;
  return api;
}
