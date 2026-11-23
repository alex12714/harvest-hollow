// A farm's valley-map thumbnail, drawn (OnFire "Hollow Valley", valley step 1): the server's tile string
// (server/world/thumb.js) painted top-down into a small 2D canvas, PX canvas pixels per tile. No WebGL, no farm state:
// one fillRect or two per tile, about 2,300 tiles, once per change (the map polls with an ETag). The canvas is
// scaled by CSS with smoothing off, so it reads as a little pixel-art map of the farm.
//
//   drawThumb(canvas, thumb) -> canvas      thumb = { w, h, tiles, crops }

export const PX = 4;

// the game's own palette (css/style.css tokens and the ground's colours, render/ground.js), flattened for 2D
const C = {
  wild: ['#6E9F4D', '#6B9B4A', '#71A250'],
  grass: ['#9CD06B', '#95C964', '#A2D571'],
  path: '#D9B57A', pathEdge: '#C9A066',
  soil: '#8A5A32', furrow: '#734A28',
  roof: '#C8553D', roofHi: '#E07A5F', wall: '#F3E3C3',
  barn: '#B07D4F', barnHi: '#C9955F',
  tree: '#3F7F2E', treeHi: '#5FA043', trunk: '#6B4423',
  rock: '#9AA0A6', rockHi: '#C4C9CE',
  decor: '#E9D8A6', decorEdge: '#B89B67',
};

/** A stable 0..2 per tile, so grass is not one flat colour (and the same every redraw). */
const vary = (x, z) => ((x * 73856093) ^ (z * 19349663)) >>> 0;

export function drawThumb(canvas, thumb) {
  const { w, h, tiles, crops = [] } = thumb;
  if (canvas.width !== w * PX) canvas.width = w * PX;
  if (canvas.height !== h * PX) canvas.height = h * PX;
  const g = canvas.getContext('2d', { alpha: false });
  if (!g) return canvas;
  const rect = (x, z, dx, dz, dw, dh, col) => { g.fillStyle = col; g.fillRect(x * PX + dx, z * PX + dz, dw, dh); };
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const c = tiles[z * w + x];
      const v = vary(x, z) % 3;
      const under = c === '.' ? C.wild[v] : C.grass[v];
      rect(x, z, 0, 0, PX, PX, under);
      switch (c) {
        case '.': case ',': break;
        case '=': rect(x, z, 0, 0, PX, PX, C.path); if (v === 0) rect(x, z, 1, 1, 1, 1, C.pathEdge); break;
        case '_': rect(x, z, 0, 0, PX, PX, C.soil); rect(x, z, 0, 1, PX, 1, C.furrow); rect(x, z, 0, 3, PX, 1, C.furrow); break;
        case '#': rect(x, z, 0, 0, PX, PX, C.roof); rect(x, z, 0, 0, PX, 1, C.roofHi); break;
        case '%': rect(x, z, 0, 0, PX, PX, C.barn); rect(x, z, 0, 0, PX, 1, C.barnHi); break;
        case '^': rect(x, z, 1, 2, 2, 2, C.trunk); rect(x, z, 0, 0, PX, 3, C.tree); rect(x, z, 1, 0, 2, 1, C.treeHi); break;
        case '*': rect(x, z, 1, 1, 2, 2, C.rock); rect(x, z, 1, 1, 1, 1, C.rockHi); break;
        case '+': rect(x, z, 1, 1, 2, 2, C.decor); rect(x, z, 1, 2, 2, 1, C.decorEdge); break;
        default: {
          const code = c.charCodeAt(0);
          const ripe = code >= 65 && code <= 90;
          const hue = crops[code - (ripe ? 65 : 97)] ?? '#7FB24A';
          rect(x, z, 0, 0, PX, PX, C.soil);
          if (ripe) { rect(x, z, 0, 0, PX, PX, hue); rect(x, z, 1, 1, 1, 1, '#FFF4D6'); } else rect(x, z, 1, 1, 2, 2, hue);
        }
      }
    }
  }
  return canvas;
}
