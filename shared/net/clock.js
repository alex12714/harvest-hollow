// Client estimate of the server clock (FROZEN CONTRACT, tech-architecture §4.2). Cristian/NTP style: keep
// the sample with the smallest round trip, whose error is bounded by +-(RTT - RTTmin)/2. Pure: timestamps
// are parameters (performance.now() on the client), never read here.
//
// Game speed (OnFire): the samples estimate the server's REAL time (pong `r`; `s` from a server without speeds).
// The farm's rate anchor { speed, realAt, gameAt } (welcome.rate, the `clock` frame) maps it to game time:
// serverNow() = gameAt + floor((realNow() - realAt) * speed), the same formula as server/clock.js. Presence
// interpolation runs on realNow(); everything the rules compute runs on serverNow().

export const JUMP_MS = 250;      // a better estimate this far off replaces the offset at once
export const SLEW = 0.2;         // otherwise move 20 % of the way per sample (no visible timer jumps)
export const WINDOW = 8;         // samples kept

export class ClockSync {
  constructor() {
    /** @type {Array<{rtt: number, offset: number}>} */
    this.samples = [];
    /** server epoch ms = perfNow + offset; null until seeded */
    this.offset = null;
    this.rtt = null;
    /** the farm's rate anchor, or null when game time is real time */
    this.rate = null;
  }

  /** The farm's game clock (welcome.rate / the clock frame's rate); null or garbage = real time. */
  setRate(r) {
    const ok = r && typeof r === 'object' && [r.speed, r.realAt, r.gameAt].every((n) => typeof n === 'number' && Number.isFinite(n))
      && r.speed > 0;
    this.rate = ok ? { speed: r.speed, realAt: r.realAt, gameAt: r.gameAt } : null;
  }

  /** The farm's game speed (1 = real time). */
  get speed() { return this.rate ? this.rate.speed : 1; }

  /** Coarse seed from `welcome.serverNow` before the first pong. */
  seed(serverNow, perfNow) {
    if (this.offset === null) this.offset = serverNow - perfNow;
  }

  /**
   * Add one ping sample.
   * @param {number} c0 perf time at send   @param {number} s server epoch at receipt   @param {number} c1 perf time at pong
   */
  add(c0, s, c1) {
    const rtt = Math.max(0, c1 - c0);
    const sample = { rtt, offset: s - (c0 + c1) / 2 };
    const prev = this.samples.at(-1);
    // Two consecutive samples that agree with each other but not with the estimate: the clock base moved (an
    // OS suspend froze performance.now(), the server stepped). Forget the older samples instead of trusting
    // their lower RTT for up to WINDOW more pings (review-m0 L1).
    if (prev && this.offset !== null && Math.abs(sample.offset - this.offset) > JUMP_MS
      && Math.abs(sample.offset - prev.offset) <= (sample.rtt + prev.rtt) / 2 + 5) this.samples = [prev];
    this.samples.push(sample);
    if (this.samples.length > WINDOW) this.samples.shift();
    const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.rtt = best.rtt;
    if (this.offset === null || Math.abs(best.offset - this.offset) > JUMP_MS) this.offset = best.offset;
    else this.offset += (best.offset - this.offset) * SLEW;
  }

  /** Forget samples (after a server time warp or reconnect) but keep the offset until a new sample. */
  reset() { this.samples = []; }

  /** Estimated server REAL epoch ms at perf time `perfNow` (presence time). */
  realNow(perfNow) { return Math.round(perfNow + (this.offset ?? 0)); }

  /** Estimated server GAME epoch ms at perf time `perfNow`, an integer (rules use integer ms). */
  serverNow(perfNow) {
    const real = this.realNow(perfNow);
    const r = this.rate;
    return r ? r.gameAt + Math.floor((real - r.realAt) * r.speed) : real;
  }
}
