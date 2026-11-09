// Procedural front line map. The left half is generated from the seed and the
// right half is its mirror image turned through 180 degrees, so ISA and the
// Helghast always fight over identical ground (fair for balance testing).

import { range, int } from './rng.js';
import { industrialMap, cityMap } from './maps.js';

export const T = { open: 0, trench: 1, rubble: 2, crater: 3, building: 4, sandbag: 5, wall: 6 };
export const T_NAMES = ['open', 'trench', 'rubble', 'crater', 'building', 'sandbag', 'wall'];

// Which map to build: the trench line (the original), an industrial site or
// a ruined city (src/sim/maps.js).
export function generateMap(seedInt, cfg) {
  if (cfg.map.type === 'industrial') return industrialMap(seedInt, cfg);
  if (cfg.map.type === 'city') return cityMap(seedInt, cfg);
  return trenchMap(seedInt, cfg);
}

function trenchMap(seedInt, cfg) {
  const { width: W, height: H, cell } = cfg.world;
  const m = cfg.map;
  const g = { rng: (seedInt ^ 0x9e3779b9) >>> 0 }; // map has its own stream
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);
  const map = {
    width: W, height: H, cell, cols, rows,
    grid: new Array(cols * rows).fill(T.open),
    wire: new Array(cols * rows).fill(0),
    elev: new Array(cols * rows).fill(0), // 0 low ground, 1 and 2 raised ground
    ramp: new Array(cols * rows).fill(0), // 1 where you can walk between heights
    hills: [], // plateau outlines for drawing
    trenches: [], wires: [], buildings: [], craters: [], sites: [], tanks: [], kind: 'trenches',
  };
  const mir = (p) => ({ x: W - p.x, y: H - p.y });

  // Trench line near the ISA edge: a wobbly line with zigzag fire bays.
  const baseX = range(g, m.trenchX[0], m.trenchX[1]);
  const ph1 = range(g, 0, 6.28), ph2 = range(g, 0, 6.28);
  const trench = [];
  for (let y = -30, i = 0; y <= H + 30; y += 50, i++) {
    const wob = Math.sin(y / 170 + ph1) * 0.6 + Math.sin(y / 63 + ph2) * 0.4;
    trench.push({ x: baseX + wob * m.trenchWiggle + (i % 2 ? 9 : -9), y });
  }
  map.trenches.push(trench, trench.map(mir));

  // Wire belt in front of the trench, with a few gaps.
  const wireOff = range(g, m.wireOffset[0], m.wireOffset[1]);
  const wire = trench.map((p) => ({ x: p.x + wireOff + range(g, -12, 12), y: p.y }));
  const gaps = [];
  const nGaps = int(g, m.wireGaps[0], m.wireGaps[1]);
  for (let k = 0; k < nGaps; k++) {
    const centre = ((k + 0.5) / nGaps) * H + range(g, -80, 80);
    const len = range(g, m.wireGapLength[0], m.wireGapLength[1]);
    gaps.push([centre - len / 2, centre + len / 2]);
  }
  map.wires.push({ pts: wire, gaps }, { pts: wire.map(mir), gaps: gaps.map(([a, b]) => [H - b, H - a]) });

  // Objectives: A in the ISA half, C its mirror, B dead centre.
  const A = { x: range(g, 1050, 1200), y: range(g, 210, 330) };
  const B = { x: W / 2, y: H / 2 };
  const C = mir(A);
  const objR = m.objectiveRadius;
  map.sites.push(siteAt('A', 'objective', A, objR), siteAt('B', 'objective', B, objR), siteAt('C', 'objective', C, objR));

  // Capturable features. Anything on the centre line is equally far from both
  // edges, so the comms post and arc tower sit on it (one top, one bottom).
  const topY = range(g, 130, 190);
  const commsTop = g.rng % 2 === 0;
  const fR = m.featureRadius;
  map.sites.push(siteAt('comms', 'comms', { x: W / 2, y: commsTop ? topY : H - topY }, fR));
  map.sites.push(siteAt('arc', 'arc', { x: W / 2, y: commsTop ? H - topY : topY }, fR));
  const mg = { x: A.x + range(g, 130, 210), y: Math.min(H - 120, A.y + range(g, 150, 230)) };
  map.sites.push(siteAt('mg1', 'mg', mg, fR), siteAt('mg2', 'mg', mir(mg), fR));

  // Ruins around each objective (B's cluster is built on its left and mirrored).
  const ruinsAround = (c, xMin, xMax) => {
    const out = [];
    const n = int(g, m.ruinsPerObjective[0], m.ruinsPerObjective[1]);
    for (let k = 0; k < n; k++) {
      const w = range(g, 36, 72), h = range(g, 36, 72);
      out.push({ x: c.x + range(g, xMin, xMax) - w / 2, y: c.y + range(g, -115, 115) - h / 2, w, h });
    }
    return out;
  };
  const leftRuins = [...ruinsAround(A, -120, 120), ...ruinsAround(B, -150, -40)];
  for (const b of leftRuins) map.buildings.push(b, { x: W - b.x - b.w, y: H - b.y - b.h, w: b.w, h: b.h });

  // Shell craters across no man's land (left half, mirrored).
  const nCr = int(g, m.craters[0], m.craters[1]);
  for (let k = 0; k < nCr; k++) {
    const c = { x: range(g, baseX + wireOff + 40, W / 2 - 20), y: range(g, 20, H - 20), r: range(g, m.craterRadius[0], m.craterRadius[1]) };
    map.craters.push(c, { ...mir(c), r: c.r });
  }

  // Petrusite tanks out in the open where stray fire will find them.
  for (let k = 0; k < m.tanksPerHalf; k++) {
    const t = { x: range(g, 720, 1380), y: range(g, 80, H - 80) };
    map.tanks.push({ ...t }, mir(t));
  }
  map.tanks = map.tanks.map((t, i) => ({ id: i, x: t.x, y: t.y, exploded: false }));

  // Paint the grid: craters, then rubble halos, buildings, trenches, wire.
  for (const c of map.craters) paintCircle(map, c.x, c.y, c.r, T.crater);
  for (const b of map.buildings) {
    forCells(map, b.x - 22, b.y - 22, b.x + b.w + 22, b.y + b.h + 22, (i, x, y) => {
      // Hash the canonical (left half) position so mirrored ruins get mirrored rubble.
      const [hx, hy] = x < W / 2 ? [x, y] : [W - x, H - y];
      if (map.grid[i] === T.open && hash(hx, hy, seedInt) < 0.55) map.grid[i] = T.rubble;
    });
  }
  for (const b of map.buildings) forCells(map, b.x, b.y, b.x + b.w, b.y + b.h, (i) => { map.grid[i] = T.building; });
  for (const t of map.trenches) paintLine(map, t, m.trenchHalfWidth, (i) => { map.grid[i] = T.trench; });
  for (const w of map.wires) {
    paintLine(map, w.pts, m.wireHalfWidth, (i, x, y) => {
      if (w.gaps.some(([a, b]) => y >= a && y <= b)) return;
      if (map.grid[i] !== T.trench) map.wire[i] = 1;
    });
  }
  addHighGround(map, g, cfg, [A, B]);
  return finishMap(map, cfg);
}

// Last checks for any map: everything must be reachable (if not, flatten
// the high ground, then as a last resort knock the walls down), and note
// what it has, for the rules and the drawing.
export function finishMap(map) {
  if (!connected(map)) {
    map.elev.fill(0);
    map.ramp.fill(0);
    if (!connected(map)) for (let i = 0; i < map.grid.length; i++) if (map.grid[i] === T.wall) map.grid[i] = T.rubble;
  }
  map.hasHeight = map.elev.some((h) => h > 0);
  map.wallCells = [];
  for (let i = 0; i < map.grid.length; i++) if (map.grid[i] === T.wall) map.wallCells.push(i);
  map.hasWalls = map.wallCells.length > 0;
  return map;
}

// ---- High ground --------------------------------------------------------
// Raised plateaus with cliff edges you cannot climb, reached only by ramps.
// They make chokepoints and give the side holding them range and accuracy.
// Built on the left half and mirrored, like everything else.

export const heightAt = (map, x, y) => { const i = cellIndex(map, x, y); return i < 0 ? 0 : map.elev[i]; };
export const rampAt = (map, x, y) => { const i = cellIndex(map, x, y); return i < 0 ? 0 : map.ramp[i]; };

// Can a soldier step from fine cell a to fine cell b?
// Walls block everyone on foot or in a tank (jetpacks fly over them).
export const canStep = (map, a, b) => a < 0 || b < 0 || (map.grid[b] !== T.wall && (map.elev[a] === map.elev[b] || map.ramp[a] === 1 || map.ramp[b] === 1));

function addHighGround(map, g, cfg, [A, B]) {
  const hc = cfg.map.hills;
  const W = map.width, H = map.height;
  const n = map.elev.length;
  const raise = (blobs, level) => {
    for (const b of blobs) {
      forCells(map, b.x - b.rx, b.y - b.ry, b.x + b.rx, b.y + b.ry, (i, x, y) => {
        if (x >= W / 2) return; // left half only; mirrored below
        if (((x - b.x) / b.rx) ** 2 + ((y - b.y) / b.ry) ** 2 <= 1) map.elev[i] = Math.max(map.elev[i], level);
      });
    }
  };
  // Ramps: a patch where the cliff edge becomes a slope, found by walking out
  // from the middle of a plateau until the ground drops.
  const ramps = [];
  const rampFrom = (cx, cy, ang, level) => {
    for (let d = 0; d < 400; d += 5) {
      const x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d;
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      if (heightAt(map, x, y) < level) { ramps.push({ x, y, r: hc.rampRadius }); return; }
    }
  };
  // The hill at B: two tiers, ramps on the near side and both flanks.
  const bx = B.x - hc.centreOffset;
  raise([{ x: bx, y: B.y, rx: hc.centre[0], ry: hc.centre[1] }], 1);
  raise([{ x: B.x - 20, y: B.y, rx: hc.top[0], ry: hc.top[1] }], 2);
  // Plenty of ways on and off, so squads are not funnelled into one ramp.
  for (const ang of [Math.PI, Math.PI * 0.75, -Math.PI * 0.75, Math.PI * 0.5, -Math.PI * 0.5]) rampFrom(bx, B.y, ang, 1);
  for (const ang of [Math.PI, Math.PI * 0.6, -Math.PI * 0.6]) rampFrom(B.x - 20, B.y, ang, 2);
  // Ridges out in no man's land, kept away from the B hill and the trenches.
  const count = int(g, hc.ridges[0], hc.ridges[1]);
  for (let k = 0; k < count; k++) {
    let x = 0, y = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = range(g, 680, 1180); y = range(g, 110, H - 110);
      if (Math.hypot(x - B.x, y - B.y) > 380 && Math.hypot(x - A.x, y - A.y) > 140) break;
    }
    const rx = range(g, hc.ridgeSize[0], hc.ridgeSize[1]), ry = range(g, hc.ridgeSize[0] * 0.6, hc.ridgeSize[1] * 0.8);
    const blobs = [{ x, y, rx, ry }, { x: x + range(g, -60, 60), y: y + range(g, -50, 50), rx: rx * 0.7, ry: ry * 0.8 }];
    raise(blobs, 1);
    rampFrom(x, y, Math.PI + range(g, -0.4, 0.4), 1); // towards home
    rampFrom(x, y, range(g, -0.5, 0.5), 1); // towards the enemy
    rampFrom(x, y, y < H / 2 ? Math.PI / 2 : -Math.PI / 2, 1); // towards the middle
    rampFrom(x, y, y < H / 2 ? -Math.PI / 2 : Math.PI / 2, 1); // and towards the edge
  }
  for (const r of ramps) {
    forCells(map, r.x - r.r, r.y - r.r, r.x + r.r, r.y + r.r, (i, x, y) => {
      if (x < W / 2 && (x - r.x) ** 2 + (y - r.y) ** 2 <= r.r * r.r) map.ramp[i] = 1;
    });
  }
  // Mirror the left half onto the right (turned 180 degrees).
  for (let i = 0; i < n; i++) {
    const x = (i % map.cols) * map.cell + map.cell / 2;
    if (x >= W / 2) continue;
    map.elev[n - 1 - i] = map.elev[i];
    map.ramp[n - 1 - i] = map.ramp[i];
  }
  // Trenches, wire and the deployment ground stay on the flat.
  for (let i = 0; i < n; i++) if (map.grid[i] === T.trench || map.wire[i] > 0) { map.elev[i] = 0; map.ramp[i] = 0; }
  if (!connected(map)) {
    // Never trap an objective: if anything is unreachable, flatten it all.
    map.elev.fill(0);
    map.ramp.fill(0);
  }
  map.hasHeight = map.elev.some((h) => h > 0);
}

// Can every site and the far deployment be reached from the ISA deployment?
function connected(map) {
  const n = map.elev.length, seen = new Uint8Array(n);
  const start = cellIndex(map, 190, map.height / 2);
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const i = q.pop();
    const x = i % map.cols, y = (i / map.cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.cols || ny >= map.rows) continue;
      const j = ny * map.cols + nx;
      if (!seen[j] && canStep(map, i, j)) { seen[j] = 1; q.push(j); }
    }
  }
  const targets = [...map.sites.map((s) => [s.x, s.y]), [map.width - 190, map.height / 2]];
  return targets.every(([x, y]) => seen[cellIndex(map, x, y)]);
}

export function siteAt(id, kind, p, r) {
  const names = { comms: 'comms post', arc: 'arc tower', mg1: 'MG nest', mg2: 'MG nest' };
  return { id, kind, name: names[id] || id, x: Math.round(p.x), y: Math.round(p.y), r, owner: null, capSide: null, cap: 0, fireCd: 0 };
}

// Deterministic per cell noise for decoration choices.
export function hash(x, y, s) {
  let h = Math.imul((x * 73856093) ^ (y * 19349663) ^ s, 0x27d4eb2d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function cellIndex(map, x, y) {
  const cx = Math.floor(x / map.cell), cy = Math.floor(y / map.cell);
  if (cx < 0 || cy < 0 || cx >= map.cols || cy >= map.rows) return -1;
  return cy * map.cols + cx;
}

export function terrainAt(map, x, y) {
  const i = cellIndex(map, x, y);
  return i < 0 ? T.open : map.grid[i];
}

export function wireAt(map, x, y) {
  const i = cellIndex(map, x, y);
  return i < 0 ? 0 : map.wire[i];
}

export function forCells(map, x0, y0, x1, y1, fn) {
  const c = map.cell;
  const ax = Math.max(0, Math.floor(x0 / c)), ay = Math.max(0, Math.floor(y0 / c));
  const bx = Math.min(map.cols - 1, Math.floor(x1 / c)), by = Math.min(map.rows - 1, Math.floor(y1 / c));
  for (let cy = ay; cy <= by; cy++) {
    for (let cx = ax; cx <= bx; cx++) fn(cy * map.cols + cx, cx * c + c / 2, cy * c + c / 2);
  }
}

export function paintCircle(map, x, y, r, code) {
  forCells(map, x - r, y - r, x + r, y + r, (i, cx, cy) => {
    if ((cx - x) ** 2 + (cy - y) ** 2 <= r * r && map.grid[i] !== T.trench && map.grid[i] !== T.building) map.grid[i] = code;
  });
}

function paintLine(map, pts, halfW, fn) {
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    forCells(map, Math.min(a.x, b.x) - halfW, Math.min(a.y, b.y) - halfW, Math.max(a.x, b.x) + halfW, Math.max(a.y, b.y) + halfW, (i, x, y) => {
      if (distToSeg(x, y, a, b) <= halfW) fn(i, x, y);
    });
  }
}

export function distToSeg(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

// Find the best cover cell near (x, y). score(cx, cy) returns a number (higher
// is better) or -Infinity to skip. Returns null when nothing qualifies.
// mirror: break ties the other way round, so the Helghast (whose map is
// the ISA map turned 180 degrees) choose the mirror image of the same spot.
export function findCover(map, x, y, radius, score, mirror = false) {
  let best = null, bestScore = -Infinity;
  forCells(map, x - radius, y - radius, x + radius, y + radius, (i, cx, cy) => {
    const t = map.grid[i];
    if (t === T.open || t === T.wall || map.wire[i] > 0) return;
    if ((cx - x) ** 2 + (cy - y) ** 2 > radius * radius) return;
    const s = score(cx, cy, t);
    if (s > bestScore || (mirror && s === bestScore)) { bestScore = s; best = { x: cx, y: cy }; }
  });
  return best;
}
