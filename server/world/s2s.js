// Server-to-server request signatures (01-engine-multiplayer.md §6): the OnFire backend signs every /api/s2s/* call.
//
//   X-HH-S2S-Ts:  <unix ms>
//   X-HH-S2S-Kid: <key id>            optional; default the first configured key
//   X-HH-S2S-Sig: hex(HMAC-SHA256(key, ts + "\n" + METHOD + "\n" + path + "\n" + hex(sha256(body))))
//
// `path` is the request's full path with its query as the client sent it (req.originalUrl: under a base path it includes
// the base, e.g. /g/farm/api/s2s/worlds/abc). An empty body hashes the empty string. A timestamp more than 60 s away
// from this server's clock is refused, and so is a signature seen in the last 2 minutes (replay). Comparisons are
// constant time. Every failure answers 401 { error: 'AUTH' }; nothing about the key, the signature or the body is logged.
import crypto from 'node:crypto';
import { hmac } from './token.js';

const SIG_RE = /^[a-f0-9]{64}$/;
export const sha256hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** The string a caller signs. */
export const s2sBase = (ts, method, path, body) => `${ts}\n${method.toUpperCase()}\n${path}\n${sha256hex(body ?? '')}`;

/** Sign a call (tests, the dev tool, and the reference for the OnFire side). */
export function signS2s(key, { ts = Date.now(), method, path, body = '' }) {
  return { 'x-hh-s2s-ts': String(ts), 'x-hh-s2s-sig': hmac(key, s2sBase(ts, method, path, body)).toString('hex') };
}

/** Signatures seen recently (replay protection). */
export class SeenSigs {
  constructor(ttlMs = 120_000) {
    this.ttlMs = ttlMs;
    this.map = new Map();
  }

  /** True when `sig` is new (and now remembered). */
  take(sig, now) {
    for (const [s, at] of this.map) { if (now - at < this.ttlMs) break; this.map.delete(s); }   // insertion order = time order
    if (this.map.has(sig)) return false;
    this.map.set(sig, now);
    return true;
  }
}

/**
 * Verify one request. `body` is the raw body Buffer (or '' for none).
 * @returns {{ ok: true, kid: string } | { ok: false, why: string }}
 */
export function verifyS2s(req, body, { keys, windowMs = 60_000, seen, now = Date.now() }) {
  const ts = Number(req.headers['x-hh-s2s-ts']);
  const sig = String(req.headers['x-hh-s2s-sig'] ?? '').toLowerCase();
  const kidH = req.headers['x-hh-s2s-kid'];
  const kid = typeof kidH === 'string' && kidH ? kidH : Object.keys(keys)[0];
  if (!Object.hasOwn(keys, kid)) return { ok: false, why: 'kid' };
  if (!Number.isSafeInteger(ts) || !SIG_RE.test(sig)) return { ok: false, why: 'shape' };
  if (Math.abs(now - ts) > windowMs) return { ok: false, why: 'skew' };
  const want = hmac(keys[kid], s2sBase(ts, req.method, req.originalUrl, body));
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), want)) return { ok: false, why: 'sig' };
  if (!seen.take(sig, now)) return { ok: false, why: 'replay' };
  return { ok: true, kid };
}
