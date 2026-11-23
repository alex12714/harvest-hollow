// Worlds ("Hollow Valley", 01-engine-multiplayer.md §4 design B′): a world groups 2-8 ordinary single-owner farms for one
// OnFire call room. Each farm stays an ordinary farm of the FarmRegistry (its own engine, journal, snapshots); the world
// only knows who is in it, which farm is theirs, and the keys that let a member look at a neighbour's farm.
//
//   <HH_DATA_DIR>/worlds/<wid>.json
//     { v: 1, wid, roomKey | null, title | null, tz | null, createdAt, lastSeenAt,
//       members: [{ fh, seat, name, role, farmId, joinedAt, lastLaunchAt, keys: [sha256(worldKey) ...] }] }
//
//   wid       the world id. OnFire mints it (farm_worlds.id, a uuid) and it arrives inside the join token; a world the
//             host has never seen is created on its first launch. PUT /api/s2s/worlds/:roomKey can also create one
//             (then the host picks a uuid) or register OnFire's wid for a room key ahead of time.
//   fh        sha256('fid|' + fid): the stable farmer id from the token (u:<user uuid> | g:<guest hash>) is never stored
//   seat      1..HH_WORLD_MAX, kept for life; a member's farm is created on their first launch and reused after
//   keys      world keys (256-bit, hex): the launch hands one out; it authorises the roster and visitor sockets on the
//             neighbours' farms. The newest 8 per member are kept, as hashes.
//
// Retention: while a world lives its farms are exempt from the farm sweep (keep()); a world nobody launched or visited
// for HH_WORLD_TTL_DAYS is forgotten, and its farms then follow HH_FARM_TTL_DAYS again. No farm id, fid, key or hash is
// logged (a world's log tag is the first 8 hex of sha256(wid)).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sha256, newSecret, sameHash } from '../farm-sessions.js';
import { WID_RE } from './token.js';

export const ROOM_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
export const KEYS_KEPT = 8;
const SEEN_WRITE_MS = 10 * 60_000;
export const worldTag = (wid) => sha256(`w|${wid}`).slice(0, 8);
export const fidHash = (fid) => sha256(`fid|${fid}`);

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

/** The FarmSessions of a loaded in-process farm (a modded farm in a worker thread is not supported by the world layer). */
const sessionsOf = (rec) => (rec && rec.host && rec.host.kind === 'local' && rec.hh ? rec.hh.sessions : null);

export class WorldRegistry {
  /**
   * @param {{ wc: object, reg: import('../farms.js').FarmRegistry, log: object, dataDir: string, wall?: () => number }} o
   */
  constructor({ wc, reg, log, dataDir, wall = Date.now }) {
    Object.assign(this, { wc, reg, log, wall });
    this.root = path.join(dataDir, 'worlds');
    this.worlds = new Map();          // wid -> world
    this.byRoom = new Map();          // roomKey -> wid
    this.byFarm = new Map();          // farmId -> { wid, seat }
    this.byKey = new Map();           // sha256(worldKey) -> { wid, seat }
    this.visits = new Map();          // `${wid}|${seat}` -> Map(farmId -> sockets)
    this.locks = new Map();           // wid -> Promise (launches of one world run one at a time)
    this.seenWrittenAt = new Map();
  }

  scan() {
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    for (const f of fs.readdirSync(this.root)) {
      const m = /^(.+)\.json$/.exec(f);
      if (!m || !WID_RE.test(m[1])) continue;
      try {
        const w = JSON.parse(fs.readFileSync(path.join(this.root, f), 'utf8'));
        if (!w || w.wid !== m[1] || !Array.isArray(w.members)) throw new Error('not this world\'s file');
        this.index(w);
      } catch (err) {
        this.log.warn('a world file could not be read; skipped', { world: worldTag(m[1]), err: err.message });
      }
    }
    return this.worlds.size;
  }

  index(w) {
    this.worlds.set(w.wid, w);
    if (w.roomKey) this.byRoom.set(w.roomKey, w.wid);
    for (const m of w.members) {
      if (m.farmId) this.byFarm.set(m.farmId, { wid: w.wid, seat: m.seat });
      for (const h of m.keys || []) this.byKey.set(h, { wid: w.wid, seat: m.seat });
    }
  }

  unindex(w) {
    this.worlds.delete(w.wid);
    if (w.roomKey && this.byRoom.get(w.roomKey) === w.wid) this.byRoom.delete(w.roomKey);
    for (const m of w.members) {
      if (m.farmId) this.byFarm.delete(m.farmId);
      for (const h of m.keys || []) this.byKey.delete(h);
    }
  }

  get count() { return this.worlds.size; }
  file(wid) { return path.join(this.root, `${wid}.json`); }
  save(w) { writeJsonSync(this.file(w.wid), w); }
  world(wid) { return typeof wid === 'string' && this.worlds.has(wid) ? this.worlds.get(wid) : null; }

  /** Run fn with the world's lock held (two launches of one person must not make two farms). */
  lock(wid, fn) {
    const prev = this.locks.get(wid) || Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    const tail = run.catch(() => {});
    this.locks.set(wid, tail);
    tail.then(() => { if (this.locks.get(wid) === tail) this.locks.delete(wid); });
    return run;
  }

  make(wid, { roomKey = null, title = null, tz = null } = {}) {
    const now = this.wall();
    const w = { v: 1, wid, roomKey, title, tz, createdAt: now, lastSeenAt: now, members: [] };
    this.save(w);
    this.index(w);
    this.log.info('a world was created', { world: worldTag(wid), worlds: this.worlds.size });
    return w;
  }

  /**
   * PUT /api/s2s/worlds/:roomKey: the world of a call room, created on first use. `wid` (optional): OnFire's own id for
   * it (farm_worlds.id). -> { world, created } | { error: 'CONFLICT' | 'FULL' }
   */
  ensureRoom(roomKey, { wid = null, title = null, tz = null } = {}) {
    const had = this.byRoom.get(roomKey);
    if (had) {
      if (wid && wid !== had) return { error: 'CONFLICT' };
      const w = this.worlds.get(had);
      let dirty = false;
      if (title && w.title !== title) { w.title = title; dirty = true; }
      if (tz && w.tz !== tz) { w.tz = tz; dirty = true; }
      if (dirty) this.save(w);
      return { world: w, created: false };
    }
    if (wid && this.worlds.has(wid)) {
      const w = this.worlds.get(wid);
      if (w.roomKey && w.roomKey !== roomKey) return { error: 'CONFLICT' };
      w.roomKey = roomKey;
      if (title) w.title = title;
      if (tz) w.tz = tz;
      this.save(w);
      this.byRoom.set(roomKey, wid);
      return { world: w, created: false };
    }
    if (this.worlds.size >= this.wc.maxWorlds) return { error: 'FULL' };
    return { world: this.make(wid || crypto.randomUUID(), { roomKey, title, tz }), created: true };
  }

  freeSeat(w) {
    const taken = new Set(w.members.map((m) => m.seat));
    for (let s = 1; s <= this.wc.maxMembers; s++) if (!taken.has(s)) return s;
    return null;
  }

  /**
   * A verified join token's claims -> this person's own farm in the token's world, seated and named, plus a device key
   * for it and a world key: { wid, farmId, key, worldKey, seat, name, role, created } | { error: 'FULL' | 'UNAVAILABLE' }.
   * Their farm is created on the first launch (the farmer sits down as p1 with the token's name: no slot picker) and
   * reused on every later one (a new device key each time, the farm's other keys keep working). Durable before it
   * resolves: the farm's save carries the key, the world file the world key.
   */
  launch(claims) {
    return this.lock(claims.wid, async () => {
      let w = this.world(claims.wid);
      if (!w) {
        if (this.worlds.size >= this.wc.maxWorlds) return { error: 'FULL' };
        w = this.make(claims.wid);
      }
      const fh = fidHash(claims.fid);
      let m = w.members.find((x) => sameHash(x.fh, fh)) || null;
      if (!m && w.members.length >= this.wc.maxMembers) return { error: 'FULL' };
      const name = claims.name || 'Farmer';
      const now = this.wall();
      let rec = m && m.farmId ? this.reg.rec(m.farmId) : null;
      let key;
      let created = false;
      if (!rec) {
        // first launch, or their farm was deleted (by them, or by the farm sweep after the world was forgotten)
        if (this.reg.count >= this.reg.mc.maxFarms) return { error: 'FULL' };
        const seat = m ? m.seat : this.freeSeat(w);
        if (seat === null) return { error: 'FULL' };
        let made;
        try { made = await this.reg.create({ tz: w.tz }); } catch { return { error: 'UNAVAILABLE' }; }
        rec = await this.reg.acquire(made.id).catch(() => null);
        const s = sessionsOf(rec);
        const err = s ? s.seatOwner(name, made.secret) : 'UNAVAILABLE';
        if (err) {
          this.log.error('a world member\'s new farm could not seat its owner', { world: worldTag(w.wid), code: err });
          return { error: 'UNAVAILABLE' };
        }
        key = made.secret;
        created = true;
        if (m) {
          if (m.farmId) this.byFarm.delete(m.farmId);
          m.farmId = made.id;
        } else {
          m = { fh, seat, name, role: claims.role, farmId: made.id, joinedAt: now, lastLaunchAt: now, keys: [] };
          w.members.push(m);
        }
        this.byFarm.set(made.id, { wid: w.wid, seat: m.seat });
      } else {
        rec = await this.reg.acquire(m.farmId).catch(() => null);
        const s = sessionsOf(rec);
        if (!s) return { error: 'UNAVAILABLE' };
        key = newSecret();
        try { await s.addOwnerKey(key); } catch { return { error: 'UNAVAILABLE' }; }
      }
      const worldKey = newSecret();
      const h = sha256(worldKey);
      const old = m.keys || [];
      m.keys = [...old, h].slice(-KEYS_KEPT);
      for (const x of old) if (!m.keys.includes(x)) this.byKey.delete(x);
      this.byKey.set(h, { wid: w.wid, seat: m.seat });
      m.name = name;
      m.role = claims.role;
      m.lastLaunchAt = now;
      w.lastSeenAt = now;
      this.save(w);
      this.log.info(created ? 'a world member got their farm' : 'a world member came back', { world: worldTag(w.wid), seat: m.seat });
      return { wid: w.wid, farmId: m.farmId, key, worldKey, seat: m.seat, name, role: m.role, created };
    });
  }

  /** The member a world key belongs to: { world, member } | null. */
  memberOfKey(key) {
    if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) return null;
    const at = this.byKey.get(sha256(key));
    const w = at ? this.world(at.wid) : null;
    const m = w ? w.members.find((x) => x.seat === at.seat) : null;
    return m ? { world: w, member: m } : null;
  }

  /**
   * A visitor socket's key on farm `farmId`: { wid, seat, name } when the key's member is in the world this farm belongs
   * to and the farm is not their own (their own farm takes their member key); else null.
   */
  visitorFor(farmId, key) {
    const got = this.memberOfKey(key);
    if (!got) return null;
    const at = this.byFarm.get(farmId);
    if (!at || at.wid !== got.world.wid || got.member.farmId === farmId) return null;
    return { wid: got.world.wid, seat: got.member.seat, name: got.member.name };
  }

  /** A visitor socket opened (+1) or closed (-1) on farm `farmId`. */
  visit(wid, seat, farmId, d) {
    const k = `${wid}|${seat}`;
    let m = this.visits.get(k);
    if (!m) this.visits.set(k, (m = new Map()));
    const n = (m.get(farmId) || 0) + d;
    if (n > 0) m.set(farmId, n); else m.delete(farmId);
    if (!m.size) this.visits.delete(k);
    this.touch(wid);
  }

  /** Somebody is in the world now: its lastSeenAt moves (written at most every 10 min). */
  touch(wid) {
    const w = this.world(wid);
    if (!w) return;
    const now = this.wall();
    w.lastSeenAt = now;
    if (now - (this.seenWrittenAt.get(wid) || 0) >= SEEN_WRITE_MS) {
      this.seenWrittenAt.set(wid, now);
      try { this.save(w); } catch (err) { this.log.error('world file write failed', { world: worldTag(wid) }, err.message); }
    }
  }

  /** The world's members as one member sees them (GET /api/w/roster). */
  roster(w, me) {
    const members = [...w.members].sort((a, b) => a.seat - b.seat).map((m) => {
      const rec = m.farmId ? this.reg.rec(m.farmId) : null;
      let online = false;
      try { online = Boolean(rec && rec.host && rec.host.status().online.length); } catch { online = false; }
      const vis = this.visits.get(`${w.wid}|${m.seat}`);
      const visiting = vis && vis.size ? [...vis.keys()].pop() : null;
      let visitors = 0;
      for (const [k, v] of this.visits) if (k.startsWith(`${w.wid}|`) && m.farmId && v.has(m.farmId)) visitors++;
      return { seat: m.seat, name: m.name, role: m.role, farmId: rec ? m.farmId : null, online, visiting, visitors,
        self: m.seat === me.seat };
    });
    return { wid: w.wid, title: w.title, max: this.wc.maxMembers, me: { seat: me.seat, farmId: me.farmId }, members };
  }

  /** True while `farmId` belongs to a living world (the farm sweep leaves it alone). */
  keep(farmId) { return this.byFarm.has(farmId); }

  /** Forget worlds nobody launched or visited for ttlDays (their farms then follow the farm retention). */
  sweep(now = this.wall()) {
    const ttl = this.wc.ttlDays * 86_400_000;
    if (!(ttl > 0)) return { area: 'worlds', expired: 0 };
    let n = 0;
    for (const w of [...this.worlds.values()]) {
      if (w.members.some((m) => {
        const rec = m.farmId ? this.reg.rec(m.farmId) : null;
        return Boolean(rec && rec.host && rec.host.status().conns);
      })) { this.touch(w.wid); continue; }
      if (now - w.lastSeenAt < ttl) continue;
      this.unindex(w);
      fs.rmSync(this.file(w.wid), { force: true });
      n++;
      this.log.info(`a world nobody opened for ${this.wc.ttlDays} days was forgotten`, { world: worldTag(w.wid) });
    }
    return { area: 'worlds', expired: n };
  }

  /** DELETE: the world and every member farm (or one member and their farm). Resolves how many farms went. */
  async remove(wid, { fid = null } = {}) {
    const w = this.world(wid);
    if (!w) return null;
    return this.lock(wid, async () => {
      const gone = fid ? w.members.filter((m) => sameHash(m.fh, fidHash(fid))) : [...w.members];
      if (fid && !gone.length) return null;
      let farms = 0;
      for (const m of gone) {
        const rec = m.farmId ? this.reg.rec(m.farmId) : null;
        if (rec && (await this.reg.remove(rec))) farms++;
      }
      this.unindex(w);
      if (fid) {
        w.members = w.members.filter((m) => !gone.includes(m));
        this.save(w);
        this.index(w);
      } else {
        fs.rmSync(this.file(wid), { force: true });
      }
      this.log.info(fid ? 'a world member was removed' : 'a world was removed', { world: worldTag(wid), farms });
      return { farms };
    });
  }
}
