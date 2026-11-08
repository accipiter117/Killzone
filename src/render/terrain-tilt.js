// The battlefield painted in a tilted three-quarter view: still seen from
// above, but leaning back so the south faces of things show. Raised ground
// is lifted up the screen by LIFT per level with a tall cliff face beneath,
// ruins are solid walls with a lit top and a shaded front, trenches show
// their far inner wall and floor, and craters are bowls. Light comes from
// the upper left, so shadows fall down and to the right.
//
// Only the picture changes: the simulation still uses flat map positions.
// The renderer lifts anything standing on raised ground by the same amount
// (liftAt), and taps are mapped back the other way.

import { makeFxRandom } from './fx-random.js';
import { T } from '../sim/map.js';

export const LIFT = 20; // screen rise per level of height, in world units

const P = {
  ground: '#5a5847',
  groundSoft: ['#5f5d4b', '#555342', '#5c5a48', '#58563f'],
  nomans: 'rgba(84,80,68,0.35)',
  rut: 'rgba(40,37,28,0.22)',
  tuft: ['#6c6c4c', '#64653f', '#727253'],
  pebble: ['#7d796b', '#6b685c', '#8c887a'],
  shadow: 'rgba(18,16,11,0.34)',
  top: ['#5a5847', '#7f7c60', '#a39c7c'],
  rimLight: 'rgba(250,242,212,0.75)',
  face: ['#635d49', '#524c3d', '#443f33', '#37342b', '#2a2822'], // top of the face to its foot
  strata: 'rgba(25,22,16,0.18)',
  ramp: ['#6d6a53', '#878267'],
  rampStripe: 'rgba(40,36,26,0.25)',
  craterLip: '#7d785f', craterWall: '#6a644f', craterFloor: '#3a372c', craterShade: '#2c2a22',
  wallTop: '#b0aa98', wallTopEdge: 'rgba(255,250,232,0.4)', wallFront: '#6f6a5c', wallFrontDark: '#545045', wallSide: '#5f5b4f',
  floor: '#45433a', floorTile: 'rgba(255,250,230,0.05)',
  trenchLip: '#8b8061', trenchFar: '#7a6a4c', trenchPlank: 'rgba(40,30,18,0.45)', trenchFloor: '#2a261d', trenchNear: '#1c1912', duck: '#5a4b34',
};

const WALL_H = 22; // ruined wall height (screen units) at its tallest

export function buildTiltTerrain(map, seedInt) {
  const canvas = document.createElement('canvas');
  canvas.width = map.width;
  canvas.height = map.height;
  const g = canvas.getContext('2d');
  const r = makeFxRandom(seedInt ^ 0x5bd1e995);
  const c = map.cell;
  const cellXY = (i) => [(i % map.cols) * c + c / 2, Math.floor(i / map.cols) * c + c / 2];

  // Ground: a calm base, big soft tone changes, then small life: tyre ruts,
  // tufts of grass and pebbles, all sparse so units stay readable.
  g.fillStyle = P.ground;
  g.fillRect(0, 0, map.width, map.height);
  for (let i = 0; i < 140; i++) {
    g.globalAlpha = 0.5;
    g.fillStyle = r.pick(P.groundSoft);
    g.beginPath();
    g.ellipse(r() * map.width, r() * map.height, r.range(80, 220), r.range(60, 160), r() * 3.14, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const t0 = map.trenches[0], t1 = map.trenches[1];
  const x0 = t0.reduce((a, p) => a + p.x, 0) / t0.length + 60;
  const x1 = t1.reduce((a, p) => a + p.x, 0) / t1.length - 60;
  g.fillStyle = P.nomans;
  g.fillRect(x0, 0, x1 - x0, map.height);
  g.strokeStyle = P.rut;
  g.lineWidth = 3;
  for (let i = 0; i < 26; i++) {
    let x = r() * map.width, y = r() * map.height;
    const a = r.range(-0.4, 0.4);
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += Math.cos(a + r.range(-0.2, 0.2)) * 30; y += Math.sin(a + r.range(-0.2, 0.2)) * 30; g.lineTo(x, y); }
    g.stroke();
    g.save(); g.translate(0, 9); g.stroke(); g.restore();
  }
  for (let i = 0; i < 1400; i++) {
    const x = r() * map.width, y = r() * map.height;
    const cell = Math.floor(y / c) * map.cols + Math.floor(x / c);
    if (map.grid[cell] !== T.open || map.elev[cell] > 0) continue;
    if (r() < 0.6) {
      g.strokeStyle = r.pick(P.tuft);
      g.lineWidth = 1.2;
      g.beginPath();
      for (const dx of [-2, 0, 2]) { g.moveTo(x + dx * 0.6, y); g.lineTo(x + dx, y - r.range(3, 5)); }
      g.stroke();
    } else {
      g.fillStyle = 'rgba(20,18,14,0.3)';
      g.fillRect(x + 1, y + 1, 3, 2);
      g.fillStyle = r.pick(P.pebble);
      g.fillRect(x, y, r.range(2, 4), 2);
    }
  }

  // Raised ground, level by level. Each level's top is drawn LIFT higher per
  // level, with a tall banded cliff face filling the drop beneath it.
  const disc = (x, y, rad, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); };
  const R = c * 0.95;
  const isRamp = (i) => map.ramp[i] === 1;
  for (const level of [1, 2]) {
    const cells = [];
    for (let i = 0; i < map.elev.length; i++) if (map.elev[i] >= level) cells.push(i);
    if (!cells.length) continue;
    const base = LIFT * (level - 1), topY = LIFT * level;
    for (const i of cells) { if (isRamp(i)) continue; const [x, y] = cellXY(i); disc(x + 18, y - base + 8, R, P.shadow); }
    for (let k = 0; k <= LIFT; k++) {
      const band = P.face[Math.min(P.face.length - 1, Math.floor(((LIFT - k) / LIFT) * P.face.length))];
      for (const i of cells) { if (isRamp(i)) continue; const [x, y] = cellXY(i); disc(x, y - base - k, R, band); }
      if (k % 5 === 2) for (const i of cells) { if (isRamp(i) || r() < 0.85) continue; const [x, y] = cellXY(i); g.fillStyle = P.strata; g.fillRect(x - 6, y - base - k, 12, 1); }
    }
    for (const i of cells) { const [x, y] = cellXY(i); disc(x - 0.6, y - topY - 1.2, R, P.rimLight); }
    for (const i of cells) { const [x, y] = cellXY(i); disc(x, y - topY, R, P.top[level]); }
    // Ramps up to this level: a slope from the level below, striped across.
    for (let i = 0; i < map.ramp.length; i++) {
      if (!isRamp(i) || map.elev[i] !== level - 1) continue;
      const [x, y] = cellXY(i);
      for (let k = 0; k <= LIFT; k += 2) disc(x, y - base - k, R, P.ramp[level - 1]);
    }
    g.strokeStyle = P.rampStripe;
    g.lineWidth = 1;
    for (let i = 0; i < map.ramp.length; i++) {
      if (!isRamp(i) || map.elev[i] !== level - 1 || i % 2) continue;
      const [x, y] = cellXY(i);
      g.beginPath(); g.moveTo(x - 5, y - base - LIFT * 0.5); g.lineTo(x + 5, y - base - LIFT * 0.5); g.stroke();
    }
  }

  for (const cr of map.craters) drawCrater(g, cr, liftAt(map, cr.x, cr.y));
  // Rubble: a few clean stones per cell, on whatever level they sit.
  for (let i = 0; i < map.grid.length; i++) {
    if (map.grid[i] !== T.rubble || r() < 0.72) continue;
    const [x, y0] = cellXY(i);
    const y = y0 - LIFT * map.elev[i];
    g.fillStyle = 'rgba(20,18,14,0.3)';
    g.fillRect(x - 2, y + 2, 6, 3);
    g.fillStyle = r.pick(P.pebble);
    g.fillRect(x - 3 + r() * 2, y - 2 + r() * 2, r.range(3, 6), r.range(3, 4));
  }
  for (const t of map.trenches) drawTrench(g, t);
  // Ruins last, north to south, so nearer walls overlap farther ones.
  for (const b of [...map.buildings].sort((a, b2) => a.y + a.h - (b2.y + b2.h))) drawRuin(g, b, r, liftAt(map, b.x + b.w / 2, b.y + b.h / 2));

  const addSandbags = (cells) => {
    for (const i of cells) {
      const [cx, cy] = cellXY(i);
      const x = cx - c / 2, y = cy - c / 2 - LIFT * map.elev[i];
      g.fillStyle = 'rgba(24,22,16,0.4)';
      g.fillRect(x + 3, y + 5, c, c * 0.7);
      for (const [ox, oy] of [[0, 2], [5, 2], [2.5, -2]]) {
        g.fillStyle = '#8d7f58';
        g.beginPath(); g.roundRect(x + ox, y + oy + 1.5, 5.5, 4, 1.6); g.fill();
        g.fillStyle = '#a6976d';
        g.beginPath(); g.roundRect(x + ox, y + oy, 5.5, 3.5, 1.6); g.fill();
        g.fillStyle = 'rgba(255,244,210,0.35)';
        g.fillRect(x + ox + 1, y + oy + 0.4, 3.5, 1);
      }
    }
  };
  // Sandbags already built (when the picture is repainted mid-battle).
  const built = [];
  for (let i = 0; i < map.grid.length; i++) if (map.grid[i] === T.sandbag) built.push(i);
  if (built.length) addSandbags(built);
  return { canvas, lift: LIFT, addCrater: (cr) => drawCrater(g, cr, liftAt(map, cr.x, cr.y)), addSandbags };
}

// How far up the screen anything standing at (x, y) is drawn.
export function liftAt(map, x, y) {
  const i = Math.floor(y / map.cell) * map.cols + Math.floor(x / map.cell);
  return i < 0 || i >= map.elev.length ? 0 : LIFT * map.elev[i];
}

// A shell hole seen from the side: a raised lip, the far wall lit, the near
// wall in shade and a dark floor.
function drawCrater(g, cr, lift) {
  const x = cr.x, y = cr.y - lift, rr = cr.r;
  g.fillStyle = 'rgba(20,18,14,0.25)';
  g.beginPath(); g.ellipse(x + 3, y + 3, rr * 1.08, rr * 0.8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = P.craterLip;
  g.beginPath(); g.ellipse(x, y, rr, rr * 0.74, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = P.craterWall;
  g.beginPath(); g.ellipse(x, y + rr * 0.04, rr * 0.82, rr * 0.58, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = P.craterShade;
  g.beginPath(); g.ellipse(x, y + rr * 0.16, rr * 0.7, rr * 0.44, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = P.craterFloor;
  g.beginPath(); g.ellipse(x + rr * 0.06, y + rr * 0.24, rr * 0.5, rr * 0.3, 0, 0, Math.PI * 2); g.fill();
}

// A ruined building: a dark floor with broken tiles, then walls standing up
// off it. Each wall run has a jagged height, a lit top, a front face (darker
// near the ground) and window gaps on the longer runs.
function drawRuin(g, b, r, lift) {
  const bx = b.x, by = b.y - lift;
  g.fillStyle = 'rgba(18,16,11,0.38)';
  g.beginPath();
  g.moveTo(bx + b.w, by); g.lineTo(bx + b.w + 16, by + 10); g.lineTo(bx + b.w + 16, by + b.h + 10); g.lineTo(bx + 16, by + b.h + 10); g.lineTo(bx, by + b.h);
  g.closePath(); g.fill();
  g.fillStyle = P.floor;
  g.fillRect(bx, by, b.w, b.h);
  g.fillStyle = P.floorTile;
  for (let y = by + 3; y < by + b.h - 2; y += 7) for (let x = bx + 3 + ((y - by) % 14 ? 3 : 0); x < bx + b.w - 3; x += 7) if (r() < 0.6) g.fillRect(x, y, 5, 5);

  const T_ = 5;
  const runs = [];
  const side = (ax, ay, bx2, by2, horizontal) => {
    let t = 0;
    while (t < 1) {
      const len = r.range(0.22, 0.55), end = Math.min(1, t + len);
      if (r() < 0.78) runs.push({ ax: ax + (bx2 - ax) * t, ay: ay + (by2 - ay) * t, bx: ax + (bx2 - ax) * end, by: ay + (by2 - ay) * end, horizontal, h: r.range(0.45, 1) * WALL_H });
      t = end + r.range(0.08, 0.2);
    }
  };
  side(bx, by, bx + b.w, by, true);
  side(bx, by, bx, by + b.h, false);
  side(bx + b.w, by, bx + b.w, by + b.h, false);
  side(bx, by + b.h, bx + b.w, by + b.h, true);
  runs.sort((a, b2) => Math.max(a.ay, a.by) - Math.max(b2.ay, b2.by));
  for (const w of runs) {
    if (w.horizontal) {
      const x = Math.min(w.ax, w.bx), len = Math.abs(w.bx - w.ax), y = w.ay;
      // Jagged top: a few steps along the run.
      const steps = Math.max(1, Math.round(len / 9));
      for (let s = 0; s < steps; s++) {
        const sx = x + (s * len) / steps, sw = len / steps + 0.5;
        const h = w.h * (s % 2 ? r.range(0.75, 1) : 1);
        const grad = g.createLinearGradient(0, y - h, 0, y);
        grad.addColorStop(0, P.wallFront); grad.addColorStop(1, P.wallFrontDark);
        g.fillStyle = grad;
        g.fillRect(sx, y - h, sw, h);
        g.fillStyle = P.wallTop;
        g.fillRect(sx, y - h - T_, sw, T_);
        g.fillStyle = P.wallTopEdge;
        g.fillRect(sx, y - h - T_, sw, 1.2);
      }
      if (len > 26 && w.h > WALL_H * 0.7) {
        g.fillStyle = 'rgba(20,18,14,0.75)';
        for (let wx = x + 8; wx < x + len - 10; wx += 16) g.fillRect(wx, y - w.h * 0.72, 5, w.h * 0.36);
      }
    } else {
      // Side walls run away from the viewer: we see their top and a thin lit side.
      const x = w.ax - T_ / 2, y0 = Math.min(w.ay, w.by), y1 = Math.max(w.ay, w.by);
      g.fillStyle = P.wallSide;
      g.fillRect(x, y0 - w.h, T_, y1 - y0 + w.h);
      g.fillStyle = P.wallTop;
      g.fillRect(x, y0 - w.h - T_, T_, y1 - y0);
      g.fillStyle = P.wallTopEdge;
      g.fillRect(x, y0 - w.h - T_, 1.2, y1 - y0);
    }
  }
}

// A trench cut into the ground: a spoil lip, the far (north) inner wall lit
// and revetted with planks, a dark floor with duckboards, and the near wall
// hidden in shade.
function drawTrench(g, pts) {
  const path = (dy = 0) => {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y + dy);
    for (const p of pts) g.lineTo(p.x, p.y + dy);
  };
  g.lineJoin = 'round';
  g.lineCap = 'round';
  path(3); g.strokeStyle = 'rgba(20,18,14,0.3)'; g.lineWidth = 42; g.stroke();
  path(); g.strokeStyle = P.trenchLip; g.lineWidth = 36; g.stroke();
  path(); g.strokeStyle = P.trenchNear; g.lineWidth = 25; g.stroke();
  path(-2); g.strokeStyle = P.trenchFar; g.lineWidth = 19; g.stroke();
  g.setLineDash([1.5, 4]);
  path(-3); g.strokeStyle = P.trenchPlank; g.lineWidth = 13; g.stroke();
  g.setLineDash([]);
  path(4); g.strokeStyle = P.trenchFloor; g.lineWidth = 12; g.stroke();
  g.setLineDash([3, 5]);
  path(4); g.strokeStyle = P.duck; g.lineWidth = 5; g.stroke();
  g.setLineDash([]);
}
