#!/usr/bin/env node
// Mint an OnFire join token for a world (dev and test only: in production the OnFire SQL RPC call_stage_farm_join mints
// them, onfiremobile docs/PRD/harvest-hollow/02-call-web-integration.md §3.4). Reads the key from HH_WORLD_SECRET (a plain
// string = key id k1, or a JSON map). Prints the token, or with --url <base> the phone link <base>/join#t=<token>.
//
//   HH_WORLD_SECRET=... node tools/world-mint.mjs --wid <wid> --fid u:<uuid> --name Ana [--role host] [--ttl 60] [--url http://127.0.0.1:3394]
import crypto from 'node:crypto';
import { parseKeys } from '../server/world/config.js';
import { signJoinToken } from '../server/world/token.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const keys = parseKeys(process.env.HH_WORLD_SECRET ?? process.env.HARVEST_JOIN_HMAC_KEYS);
if (!keys) { console.error('set HH_WORLD_SECRET'); process.exit(2); }
const kid = args.kid || Object.keys(keys)[0];
const now = Math.floor(Date.now() / 1000);
const ttl = Math.min(600, Number(args.ttl) || 60);
const payload = { v: 1, kid, iss: 'call.onfire.so', aud: 'harvest', wid: args.wid || crypto.randomUUID(), fid: args.fid || `u:${crypto.randomUUID()}`,
  name: args.name || 'Farmer', role: args.role === 'host' ? 'host' : 'farmer', guest: String(args.fid || '').startsWith('g:'),
  surf: args.url ? 'phone' : 'panel', iat: now, exp: now + ttl, jti: crypto.randomUUID() };
const token = signJoinToken(payload, keys[kid]);
console.log(args.url ? `${args.url.replace(/\/+$/, '')}/join#t=${token}` : token);
