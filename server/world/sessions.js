// A world member's farm sessions: everything FarmSessions does, plus VISITORS (01-engine-multiplayer.md §4.1).
//
// A visitor is a member of the same world looking at this farm from their own: hello { proto, cid, token: <world key> }
// (the world key from POST /api/w/launch rides in hello.token, so the shared hello parser is unchanged). The answer is a
// welcome with `visitor: { seat, name }`, `pid: null` and `owner` (the farm's first farmer), then every delta, presence
// row, ghost, peer change and chat line the farmers get. A visitor has no seat on the farm:
//   - act / acts       answered rej SELF_ONLY, one per action (never applied: the server refuses, not just the UI)
//   - ping / resync    answered (pong; a fresh welcome)
//   - mv, ghost, emote, mark, chat   dropped (a visitor has no avatar on this farm in phase 1)
// Visitors do not count as members, are not in the slot list, never trigger _seen / Together / bench facts, and do not
// keep the farm's lastSeenAt fresh. The world registry knows where every member is (the roster's "visiting").
//
// World farms also get two server-side seat operations (server/world/registry.js launch): seatOwner (the new farm's
// creator sits down as p1 with their call name, no socket needed) and addOwnerKey (a device key for p1, durable first).
import { FarmSessions, sha256, sameHash } from '../farm-sessions.js';
import { TOKENS_KEPT } from '../sessions.js';
import { MSG, ERR, PROTOCOL_VERSION, cleanName } from '../../shared/net/protocol.js';
import { CONTENT_HASH } from '../../shared/content/index.js';
import { RULES_VERSION } from '../../shared/rules/version.js';

/** The FarmSessions class of a host with a world layer: visitors are looked up in `world` (a WorldRegistry). */
export function worldSessions(world) {
  return class WorldFarmSessions extends FarmSessions {
    get farmId() { return this.meta && this.meta.id; }

    hello(conn, m) {
      if (conn.visitor) return undefined;                       // a visitor's repeated hello
      if (!conn.pid && !conn.joining && m.token && m.proto === PROTOCOL_VERSION) {
        const v = world.visitorFor(this.farmId, m.token);
        if (v) return this.visit(conn, m, v);
      }
      return super.hello(conn, m);
    }

    visit(conn, m, v) {
      conn.helloAt ??= this.wall();
      conn.visitor = v;
      conn.cid = m.cid;
      world.visit(v.wid, v.seat, this.farmId, +1);
      this.log.info('a neighbour came to look', { seat: v.seat });
      return this.visitWelcome(conn);
    }

    /** The full state for a visitor (on hello and on resync). */
    visitWelcome(conn) {
      clearTimeout(conn.resyncTimer);
      conn.resyncTimer = null;
      this.engine.runDue();
      const owner = Object.keys(this.state.players).sort()[0] ?? null;
      const msg = {
        t: MSG.WELCOME, proto: PROTOCOL_VERSION, pid: null, visitor: { seat: conn.visitor.seat, name: conn.visitor.name }, owner,
        state: this.state, v: this.engine.v, serverNow: this.clock.now(), lastSeq: 0, known: true, rejected: [],
        contentHash: CONTENT_HASH, rulesVersion: RULES_VERSION, peers: this.peers(null), chat: this.chatLog,
      };
      if (this.build) msg.buildHash = this.build;
      this.send(conn, msg, true);
    }

    /** Every frame of a visitor after its hello (server/router.js hands them here). Never throws. */
    visitorFrame(conn, m) {
      const take = (k) => conn.buckets[k].take();
      switch (m.t) {
        case MSG.ACT:
        case MSG.ACTS:
          for (const a of m.t === MSG.ACT ? [m] : m.list) {
            this.send(conn, { t: MSG.REJ, seq: a.seq, code: take('act') ? ERR.SELF_ONLY : ERR.RATE });
          }
          return undefined;
        case MSG.PING:
          if (take('ping')) this.send(conn, { t: MSG.PONG, c: m.c, s: this.clock.now() }, true);
          return undefined;
        case MSG.RESYNC:
          if (take('resync')) this.visitWelcome(conn);
          return undefined;
        default:
          return undefined;
      }
    }

    broadcast(msg, exceptPid = null) {
      const s = JSON.stringify(msg);
      for (const c of this.conns) if ((c.pid && c.pid !== exceptPid) || c.visitor) c.out.push(s);
    }

    presenceOut(msg) {
      super.presenceOut(msg);
      for (const c of this.conns) if (c.visitor && msg.list.length) c.out.presence(msg.ts, msg.list);
    }

    ghostOut(pid, msg) {
      super.ghostOut(pid, msg);
      const s = JSON.stringify(msg);
      for (const c of this.conns) if (c.visitor) c.out.ghost(pid, s);
    }

    close(conn) {
      const v = this.conns.has(conn) ? conn.visitor : null;
      super.close(conn);
      if (v) world.visit(v.wid, v.seat, this.farmId, -1);
    }

    /**
     * The world's new farm: its creator sits down as p1 named `name`, server-side (the creator's secret becomes their
     * member key, journaled with the `_join` line exactly as a socket claim does). Returns null or a refusal code.
     */
    seatOwner(name, secret) {
      const r = this.reservation();
      if (!r || r.slot !== 'p1' || !sameHash(r.hash, sha256(secret))) return 'AUTH';
      const clean = cleanName(name) || 'Farmer';
      const res = this.engine.system('_join', { pid: 'p1', name: clean }, {}, { auth: { p1: { tokenHash: sha256(secret) } } });
      if (!res.ok) return res.code || ERR.INTERNAL;
      this.meta.reserve = null;
      this.meta.members = Object.keys(this.state.players).length;
      this.farm.saveMeta();
      return null;
    }

    /** One more device key for p1 (the newest TOKENS_KEPT stay), snapshotted before it is handed out. */
    async addOwnerKey(key) {
      const a = Object.hasOwn(this.server.auth, 'p1') ? this.server.auth.p1 : null;
      if (!a || !Object.hasOwn(this.state.players, 'p1')) throw new Error('no owner');
      a.extra = [...(Array.isArray(a.extra) ? a.extra : []), sha256(key)].slice(-TOKENS_KEPT);
      await this.save();
    }
  };
}
