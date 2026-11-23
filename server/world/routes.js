// The world layer's HTTP surface (contract: onfiremobile docs/PRD/harvest-hollow/04-world-api.md). Mounted by
// server/multi.js only when HH_WORLD_SECRET is set; every path is relative to the app, so a base path mount covers it.
//
// Server-to-server (HMAC-signed, server/world/s2s.js; never same-origin guarded, never per-address limited):
//   PUT    /api/s2s/worlds/:roomKey          { wid?, title?, tz? } -> 201|200 { wid, roomKey, created, members, max }
//   GET    /api/s2s/worlds/:wid              -> { wid, roomKey, title, createdAt, lastSeenAt, max, members: [...] }
//   DELETE /api/s2s/worlds/:wid              -> { ok, farms }   (the world and every member farm)
//   DELETE /api/s2s/worlds/:wid/members/:fid -> { ok, farms }   (one member and their farm: account deletion)
// Browser (same origin):
//   POST   /api/w/launch   { t, wid? }      -> 201 { wid, farmId, key, worldKey, seat, name, role, created }
//   GET    /api/w/roster   Bearer <worldKey> -> { wid, title, max, me, members: [...] }
//   GET    /api/w/config                    -> { embedOrigins }
// Pages:  /join (phone: #t=<token>), /embed (call panel iframe: the token by postMessage), /w/visit/:farmId (a
//         neighbour's farm, read-only)
import express from 'express';
import { ID_RE } from '../farms.js';
import { clientIp, WindowLimiter } from '../ip-limits.js';
import { verifyJoinToken, JtiSet, WID_RE, FID_RE } from './token.js';
import { verifyS2s, SeenSigs } from './s2s.js';
import { ROOM_RE, worldTag } from './registry.js';
import { isTimeZone } from '../../shared/rules/calendar.js';

const NO_STORE = 'no-store';
const KEY_RE = /^[a-f0-9]{64}$/;

const bearer = (req) => {
  const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ''));
  return m && KEY_RE.test(m[1]) ? m[1] : null;
};

/** Mount the world routes on the multi-farm app. `hh.world`: the WorldRegistry, `hh.wc`: its config. */
export function mountWorld(app, hh, { sameOrigin }) {
  const { world, wc, log, mc } = hh;
  const ipOf = (req) => clientIp(req, mc.trustProxy);
  const jtis = new JtiSet();
  const sigs = new SeenSigs(2 * wc.s2sWindowMs);
  const launches = new WindowLimiter([[60_000, 30]]);
  const rosters = new WindowLimiter([[60_000, 120]]);
  hh.limiters?.push(launches, rosters);
  const prune = setInterval(() => jtis.prune(Date.now()), 60_000);
  prune.unref?.();

  // ---- server to server ---------------------------------------------------------------------------------------
  const s2s = express.Router({ mergeParams: true });
  s2s.use(express.raw({ type: () => true, limit: '4kb' }), (req, res, next) => {
    res.set('Cache-Control', NO_STORE);
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const v = verifyS2s(req, body, { keys: wc.keys, windowMs: wc.s2sWindowMs, seen: sigs });
    if (!v.ok) return res.status(401).json({ error: 'AUTH' });
    if (body.length) {
      try { req.json = JSON.parse(body.toString('utf8')); } catch { return res.status(400).json({ error: 'BAD_REQUEST' }); }
    } else req.json = {};
    if (!req.json || typeof req.json !== 'object' || Array.isArray(req.json)) return res.status(400).json({ error: 'BAD_REQUEST' });
    return next();
  });
  const pub = (w) => ({
    wid: w.wid, roomKey: w.roomKey, title: w.title, tz: w.tz, createdAt: w.createdAt, lastSeenAt: w.lastSeenAt, max: wc.maxMembers,
    members: world.roster(w, { seat: 0, farmId: null }).members.map(({ self: _s, farmId: _f, ...m }) => m),
  });
  s2s.put('/worlds/:roomKey', (req, res) => {
    const { roomKey } = req.params;
    const b = req.json;
    if (!ROOM_RE.test(roomKey)) return res.status(400).json({ error: 'BAD_REQUEST' });
    if (b.wid !== undefined && (typeof b.wid !== 'string' || !WID_RE.test(b.wid))) return res.status(400).json({ error: 'BAD_REQUEST' });
    if (b.title !== undefined && (typeof b.title !== 'string' || b.title.length > 80)) return res.status(400).json({ error: 'BAD_REQUEST' });
    if (b.tz !== undefined && (typeof b.tz !== 'string' || b.tz.length > 64 || !isTimeZone(b.tz))) return res.status(400).json({ error: 'BAD_REQUEST' });
    let r;
    try { r = world.ensureRoom(roomKey, { wid: b.wid ?? null, title: b.title ?? null, tz: b.tz ?? null }); } catch (err) {
      log.error('creating a world failed', err.message);
      return res.status(500).json({ error: 'INTERNAL' });
    }
    if (r.error === 'CONFLICT') return res.status(409).json({ error: 'CONFLICT' });
    if (r.error) return res.status(503).json({ error: 'FULL' });
    return res.status(r.created ? 201 : 200).json({ ...pub(r.world), created: r.created });
  });
  s2s.get('/worlds/:wid', (req, res) => {
    const w = WID_RE.test(req.params.wid) ? world.world(req.params.wid) : null;
    return w ? res.json(pub(w)) : res.status(404).json({ error: 'NOT_FOUND' });
  });
  s2s.delete('/worlds/:wid', async (req, res) => {
    const r = WID_RE.test(req.params.wid) ? await world.remove(req.params.wid) : null;
    return r ? res.json({ ok: true, farms: r.farms }) : res.status(404).json({ error: 'NOT_FOUND' });
  });
  s2s.delete('/worlds/:wid/members/:fid', async (req, res) => {
    const { wid, fid } = req.params;
    const r = WID_RE.test(wid) && FID_RE.test(fid) ? await world.remove(wid, { fid }) : null;
    return r ? res.json({ ok: true, farms: r.farms }) : res.status(404).json({ error: 'NOT_FOUND' });
  });
  app.use('/api/s2s', s2s, (_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

  // ---- browser --------------------------------------------------------------------------------------------------
  app.post('/api/w/launch', sameOrigin, express.json({ limit: '8kb' }), async (req, res) => {
    res.set('Cache-Control', NO_STORE);
    const r = launches.take(ipOf(req));
    if (!r.ok) return res.set('Retry-After', String(Math.ceil(r.retryAfterMs / 1000))).status(429).json({ error: 'RATE' });
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const wid = typeof b.wid === 'string' && b.wid ? b.wid : null;
    const v = verifyJoinToken(b.t, { keys: wc.keys, seen: jtis, iss: wc.iss, aud: wc.aud, skewMs: wc.skewMs, maxLifeS: wc.maxLifeS, wid });
    if (!v.ok) return res.status(401).json({ error: 'invalid_token' });
    let out;
    try { out = await world.launch(v.claims); } catch (err) {
      log.error('a world launch failed', { world: worldTag(v.claims.wid) }, err.message);
      return res.status(500).json({ error: 'INTERNAL' });
    }
    if (out.error === 'FULL') return res.status(409).json({ error: 'FULL' });
    if (out.error) return res.status(503).json({ error: 'UNAVAILABLE' });
    return res.status(201).json(out);
  });

  app.get('/api/w/roster', (req, res) => {
    res.set('Cache-Control', NO_STORE);
    const r = rosters.take(ipOf(req));
    if (!r.ok) return res.set('Retry-After', String(Math.ceil(r.retryAfterMs / 1000))).status(429).json({ error: 'RATE' });
    const got = world.memberOfKey(bearer(req));
    if (!got) return res.status(401).json({ error: 'AUTH' });
    world.touch(got.world.wid);
    return res.json(world.roster(got.world, got.member));
  });

  app.get('/api/w/config', (_req, res) => res.set('Cache-Control', 'no-cache').json({ embedOrigins: wc.embedOrigins }));

  // ---- pages ----------------------------------------------------------------------------------------------------
  const page = (file, csp) => (req, res, next) => {
    let p = null;
    try { p = hh.static.indexHtml(file); } catch (err) { log.error(`${file} could not be rendered`, err.message); }
    if (!p) return next();
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (csp) res.setHeader('Content-Security-Policy', csp);
    return hh.static.sendPage(req, res, p);
  };
  app.get(['/join', '/join/'], page('world-launch.html', "frame-ancestors 'none'"));
  app.get(['/embed', '/embed/'], page('world-launch.html', `frame-ancestors ${wc.frameAncestors.join(' ') || "'none'"}`));
  app.get(['/w/visit/:id', '/w/visit/:id/'], (req, res, next) => (ID_RE.test(req.params.id)
    ? page('world-visit.html', null)(req, res, next) : res.status(404).type('text').send('Not found')));

  return { stop: () => clearInterval(prune) };
}
