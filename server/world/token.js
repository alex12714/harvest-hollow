// The OnFire join token (contract: onfiremobile docs/PRD/harvest-hollow/02-call-web-integration.md §3.4, minted by the
// SQL RPC call_stage_farm_join). It says "this person, in this call's world, for the next minute":
//
//   token   = base64url(payload_json) + "." + base64url(HMAC-SHA256(key[kid], payload_b64))
//             (the MAC covers the base64url TEXT, so the exact bytes received are verified; the key is used as the
//             UTF-8 bytes of the configured string, as pgcrypto's hmac(text, text, 'sha256') does)
//   payload = { v: 1, kid, iss: 'call.onfire.so', aud: 'harvest', wid, fid: 'u:<uuid>' | 'g:<24 hex>', name, role:
//               'host' | 'farmer', guest, surf: 'panel' | 'phone', iat, exp, jti }
//
// verifyJoinToken checks, in this order: shape, the key id, the MAC (constant time), v / aud / iss, iat <= now + 30 s,
// now < exp, exp - iat <= 600 s, the claims' shapes, the world (when the caller names one), then the jti (single use:
// kept until its exp). Every failure is one answer to the outside: invalid_token. The reason is for tests only and is
// never logged with the token.
import crypto from 'node:crypto';

const B64U_RE = /^[A-Za-z0-9_-]+$/;
export const WID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const FID_RE = /^[ug]:[A-Za-z0-9_-]{8,64}$/;
const JTI_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_TOKEN = 4096;

export const b64u = (buf) => Buffer.from(buf).toString('base64url');
export const hmac = (key, text) => crypto.createHmac('sha256', Buffer.from(key, 'utf8')).update(text, 'utf8').digest();

/** Sign a payload the way the OnFire side does (tests, the dev mint tool). */
export function signJoinToken(payload, key) {
  const p = b64u(JSON.stringify(payload));
  return `${p}.${b64u(hmac(key, p))}`;
}

/** Spent jtis, each kept until its exp (then the token is dead anyway). In memory: a restart forgets them (02 R2). */
export class JtiSet {
  constructor({ max = 100_000 } = {}) {
    this.map = new Map();
    this.max = max;
  }

  has(jti) { return this.map.has(jti); }

  add(jti, expMs) {
    if (this.map.size >= this.max) this.prune(Date.now());
    this.map.set(jti, expMs);
  }

  prune(now) {
    for (const [j, exp] of this.map) if (exp <= now) this.map.delete(j);
  }

  get size() { return this.map.size; }
}

const fail = (why) => ({ ok: false, why });
const int = (n) => Number.isSafeInteger(n);
/** Code points, control characters dropped, trimmed (the SQL side already strips them; belt and braces). */
const cleanName = (s) => [...String(s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')].join('').trim();

/**
 * @param {string} token
 * @param {{ keys: Record<string,string>, now?: number, seen?: JtiSet|null, iss?: string, aud?: string, skewMs?: number,
 *   maxLifeS?: number, wid?: string|null }} o  `seen`: the jti set (null: no single-use check, e.g. a dry verify)
 * @returns {{ ok: true, claims: object } | { ok: false, why: string }}
 */
export function verifyJoinToken(token, o) {
  const { keys, now = Date.now(), seen = null, iss = 'call.onfire.so', aud = 'harvest', skewMs = 30_000, maxLifeS = 600,
    wid = null } = o;
  if (typeof token !== 'string' || token.length > MAX_TOKEN) return fail('shape');
  const parts = token.split('.');
  if (parts.length !== 2 || !B64U_RE.test(parts[0]) || !B64U_RE.test(parts[1])) return fail('shape');
  let c;
  try { c = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return fail('shape'); }
  if (!c || typeof c !== 'object' || Array.isArray(c)) return fail('shape');
  const key = typeof c.kid === 'string' && Object.hasOwn(keys, c.kid) ? keys[c.kid] : null;
  if (!key) return fail('kid');
  const want = hmac(key, parts[0]);
  const got = Buffer.from(parts[1], 'base64url');
  // timingSafeEqual needs equal lengths; comparing against itself keeps the work the same for a wrong length
  const sameLen = got.length === want.length;
  if (!crypto.timingSafeEqual(sameLen ? got : want, want) || !sameLen) return fail('sig');
  if (c.v !== 1 || c.aud !== aud || c.iss !== iss) return fail('claims');
  if (!int(c.iat) || !int(c.exp)) return fail('claims');
  const nowS = now / 1000;
  if (c.iat * 1000 > now + skewMs) return fail('future');
  if (!(nowS < c.exp)) return fail('expired');
  if (c.exp - c.iat > maxLifeS || c.exp <= c.iat) return fail('life');
  if (typeof c.wid !== 'string' || !WID_RE.test(c.wid)) return fail('claims');
  if (typeof c.fid !== 'string' || !FID_RE.test(c.fid)) return fail('claims');
  if (typeof c.jti !== 'string' || !JTI_RE.test(c.jti)) return fail('claims');
  if (c.role !== undefined && c.role !== 'host' && c.role !== 'farmer') return fail('claims');
  if (wid !== null && c.wid !== wid) return fail('world');
  if (seen) {
    if (seen.has(c.jti)) return fail('replay');
    seen.add(c.jti, c.exp * 1000);
  }
  const name = typeof c.name === 'string' ? [...cleanName(c.name)].slice(0, 24).join('') : '';
  return { ok: true, claims: { wid: c.wid, fid: c.fid, name, role: c.role === 'host' ? 'host' : 'farmer', guest: c.guest === true,
    surf: c.surf === 'phone' ? 'phone' : 'panel', iat: c.iat, exp: c.exp, jti: c.jti, kid: c.kid } };
}
