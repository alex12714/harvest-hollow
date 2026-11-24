// Authoritative server clock (tech-architecture §4.1). Epoch ms, monotonic: game time never runs backwards
// even if the wall clock does (NTP, manual change). `sidecar` is the persisted server.clock object
// ({ lastNow, devOffset }), so the guard and the offset survive a restart.
//
// Game time = wall + devOffset. devOffset is the sum of dev time warps and of absorbed backward wall steps.
// It is KEPT on a production boot (review-m0 M7): zeroing it under a save whose timestamps were written with it
// froze every timer and the partner's avatar for the warped duration. A production server refuses new warps.
//
// Game speed (OnFire, the farm owner's setting): that monotonic wall-rate time is `real()`. Game time `now()` runs
// `speed` times as fast from an anchor { speed, realAt, gameAt } kept in the sidecar as `rate`:
//   now() = gameAt + floor((real() - realAt) * speed)
// A speed change re-anchors at the current game time, so game time is accumulated segment by segment: switching
// never jumps a timer, and the time while the server was off counts at the speed that was set then (the farm keeps
// running at its speed). No `rate` (every farm before this setting, or 1x never changed) is exactly the old clock.
// Presence (avatar walking, interpolation) stays on real(): only the farm's timers run faster.

import { SPEEDS } from '../shared/net/protocol.js';

export { SPEEDS };

/** A backward wall step larger than this is absorbed into the offset instead of freezing game time. */
export const STEP_MS = 5000;


/** A valid persisted or wire rate anchor, or null. */
export function cleanRate(r) {
  if (!r || typeof r !== 'object') return null;
  const { speed, realAt, gameAt } = r;
  if (!SPEEDS.includes(speed) || !Number.isSafeInteger(realAt) || !Number.isSafeInteger(gameAt)) return null;
  return { speed, realAt, gameAt };
}

/** Game time at real time `real` under `rate` (null: the identity). Integer ms. */
export function gameAt(rate, real) {
  return rate ? rate.gameAt + Math.floor((real - rate.realAt) * rate.speed) : real;
}

/** The earliest real time at which game time reaches `game` under `rate`. */
export function realAt(rate, game) {
  return rate ? rate.realAt + Math.ceil((game - rate.gameAt) / rate.speed) : game;
}

export class ServerClock {
  /**
   * @param {{ lastNow: number, devOffset?: number }} sidecar
   * @param {{ dev?: boolean, wall?: () => number, log?: Console }} [opts]
   */
  constructor(sidecar, { dev = false, wall = Date.now, log = console } = {}) {
    this.c = sidecar;
    if (!Number.isFinite(this.c.lastNow)) this.c.lastNow = 0;
    if (!Number.isSafeInteger(this.c.devOffset)) this.c.devOffset = 0;
    const rate = cleanRate(this.c.rate);
    if (rate) this.c.rate = rate; else delete this.c.rate;
    this.dev = dev;
    this.wall = wall;
    this.log = log;
    if (!dev && this.c.devOffset !== 0) {
      log.warn(`\x1b[33mgame time runs ${this.c.devOffset} ms ahead of the wall clock (a dev warp or a clock step `
        + 'saved in this data dir); kept so timers continue smoothly\x1b[0m');
    }
  }

  /** The farm's game speed (1 when never changed). */
  get speed() { return this.c.rate ? this.c.rate.speed : 1; }

  /** The rate anchor for the wire (welcome, the `clock` frame), or null for the identity. */
  rate() { return this.c.rate ? { ...this.c.rate } : null; }

  /** Current game time (integer epoch ms): real() at the farm's speed. */
  now() { return gameAt(this.c.rate, this.real()); }

  /**
   * Set the game speed (one of SPEEDS). Re-anchors at the current game time: nothing jumps. Returns the new rate
   * (null back at the identity is never produced: once changed, the anchor stays, at 1x too).
   */
  setSpeed(speed) {
    if (!SPEEDS.includes(speed)) throw new Error(`speed must be one of ${SPEEDS.join(', ')}`);
    const real = this.real();
    const game = gameAt(this.c.rate, real);
    this.c.rate = { speed, realAt: real, gameAt: game };
    return this.rate();
  }

  /** Real ms until game time advances by `ms` (scheduler delays). */
  realDelay(ms) { return ms <= 0 ? 0 : Math.ceil(ms / this.speed); }

  /** Current wall-rate time (integer epoch ms, monotonic). Presence runs on it. */
  real() {
    const t = Math.floor(this.wall()) + this.c.devOffset;
    const last = this.c.lastNow;
    if (t < last) {
      // Small steps back (NTP slew, jitter) hold game time for their length. A real step (a manual change, an
      // RTC that resynced after resume) is absorbed, so game time continues from where it was (review-m0 M7).
      if (last - t > STEP_MS) {
        this.c.devOffset += last - t;
        this.log.warn(`wall clock went back ${last - t} ms; game time continues from where it was`);
      }
      return last;
    }
    this.c.lastNow = t;
    return t;
  }

  /** Dev-only time warp (HH_DEV=1): jump game time forward by ms. */
  warp(ms) {
    if (!this.dev) throw new Error('warp is dev-only');
    if (!Number.isSafeInteger(ms) || ms <= 0) throw new Error('warp ms must be a positive integer');
    this.c.devOffset += this.realDelay(ms);
    return this.now();
  }

  /** Raise the monotonic floor to game time `t` (journal replay restores it). */
  observe(t) {
    const r = realAt(this.c.rate, t);
    if (r > this.c.lastNow) this.c.lastNow = r;
  }
}
