// The game page's side of the public valley (OnFire "Hollow Valley", valley step 1; 05-valley-map.md). Multi mode only.
//
//   createValleyUi(S) -> { start(), open(), menuItem(closeMenu), tile(closeSheet), settingsRows(ctx), mode } | null
//     start()        after the farmer's welcome (main.js): a farm of a call world keeps its call world (the launch saved
//                    it on this device); any other farm joins its public valley (POST /api/w/valley/join with the
//                    farmer's member key), unless a farmer of the farm opted out. Then the Neighbours strip with its
//                    Valley pill appears (strip.js).
//     open()         the valley map (valley-map.js)
//     menuItem / tile    the HUD's More menu entry and the phone farm menu's tile (hidden until there is a valley)
//     settingsRows   Settings > Farm: "Show my farm in the valley" (the opt-out; a call world's farm says why not)
//   mode: 'unknown' | 'public' | 'call' | 'out' | 'off' (the host has no valleys)
import { h, svgIcon } from '../ui/dom.js';
import { farm, session } from '../net/farm.js';
import { t } from '../i18n/index.js';
import { worldOf, saveWorld, forgetWorld, valleyCall } from './base.js';

export function createValleyUi(S) {
  if (!farm.multi) return null;
  const st = { mode: 'unknown', busy: false };
  const entries = new Set();              // menu items and tiles: shown once there is a valley to open
  let strip = null;

  const show = () => { for (const e of entries) e.hidden = !(st.mode === 'public' || st.mode === 'call'); };
  const setMode = (m) => { st.mode = m; show(); };

  function open() {
    if (!worldOf(farm.id)) return Promise.resolve(null);
    return import('./valley-map.js').then((m) => m.openValleyMap({ homeId: farm.id }));
  }

  async function mountStrip() {
    if (strip) return;
    const m = await import('./strip.js');
    strip = m.mountWorldStrip({ homeId: farm.id, onMap: open });
  }
  function unmountStrip() {
    strip?.stop();
    strip = null;
    document.querySelector('[data-hhw="strip"]')?.remove();
    document.querySelector('[data-hhw="valley"]')?.remove();
  }

  async function start() {
    const had = worldOf(farm.id);
    if (had && had.kind !== 'public') { setMode('call'); return mountStrip(); }
    if (!session.secret) return undefined;
    const r = await valleyCall('join', { farmId: farm.id, secret: session.secret, worldKey: had?.worldKey ?? null });
    if (r.ok && r.body?.out) { forgetWorld(farm.id); setMode('out'); return undefined; }
    if (r.ok && r.body?.worldKey) {
      saveWorld({ ...r.body, kind: 'public' });
      setMode('public');
      return mountStrip();
    }
    if (r.code === 'CALL') { setMode('call'); return undefined; }
    if (r.status === 404 && r.code !== 'NOT_FOUND') { setMode('off'); return undefined; }   // a host without valleys
    if (had) { setMode('public'); return mountStrip(); }        // offline for a moment: the last known valley
    return undefined;
  }

  async function setShown(on) {
    if (st.busy || !session.secret) return false;
    st.busy = true;
    const r = await valleyCall(on ? 'join' : 'leave', { farmId: farm.id, secret: session.secret, rejoin: on });
    st.busy = false;
    if (!r.ok) { S.ui?.toast?.(t('world.valley.set.failed'), { kind: 'info', ms: 4000 }); return false; }
    if (on && r.body?.worldKey) {
      saveWorld({ ...r.body, kind: 'public' });
      setMode('public');
      await mountStrip();
      S.ui?.toast?.(t('world.valley.joined'), { kind: 'info', ms: 3000 });
    } else if (!on) {
      forgetWorld(farm.id);
      unmountStrip();
      setMode('out');
      S.ui?.toast?.(t('world.valley.left'), { kind: 'info', ms: 3000 });
    }
    return true;
  }

  const track = (e) => { entries.add(e); show(); return e; };
  const menuItem = (closeMenu) => track(h('button.edge-item', { type: 'button', role: 'menuitem', tabindex: '-1', id: 'hud-valley',
    dataset: { mk: 'world.valley.open' }, on: { click: () => { closeMenu?.(); open(); } } }, svgIcon('ping', 26), h('span.lbl', t('world.valley.open'))));
  const tile = (closeSheet) => track(h('button.m-tile', { type: 'button', 'aria-label': t('world.valley.title'), dataset: { valley: 'open' },
    on: { click: () => { closeSheet?.(); open(); } } }, h('span.m-ico', svgIcon('ping', 30)), h('span.lbl', t('world.valley.open'))));

  function settingsRows() {
    if (st.mode === 'off' || st.mode === 'unknown') return [];
    if (st.mode === 'call') return [h('h3', t('world.valley.set.title')), h('div.set-row', h('span.help', t('world.valley.set.call')))];
    const b = h('button.toggle', { type: 'button', role: 'switch', 'aria-checked': String(st.mode === 'public'), dataset: { valley: 'show' },
      on: { click: async () => {
        const want = b.getAttribute('aria-checked') !== 'true';
        b.disabled = true;
        const ok = await setShown(want);
        b.disabled = false;
        if (ok) b.setAttribute('aria-checked', String(want));
      } } },
    h('span', t('world.valley.set.show'), h('span.help', t('world.valley.set.help'))), h('span.sw', { 'aria-hidden': 'true' }));
    return [h('h3', t('world.valley.set.title')), h('div.set-row', b)];
  }

  return { start, open, menuItem, tile, settingsRows, get mode() { return st.mode; } };
}
