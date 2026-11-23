// A farm's valley-map thumbnail (OnFire "Hollow Valley", valley step 1; 05-valley-map.md): the farmable 48 x 48 core
// as one character per tile, computed from the farm's state on the server, drawn by the client as a tiny top-down
// canvas (public/js/world/thumb-draw.js). About 2.3 KB per farm instead of a visitor socket and a welcome (13-150 KB)
// and a second WebGL renderer per neighbour.
//
//   farmThumb(state, now) -> { v: 1, x0, z0, w, h, tiles, crops }   (a square around the farm's land, frame())
//     tiles   w * h characters, row by row (z outer, x inner):
//               '.' wild (not the farm's land yet)   ',' grass (owned land)   '=' path
//               '_' a plot without a crop            '#' a building or landmark   '%' an animal home
//               '^' a tree                           '*' debris (rock, stump, weed, log)   '+' decor, fence, a crate
//               'a'..'z' a growing crop, 'A'..'Z' a ripe one: the letter's index in `crops`
//     crops   the crops' colours ('#rrggbb', the content's crop hue), at most 26
//
// Tile kinds only: no names, no items, no ids, nothing a farmer typed.
import { FARM_MIN, FARM_MAX, WORLD_TILES } from '../../shared/content/config.js';
import { defOf, cropOf } from '../../shared/content/index.js';
import { getGrid, inLand, landRects } from '../../shared/rules/grid.js';

const MARGIN = 3;                 // wild tiles around the farm's land
const MIN_SIDE = 24;

/** The square of the farmable core the thumbnail shows: the farm's land and a little wild around it (a starter farm
 *  fills its plot instead of sitting small in the middle of 48 x 48 tiles of locked land). */
export function frame(state) {
  let ax = Infinity; let az = Infinity; let bx = -Infinity; let bz = -Infinity;
  for (const [x, z, w, d] of landRects(state)) {
    ax = Math.min(ax, x); az = Math.min(az, z); bx = Math.max(bx, x + w); bz = Math.max(bz, z + d);
  }
  const core = FARM_MAX - FARM_MIN;
  if (!Number.isFinite(ax)) return { x0: FARM_MIN, z0: FARM_MIN, w: core, h: core };
  const side = Math.min(core, Math.max(MIN_SIDE, bx - ax + 2 * MARGIN, bz - az + 2 * MARGIN));
  const clamp = (v) => Math.max(FARM_MIN, Math.min(FARM_MAX - side, v));
  const x0 = clamp(Math.round((ax + bx - side) / 2));
  const z0 = clamp(Math.round((az + bz - side) / 2));
  return { x0, z0, w: side, h: side };
}

const KIND = { plot: '_', landmark: '#', building: '#', home: '%', tree: '^', debris: '*', decor: '+', crate: '+', gift: '+' };
const HUE_RE = /^#[0-9a-fA-F]{6}$/;

export function farmThumb(state, now = Date.now()) {
  const { x0, z0, w, h } = frame(state);
  const g = getGrid(state);
  const objs = state.farm.objects;
  const crops = [];
  const cropIdx = new Map();
  const out = new Array(w * h);
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const tx = x0 + x;
      const tz = z0 + z;
      const i = tz * WORLD_TILES + tx;
      const id = g.object[i] ?? g.ground[i] ?? null;
      const o = id ? objs[id] : null;
      const def = o ? defOf(o.def) : null;
      let c;
      if (!def) c = inLand(state, tx, tz) ? ',' : '.';
      else if (def.layer === 'ground' && def.kind === 'decor') c = '=';
      else if (def.kind === 'plot' && o.crop && o.crop.def) {
        let k = cropIdx.get(o.crop.def);
        if (k === undefined) {
          k = crops.length < 26 ? crops.length : 25;
          if (crops.length < 26) {
            const hue = cropOf(o.crop.def)?.hue;
            crops.push(HUE_RE.test(String(hue)) ? hue : '#7FB24A');
          }
          cropIdx.set(o.crop.def, k);
        }
        const ripe = Number.isFinite(o.crop.readyAt) && now >= o.crop.readyAt;
        c = String.fromCharCode((ripe ? 65 : 97) + k);
      } else c = KIND[def.kind] ?? '+';
      out[z * w + x] = c;
    }
  }
  return { v: 1, x0, z0, w, h, tiles: out.join(''), crops };
}
