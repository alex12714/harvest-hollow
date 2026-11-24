// What a visitor's socket may carry (OnFire "Hollow Valley"; 05-valley-map.md, privacy). A visitor (a call-world
// neighbour or a stranger from a public valley) sees the farm itself, read-only. The text its farmers wrote for each
// other never leaves the server on a visitor socket: not in the welcome's state, not in a delta's ops, not in a
// delta's events.
//
//   - every string under a key named text / note / message / msg is sent as '' (sticky notes' text, gift notes,
//     shelf notes, Memory Book captions, whatever a later feature names that way)
//   - the activity logs are sent as empty containers, and writes into them are dropped: farm.ledger.rows (who sold
//     what, when) and farm.memory.rows (the Memory Book's pages)
//   - chat is never sent to a visitor (server/world/sessions.js), and only these frames go to one at all:
//     delta (redacted), presence, peer, emote, mark, clock (VISITOR_FRAMES)
// The containers stay (an op that writes inside one would otherwise find no parent on the visitor's store), and keys
// stay in place, so the client's store applies every delta it gets exactly as the farmers' stores do.
import { MSG } from '../../shared/net/protocol.js';

export const PRIVATE_KEYS = new Set(['text', 'note', 'message', 'msg']);
export const DROPPED = [['farm', 'ledger', 'rows'], ['farm', 'memory', 'rows']];
export const VISITOR_FRAMES = new Set([MSG.DELTA, MSG.PRESENCE, MSG.PEER, MSG.EMOTE, MSG.MARK, MSG.CLOCK]);

const same = (a, b) => a.length === b.length && a.every((x, i) => String(x) === String(b[i]));
const under = (p, root) => p.length > root.length && root.every((x, i) => String(p[i]) === String(x));

/** A deep copy of `v` (found at `path`) with private text blanked and dropped logs emptied. */
export function redactValue(v, path = []) {
  if (DROPPED.some((d) => same(path, d))) return Array.isArray(v) ? [] : {};
  if (v === null || typeof v !== 'object') {
    return typeof v === 'string' && path.length && PRIVATE_KEYS.has(String(path.at(-1))) ? '' : v;
  }
  if (Array.isArray(v)) return v.map((x, i) => redactValue(x, [...path, i]));
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = redactValue(x, [...path, k]);
  return out;
}

/** The state a visitor's welcome carries. */
export const redactState = (state) => redactValue(state, []);

/** An event of a delta, without its private text. */
export function redactEvent(ev) {
  if (!ev || typeof ev !== 'object') return ev;
  const out = {};
  for (const [k, x] of Object.entries(ev)) if (!PRIVATE_KEYS.has(k)) out[k] = x;
  return out;
}

/** A delta as a visitor gets it: ops inside a dropped log removed, every other op's value redacted, events cleaned. */
export function redactDelta(d) {
  const ops = [];
  for (const op of d.ops || []) {
    const p = Array.isArray(op.p) ? op.p : [];
    if (DROPPED.some((root) => under(p, root))) continue;
    ops.push(op.o === 's' ? { ...op, v: redactValue(op.v, p) } : op);
  }
  return { ...d, ops, ev: Array.isArray(d.ev) ? d.ev.map(redactEvent) : d.ev };
}
