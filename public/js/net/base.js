// The page's path prefix (HH_BASE_PATH, server/base-path.js): the server renders <meta name="hh-base" content="/games/farm">
// into every page it serves under a prefix, and nothing without one, so BASE is '' and every helper below returns its
// input unchanged: a server without a prefix is untouched. Read once when the module loads. Every URL of this server
// the client builds at runtime (API calls, the socket, page links, manifests) goes through url(); a page path is read
// through pagePath() before it is matched. Static files go through net/asset-base.js assetUrl(), which uses it too.
//
//   BASE                 '' or '/seg[/seg]' (no trailing slash)
//   url('/api/x')        BASE + '/api/x' (only a root path moves: '//host', 'https://…', relative paths stay)
//   pagePath('/g/f/f/x') the path without BASE ('/f/x'); a path outside BASE comes back unchanged

/** The meta's content, normalised to '' or '/seg[/seg]', or '' (no meta, or no document: node tests, a worker). */
function readBase() {
  const raw = globalThis.document?.querySelector?.('meta[name="hh-base"]')?.getAttribute('content') ?? '';
  const p = raw.trim().replace(/\/+$/, '');
  return /^(\/[A-Za-z0-9._~-]+)+$/.test(p) ? p : '';
}

export const BASE = readBase();

/** '/api/x' -> BASE + '/api/x'; anything that is not a root path comes back unchanged. */
export function url(path, base = BASE) {
  if (!base || typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return path;
  return `${base}${path}`;
}

/** A location's path as the routes see it: BASE taken off ('/g/farm' and '/g/farm/' are '/'). */
export function pagePath(pathname, base = BASE) {
  const p = String(pathname ?? '');
  if (!base) return p;
  if (p === base) return '/';
  return p.startsWith(`${base}/`) ? p.slice(base.length) : p;
}
