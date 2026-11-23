// The world layer's knobs (OnFire "Hollow Valley", docs: onfiremobile docs/PRD/harvest-hollow/04-world-api.md). Read once
// at boot from the environment, or handed in as cfg.world by tests. The layer is OFF (no routes, no visitors) unless a
// join key is set.
//
//   HH_WORLD_SECRET            the HMAC key the OnFire side signs join tokens with, and that signs server-to-server
//                              calls. Either a plain string (>= 16 characters; it is key id "k1") or a JSON object of
//                              key id -> key ({"k1":"...","k2":"..."}), so a rotation can run two keys for one TTL.
//                              HARVEST_JOIN_HMAC_KEYS (the name 02-call-web-integration.md uses) is read too.
//   HH_WORLD_MAX               farms per world (default 8; the 9th person gets 409 FULL)
//   HH_WORLD_MAX_WORLDS        worlds on this host (default 2000)
//   HH_WORLD_TTL_DAYS          a world nobody launched or visited for this long is forgotten (default 90; 0 = never).
//                              While a world lives, its farms are exempt from the farm retention (HH_FARM_TTL_DAYS);
//                              afterwards they follow it again.
//   HH_WORLD_ISS               the join token's expected issuer (default call.onfire.so)
//   HH_WORLD_EMBED_ORIGINS     comma list: who may post a token into /embed (default call + app2.onfire.so)
//   HH_WORLD_FRAME_ANCESTORS   space list for /embed's frame-ancestors (default call, app, app2.onfire.so)

const DEFAULT_EMBED = ['https://call.onfire.so', 'https://app2.onfire.so'];
const DEFAULT_ANCESTORS = ['https://call.onfire.so', 'https://app.onfire.so', 'https://app2.onfire.so'];
const KID_RE = /^[A-Za-z0-9_-]{1,16}$/;

export class WorldConfigError extends Error {}

/** { kid: key } from the env value, or null when unset. Throws on a value that is set but unusable. */
export function parseKeys(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const s = String(raw).trim();
  let keys;
  if (s.startsWith('{')) {
    try { keys = JSON.parse(s); } catch { throw new WorldConfigError('HH_WORLD_SECRET is not valid JSON'); }
    if (!keys || typeof keys !== 'object' || Array.isArray(keys)) throw new WorldConfigError('HH_WORLD_SECRET must be an object');
  } else {
    keys = { k1: s };
  }
  const out = {};
  for (const [kid, key] of Object.entries(keys)) {
    if (!KID_RE.test(kid)) throw new WorldConfigError('HH_WORLD_SECRET: a key id must be 1-16 of [A-Za-z0-9_-]');
    if (typeof key !== 'string' || key.length < 4) throw new WorldConfigError('HH_WORLD_SECRET: every key must be a string');
    out[kid] = key;
  }
  if (!Object.keys(out).length) throw new WorldConfigError('HH_WORLD_SECRET has no key');
  return Object.freeze(out);
}

const num = (v, def, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new WorldConfigError(`a world setting is out of range: ${v}`);
  return n;
};
const list = (v, def, sep) => (v === undefined || v === '' ? def : String(v).split(sep).map((x) => x.trim()).filter(Boolean));

/** The world settings, or null when no key is configured (the layer stays off). */
export function worldConfig(env = {}) {
  const keys = parseKeys(env.HH_WORLD_SECRET ?? env.HARVEST_JOIN_HMAC_KEYS);
  if (!keys) return null;
  return Object.freeze({
    keys,
    maxMembers: num(env.HH_WORLD_MAX, 8, { min: 1, max: 64 }),
    maxWorlds: num(env.HH_WORLD_MAX_WORLDS, 2000, { min: 1 }),
    ttlDays: num(env.HH_WORLD_TTL_DAYS, 90, { min: 0 }),
    iss: env.HH_WORLD_ISS || 'call.onfire.so',
    aud: 'harvest',
    skewMs: 30_000,              // iat may be this far in the future (02 §3.4)
    maxLifeS: 600,               // exp - iat at most (02 §3.4: phone tokens live 600 s)
    s2sWindowMs: 60_000,         // a server-to-server call's timestamp must be this fresh (01 §6)
    embedOrigins: Object.freeze(list(env.HH_WORLD_EMBED_ORIGINS, DEFAULT_EMBED, ',')),
    frameAncestors: Object.freeze(list(env.HH_WORLD_FRAME_ANCESTORS, DEFAULT_ANCESTORS, /\s+/)),
  });
}
