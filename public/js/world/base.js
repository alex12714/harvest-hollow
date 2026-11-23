// Paths and storage of the world layer's pages (OnFire "Hollow Valley"). Every URL is built from the page's own path,
// so the pages work at the origin root and under a base path (/g/farm) alike, without knowing which.
//
//   appBase(pathname)       '' or '/g/farm': the part of the path before /f/<id>, /w/visit/<id>, /join or /embed
//   url(p)                  appBase() + p ('/api/w/roster' -> '/g/farm/api/w/roster')
//   wsUrl(farmId)           the farm socket of this host
//   saveWorld / worldOf     localStorage 'hh.world.<home farm id>' = { wid, worldKey, seat, farmId, kind? } (the world key
//                           lets this device list its neighbours and look at their farms; it never leaves this origin;
//                           kind 'public': a public valley, server/world/valley.js)
//   valleyCall / fetchThumb  the public valley's join / leave, and the valley map's thumbnails

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
  try {
    store.setItem(`hh.world.${w.farmId}`, JSON.stringify({ wid: w.wid, worldKey: w.worldKey, seat: w.seat, farmId: w.farmId,
      ...(w.kind === 'public' ? { kind: 'public' } : {}) }));
  } catch { /* storage blocked: the neighbours panel is not offered on this device */ }
}

/** This device forgets its world entry for `homeId` (the farm left its valley, or the world forgot the key). */
export function forgetWorld(homeId, store = globalThis.localStorage) {
  try { store.removeItem(`hh.world.${homeId}`); } catch { /* nothing to forget */ }
}

/**
 * A public valley (server/world/valley-routes.js): POST /api/w/valley/join | leave with a member key of the farm.
 * -> { ok: true, body } | { ok: false, status, code }
 */
export async function valleyCall(what, { farmId, secret, worldKey = null, rejoin = false }, fetcher = globalThis.fetch) {
  try {
    const r = await fetcher(url(`/api/w/valley/${what}`), {
      method: 'POST', cache: 'no-store',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ farmId, ...(worldKey ? { worldKey } : {}), ...(rejoin ? { rejoin: true } : {}) }),
    });
    const body = await r.json().catch(() => null);
    return r.ok ? { ok: true, body } : { ok: false, status: r.status, code: body?.error ?? null };
  } catch { return { ok: false, status: 0, code: 'NET' }; }
}

/** A viewer's choice about a neighbour (POST /api/w/valley/hide | report with the world key): { ok, status, body }. */
export async function valleyViewer(what, worldKey, body, fetcher = globalThis.fetch) {
  try {
    const r = await fetcher(url(`/api/w/valley/${what}`), {
      method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', authorization: `Bearer ${worldKey}` },
      body: JSON.stringify(body),
    });
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => null) };
  } catch { return { ok: false, status: 0, body: null }; }
}

/** A farm's map thumbnail (server/world/thumb.js): { ok, body, etag } | { ok: true, same: true } (304) | { ok: false, status }. */
export async function fetchThumb(worldKey, farmId, etag = null, fetcher = globalThis.fetch) {
  try {
    const r = await fetcher(url(`/api/w/thumb/${encodeURIComponent(farmId)}`), {
      cache: 'no-cache', headers: { authorization: `Bearer ${worldKey}`, ...(etag ? { 'if-none-match': etag } : {}) },
    });
    if (r.status === 304) return { ok: true, same: true };
    return r.ok ? { ok: true, body: await r.json(), etag: r.headers.get('etag') } : { ok: false, status: r.status };
  } catch { return { ok: false, status: 0 }; }
}

/** The roster as this member sees it: { ok, body } | { ok: false, status }. */
export async function fetchRoster(worldKey, fetcher = globalThis.fetch) {
  try {
    const r = await fetcher(url('/api/w/roster'), { cache: 'no-store', headers: { authorization: `Bearer ${worldKey}` } });
    return r.ok ? { ok: true, body: await r.json() } : { ok: false, status: r.status };
  } catch { return { ok: false, status: 0 }; }
}
