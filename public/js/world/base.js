// Paths and storage of the world layer's pages (OnFire "Hollow Valley"). Every URL is built from the page's own path,
// so the pages work at the origin root and under a base path (/g/farm) alike, without knowing which.
//
//   appBase(pathname)       '' or '/g/farm': the part of the path before /f/<id>, /w/visit/<id>, /join or /embed
//   url(p)                  appBase() + p ('/api/w/roster' -> '/g/farm/api/w/roster')
//   wsUrl(farmId)           the farm socket of this host
//   saveWorld / worldOf     localStorage 'hh.world.<home farm id>' = { wid, worldKey, seat, farmId } (the world key
//                           lets this device list its neighbours and look at their farms; it never leaves this origin)

const SUFFIX = /\/(?:f\/[A-Za-z0-9_-]{6,64}|w\/visit\/[A-Za-z0-9_-]{6,64}|join|embed)\/?$/;
const ID_RE = /^[a-z2-7]{12}$/;
const KEY_RE = /^[a-f0-9]{64}$/;

export function appBase(pathname = globalThis.location?.pathname ?? '/') {
  const m = SUFFIX.exec(pathname);
  return m ? pathname.slice(0, m.index) : pathname.replace(/\/+$/, '');
}

export const url = (p) => `${appBase()}${p}`;

export function wsUrl(farmId, loc = globalThis.location) {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${appBase(loc.pathname)}/ws?farm=${encodeURIComponent(farmId)}`;
}

export const farmPath = (farmId, hash = '') => url(`/f/${encodeURIComponent(farmId)}${hash}`);
export const visitPath = (farmId, home) => url(`/w/visit/${encodeURIComponent(farmId)}?from=${encodeURIComponent(home)}`);

/** This device's world entry for its farm `homeId`, or null. */
export function worldOf(homeId, store = globalThis.localStorage) {
  if (!ID_RE.test(String(homeId))) return null;
  try {
    const w = JSON.parse(store.getItem(`hh.world.${homeId}`));
    return w && KEY_RE.test(w.worldKey) && w.farmId === homeId ? w : null;
  } catch { return null; }
}

export function saveWorld(w, store = globalThis.localStorage) {
  try { store.setItem(`hh.world.${w.farmId}`, JSON.stringify({ wid: w.wid, worldKey: w.worldKey, seat: w.seat, farmId: w.farmId })); }
  catch { /* storage blocked: the neighbours panel is not offered on this device */ }
}

/** The roster as this member sees it: { ok, body } | { ok: false, status }. */
export async function fetchRoster(worldKey, fetcher = globalThis.fetch) {
  try {
    const r = await fetcher(url('/api/w/roster'), { cache: 'no-store', headers: { authorization: `Bearer ${worldKey}` } });
    return r.ok ? { ok: true, body: await r.json() } : { ok: false, status: r.status };
  } catch { return { ok: false, status: 0 }; }
}
