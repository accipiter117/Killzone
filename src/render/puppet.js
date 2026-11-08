// A tiny pixel art renderer for "puppets": figures made of simple shaped
// pieces (tapered limbs, ellipses, polygons), each with a material. Every
// pixel takes the frontmost piece under it, is shaded from the upper left
// into that material's five tone ramp, then bevelled (light top-left edge,
// dark bottom-right edge), separated from the piece behind by a dark line,
// and the whole figure gets an outline. The result reads like hand shaded
// pixel art but can be re-posed for every animation frame.

const LIGHT = (() => { const l = [-0.55, -0.7, 0.55]; const n = Math.hypot(...l); return l.map((v) => v / n); })();
const OUTLINE = [10, 11, 13];

const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// Five tones from a base colour: shadows lean cool, highlights lean warm.
export function ramp(hex) {
  const c = hexRgb(hex);
  return [mix(c, [14, 15, 22], 0.62), mix(c, [16, 18, 26], 0.38), mix(c, [18, 20, 28], 0.15), c, mix(c, [255, 240, 214], 0.28)];
}

// Materials: { name: { ramp, glow?, gloss? } }
export function materials(defs) {
  const out = {};
  for (const [k, v] of Object.entries(defs)) {
    out[k] = typeof v === 'string' ? { ramp: ramp(v) } : { ...v, ramp: v.ramp || ramp(v.base) };
  }
  return out;
}

// ---- Pieces --------------------------------------------------------------

let nextId = 1;
export const cap = (a, b, ra, rb, mat, z) => ({ kind: 'cap', a, b, ra, rb: rb ?? ra, mat, z, id: nextId++ });
export const ell = (c, rx, ry, mat, z) => ({ kind: 'ell', c, rx, ry, mat, z, id: nextId++ });
export const poly = (pts, mat, z, tilt = 0) => ({ kind: 'poly', pts, mat, z, tilt, id: nextId++ });
export const box = (x0, y0, x1, y1, mat, z) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], mat, z);

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Returns the light on a piece at a point (about -1..1), or null if outside.
function sample(p, x, y) {
  if (p.kind === 'cap') {
    const [ax, ay] = p.a, [bx, by] = p.b;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const r = p.ra + (p.rb - p.ra) * t;
    const qx = x - (ax + dx * t), qy = y - (ay + dy * t);
    const d = Math.hypot(qx, qy);
    if (d > r) return null;
    const s = d / r; // cylinder normal: across the limb and towards the viewer
    const nz = Math.sqrt(Math.max(0, 1 - s * s));
    const nx = d ? (qx / d) * s : 0, ny = d ? (qy / d) * s : 0;
    return nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
  }
  if (p.kind === 'ell') {
    const nx = (x - p.c[0]) / p.rx, ny = (y - p.c[1]) / p.ry;
    const q = nx * nx + ny * ny;
    if (q > 1) return null;
    return nx * LIGHT[0] + ny * LIGHT[1] + Math.sqrt(1 - q) * LIGHT[2];
  }
  if (!inPoly(x, y, p.pts)) return null;
  // Flat plates, tilted slightly so their top catches more light.
  let minY = Infinity, maxY = -Infinity;
  for (const [, py] of p.pts) { minY = Math.min(minY, py); maxY = Math.max(maxY, py); }
  const v = (y - minY) / Math.max(1, maxY - minY);
  return 0.62 - 0.32 * v + p.tilt;
}

// Draw pieces into a w x h pixel buffer. Returns an RGBA Uint8ClampedArray.
export function rasterise(pieces, mats, w, h, { dim = 1 } = {}) {
  const n = w * h;
  const owner = new Int32Array(n).fill(-1);
  const zbuf = new Float32Array(n).fill(-1e9);
  const val = new Float32Array(n);
  const rad = new Float32Array(n); // distance from the centre of glowing ellipses (0..1)
  pieces.forEach((p, idx) => {
    // Bounding box to keep this quick.
    let x0, y0, x1, y1;
    if (p.kind === 'cap') {
      const r = Math.max(p.ra, p.rb) + 1;
      x0 = Math.min(p.a[0], p.b[0]) - r; x1 = Math.max(p.a[0], p.b[0]) + r;
      y0 = Math.min(p.a[1], p.b[1]) - r; y1 = Math.max(p.a[1], p.b[1]) + r;
    } else if (p.kind === 'ell') {
      x0 = p.c[0] - p.rx - 1; x1 = p.c[0] + p.rx + 1; y0 = p.c[1] - p.ry - 1; y1 = p.c[1] + p.ry + 1;
    } else {
      x0 = Math.min(...p.pts.map((q) => q[0])) - 1; x1 = Math.max(...p.pts.map((q) => q[0])) + 1;
      y0 = Math.min(...p.pts.map((q) => q[1])) - 1; y1 = Math.max(...p.pts.map((q) => q[1])) + 1;
    }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(w - 1, Math.ceil(x1)); x++) {
        const i = y * w + x;
        if (p.z < zbuf[i]) continue;
        const s = sample(p, x + 0.5, y + 0.5);
        if (s === null) continue;
        zbuf[i] = p.z; owner[i] = idx; val[i] = s;
        if (p.kind === 'ell') rad[i] = Math.hypot((x + 0.5 - p.c[0]) / p.rx, (y + 0.5 - p.c[1]) / p.ry);
      }
    }
  });

  const out = new Uint8ClampedArray(n * 4);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : owner[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = owner[i];
      if (o < 0) {
        // Outline: any empty pixel touching the figure (glowing bits excepted).
        const nb = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)];
        if (nb.some((k) => k >= 0 && !mats[pieces[k].mat].glow)) out.set([...OUTLINE, 255], i * 4);
        continue;
      }
      const p = pieces[o];
      const m = mats[p.mat];
      if (m.glow) {
        // Glowing lenses and flashes: hot core, bright body, deeper rim.
        const r = p.kind === 'ell' ? rad[i] : 0.6;
        const c = r < 0.45 ? m.core : r < 0.8 || !m.ramp[2] ? m.ramp[3] : m.ramp[2];
        out.set([...c, 255], i * 4);
        continue;
      }
      let tone = Math.round(1 + val[i] * 3.2);
      // Bevel: light where the piece starts at the top or left, dark where it ends.
      const up = at(x, y - 1), left = at(x - 1, y), down = at(x, y + 1), right = at(x + 1, y);
      if ((up !== o && up >= 0 && pieces[up].z < p.z) || (left !== o && left >= 0 && pieces[left].z < p.z)) tone += 1;
      if (up < 0 || left < 0) tone += 1;
      if ((down >= 0 && down !== o) || (right >= 0 && right !== o)) tone -= 1;
      // Seam: a dark line where this piece sits behind a different one.
      if ((down >= 0 && pieces[down].id !== p.id && pieces[down].z > p.z) || (right >= 0 && pieces[right].id !== p.id && pieces[right].z > p.z)) tone = 0;
      if (m.gloss && val[i] > 0.82) tone = 4;
      tone = Math.max(0, Math.min(4, tone));
      const c = m.ramp[tone];
      out.set([c[0] * dim, c[1] * dim, c[2] * dim, 255], i * 4);
    }
  }
  return out;
}

// Turn every piece about a pivot (for lying down and falling).
export function rotatePieces(pieces, pivot, deg) {
  const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const rot = ([x, y]) => [pivot[0] + (x - pivot[0]) * ca - (y - pivot[1]) * sa, pivot[1] + (x - pivot[0]) * sa + (y - pivot[1]) * ca];
  return pieces.map((p) => {
    if (p.kind === 'cap') return { ...p, a: rot(p.a), b: rot(p.b) };
    if (p.kind === 'poly') return { ...p, pts: p.pts.map(rot) };
    // Ellipses: turned a quarter, swap their radii.
    const quarter = Math.abs(Math.round(deg / 90)) % 2 === 1 && Math.abs(deg % 90) < 20;
    return { ...p, c: rot(p.c), rx: quarter ? p.ry : p.rx, ry: quarter ? p.rx : p.ry };
  });
}

export const shiftPieces = (pieces, dx, dy) => pieces.map((p) => {
  if (p.kind === 'cap') return { ...p, a: [p.a[0] + dx, p.a[1] + dy], b: [p.b[0] + dx, p.b[1] + dy] };
  if (p.kind === 'poly') return { ...p, pts: p.pts.map(([x, y]) => [x + dx, y + dy]) };
  return { ...p, c: [p.c[0] + dx, p.c[1] + dy] };
});
