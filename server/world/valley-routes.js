// The valley map's HTTP surface (OnFire "Hollow Valley", valley step 1; 05-valley-map.md). Mounted by mountWorld
// (server/world/routes.js) under the same app, so a base path mount (HH_BASE_PATH) covers it.
//
//   POST /api/w/valley/join    Authorization: Bearer <member key of the farm>, JSON { farmId, worldKey?, rejoin? }
//                              -> 200 { wid, worldKey, seat, farmId, kind: 'public', created } | 200 { out: true }
//                              | 401 AUTH | 404 NOT_FOUND | 409 CALL (a call world's farm) | 503 FULL | UNAVAILABLE | 429
//   POST /api/w/valley/leave   Authorization: Bearer <member key>, JSON { farmId } -> 200 { ok, out: true } | as join
//   GET  /api/w/thumb/:farmId  Authorization: Bearer <world key> -> 200 farmThumb (server/world/thumb.js) with an ETag
//                              (304 on If-None-Match) | 401 AUTH | 404 (not a farm of the key's world) | 503 | 429
// Both POSTs are same-origin only; per address: 30 joins / leaves a minute, 240 thumbnails a minute.
import express from 'express';
import crypto from 'node:crypto';
import { ID_RE } from '../farms.js';
import { WindowLimiter } from '../ip-limits.js';
import { farmThumb } from './thumb.js';
import { stateOf } from './valley.js';

const NO_STORE = 'no-store';
const MEMBER_KEY_RE = /^[A-Za-z0-9_-]{16,256}$/;
const WORLD_KEY_RE = /^[a-f0-9]{64}$/;

const bearer = (req, re) => {
  const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ''));
  return m && re.test(m[1]) ? m[1] : null;
};

const CODES = { AUTH: 401, NOT_FOUND: 404, CALL: 409, FULL: 503, UNAVAILABLE: 503 };

export function mountValley(app, hh, { sameOrigin, ipOf }) {
  const { world, log } = hh;
  const valley = world.valley;
  const joins = new WindowLimiter([[60_000, 30]]);
  const thumbs = new WindowLimiter([[60_000, 240]]);
  hh.limiters?.push(joins, thumbs);
  const limited = (lim) => (req, res, next) => {
    res.set('Cache-Control', NO_STORE);
    const r = lim.take(ipOf(req));
    if (!r.ok) return res.set('Retry-After', String(Math.ceil(r.retryAfterMs / 1000))).status(429).json({ error: 'RATE' });
    return next();
  };
  const answer = (res, out) => (out.error ? res.status(CODES[out.error] ?? 500).json({ error: out.error }) : res.json(out));

  if (valley) {
    const body = express.json({ limit: '1kb' });
    const parse = (req) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      return {
        key: bearer(req, MEMBER_KEY_RE),
        farmId: typeof b.farmId === 'string' && ID_RE.test(b.farmId) ? b.farmId : null,
        worldKey: typeof b.worldKey === 'string' && WORLD_KEY_RE.test(b.worldKey) ? b.worldKey : null,
        rejoin: b.rejoin === true,
      };
    };
    app.post('/api/w/valley/join', sameOrigin, limited(joins), body, async (req, res) => {
      const p = parse(req);
      if (!p.key) return res.status(401).json({ error: 'AUTH' });
      if (!p.farmId) return res.status(404).json({ error: 'NOT_FOUND' });
      try { return answer(res, await valley.join(p.farmId, p.key, p)); } catch (err) {
        log.error('joining a valley failed', err.message);
        return res.status(500).json({ error: 'INTERNAL' });
      }
    });
    app.post('/api/w/valley/leave', sameOrigin, limited(joins), body, async (req, res) => {
      const p = parse(req);
      if (!p.key) return res.status(401).json({ error: 'AUTH' });
      if (!p.farmId) return res.status(404).json({ error: 'NOT_FOUND' });
      try { return answer(res, await valley.leave(p.farmId, p.key)); } catch (err) {
        log.error('leaving a valley failed', err.message);
        return res.status(500).json({ error: 'INTERNAL' });
      }
    });
  }

  // a neighbour's thumbnail: any world (a call world's map uses it too), only farms of the key's own world
  app.get('/api/w/thumb/:farmId', limited(thumbs), async (req, res) => {
    const got = world.memberOfKey(bearer(req, WORLD_KEY_RE));
    if (!got) return res.status(401).json({ error: 'AUTH' });
    const { farmId } = req.params;
    const at = ID_RE.test(farmId) ? world.byFarm.get(farmId) : null;
    if (!at || at.wid !== got.world.wid || valley?.out.has(farmId)) return res.status(404).json({ error: 'NOT_FOUND' });
    let rec;
    try { rec = await hh.reg.acquire(farmId); } catch { rec = null; }
    const state = stateOf(rec);
    if (!state) return res.status(rec ? 503 : 404).json({ error: rec ? 'UNAVAILABLE' : 'NOT_FOUND' });
    const t = farmThumb(state);
    const tag = `"${crypto.createHash('sha1').update(t.tiles).update(t.crops.join()).digest('base64url').slice(0, 16)}"`;
    res.set('ETag', tag);
    res.set('Cache-Control', 'private, no-cache');
    if (req.headers['if-none-match'] === tag) return res.status(304).end();
    return res.json(t);
  });
}
