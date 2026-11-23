// The neighbours panel of a world farm (OnFire "Hollow Valley", phase 1): a "Neighbours" pill at the top of the screen
// that opens a paper card listing every farm of this call's world, who is on their farm, who is visiting whom, and a
// Visit button per neighbour (a read-only look at their farm, /w/visit/<id>) or Back home while visiting. Shown only on
// a device that opened its farm from the call (base.js worldOf); everywhere else nothing is added to the page.
//
//   mountWorldStrip({ homeId, here, doc? }) -> { stop() } | null
//     homeId  this device's own farm in the world;  here  the farm on screen (home, or the one being visited)
import { t } from '../i18n/index.js';
import { worldOf, fetchRoster, visitPath, farmPath } from './base.js';

const POLL_MS = 4000;

function el(doc, tag, cls, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Load world.css once (the game page does not link it: the panel is the world layer's own). */
function ensureCss(doc) {
  if (doc.getElementById('hh-world-css')) return;
  const l = doc.createElement('link');
  l.id = 'hh-world-css';
  l.rel = 'stylesheet';
  l.href = new URL('../../css/world.css', import.meta.url).href;   // beside this module, wherever the game files come from
  doc.head.append(l);
}

export function mountWorldStrip({ homeId, here = homeId, doc = document, onVisit = null } = {}) {
  const w = worldOf(homeId);
  if (!w) return null;
  ensureCss(doc);
  const root = el(doc, 'div', 'hhw-strip');
  root.setAttribute('data-hhw', 'strip');
  const pill = el(doc, 'button', 'btn btn--sky btn--small hhw-pill');
  pill.type = 'button';
  pill.setAttribute('aria-expanded', 'false');
  pill.setAttribute('aria-controls', 'hhw-card');
  const pillText = el(doc, 'span', 'hhw-pill-t', t('world.neighbours'));
  const pillDots = el(doc, 'span', 'hhw-dots');
  pillDots.setAttribute('aria-hidden', 'true');
  pill.append(pillText, pillDots);
  const card = el(doc, 'section', 'paper hhw-card');
  card.id = 'hhw-card';
  card.hidden = true;
  card.setAttribute('aria-label', t('world.title'));
  const head = el(doc, 'header', 'hhw-head');
  const title = el(doc, 'h2', 'hhw-title', t('world.title'));
  const close = el(doc, 'button', 'btn btn--paper btn--small hhw-close', t('world.close'));
  close.type = 'button';
  head.append(title, close);
  const list = el(doc, 'ul', 'hhw-list');
  const status = el(doc, 'p', 'hhw-status');
  status.setAttribute('role', 'status');
  card.append(head, list, status);
  root.append(pill, card);
  doc.body.append(root);

  const toggle = (open) => {
    card.hidden = !open;
    pill.setAttribute('aria-expanded', String(open));
    if (open) refresh();
  };
  pill.addEventListener('click', () => toggle(card.hidden));
  close.addEventListener('click', () => toggle(false));
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !card.hidden) toggle(false); });

  const go = (to) => { if (onVisit) onVisit(to); else location.assign(to); };

  function render(r) {
    const byFarm = new Map(r.members.filter((m) => m.farmId).map((m) => [m.farmId, m]));
    list.replaceChildren(...r.members.map((m) => {
      const li = el(doc, 'li', `hhw-row${m.self ? ' self' : ''}${m.farmId === here ? ' here' : ''}`);
      li.dataset.seat = String(m.seat);
      const dot = el(doc, 'span', `hhw-dot${m.online ? ' on' : ''}`);
      dot.setAttribute('aria-hidden', 'true');
      const who = el(doc, 'div', 'hhw-who');
      who.append(el(doc, 'span', 'hhw-name', m.self ? `${m.name} (${t('world.you')})` : m.name));
      const bits = [];
      if (!m.farmId) bits.push(t('world.noFarm'));
      else if (m.visiting && byFarm.has(m.visiting)) bits.push(t('world.visitingName', { name: byFarm.get(m.visiting).name }));
      else bits.push(m.online ? t('world.online') : t('world.away'));
      if (m.visitors) bits.push(t('world.visitors', { n: m.visitors }));
      who.append(el(doc, 'span', 'hhw-sub', bits.join(' · ')));
      li.append(dot, who);
      if (m.self && here !== homeId) {
        const b = el(doc, 'button', 'btn btn--small hhw-go', t('world.home'));
        b.type = 'button';
        b.addEventListener('click', () => go(farmPath(homeId)));
        li.append(b);
      } else if (!m.self && m.farmId && m.farmId !== here) {
        const b = el(doc, 'button', 'btn btn--sky btn--small hhw-go', t('world.visit'));
        b.type = 'button';
        b.dataset.farm = m.farmId;
        b.addEventListener('click', () => go(visitPath(m.farmId, homeId)));
        li.append(b);
      }
      return li;
    }));
    const n = r.members.filter((m) => !m.self && m.online).length;
    pillDots.textContent = n ? String(n) : '';
    status.textContent = '';
  }

  let timer = null;
  let stopped = false;
  async function refresh() {
    clearTimeout(timer);
    const r = await fetchRoster(w.worldKey);
    if (stopped) return;
    if (r.ok) render(r.body);
    else if (r.status === 401) { root.remove(); stopped = true; return; }   // the world forgot this key
    else status.textContent = t('world.rosterFailed');
    timer = setTimeout(refresh, POLL_MS);
  }
  refresh();
  return {
    root,
    open: () => toggle(true),
    refresh,
    stop() { stopped = true; clearTimeout(timer); root.remove(); },
  };
}
