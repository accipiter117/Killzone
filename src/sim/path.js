// Route finding over the fine terrain grid (10 unit cells). Squads use it to
// get round cliffs (only ramps lead up and down) and to prefer gaps in the
// wire over wading through it. Weighted A*: slightly greedy so it stays quick
// on open ground, always deterministic.

import { cellIndex, canStep } from './map.js';

// Cost of entering a wire cell, in cells of open ground. Engineers cut wire,
// so it costs them little.
const WIRE_COST = 6;
const ENGINEER_WIRE_COST = 1.5;
const GREED = 1.4;

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] < key || (k[p] === key && v[p] < val)) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = lk, mv = lv;
        if (l < k.length && (k[l] < mk || (k[l] === mk && v[l] < mv))) { m = l; mk = k[l]; mv = v[l]; }
        if (r < k.length && (k[r] < mk || (k[r] === mk && v[r] < mv))) { m = r; mk = k[r]; mv = v[r]; }
        if (m === i) break;
        k[i] = k[m]; v[i] = v[m]; i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

// Returns a list of world points from a to b (not including a), or null.
// mirror: the Helghast search their neighbours and break ties in mirror
// image order, so equal routes are chosen the same way by both sides.
export function findPath(map, a, b, { engineer = false, maxNodes = 12000, mirror = false } = {}) {
  const cols = map.cols, rows = map.rows;
  const start = cellIndex(map, a.x, a.y), goal = cellIndex(map, b.x, b.y);
  if (start < 0 || goal < 0) return null;
  if (start === goal) return [{ x: b.x, y: b.y }];
  const wireCost = engineer ? ENGINEER_WIRE_COST : WIRE_COST;
  const gx = goal % cols, gy = (goal / cols) | 0;
  const g = new Float32Array(cols * rows).fill(Infinity);
  const from = new Int32Array(cols * rows).fill(-1);
  const open = new Heap();
  const n = cols * rows;
  const enc = mirror ? (i) => n - 1 - i : (i) => i; // tie-break order
  const nb = mirror ? NB.map(([dx, dy, st]) => [-dx, -dy, st]) : NB;
  g[start] = 0;
  open.push(0, enc(start));
  let expanded = 0, best = start, bestH = Infinity;
  while (open.size) {
    const i = enc(open.pop());
    if (i === goal) break;
    if (++expanded > maxNodes) break;
    const x = i % cols, y = (i / cols) | 0;
    const h = Math.hypot(gx - x, gy - y);
    if (h < bestH) { bestH = h; best = i; }
    for (const [dx, dy, step] of nb) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (!canStep(map, i, j)) continue;
      // No cutting corners past a cliff.
      if (dx && dy && (!canStep(map, i, y * cols + nx) || !canStep(map, i, ny * cols + x))) continue;
      const cost = g[i] + step * (map.wire[j] > 0 ? wireCost : 1);
      if (cost >= g[j]) continue;
      g[j] = cost;
      from[j] = i;
      open.push(cost + GREED * Math.hypot(gx - nx, gy - ny), enc(j));
    }
  }
  // If the goal could not be reached, head for the closest point found.
  const end = from[goal] >= 0 ? goal : best;
  const cells = [];
  for (let i = end; i !== start && i >= 0; i = from[i]) cells.push(i);
  cells.reverse();
  const c = map.cell;
  const pts = cells.map((i) => ({ x: (i % cols) * c + c / 2, y: ((i / cols) | 0) * c + c / 2 }));
  if (end === goal) pts.push({ x: b.x, y: b.y });
  return pts.length ? pts : null;
}

// Can you walk straight from a to b without meeting a cliff (or, unless
// allowed, wire)? Used to smooth routes into long straight legs.
export function straightClear(map, a, b, allowWire = false) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.ceil(d / 4);
  let prev = cellIndex(map, a.x, a.y);
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const i = cellIndex(map, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    if (i < 0) return false;
    if (i !== prev) {
      if (!canStep(map, prev, i)) return false;
      if (!allowWire && map.wire[i] > 0) return false;
      prev = i;
    }
  }
  return true;
}

// The next point a squad at `from` should walk to on its way to `to`.
// Routes are cached on the squad and refreshed when the destination moves,
// every few seconds, or when the squad has wandered off them.
export function nextStep(state, sq, from, to) {
  const map = state.map;
  if (state.cfg.roles[sq.role].flies) { sq.path = null; return to; } // jetpacks fly straight
  const engineer = sq.role === 'engineer';
  // Straight there if nothing is in the way (the common case on open ground).
  if (straightClear(map, from, to, engineer)) { sq.path = null; return to; }
  const stale = !sq.path || !sq.pathTo || Math.hypot(sq.pathTo.x - to.x, sq.pathTo.y - to.y) > 40 || state.tick - sq.pathTick > 150;
  if (stale) {
    sq.path = findPath(map, from, to, { engineer, mirror: sq.side === 1 });
    sq.pathTo = { x: to.x, y: to.y };
    sq.pathTick = state.tick;
  }
  const path = sq.path;
  if (!path || !path.length) return to;
  // Drop points already reached, then look as far ahead as is walkable.
  while (path.length > 1 && Math.hypot(path[0].x - from.x, path[0].y - from.y) < 18) path.shift();
  let pick = 0;
  for (let k = Math.min(path.length - 1, 40); k > 0; k -= 2) {
    if (straightClear(map, from, path[k], engineer)) { pick = k; break; }
  }
  return path[pick];
}
