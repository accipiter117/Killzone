// Random skirmish maps: a stretch of Helghan generated from the seed, about
// twice the size of the hand-built maps, for two armies that set out from
// their headquarters not knowing where the other is.
//
// The land: ash flats with ridges and plateaus (reached by ramps), usually a
// river between the two headquarters (crossed by bridges where roads meet
// it, and a ford or two), and places worth fighting for spread across it:
// ruined towns, industrial yards, fuel dumps (supply points, which pay
// order points and score), vehicle depots and comms masts, joined by a road
// network. Wrecks, craters, dead trees, mud and vent haze scatter between.
//
// Each side's headquarters sits in its own corner region, picked at random.
// A map is accepted only when everything can be reached and the two
// headquarters are about as far from the places that matter as each other;
// otherwise the generator tries again with the next variant of the seed.

import { WK, S, cellIndex, canStep, distToSeg } from '../map.js';
import { findPath } from '../path.js';
import { kit } from './kit.js';

export const RANDOM_SIZE = { width: 6000, height: 4000 };

export function randomMap(seedInt, cfg) {
  for (let attempt = 0; attempt < 14; attempt++) {
    const map = build((seedInt + attempt * 0x9e3779b1) >>> 0, cfg);
    if (accept(map)) { map.attempts = attempt + 1; return map; }
  }
  // Very unlikely: fall back to the last try with the river taken out.
  return build(seedInt, cfg, { noRiver: true });
}

function build(seed, cfg, opts = {}) {
  // Size from the battle's world (small, medium or large in the menu);
  // medium is RANDOM_SIZE. Counts scale with the area and spacings with the
  // side, so every size is about as busy.
  const W = cfg.world.width || RANDOM_SIZE.width, H = cfg.world.height || RANDOM_SIZE.height;
  const area = (W * H) / (RANDOM_SIZE.width * RANDOM_SIZE.height), sk = Math.sqrt(area);
  const many = (n, min = 1) => Math.max(min, Math.round(n * area));
  const t = kit(W, H, cfg.world.cell, 'trenches', seed, 0x6a09e667);
  const { map, rand, g } = t;
  map.skirmish = true;
  const pick = (list) => list[Math.floor(rand(0, list.length)) % list.length];
  const near = (a, b, d) => Math.hypot(a.x - b.x, a.y - b.y) < d;

  // ---- Headquarters: opposite corners or opposite sides. -------------------
  const layouts = [
    [[0.11, 0.16], [0.89, 0.84]], [[0.11, 0.84], [0.89, 0.16]],
    [[0.09, 0.5], [0.91, 0.5]], [[0.2, 0.12], [0.8, 0.88]], [[0.2, 0.88], [0.8, 0.12]],
  ];
  const lay = pick(layouts);
  // The ISA always take the western HQ: routing, rallying and facing all
  // assume the ISA start in the west (the corners still vary north/south).
  rand(0, 1); // (was a coin for swapping sides; kept so seeds make the same maps)
  const hq = lay.map(([fx, fy]) => ({ x: Math.round(W * fx + rand(-140, 140)), y: Math.round(H * fy + rand(-140, 140)) }));
  const mid = { x: (hq[0].x + hq[1].x) / 2, y: (hq[0].y + hq[1].y) / 2 };
  const axis = Math.atan2(hq[1].y - hq[0].y, hq[1].x - hq[0].x);

  // ---- The river: across the line between the headquarters. -----------------
  let river = null;
  if (!opts.noRiver && rand(0, 1) < 0.7) {
    const perp = axis + Math.PI / 2, off = rand(-260, 260);
    const c = { x: mid.x + Math.cos(axis) * off, y: mid.y + Math.sin(axis) * off };
    const pts = [];
    for (let k = -8; k <= 8; k++) {
      const d = k * 420, wob = Math.sin(k * 0.9 + rand(0, 6)) * 120 + rand(-50, 50);
      pts.push([c.x + Math.cos(perp) * d + Math.cos(axis) * wob, c.y + Math.sin(perp) * d + Math.sin(axis) * wob]);
    }
    river = pts;
    t.river(pts, Math.round(rand(40, 56)));
  }
  const riverDist = (p) => {
    if (!river) return 1e9;
    let d = 1e9;
    for (let k = 0; k < river.length - 1; k++) d = Math.min(d, distToSeg(p.x, p.y, { x: river[k][0], y: river[k][1] }, { x: river[k + 1][0], y: river[k + 1][1] }));
    return d;
  };

  // ---- Places: spread across the map, away from the HQs and the river. ------
  const places = [];
  for (let tries = 0; tries < 900 && places.length < many(13, 9); tries++) {
    const p = { x: rand(420, W - 420), y: rand(380, H - 380) };
    if (hq.some((h) => near(p, h, 820 * sk))) continue;
    if (places.some((q) => near(p, q, 760 * sk))) continue;
    if (riverDist(p) < 230) continue;
    places.push(p);
  }
  // Give them jobs, fairly: walking out from both HQs at once, each side's
  // next-nearest unclaimed place gets the same kind of job.
  const jobs = ['depot', 'comms', 'supply', 'town', 'supply', 'industry'];
  const claimed = new Set();
  const kinds = new Map();
  for (const job of jobs) {
    for (const h of hq) {
      let best = null;
      for (const p of places) if (!claimed.has(p) && (!best || dist(p, h) < dist(best, h))) best = p;
      if (best) { claimed.add(best); kinds.set(best, job); }
    }
  }
  for (const p of places) if (!kinds.has(p)) kinds.set(p, pick(['town', 'industry', 'supply', 'town']));

  // ---- Raised ground: ridges and plateaus in the open. --------------------------
  const hills = [];
  for (let tries = 0; tries < 400 && hills.length < many(9, 5); tries++) {
    const p = { x: rand(300, W - 300), y: rand(300, H - 300) };
    if (hq.some((h) => near(p, h, 650 * sk)) || places.some((q) => near(p, q, 420 * sk)) || hills.some((q) => near(p, q, 520 * sk)) || riverDist(p) < 260) continue;
    hills.push(p);
  }
  for (const p of hills) {
    const rx = rand(150, 280), ry = rand(100, 190);
    t.hill(p.x, p.y, rx, ry, 1);
    t.hill(p.x + rand(-rx * 0.5, rx * 0.5), p.y + rand(-ry * 0.4, ry * 0.4), rx * 0.6, ry * 0.7, 1);
    if (rand(0, 1) < 0.4) t.hill(p.x, p.y, rx * 0.35, ry * 0.4, 2);
    // Ramps out of the plateau in several directions (and up to the top).
    for (let k = 0; k < 5; k++) rampOut(map, t, p, (k / 5) * Math.PI * 2 + rand(-0.3, 0.3), 1);
    rampOut(map, t, p, rand(0, Math.PI * 2), 2);
    rampOut(map, t, p, rand(0, Math.PI * 2), 2);
    if (rand(0, 1) < 0.5) t.prop('pylon', p.x, p.y, 18, 18, 0);
  }

  // ---- Roads: a network joining the HQs and the places. ------------------------
  const nodes = [...hq, ...places];
  const edges = spanningRoads(nodes, rand);
  for (const [a, b] of edges) {
    const pa = nodes[a], pb = nodes[b];
    const pts = [[pa.x, pa.y]];
    for (const f of [0.33, 0.66]) pts.push([pa.x + (pb.x - pa.x) * f + rand(-90, 90), pa.y + (pb.y - pa.y) * f + rand(-90, 90)]);
    pts.push([pb.x, pb.y]);
    const big = a < 2 || b < 2;
    t.road(pts, big ? 24 : 18, big ? 'asphalt' : rand(0, 1) < 0.5 ? 'dirt' : 'asphalt');
    if (river) bridgeOver(map, t, pts);
  }
  // A ford or two besides the bridges.
  if (river) {
    for (let k = 0; k < 2; k++) {
      const i = Math.floor(rand(3, river.length - 4));
      const [x, y] = river[i], [x2, y2] = river[i + 1], a = Math.atan2(y2 - y, x2 - x) + Math.PI / 2;
      t.ford([[x - Math.cos(a) * 90, y - Math.sin(a) * 90], [x + Math.cos(a) * 90, y + Math.sin(a) * 90]], 30);
    }
  }

  // ---- The places themselves. ---------------------------------------------------
  const objR = cfg.map.objectiveRadius, fR = cfg.map.featureRadius;
  let n = { supply: 0, depot: 0, comms: 0, town: 0, industry: 0 };
  for (const p of places) {
    const kind = kinds.get(p);
    n[kind]++;
    if (kind === 'town') town(t, p, rand);
    else if (kind === 'industry') industry(t, p, rand);
    else if (kind === 'depot') { t.pad(p.x - 120, p.y - 90, p.x + 120, p.y + 90, 'dark', 50); t.building(p.x + 20, p.y - 80, p.x + 120, p.y + 10, [['w', 0.5, 60]], WK.metal); t.prop('truck', p.x - 70, p.y + 50, 48, 22, 0.2, { solid: true }); t.site(`depot-${n.depot}`, 'depot', p.x - 40, p.y - 20, fR, 'vehicle depot'); }
    else if (kind === 'comms') { t.hill(p.x, p.y, 120, 80, 1); rampOut(map, t, p, 0, 1); rampOut(map, t, p, Math.PI, 1); rampOut(map, t, p, Math.PI / 2, 1); t.prop('pylon', p.x + 40, p.y - 20, 18, 18); t.site(`comms-${n.comms}`, 'comms', p.x, p.y, fR, 'comms mast'); }
    else { fuelDump(t, p, rand); t.site(`S${n.supply}`, 'supply', p.x, p.y, objR * 0.8, 'fuel dump'); }
    if (kind === 'town' || kind === 'industry') t.site(`S${++n.supply + 20}`, 'supply', p.x, p.y, objR, kind === 'town' ? 'ruined town' : 'industrial yard');
  }
  // Supply points are numbered 1, 2, 3 ... for the player.
  let k = 0;
  for (const s of map.sites) if (s.kind === 'supply') { s.id = `S${++k}`; }

  // ---- Headquarters bases. ----------------------------------------------------------
  for (const side of [0, 1]) {
    const h = hq[side], f = Math.atan2(mid.y - h.y, mid.x - h.x);
    t.pad(h.x - 150, h.y - 110, h.x + 150, h.y + 110, 'dark', 50);
    t.hazard(h.x - 150, h.y - 110, h.x + 150, h.y - 104);
    t.building(h.x - 60, h.y - 45, h.x + 60, h.y + 45, [['n', 0.5, 34], ['s', 0.5, 34], ['e', 0.5, 30], ['w', 0.5, 30]], side ? WK.concrete : WK.metal);
    for (let a = -1; a <= 1; a++) t.sandbags(h.x + Math.cos(f + a * 0.7) * 150, h.y + Math.sin(f + a * 0.7) * 150, 40, f + a * 0.7);
    t.prop(side ? 'banner' : 'lamp', h.x - 70, h.y - 60, 6, 6);
    t.prop(side ? 'banner' : 'lamp', h.x + 70, h.y - 60, 6, 6);
    t.prop('crates', h.x + 100, h.y + 70, 40, 26, 0.1, { low: true });
    const s = t.site(`hq${side}`, 'hq', h.x, h.y, objR, side ? 'Helghast headquarters' : 'ISA headquarters', side);
    s.home = side;
    // Two MG nests guard the approach (behind the outer sandbags): a raid
    // has to silence or take them before it can sit on the HQ.
    for (const a of [-1, 1]) t.site(`hqmg${side}${a < 0 ? 'a' : 'b'}`, 'mg', Math.round(h.x + Math.cos(f + a * 0.7) * 125), Math.round(h.y + Math.sin(f + a * 0.7) * 125), fR, 'HQ MG nest', side);
    // The army forms up in front of its HQ, facing the middle of the map.
    const fx = Math.cos(f), fy = Math.sin(f), px = -fy, py = fx;
    t.deploy(side, [-1, 0, 1].map((o) => [Math.round(h.x + fx * 230 + px * o * 190), Math.round(h.y + fy * 230 + py * o * 190)]), [Math.round(h.x - fx * 40 + px * 200), Math.round(h.y - fy * 40 + py * 200)]);
    // Each side's own depot beside its HQ.
    const dp = { x: h.x - px * 260 - fx * 60, y: h.y - py * 260 - fy * 60 };
    t.pad(dp.x - 80, dp.y - 60, dp.x + 80, dp.y + 60, 'dark', 40);
    t.site(`depot${side}`, 'depot', Math.round(dp.x), Math.round(dp.y), fR, side ? 'Helghast motor pool' : 'ISA vehicle park', side);
  }

  // ---- Scatter. --------------------------------------------------------------------------
  const free = (p, d = 160) => !hq.some((h) => near(p, h, 380)) && !places.some((q) => near(p, q, d + 80)) && riverDist(p) > 90;
  for (let i = 0; i < many(18); i++) {
    const p = { x: rand(200, W - 200), y: rand(200, H - 200) };
    if (!free(p)) continue;
    const kind = pick(['tankwreck', 'tankwreck', 'apc', 'truck', 'bus']);
    const size = { tankwreck: [64, 40], apc: [58, 30], truck: [48, 22], bus: [90, 28] }[kind];
    t.prop(kind, p.x, p.y, size[0], size[1], rand(0, 6.28), { solid: true, side: rand(0, 1) < 0.5 ? 'isa' : 'hgh' });
    t.scorch(p.x, p.y, 50);
  }
  for (let i = 0; i < many(60); i++) { const p = { x: rand(100, W - 100), y: rand(100, H - 100) }; if (free(p, 60)) t.prop('deadtree', p.x, p.y, 28, 28); }
  for (let i = 0; i < many(8); i++) { const p = { x: rand(300, W - 300), y: rand(300, H - 300) }; if (free(p)) t.mud(p.x, p.y, rand(80, 160), rand(60, 110)); }
  for (let i = 0; i < many(4); i++) { const p = { x: rand(300, W - 300), y: rand(300, H - 300) }; if (free(p)) t.haze(p.x, p.y, rand(110, 180), rand(80, 120)); }
  for (let i = 0; i < many(6); i++) { const p = { x: rand(300, W - 300), y: rand(300, H - 300) }; if (free(p)) t.ash(p.x, p.y, rand(200, 400), rand(150, 260)); }
  t.craters(many(150), 100, 100, W - 100, H - 100, 10, 26);
  t.debris(0, 0, W, H, 0.012);
  // Petrusite tanks by the industry and fuel dumps (stray fire sets them off).
  const tanks = [];
  for (const p of places) if (kinds.get(p) !== 'town' && kinds.get(p) !== 'comms') tanks.push([p.x + rand(-140, 140), p.y + rand(90, 150)]);
  t.petrol(tanks);
  map.hq = hq;
  map.places = places;
  void g;
  return map;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Walk out from a plateau's middle until the ground drops, and put a ramp there.
function rampOut(map, t, p, ang, level) {
  for (let d = 0; d < 500; d += 6) {
    const x = p.x + Math.cos(ang) * d, y = p.y + Math.sin(ang) * d;
    const i = cellIndex(map, x, y);
    if (i < 0) return;
    if (map.elev[i] < level) { t.ramp(x, y, 34); return; }
  }
}

// A minimum spanning tree over the places, plus a few extra roads so there
// is more than one way between the headquarters.
function spanningRoads(nodes, rand) {
  const n = nodes.length, inTree = [0], edges = [];
  const d = (a, b) => Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
  while (inTree.length < n) {
    let best = null;
    for (const a of inTree) for (let b = 0; b < n; b++) if (!inTree.includes(b) && (!best || d(a, b) < best[2])) best = [a, b, d(a, b)];
    inTree.push(best[1]);
    edges.push([best[0], best[1]]);
  }
  const has = (a, b) => edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const extra = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (!has(a, b) && d(a, b) < 1500) extra.push([a, b, d(a, b) + rand(0, 400)]);
  extra.sort((x, y) => x[2] - y[2]);
  for (const [a, b] of extra.slice(0, 4)) edges.push([a, b]);
  return edges;
}

// Where a road meets the river, a bridge carries it across.
function bridgeOver(map, t, pts) {
  const at = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1], len = Math.hypot(bx - ax, by - ay);
    for (let s = 0; s <= len; s += 8) {
      const x = ax + ((bx - ax) * s) / len, y = ay + ((by - ay) * s) / len;
      const i = cellIndex(map, x, y);
      if (i >= 0 && map.surf[i] === S.deep) at.push([x, y, Math.atan2(by - ay, bx - ax)]);
    }
  }
  if (!at.length) return;
  const [x0, y0, a] = at[0], [x1, y1] = at[at.length - 1];
  t.bridge([[x0 - Math.cos(a) * 30, y0 - Math.sin(a) * 30], [x1 + Math.cos(a) * 30, y1 + Math.sin(a) * 30]], 22);
}

// A ruined town: a few streets of gutted houses, wrecks and rubble.
function town(t, p, rand) {
  const brick = rand(0, 1) < 0.6 ? WK.brick : WK.concrete;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    if (rand(0, 1) < 0.3 || (i === 0 && j === 0)) continue;
    const x = p.x + i * 170 + rand(-20, 20), y = p.y + j * 140 + rand(-20, 20), w = rand(90, 130), h = rand(70, 100);
    t.building(x - w / 2, y - h / 2, x + w / 2, y + h / 2, [['n', 0.5, 30], ['s', rand(0.3, 0.7), 30], ['e', 0.5, 26], ['w', 0.5, 26]], brick);
    t.ruin(x - w / 2, y - h / 2, x + w / 2, y + h / 2, rand(0.1, 0.3));
  }
  t.debris(p.x - 280, p.y - 230, p.x + 280, p.y + 230, 0.06);
  // A wreck in the street, clear of the square in the middle (the supply point).
  t.prop(rand(0, 1) < 0.5 ? 'bus' : 'truck', p.x + (rand(0, 1) < 0.5 ? -1 : 1) * rand(70, 110), p.y + rand(-20, 20), 70, 26, rand(-0.3, 0.3), { solid: true });
  t.prop('lamp', p.x - 30, p.y - 70, 6, 6); t.prop('lamp', p.x + 30, p.y + 70, 6, 6);
}

// An industrial yard: containers, pipes, a silo or stack, a shed.
function industry(t, p, rand) {
  t.pad(p.x - 240, p.y - 180, p.x + 240, p.y + 180, null, 60);
  const cols = ['#7a4a2c', '#3f6f74', '#a08a3c', '#6c6f73'];
  for (let k = 0, tries = 0; k < 5 && tries < 40; tries++) {
    const x = p.x + rand(-200, 200), y = p.y + rand(-150, 150);
    if (Math.hypot(x - p.x, y - p.y) < 110) continue; // the middle stays open for the supply point
    t.prop('container', x, y, 120, 30, rand(0, 1) < 0.5 ? 0 : 1.57, { solid: true, col: cols[k++ % 4] });
  }
  t.prop('pipes', p.x, p.y - 120, 300, 30, 0, { solid: true, n: 3 });
  t.prop(rand(0, 1) < 0.5 ? 'silo' : 'stack', p.x + 160, p.y + 110, 50, 50, 0, { solid: true });
  t.building(p.x - 210, p.y + 40, p.x - 80, p.y + 150, [['n', 0.5, 50]], WK.metal);
  t.prop('barrels', p.x + 40, p.y + 60, 26, 22, 0, { low: true });
  t.haze(p.x + 60, p.y - 60, 110, 70);
}

// A fuel dump: drums, crates and barriers round a few tanks.
function fuelDump(t, p, rand) {
  t.pad(p.x - 130, p.y - 100, p.x + 130, p.y + 100, 'dark', 40);
  t.prop('tanker', p.x - 30, p.y - 50, 120, 26, 0, { solid: true });
  t.prop('barrels', p.x + 70, p.y + 10, 30, 26, 0, { low: true });
  t.prop('barrels', p.x - 80, p.y + 40, 30, 26, 0, { low: true });
  t.prop('crates', p.x + 20, p.y + 60, 40, 26, rand(0, 1), { low: true });
  t.prop('jersey', p.x, p.y + 95, 120, 12, 0, { low: true });
  t.prop('jersey', p.x, p.y - 95, 120, 12, 0, { low: true });
}

// The checks a map must pass: everything reachable from both headquarters,
// and the places that matter about as close to one HQ as the other.
function accept(map) {
  const [h0, h1] = map.hq;
  const reach = (from) => {
    const seen = new Uint8Array(map.grid.length), q = [cellIndex(map, from.x, from.y)];
    seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop(), x = i % map.cols, y = (i / map.cols) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.cols || ny >= map.rows) continue;
        const j = ny * map.cols + nx;
        if (!seen[j] && canStep(map, i, j)) { seen[j] = 1; q.push(j); }
      }
    }
    return seen;
  };
  const r0 = reach(map.deploy[0].platoons[1]);
  map.reach = r0; // kept: the AI's scouting points are put on reachable ground
  for (const s of map.sites) if (!r0[cellIndex(map, s.x, s.y)]) return false;
  for (const p of [...map.deploy[1].platoons, map.deploy[0].tank, map.deploy[1].tank]) if (!r0[cellIndex(map, p.x, p.y)]) return false;
  // Fairness: route lengths from each HQ to its four nearest supply points
  // and depots, and to the enemy HQ, must be close.
  const len = (a, b) => { const p = findPath(map, a, b, { maxNodes: 400000 }); if (!p) return 1e9; let d = 0, q = a; for (const r of p) { d += Math.hypot(r.x - q.x, r.y - q.y); q = r; } return d; };
  const goals = map.sites.filter((s) => s.kind === 'supply' || (s.kind === 'depot' && s.owner === null) || s.kind === 'comms');
  const near4 = (h) => goals.map((s) => Math.hypot(s.x - h.x, s.y - h.y)).sort((a, b) => a - b).slice(0, 4).reduce((a, b) => a + b, 0);
  const a = near4(h0), b = near4(h1);
  if (Math.abs(a - b) / Math.max(a, b) > 0.15) return false;
  return len(h0, h1) < 1e9;
}
