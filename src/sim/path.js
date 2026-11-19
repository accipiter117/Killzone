// Route finding over the fine terrain grid (10 unit cells). Squads use it to
// get round cliffs (only ramps lead up and down) and to prefer gaps in the
// wire over wading through it. Weighted A*: slightly greedy so it stays quick
// on open ground, always deterministic.

import { cellIndex, canStep, T, S_NAMES } from './map.js';
import { CONFIG } from '../config.js';

// What each ground surface costs a route (roads cheap, fords and mud dear).
let SURF_COST = null; // filled on first use (map.js and this module import each other)

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
export function findPath(map, a, b, { engineer = false, maxNodes = 24000, mirror = false, vehicle = false } = {}) {
  const cols = map.cols, rows = map.rows;
  const start = cellIndex(map, a.x, a.y), goal = cellIndex(map, b.x, b.y);
  if (start < 0 || goal < 0) return null;
  if (start === goal) return [{ x: b.x, y: b.y }];
  // Tanks crush wire but cannot enter ruins, and would rather keep a cell
  // clear of them (squeezing past is allowed, just expensive, so a tank that
  // has ended up in a tight spot can always drive out again).
  const wireCost = vehicle ? 1 : engineer ? ENGINEER_WIRE_COST : WIRE_COST;
  const B = T.building, grid = map.grid;
  const blocked = vehicle ? (j) => grid[j] === B : null;
  const tight = vehicle ? (j, x, y) => (x > 0 && grid[j - 1] === B) || (x < cols - 1 && grid[j + 1] === B) || (y > 0 && grid[j - cols] === B) || (y < rows - 1 && grid[j + cols] === B) : null;
  if (!SURF_COST) SURF_COST = S_NAMES.map((n) => CONFIG.surface[n].cost);
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
      if (blocked && blocked(j)) continue;
      // No cutting corners past a cliff: a diagonal step brushes both cells
      // beside it, so the way through each of them must be walkable too
      // (otherwise a walker slips off the side of a ramp onto low ground it
      // cannot climb back from).
      if (dx && dy) {
        const o1 = y * cols + nx, o2 = ny * cols + x;
        if (!canStep(map, i, o1) || !canStep(map, o1, j) || !canStep(map, i, o2) || !canStep(map, o2, j)) continue;
      }
      const cost = g[i] + step * (map.wire[j] > 0 ? wireCost : 1) * (tight && tight(j, nx, ny) ? 5 : 1) * (map.surf ? SURF_COST[map.surf[j]] : 1);
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
  // Walks every cell the line passes through, in order (a grid traversal),
  // so a line that clips the corner of a wall or cliff cell is caught. The
  // old check sampled every 4 units and could skip such a cell, sending
  // soldiers straight into corners they then could not get round.
  const c = map.cell, cols = map.cols, rows = map.rows;
  let x = Math.floor(a.x / c), y = Math.floor(a.y / c);
  const x1 = Math.floor(b.x / c), y1 = Math.floor(b.y / c);
  if (x1 < 0 || y1 < 0 || x1 >= cols || y1 >= rows) return false;
  const dx = b.x - a.x, dy = b.y - a.y;
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const ddx = dx !== 0 ? c / Math.abs(dx) : Infinity, ddy = dy !== 0 ? c / Math.abs(dy) : Infinity;
  let tx = dx !== 0 ? ((sx > 0 ? (x + 1) * c : x * c) - a.x) / dx : Infinity;
  let ty = dy !== 0 ? ((sy > 0 ? (y + 1) * c : y * c) - a.y) / dy : Infinity;
  const inside = (cx, cy) => cx >= 0 && cy >= 0 && cx < cols && cy < rows;
  let prev = inside(x, y) ? y * cols + x : -1;
  const enter = (cx, cy) => {
    if (!inside(cx, cy)) return false;
    const i = cy * cols + cx;
    if (!canStep(map, prev, i) || (!allowWire && map.wire[i] > 0)) return false;
    prev = i;
    return true;
  };
  for (let n = cols + rows + 4; n > 0 && (x !== x1 || y !== y1); n--) {
    if (Math.abs(tx - ty) < 1e-9) {
      // Exactly through a corner: the way through both neighbours must be
      // walkable.
      const from = prev;
      if (!enter(x + sx, y) || !enter(x + sx, y + sy)) return false;
      prev = from;
      if (!enter(x, y + sy) || !enter(x + sx, y + sy)) return false;
      prev = from;
      x += sx; y += sy; tx += ddx; ty += ddy;
    } else if (tx < ty) { x += sx; tx += ddx; } else { y += sy; ty += ddy; }
    if (!enter(x, y)) return false;
  }
  return true;
}

// Long routes on a skirmish map: planned on a coarse grid (COARSE fine cells
// a side), where a step between two coarse cells is allowed only if troops
// can walk straight between their centres. The whole coarse map is small
// enough to search every time, so a detour of any length round a river to
// its bridge is found at once; soldiers still find their own way round the
// small things on each leg. Built once per map and kept on it.
const COARSE = 4;
function coarseOf(map, vehicle = false) {
  const slot = vehicle ? 'coarseV' : 'coarse';
  if (map[slot]) return map[slot];
  const k = COARSE, cols = Math.ceil(map.cols / k), rows = Math.ceil(map.rows / k), c = map.cell * k;
  const open = new Uint8Array(cols * rows), pt = new Array(cols * rows).fill(null);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    // The cell's point: the walkable fine cell nearest its middle.
    let best = null, bd = Infinity, n = 0;
    for (let y = j * k; y < Math.min(map.rows, j * k + k); y++) for (let x = i * k; x < Math.min(map.cols, i * k + k); x++) {
      const f = y * map.cols + x;
      if (map.grid[f] === T.wall || (vehicle && map.grid[f] === T.building) || (map.surf && map.surf[f] === 3) || (map.reach && !map.reach[f])) continue;
      n++;
      const d = Math.abs(x - (i * k + k / 2 - 0.5)) + Math.abs(y - (j * k + k / 2 - 0.5));
      if (d < bd) { bd = d; best = { x: x * map.cell + map.cell / 2, y: y * map.cell + map.cell / 2 }; }
    }
    if (n * 2 >= k * k) { open[j * cols + i] = 1; pt[j * cols + i] = best; }
  }
  map[slot] = { cols, rows, c, open, pt, edge: new Map(), vehicle };
  return map[slot];
}
// Tanks cannot enter ruins: a straight leg must also miss every building cell.
function clearOfRuins(map, a, b) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5);
  for (let k = 0; k <= steps; k++) {
    const i = cellIndex(map, a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps);
    if (i >= 0 && map.grid[i] === T.building) return false;
  }
  return true;
}
function coarseStep(map, cg, i, j) {
  const key = i < j ? i * 1e6 + j : j * 1e6 + i;
  let ok = cg.edge.get(key);
  if (ok === undefined) { ok = straightClear(map, cg.pt[i], cg.pt[j], cg.vehicle) && (!cg.vehicle || clearOfRuins(map, cg.pt[i], cg.pt[j])); cg.edge.set(key, ok); }
  return ok;
}
export function coarsePath(map, a, b, vehicle = false) {
  if (!SURF_COST) SURF_COST = S_NAMES.map((n) => CONFIG.surface[n].cost);
  const cg = coarseOf(map, vehicle), cols = cg.cols, rows = cg.rows, n = cols * rows;
  const near = (p) => {
    const ci = Math.min(cols - 1, Math.floor(p.x / cg.c)), cj = Math.min(rows - 1, Math.floor(p.y / cg.c));
    for (let r = 0; r < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const i = ci + dx, j = cj + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || i < 0 || j < 0 || i >= cols || j >= rows) continue;
      const q = j * cols + i;
      if (cg.open[q] && straightClear(map, p, cg.pt[q], vehicle)) return q;
    }
    return -1;
  };
  const start = near(a), goal = near(b);
  if (start < 0 || goal < 0) return null;
  const gx = goal % cols, gy = (goal / cols) | 0;
  const g = new Float32Array(n).fill(Infinity), from = new Int32Array(n).fill(-1);
  const open = new Heap();
  g[start] = 0;
  open.push(0, start);
  while (open.size) {
    const i = open.pop();
    if (i === goal) break;
    const x = i % cols, y = (i / cols) | 0;
    for (const [dx, dy, st] of NB) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (!cg.open[j]) continue;
      const fj = cellIndex(map, cg.pt[j].x, cg.pt[j].y);
      const cost = g[i] + st * (map.surf ? SURF_COST[map.surf[fj]] : 1);
      if (cost >= g[j] || !coarseStep(map, cg, i, j)) continue;
      g[j] = cost;
      from[j] = i;
      open.push(cost + Math.hypot(gx - nx, gy - ny), j);
    }
  }
  if (from[goal] < 0 && goal !== start) return null;
  const pts = [];
  for (let i = goal; i !== start && i >= 0; i = from[i]) pts.push(cg.pt[i]);
  pts.reverse();
  pts.push({ x: b.x, y: b.y });
  return pts.map((p) => ({ x: p.x, y: p.y }));
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
  const age = state.tick - (sq.pathTick ?? -9999);
  const stale = !sq.path || !sq.pathTo || (Math.hypot(sq.pathTo.x - to.x, sq.pathTo.y - to.y) > 40 && age > 15) || age > 150;
  if (stale) {
    // Skirmish maps: long routes are planned on the coarse grid (see coarsePath).
    const far = map.skirmish && Math.hypot(to.x - from.x, to.y - from.y) > 500;
    sq.path = (far && coarsePath(map, from, to)) || findPath(map, from, to, { engineer, mirror: sq.side === 1 });
    sq.pathTo = { x: to.x, y: to.y };
    sq.pathTick = state.tick;
  }
  const path = sq.path;
  if (!path || !path.length) return to;
  // Drop points already reached, then look as far ahead as is walkable. A
  // point counts as reached once any of the squad has stood on it: the
  // squad's middle can never get close to a doorway its point man is
  // standing in, with the rest formed up behind him.
  const reached = (p) => {
    if (Math.hypot(p.x - from.x, p.y - from.y) < 18) return true;
    for (const id of sq.soldiers) {
      const s = state.soldiers[id];
      if (s.alive && !s.fled && Math.hypot(p.x - s.x, p.y - s.y) < 10) return true;
    }
    return false;
  };
  while (path.length > 1 && reached(path[0])) path.shift();
  let pick = 0;
  for (let k = Math.min(path.length - 1, 40); k > 0; k -= 2) {
    if (straightClear(map, from, path[k], engineer)) { pick = k; break; }
  }
  return path[pick];
}
