// The farm's game speed (OnFire): how fast game time runs on this farm (crops, animals, workshops, the sky, the
// calendar). One clock per farm on the server (server/clock.js); only the farm's owner (its first farmer, p1: the
// creator) may change it, and everyone on the farm, visitors too, runs at the speed the server says.
//
//   const speed = createGameSpeed({ clock, send, me, players })
//   speed.welcome(w)          a welcome: seed the real-time estimate and take the farm's rate
//   speed.clockFrame(m)       a `clock` frame: the new rate (or, with code OWNER_ONLY, the unchanged one)
//   speed.speed()             the current speed (1 = real time)
//   speed.owner()             the owner's pid, or null
//   speed.canSet()            this farmer is the owner
//   speed.set(v)              ask the server (one of SPEEDS; ignored when not the owner or already that speed)
//   speed.on(fn({ speed, by, refused })) -> off
import { MSG, SPEEDS } from '../../../shared/net/protocol.js';

export { SPEEDS };

/** The i18n key of a game speed: 0.5 -> settings.speed.x0_5 (en/settings.js). */
export const speedKey = (v) => `settings.speed.x${String(v).replace('.', '_')}`;

/** The owner of a farm state: its first farmer by slot (p1), as the server decides (server/sessions.js ownerPid). */
export const ownerOf = (state) => (state && state.players ? Object.keys(state.players).sort()[0] ?? null : null);

/**
 * @param {object} o
 * @param {import('../../../shared/net/clock.js').ClockSync} o.clock
 * @param {(msg: object) => void} o.send     a raw frame to the server
 * @param {() => string | null} o.me         this tab's farmer (null for a visitor)
 * @param {() => object | null} o.state      the farm state (for the owner)
 * @param {() => number} [o.perf]            performance.now()
 */
export function createGameSpeed({ clock, send, me, state, perf = () => performance.now() }) {
  const subs = new Set();
  const emit = (e) => { for (const fn of [...subs]) { try { fn(e); } catch (err) { console.error('game speed listener failed', err); } } };

  const api = {
    welcome(w) {
      clock.seed(Number.isFinite(w.realNow) ? w.realNow : w.serverNow, perf());
      const before = clock.speed;
      clock.setRate(w.rate ?? null);
      if (clock.speed !== before) emit({ speed: clock.speed, by: null, refused: false });
    },
    clockFrame(m) {
      const before = clock.speed;
      clock.setRate(m.rate ?? null);
      // the rate moved the game clock's anchor, not the real-time estimate: no reseed, the pings keep it
      emit({ speed: clock.speed, by: m.by ?? null, refused: m.code === 'OWNER_ONLY', changed: clock.speed !== before });
    },
    speed: () => clock.speed,
    owner: () => ownerOf(state()),
    canSet: () => Boolean(me()) && me() === ownerOf(state()),
    set(v) {
      if (!SPEEDS.includes(v) || !api.canSet() || v === clock.speed) return false;
      send({ t: MSG.SPEED, speed: v });
      return true;
    },
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
  return api;
}
