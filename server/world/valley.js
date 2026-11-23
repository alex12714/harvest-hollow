// Public valleys (OnFire "Hollow Valley", valley step 1; doc: onfiremobile docs/PRD/harvest-hollow/05-valley-map.md).
//
// A farm started on the public host (the landing page, POST /api/farms) has no call world. It joins a PUBLIC VALLEY: a
// world of the world registry (server/world/registry.js) with `kind: 'public'`, no room key and no call behind it, that
// holds up to HH_VALLEY_MAX (default 8) farms. Once it is in one, everything the world layer already does works for it
// unchanged: the roster (GET /api/w/roster), the neighbours panel, the read-only visit (/w/visit/<id>, a visitor socket
// with the world key) and the valley map's thumbnails (GET /api/w/thumb/:farmId).
//
// Rules (owner decisions 2026-11-23):
//   - assignment: a farm joins on its farmer's next visit (POST /api/w/valley/join with a member key of the farm), into
//     the NEWEST public valley that has room; a new valley is made when every valley is full. A farm stays in its
//     valley for life (a member's seat is kept), until it opts out or is deleted.
//   - one world per farm: a farm made by a call launch belongs to that call world only and never joins a public valley
//     (join answers CALL); a standalone farm belongs to its public valley only. So "call world while launched from a
//     call, the public valley otherwise" holds without a farm ever being in two worlds (byFarm stays one-to-one).
//   - opt-out: "Show my farm in the valley" off (Settings > Farm) removes the farm from its valley at once (its world
//     keys stop working: the neighbours panel and the map go away on every device) and remembers the choice; the farm
//     never auto-joins again until a farmer of the farm turns it back on (join { rejoin: true }).
//   - privacy: neighbours see the farm's name, the first farmer's display name and colour, online / visitor counts, the
//     thumbnail (tile kinds only) and the read-only farm view. A public valley's visitor gets no chat (neither the log
//     in the welcome nor live lines, server/world/sessions.js), and no key, hash or other farm id.
//   - retention: a public valley does NOT exempt its farms from the farm sweep (registry keep()): they age out like any
//     farm, and prune() (every sweep) drops members whose farm is gone; an empty valley is removed.
//
// Storage: the valleys are ordinary world files (<HH_DATA_DIR>/worlds/<uuid>.json, kind 'public'); the opt-out list is
// <HH_DATA_DIR>/worlds/.valley.json { v: 1, out: [farmId] } (a dot name: the world scan skips it).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sha256, newSecret } from '../farm-sessions.js';
import { KEYS_KEPT, worldTag } from './registry.js';
import { ownFarmName } from '../../shared/brand.js';

const NAME_FALLBACK = 'Farmer';
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const LOCK = '#valley';                                  // one lock for every assignment (not a valid wid: no clash)
export const farmHash = (farmId) => sha256(`farm|${farmId}`);

function writeJsonSync(file, obj) {
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(obj));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

/** The in-process state of a loaded farm, or null (asleep, or a modded farm in a worker thread). */
export const stateOf = (rec) => (rec && rec.host && rec.host.kind === 'local' && rec.hh ? rec.hh.sessions.state : null);

/** What a neighbour may see of a farm's people: { name, farmName, color } from its state (null fields when unknown). */
export function faceOf(state) {
  if (!state || !state.players) return null;
  const first = Object.keys(state.players).sort()[0];
  const p = first ? state.players[first] : null;
  const farmName = ownFarmName(state) ?? '';                 // the game's default name is no name
  return {
    name: (p && typeof p.name === 'string' && p.name.trim()) || null,
    color: p && COLOR_RE.test(String(p.color)) ? p.color : null,
    farmName: farmName || null,
  };
}

export class Valley {
  /** @param {{ world: import('./registry.js').WorldRegistry, max?: number }} o */
  constructor({ world, max = 8 }) {
    this.world = world;
    this.reg = world.reg;
    this.log = world.log;
    this.max = max;
    this.file = path.join(world.root, '.valley.json');
    this.out = new Set();
  }

  load() {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const id of Array.isArray(j.out) ? j.out : []) if (typeof id === 'string') this.out.add(id);
    } catch (err) {
      if (err.code !== 'ENOENT') this.log.warn('the valley opt-out list could not be read; nobody is opted out', { err: err.message });
    }
    return this;
  }

  saveOut() { writeJsonSync(this.file, { v: 1, out: [...this.out] }); }

  get valleys() { return [...this.world.worlds.values()].filter((w) => w.kind === 'public'); }

  /** The world `farmId` belongs to: { w, m } or null. */
  placeOf(farmId) {
    const at = this.world.byFarm.get(farmId);
    const w = at ? this.world.world(at.wid) : null;
    const m = w ? w.members.find((x) => x.seat === at.seat) : null;
    return m ? { w, m } : null;
  }

  live(w) { return w.members.filter((m) => m.farmId && this.reg.has(m.farmId) && !this.out.has(m.farmId)); }

  /** The newest public valley with room, or null. */
  pick() {
    const open = this.valleys.filter((w) => this.live(w).length < this.max);
    open.sort((a, b) => b.createdAt - a.createdAt || (a.wid < b.wid ? 1 : -1));
    return open[0] ?? null;
  }

  freeSeat(w) {
    const taken = new Set(w.members.map((m) => m.seat));
    for (let s = 1; s <= this.max; s++) if (!taken.has(s)) return s;
    return null;
  }

  /**
   * A farmer of farm `farmId` (member key `key`) opens their farm: the farm joins a public valley (or stays in its
   * own), and this device gets a world key for it. `worldKey`: the key this device already holds (kept when it is
   * still this farm's); `rejoin`: turn an opt-out off first.
   *   -> { wid, worldKey, seat, farmId, kind: 'public', created } | { out: true }
   *    | { error: 'NOT_FOUND' | 'AUTH' | 'CALL' | 'FULL' | 'UNAVAILABLE' }
   */
  async join(farmId, key, { worldKey = null, rejoin = false } = {}) {
    let rec;
    try { rec = await this.reg.acquire(farmId); } catch { return { error: 'UNAVAILABLE' }; }
    if (!rec) return { error: 'NOT_FOUND' };
    let g;
    try { g = await rec.host.call('grantOf', key); } catch { return { error: 'UNAVAILABLE' }; }
    if (!g || g.kind !== 'member') return { error: 'AUTH' };
    return this.world.lock(LOCK, () => {
      if (rejoin && this.out.delete(farmId)) this.saveOut();
      const at = this.placeOf(farmId);
      if (at && at.w.kind !== 'public') return { error: 'CALL' };
      if (this.out.has(farmId)) return { out: true };
      const face = faceOf(stateOf(rec));
      const now = this.world.wall();
      let w;
      let m;
      let created = false;
      if (at) {
        ({ w, m } = at);
        // this device's key is still one of this farm's: nothing to write
        const had = worldKey ? this.world.memberOfKey(worldKey) : null;
        if (had && had.world === w && had.member === m) {
          this.refresh(m, face);
          this.world.touch(w.wid);
          return { wid: w.wid, worldKey, seat: m.seat, farmId, kind: 'public', created: false };
        }
      } else {
        w = this.pick();
        if (!w) {
          if (this.world.worlds.size >= this.world.wc.maxWorlds) return { error: 'FULL' };
          w = { v: 1, wid: crypto.randomUUID(), kind: 'public', roomKey: null, title: null, tz: null, createdAt: now, lastSeenAt: now, members: [] };
          this.world.save(w);
          this.world.index(w);
          this.log.info('a public valley was opened', { world: worldTag(w.wid), worlds: this.world.worlds.size });
        }
        const seat = this.freeSeat(w);
        if (seat === null) {
          // every seat is held by a farm that is gone or opted out: take the first such seat
          const dead = w.members.find((x) => !this.live(w).includes(x));
          if (!dead) return { error: 'FULL' };
          this.drop(w, dead);
        }
        m = { fh: farmHash(farmId), seat: this.freeSeat(w), name: NAME_FALLBACK, farmName: null, color: null, role: 'farmer', farmId,
          joinedAt: now, lastLaunchAt: now, keys: [] };
        w.members.push(m);
        this.world.byFarm.set(farmId, { wid: w.wid, seat: m.seat });
        created = true;
      }
      this.refresh(m, face);
      const fresh = newSecret();
      const h = sha256(fresh);
      const old = m.keys || [];
      m.keys = [...old, h].slice(-KEYS_KEPT);
      for (const x of old) if (!m.keys.includes(x)) this.world.byKey.delete(x);
      this.world.byKey.set(h, { wid: w.wid, seat: m.seat });
      m.lastLaunchAt = now;
      w.lastSeenAt = now;
      this.world.save(w);
      if (created) this.log.info('a farm joined a public valley', { world: worldTag(w.wid), seat: m.seat, farms: this.live(w).length });
      return { wid: w.wid, worldKey: fresh, seat: m.seat, farmId, kind: 'public', created };
    });
  }

  /** The stored face follows the farm's state (written with the next save of the valley). */
  refresh(m, face) {
    if (!face) return;
    if (face.name) m.name = face.name;
    m.color = face.color;
    m.farmName = face.farmName;
  }

  /** Member `m` leaves valley `w` (in memory and on disk; the valley file goes when it is empty). */
  drop(w, m) {
    this.world.unindex(w);
    w.members = w.members.filter((x) => x !== m);
    if (w.members.length) {
      this.world.save(w);
      this.world.index(w);
    } else {
      fs.rmSync(this.world.file(w.wid), { force: true });
    }
  }

  /** "Show my farm in the valley" off: out of its valley now, never auto-joined again. Auth as join. */
  async leave(farmId, key) {
    let rec;
    try { rec = await this.reg.acquire(farmId); } catch { return { error: 'UNAVAILABLE' }; }
    if (!rec) return { error: 'NOT_FOUND' };
    let g;
    try { g = await rec.host.call('grantOf', key); } catch { return { error: 'UNAVAILABLE' }; }
    if (!g || g.kind !== 'member') return { error: 'AUTH' };
    return this.world.lock(LOCK, () => {
      const at = this.placeOf(farmId);
      if (at && at.w.kind !== 'public') return { error: 'CALL' };
      if (!this.out.has(farmId)) {
        this.out.add(farmId);
        this.saveOut();
      }
      if (at) {
        this.drop(at.w, at.m);
        this.log.info('a farm left its public valley', { world: worldTag(at.w.wid) });
      }
      return { ok: true, out: true };
    });
  }

  /**
   * The valley as one member sees it. Only what a stranger may see: seat, the farm's name, its first farmer's name and
   * colour, online, how many are looking at it, and the farm id a visit needs. No role, no "who visits whom".
   */
  roster(w, me) {
    const members = this.live(w).sort((a, b) => a.seat - b.seat).map((m) => {
      const rec = this.reg.rec(m.farmId);
      this.refresh(m, faceOf(stateOf(rec)));
      let online = false;
      try { online = Boolean(rec && rec.host && rec.host.status().online.length); } catch { online = false; }
      let visitors = 0;
      for (const [k, v] of this.world.visits) if (k.startsWith(`${w.wid}|`) && v.has(m.farmId)) visitors++;
      return { seat: m.seat, name: m.name || NAME_FALLBACK, farmName: m.farmName ?? null, color: m.color ?? null, farmId: m.farmId,
        online, visiting: null, visitors, self: m.seat === me.seat };
    });
    return { wid: w.wid, kind: 'public', title: null, max: this.max, me: { seat: me.seat, farmId: me.farmId }, members };
  }

  /** Every sweep: members whose farm is gone (or opted out) leave; an empty valley goes; stale opt-outs are forgotten. */
  prune() {
    let n = 0;
    for (const w of this.valleys) {
      const live = this.live(w);
      for (const m of w.members.filter((x) => !live.includes(x))) { this.drop(w, m); n++; }
    }
    let changed = false;
    for (const id of [...this.out]) if (!this.reg.has(id)) { this.out.delete(id); changed = true; }
    if (changed) {
      try { this.saveOut(); } catch (err) { this.log.error('the valley opt-out list could not be written', err.message); }
    }
    return n;
  }
}
