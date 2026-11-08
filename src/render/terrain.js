// Paints the battlefield once onto an offscreen canvas, in a clean, calm
// style (after Bad North): quiet ground, raised plateaus with visible cliff
// faces and soft shadows, striped ramps, chunky 2.5D ruins, crisp trenches.
// Light comes from the upper left. New craters and sandbags are painted on
// as they appear; wire is drawn live by the renderer because it gets cut.

import { makeFxRandom } from './fx-random.js';
import { T } from '../sim/map.js';

const P = {
  ground: '#595747',
  groundSoft: ['#5e5c4b', '#555343', '#5b5948', '#575545'],
  nomans: 'rgba(90,86,74,0.35)',
  shadow: 'rgba(20,18,13,0.38)',
  top: ['#595747', '#7c795f', '#958f71'], // by level
  faceLight: '#6a6450', // upper part of a cliff face
  face: '#4c473a',
  faceDark: '#34312a',
  rim: 'rgba(240,232,200,0.5)',
  ramp: ['#6b6852', '#868166'],
  crater: '#3d3a2f', craterRim: '#7a765f',
  stone: ['#7d796b', '#6b685c', '#8c887a'],
  wallTop: '#a29d8c', wallFace: '#6b675b', floor: '#4b493f',
  trenchLip: '#8b8061', trench: '#2e2a20', trenchFloor: '#1f1c15', duck: '#4b4232',
};
const FACE = 12; // cliff face height in pixels

export function buildTerrain(map, seedInt) {
  const canvas = document.createElement('canvas');
  canvas.width = map.width;
  canvas.height = map.height;
  const g = canvas.getContext('2d');
  const r = makeFxRandom(seedInt ^ 0x5bd1e995);
  const c = map.cell;
  const cellXY = (i) => [(i % map.cols) * c + c / 2, Math.floor(i / map.cols) * c + c / 2];

  // Quiet ground: a flat colour with a few big, soft tone changes.
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

  // Raised ground, level by level: shadow, cliff face, then the top.
  const disc = (x, y, rad, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); };
  const R = c * 0.95; // overlapping discs give smooth, rounded edges
  const isRamp = (i) => map.ramp[i] === 1;
  for (const level of [1, 2]) {
    const cells = [];
    for (let i = 0; i < map.elev.length; i++) if (map.elev[i] >= level) cells.push(i);
    if (!cells.length) continue;
    // Shadow cast down and to the right, then the cliff face (lit at the
    // top, darkest at the foot), then a light rim and the flat top.
    for (const i of cells) { if (isRamp(i)) continue; const [x, y] = cellXY(i); disc(x + 8, y + FACE + 5, R, P.shadow); }
    for (let k = FACE; k >= 1; k--) {
      const col = k > FACE - 3 ? P.faceDark : k < 4 ? P.faceLight : P.face;
      for (const i of cells) { if (isRamp(i)) continue; const [x, y] = cellXY(i); disc(x, y + k, R, col); }
    }
    for (const i of cells) { const [x, y] = cellXY(i); disc(x - 0.5, y - 1, R, P.rim); }
    for (const i of cells) { const [x, y] = cellXY(i); disc(x, y, R, P.top[level]); }
    // Ramps on this level: a smooth slope blending down to the ground.
    for (let i = 0; i < map.ramp.length; i++) {
      if (!isRamp(i) || map.elev[i] !== level - 1) continue;
      const [x, y] = cellXY(i);
      disc(x, y, R, P.ramp[level - 1]);
    }
  }

  for (const cr of map.craters) drawCrater(g, cr);

  // Rubble: a few clean stones per cell.
  for (let i = 0; i < map.grid.length; i++) {
    if (map.grid[i] !== T.rubble || r() < 0.75) continue;
    const [x, y] = cellXY(i);
    g.fillStyle = 'rgba(20,18,14,0.3)';
    g.fillRect(x - 2, y + 1, 5, 3);
    g.fillStyle = r.pick(P.stone);
    g.fillRect(x - 3 + r() * 2, y - 2 + r() * 2, r.range(3, 5), r.range(2, 4));
  }
  for (const b of map.buildings) drawRuin(g, b, r);
  for (const t of map.trenches) drawTrench(g, t);

  const addSandbags = (cells) => {
    for (const i of cells) {
      const [cx, cy] = cellXY(i);
      const x = cx - c / 2, y = cy - c / 2;
      g.fillStyle = 'rgba(24,22,16,0.4)';
      g.fillRect(x + 2, y + 3, c, c);
      for (const [ox, oy] of [[0, 0], [5, 0], [2.5, 5]]) {
        g.fillStyle = '#a6976d';
        g.beginPath();
        g.roundRect(x + ox, y + oy, 5, 4.5, 1.6);
        g.fill();
        g.fillStyle = 'rgba(255,244,210,0.35)';
        g.fillRect(x + ox + 1, y + oy + 0.5, 3, 1);
      }
    }
  };
  // Sandbags already built (when the picture is repainted mid-battle).
  const built = [];
  for (let i = 0; i < map.grid.length; i++) if (map.grid[i] === T.sandbag) built.push(i);
  if (built.length) addSandbags(built);
  return { canvas, addCrater: (cr) => drawCrater(g, cr), addSandbags };
}

function drawCrater(g, c) {
  g.fillStyle = 'rgba(20,18,14,0.25)';
  g.beginPath();
  g.ellipse(c.x + 2, c.y + 2, c.r * 1.05, c.r * 0.95, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = P.craterRim;
  g.beginPath();
  g.ellipse(c.x, c.y, c.r, c.r * 0.92, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = P.crater;
  g.beginPath();
  g.ellipse(c.x + c.r * 0.08, c.y + c.r * 0.1, c.r * 0.74, c.r * 0.66, 0, 0, Math.PI * 2);
  g.fill();
}

// Ruins as chunky little blocks: a dark floor, broken walls with a lit top
// and a shaded face towards the viewer.
function drawRuin(g, b, r) {
  g.fillStyle = 'rgba(22,20,15,0.35)';
  g.fillRect(b.x + 6, b.y + 8, b.w, b.h);
  g.fillStyle = P.floor;
  g.fillRect(b.x, b.y, b.w, b.h);
  const T_ = 5, H = 7;
  const walls = [];
  const side = (ax, ay, bx, by) => {
    let t = 0;
    while (t < 1) {
      const len = r.range(0.2, 0.5), end = Math.min(1, t + len);
      if (r() < 0.75) walls.push([ax + (bx - ax) * t, ay + (by - ay) * t, ax + (bx - ax) * end, ay + (by - ay) * end]);
      t = end + r.range(0.08, 0.22);
    }
  };
  side(b.x, b.y, b.x + b.w, b.y);
  side(b.x + b.w, b.y, b.x + b.w, b.y + b.h);
  side(b.x, b.y + b.h, b.x + b.w, b.y + b.h);
  side(b.x, b.y, b.x, b.y + b.h);
  for (const [ax, ay, bx, by] of walls) {
    const x = Math.min(ax, bx) - T_ / 2, y = Math.min(ay, by) - T_ / 2;
    const w = Math.abs(bx - ax) + T_, h = Math.abs(by - ay) + T_;
    g.fillStyle = P.wallFace;
    g.fillRect(x, y + h - H / 2, w, H);
    g.fillStyle = P.wallTop;
    g.fillRect(x, y - H / 2, w, h);
    g.fillStyle = 'rgba(255,248,226,0.25)';
    g.fillRect(x, y - H / 2, w, 1.5);
  }
}

function drawTrench(g, pts) {
  const path = () => {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) g.lineTo(p.x, p.y);
  };
  g.lineJoin = 'round';
  g.lineCap = 'round';
  path(); g.strokeStyle = 'rgba(20,18,14,0.3)'; g.lineWidth = 40; g.stroke();
  path(); g.strokeStyle = P.trenchLip; g.lineWidth = 34; g.stroke();
  path(); g.strokeStyle = P.trench; g.lineWidth = 24; g.stroke();
  path(); g.strokeStyle = P.trenchFloor; g.lineWidth = 13; g.stroke();
  g.setLineDash([3, 6]);
  path(); g.strokeStyle = P.duck; g.lineWidth = 5; g.stroke();
  g.setLineDash([]);
}
