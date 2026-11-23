// HH_BASE_PATH: the whole game under a path prefix (`/games/farm`), for a reverse proxy that routes a path of a bigger
// site to this server WITHOUT stripping the prefix. Unset (the default) changes nothing: every route, page and socket
// stays where it was, byte for byte.
//
// How it works (one prefix, applied in four places; the app itself is built exactly as without it):
//   - the express app is mounted under the prefix (withBasePath): express strips the prefix from req.url, so every
//     route, router and req.path check stays as it is; anything outside the prefix is a plain 404
//   - the WebSocket listens on <prefix>/ws (wsPath)
//   - the pages the server renders (server/static.js indexHtml) point every URL under the prefix and carry
//     <meta name="hh-base" content="<prefix>">; the client reads it once (public/js/net/base.js) for its fetches, socket,
//     links and path parsing
//   - static game files are also served at <prefix>/public/{js,css,assets}/... (publicAlias). Client modules import
//     shared/ with one '..' more than their URL depth, which the browser clamps at an origin's root but which would eat
//     a segment of the prefix; one extra segment ('public') gives that '..' somewhere to land, exactly like option 2's
//     /b/<build>/public layout (server/static.js header).
import express from 'express';

/** One path segment of a prefix: URL-safe, no dot segments. */
const SEGMENT = /^[A-Za-z0-9_~-][A-Za-z0-9._~-]*$/;

/**
 * HH_BASE_PATH as the server uses it: '' (unset, '' or '/') or '/seg[/seg...]' without a trailing slash. Throws an
 * Error naming the problem for anything else (config.js turns it into a ConfigError).
 */
export function basePathOf(raw) {
  if (raw === undefined || raw === null) return '';
  const s = String(raw).trim();
  if (s === '' || s === '/') return '';
  const p = s.replace(/\/+$/, '');
  if (!p.startsWith('/')) throw new Error(`HH_BASE_PATH=${raw} must start with a slash (e.g. /games/farm)`);
  const segs = p.slice(1).split('/');
  if (segs.some((seg) => !SEGMENT.test(seg) || seg === '.' || seg === '..')) {
    throw new Error(`HH_BASE_PATH=${raw} must be URL path segments of letters, digits and - _ . ~ (e.g. /games/farm)`);
  }
  // a prefix that starts like one of the game's own top-level paths could not be told apart from them
  if (RESERVED.has(segs[0])) throw new Error(`HH_BASE_PATH=${raw} must not start with /${segs[0]} (one of the game's own paths)`);
  return p;
}

/** The game's own first path segments (routes and static mounts). */
const RESERVED = new Set(['api', 'ws', 'f', 'b', 'js', 'css', 'assets', 'shared', 'vendor', 'public', 'mods', 'privacy', 'sri-probe']);

/** The WebSocket's path under a prefix. */
export const wsPath = (base = '') => `${base}/ws`;

/**
 * The request handler the HTTP server runs: `app` itself without a prefix, else an outer app that mounts `app` under
 * it and answers 404 everywhere else.
 */
export function withBasePath(app, base = '') {
  if (!base) return app;
  const outer = express();
  outer.disable('x-powered-by');
  outer.use(base, app);
  outer.use((_req, res) => res.status(404).set('Cache-Control', 'no-store').type('text').send('Not found'));
  return outer;
}

/**
 * Under a prefix: GET/HEAD /public/{js,css,assets}/... is the same file as /{js,css,assets}/... (see the header). Pages
 * are never served this way (they are routes, not files).
 */
export function publicAlias() {
  return (req, _res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !/^\/public\/(js|css|assets)\//.test(req.path)
      || /\.html?$/i.test(req.path)) return next();
    req.url = req.url.slice('/public'.length);
    return next();
  };
}
