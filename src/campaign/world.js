// The war map board: a grid of provinces with wandering borders, generated
// from a seed. The ISA (bottom) half is generated and the Helghast (top)
// half is its exact mirror turned through 180 degrees, so both sides start
// with identical ground, sites and distances.
//
// Pure: no DOM, no Math.random. Uses the campaign's own seeded RNG.

import { range } from '../sim/rng.js';

export function generateBoard(st, cc) {
  const { rows, cols, width: W, height: H, jitter, wiggle } = cc.board;
  // Corner points of the grid, nudged about (except on the edge); each
  // point's mirror is set at the same time so the halves match exactly.
  const V = new Map();
  const vk = (r, c) => r * (cols + 1) + c;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      if (V.has(vk(r, c))) continue;
      const mr = rows - r, mc = cols - c;
      const self = mr === r && mc === c;
      let x = (c / cols) * W, y = (r / rows) * H;
      if (!self && c > 0 && c < cols) x += range(st, -jitter[0], jitter[0]);
      if (!self && r > 0 && r < rows) y += range(st, -jitter[1], jitter[1]);
      V.set(vk(r, c), [x, y]);
      V.set(vk(mr, mc), [W - x, H - y]);
    }
  }
  // Each border bends at its middle, the same bend seen from both sides.
  const M = new Map();
  const mid = (a, b) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (M.has(key)) return M.get(key);
    const [x1, y1] = V.get(a), [x2, y2] = V.get(b);
    let mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const onEdge = (x1 === x2 && (x1 === 0 || x1 === W)) || (y1 === y2 && (y1 === 0 || y1 === H));
    const ma = (rows + 1) * (cols + 1) - 1 - a, mb = (rows + 1) * (cols + 1) - 1 - b;
    const mkey = ma < mb ? `${ma}-${mb}` : `${mb}-${ma}`;
    if (!onEdge) {
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, w = range(st, -wiggle, wiggle);
      mx += (-dy / L) * w;
      my += (dx / L) * w;
    }
    M.set(key, [mx, my]);
    if (mkey !== key) M.set(mkey, [W - mx, H - my]);
    return M.get(key);
  };
  const half = rows / 2;
  const provinces = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = vk(r, c), b = vk(r, c + 1), d = vk(r + 1, c + 1), e = vk(r + 1, c);
      const pts = [V.get(a), mid(a, b), V.get(b), mid(b, d), V.get(d), mid(d, e), V.get(e), mid(e, a)].map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
      const corners = [V.get(a), V.get(b), V.get(d), V.get(e)];
      const home = r < half ? 1 : 0;
      // The ISA's own rows count from the front (row 0) to the rear; the
      // Helghast half takes the mirror province's site.
      const lr = home === 0 ? r - half : half - 1 - r;
      const lc = home === 0 ? c : cols - 1 - c;
      const def = cc.provinces[lr][lc];
      const id = r * cols + c;
      const nb = [];
      if (r > 0) nb.push(id - cols);
      if (c > 0) nb.push(id - 1);
      if (c < cols - 1) nb.push(id + 1);
      if (r < rows - 1) nb.push(id + cols);
      provinces.push({
        id, row: r, col: c, home, owner: home, site: def.site, name: home === 0 ? def.isa : def.hgh,
        kit: cc.kit[def.site], supply: cc.supply[def.site], pts,
        cx: Math.round((corners.reduce((s, p) => s + p[0], 0) / 4) * 10) / 10,
        cy: Math.round((corners.reduce((s, p) => s + p[1], 0) / 4) * 10) / 10,
        neighbours: nb.sort((x, y) => x - y),
      });
    }
  }
  return { width: W, height: H, rows, cols, provinces };
}
