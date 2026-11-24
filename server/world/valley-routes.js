// The valley map's HTTP surface (OnFire "Hollow Valley", valley step 1; 05-valley-map.md). Mounted by mountWorld
// (server/world/routes.js) under the same app, so a base path mount (HH_BASE_PATH) covers it.
//
//   POST /api/w/valley/join    Authorization: Bearer <member key of the farm>, JSON { farmId, worldKey?, rejoin? }
//                              -> 200 { wid, worldKey, seat, farmId, kind: 'public', created } | 200 { out: true }
//                              | 401 AUTH | 404 NOT_FOUND | 409 CALL (a call world's farm) | 503 FULL | UNAVAILABLE | 429
//   POST /api/w/valley/leave   Authorization: Bearer <member key>, JSON { farmId } -> 200 { ok, out: true } | as join
//   GET  /api/w/thumb/:farmId  Authorization: Bearer <world key> -> 200 farmThumb (server/world/thumb.js) with an ETag;
//                              never loads a sleeping farm (its last snapshot on disk is read instead: thumbOf)
//                              (304 on If-None-Match) | 401 AUTH | 404 (not a farm of the key's world) | 503 | 429
//   POST /api/w/valley/hide    Authorization: Bearer <world key>, JSON { farmId, hide: true|false } (or { hide: false }
//                              alone: show every hidden farm again) -> { ok, hidden: n }: this viewer's farm stops
//                              seeing that neighbour in the roster and on the map (stored on the viewer's member record)
//   POST /api/w/valley/report  Authorization: Bearer <world key>, JSON { farmId, reason: offensive|spam|other } -> 202:
//                              one log line (the farm's log tag and the reason); 5 an hour per address, one a day per
//                              viewer and farm
// The POSTs are same-origin only; per address: 30 joins / leaves / hides a minute, 240 thumbnails a minute.
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ID_RE, farmTag } from '../farms.js';
import { worldTag } from './registry.js';
import { WindowLimiter } from '../ip-limits.js';
import { farmThumb } from './thumb.js';
import { stateOf } from './valley.js';
import { gameAt, cleanRate } from '../clock.js';

const NO_STORE = 'no-store';
const MEMBER_KEY_RE = /^[A-Za-z0-9_-]{16,256}$/;
const WORLD_KEY_RE = /^[a-f0-9]{64}$/;

const bearer = (req, re) => {
  const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ''));
  return m && re.test(m[1]) ? m[1] : null;
};

const CODES = { AUTH: 401, NOT_FOUND: 404, CALL: 409, FULL: 503, UNAVAILABLE: 503 };

/**
 * A farm's thumbnail WITHOUT waking it: a loaded farm's live state, else its last snapshot on disk (farm.json, written
 * at least every 30 s while it changes and when it unloads), read once per change of the file and cached. Null when
 * neither can be read.
 */
/** A sleeping farm's game time from its saved clock sidecar ({ devOffset, rate }): the wall at the farm's speed. */
export function snapGameNow(server, wall) {
  const c = server && server.clock;
  if (!c) return wall;
  const real = Math.max(wall + (Number.isSafeInteger(c.devOffset) ? c.devOffset : 0), Number.isFinite(c.lastNow) ? c.lastNow : 0);
  return gameAt(cleanRate(c.rate), real);
}
const snapThumbs = new Map();                  // farmId -> { mtimeMs, thumb }
export function thumbOf(rec, now = Date.now()) {
  const live = stateOf(rec);
  // crops ripen in the farm's GAME time (its owner's game speed, server/clock.js), not the wall clock
  if (live) return farmThumb(live, rec.hh.clock ? rec.hh.clock.now() : now);
  const file = path.join(rec.dir, 'farm.json');
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  const had = snapThumbs.get(rec.id);
  if (had && had.mtimeMs === st.mtimeMs && had.at > now - 60_000) return had.thumb;
  try {
    const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!snap || !snap.state || !snap.state.farm) return had?.thumb ?? null;
    // crops ripen with time (the farm's game time at its speed): recomputed at most once a minute
    const thumb = farmThumb(snap.state, snapGameNow(snap.server, now));
    snapThumbs.set(rec.id, { mtimeMs: st.mtimeMs, at: now, thumb });
    if (snapThumbs.size > 4096) snapThumbs.delete(snapThumbs.keys().next().value);
    return thumb;
  } catch { return had?.thumb ?? null; }
}

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

  // a viewer's own choices about a neighbour in a public valley: hide it (for this viewer), or report its name
  const reports = new WindowLimiter([[60 * 60_000, 5]]);
  const reported = new Map();                       // `${wid}|${seat}|${farmId}` -> at (one report a day each)
  hh.limiters?.push(reports);
  const REASONS = new Set(['offensive', 'spam', 'other']);
  const neighbour = (req, res) => {
    const got = world.memberOfKey(bearer(req, WORLD_KEY_RE));
    if (!got || got.world.kind !== 'public' || !valley) { res.status(401).json({ error: 'AUTH' }); return null; }
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const farmId = typeof b.farmId === 'string' && ID_RE.test(b.farmId) ? b.farmId : null;
    return { got, b, farmId };
  };
  const small = express.json({ limit: '1kb' });
  app.post('/api/w/valley/hide', sameOrigin, limited(joins), small, (req, res) => {
    const n = neighbour(req, res);
    if (!n) return undefined;
    const hide = n.b.hide === true;
    if (!n.farmId && hide) return res.status(404).json({ error: 'NOT_FOUND' });
    return answer(res, valley.hide(n.got.world, n.got.member, n.farmId, hide));
  });
  app.post('/api/w/valley/report', sameOrigin, limited(reports), small, (req, res) => {
    const n = neighbour(req, res);
    if (!n) return undefined;
    const reason = REASONS.has(n.b.reason) ? n.b.reason : null;
    const w = n.got.world;
    if (!n.farmId || !reason || n.farmId === n.got.member.farmId || !valley.live(w).some((m) => m.farmId === n.farmId)) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    const k = `${w.wid}|${n.got.member.seat}|${n.farmId}`;
    const now = Date.now();
    if (now - (reported.get(k) ?? 0) > 86_400_000) {
      reported.set(k, now);
      if (reported.size > 10_000) reported.delete(reported.keys().next().value);
      // one line for a human: which farm (its log tag, never the id) and why
      log.warn('a farm name was reported in a public valley', { farm: farmTag(n.farmId), world: worldTag(w.wid), reason });
    }
    return res.status(202).json({ ok: true });
  });

  // a neighbour's thumbnail: any world (a call world's map uses it too), only farms of the key's own world
  app.get('/api/w/thumb/:farmId', limited(thumbs), async (req, res) => {
    const got = world.memberOfKey(bearer(req, WORLD_KEY_RE));
    if (!got) return res.status(401).json({ error: 'AUTH' });
    const { farmId } = req.params;
    const at = ID_RE.test(farmId) ? world.byFarm.get(farmId) : null;
    if (!at || at.wid !== got.world.wid || valley?.out.has(farmId)) return res.status(404).json({ error: 'NOT_FOUND' });
    const rec = hh.reg.rec(farmId);
    if (!rec) return res.status(404).json({ error: 'NOT_FOUND' });
    const t = thumbOf(rec);
    if (!t) return res.status(503).json({ error: 'UNAVAILABLE' });
    const tag = `"${crypto.createHash('sha1').update(t.tiles).update(t.crops.join()).digest('base64url').slice(0, 16)}"`;
    res.set('ETag', tag);
    res.set('Cache-Control', 'private, no-cache');
    if (req.headers['if-none-match'] === tag) return res.status(304).end();
    return res.json(t);
  });
}
