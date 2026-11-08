// Paints the battlefield once onto an offscreen canvas (mud, craters, ruins,
// trenches). New craters from artillery are painted on top as they appear.
// Wire is drawn every frame by the renderer because engineers cut it.

import { makeFxRandom } from './fx-random.js';
import { T } from '../sim/map.js';

const MUD = ['#5a5442', '#4a4533', '#423d2e', '#5f5a48', '#534d3c', '#4d4a3a'];

export function buildTerrain(map, seedInt) {
  const canvas = document.createElement('canvas');
  canvas.width = map.width;
  canvas.height = map.height;
  const g = canvas.getContext('2d');
  // A fixed cosmetic seed per map so the ground looks the same on replays.
  const r = makeFxRandom(seedInt ^ 0x5bd1e995);

  g.fillStyle = '#4d4836';
  g.fillRect(0, 0, map.width, map.height);
  for (let i = 0; i < 900; i++) {
    g.globalAlpha = 0.35;
    g.fillStyle = r.pick(MUD);
    g.beginPath();
    g.ellipse(r() * map.width, r() * map.height, r.range(20, 90), r.range(14, 60), r() * 3.14, 0, Math.PI * 2);
    g.fill();
  }
  // No man's land is greyer and more churned up.
  const t0 = map.trenches[0], t1 = map.trenches[1];
  const x0 = t0.reduce((a, p) => a + p.x, 0) / t0.length + 40;
  const x1 = t1.reduce((a, p) => a + p.x, 0) / t1.length - 40;
  const grad = g.createLinearGradient(x0, 0, x1, 0);
  grad.addColorStop(0, 'rgba(70,66,58,0)');
  grad.addColorStop(0.15, 'rgba(70,66,58,0.35)');
  grad.addColorStop(0.85, 'rgba(70,66,58,0.35)');
  grad.addColorStop(1, 'rgba(70,66,58,0)');
  g.globalAlpha = 1;
  g.fillStyle = grad;
  g.fillRect(x0, 0, x1 - x0, map.height);
  for (let i = 0; i < 7000; i++) {
    g.globalAlpha = r.range(0.15, 0.4);
    g.fillStyle = r() < 0.5 ? '#2f2b21' : '#7a7259';
    g.fillRect(r() * map.width, r() * map.height, r.range(1, 3), r.range(1, 3));
  }
  g.globalAlpha = 1;

  for (const c of map.craters) drawCrater(g, c, r);

  // Rubble: scattered stones on rubble cells.
  for (let i = 0; i < map.grid.length; i++) {
    if (map.grid[i] !== T.rubble) continue;
    const cx = (i % map.cols) * map.cell, cy = Math.floor(i / map.cols) * map.cell;
    for (let k = 0; k < 3; k++) {
      g.fillStyle = r.pick(['#6e6a62', '#58554e', '#807a6e', '#4a4741']);
      g.fillRect(cx + r() * map.cell, cy + r() * map.cell, r.range(2, 5), r.range(2, 4));
    }
  }
  for (const b of map.buildings) drawBuilding(g, b, r);
  for (const t of map.trenches) drawTrench(g, t);

  return { canvas, addCrater: (c) => drawCrater(g, c, r) };
}

function drawCrater(g, c, r) {
  const grad = g.createRadialGradient(c.x - c.r * 0.15, c.y - c.r * 0.15, c.r * 0.1, c.x, c.y, c.r * 1.15);
  grad.addColorStop(0, '#221e16');
  grad.addColorStop(0.55, '#3a3427');
  grad.addColorStop(0.82, '#6d6450');
  grad.addColorStop(1, 'rgba(109,100,80,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(c.x, c.y, c.r * 1.15, 0, Math.PI * 2);
  g.fill();
  // Thrown out earth round the rim.
  for (let k = 0; k < 10; k++) {
    const a = r() * Math.PI * 2, d = c.r * r.range(1, 1.5);
    g.fillStyle = r() < 0.5 ? '#3b3528' : '#6a614c';
    g.fillRect(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, r.range(2, 4), r.range(2, 4));
  }
}

function drawBuilding(g, b, r) {
  g.fillStyle = '#3c3a36';
  g.fillRect(b.x, b.y, b.w, b.h);
  g.fillStyle = '#4a4741';
  for (let k = 0; k < 6; k++) g.fillRect(b.x + r() * (b.w - 8), b.y + r() * (b.h - 8), r.range(4, 10), r.range(4, 10));
  // Broken walls: each side drawn in chunks with gaps knocked out of it.
  g.strokeStyle = '#8a857a';
  g.lineWidth = 5;
  g.lineCap = 'square';
  const sides = [[b.x, b.y, b.x + b.w, b.y], [b.x + b.w, b.y, b.x + b.w, b.y + b.h], [b.x + b.w, b.y + b.h, b.x, b.y + b.h], [b.x, b.y + b.h, b.x, b.y]];
  for (const [ax, ay, bx, by] of sides) {
    let t = 0;
    while (t < 1) {
      const len = r.range(0.15, 0.45);
      const end = Math.min(1, t + len);
      if (r() < 0.75) {
        g.beginPath();
        g.moveTo(ax + (bx - ax) * t, ay + (by - ay) * t);
        g.lineTo(ax + (bx - ax) * end, ay + (by - ay) * end);
        g.stroke();
      }
      t = end + r.range(0.05, 0.2);
    }
  }
  // Light edge on the top and right walls for a little depth.
  g.strokeStyle = 'rgba(220,214,196,0.25)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(b.x, b.y - 2);
  g.lineTo(b.x + b.w + 2, b.y - 2);
  g.lineTo(b.x + b.w + 2, b.y + b.h);
  g.stroke();
}

function drawTrench(g, pts) {
  const path = () => {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) g.lineTo(p.x, p.y);
  };
  g.lineJoin = 'round';
  g.lineCap = 'butt';
  // Sandbags: a dashed band peeking out either side of the parapet.
  g.setLineDash([7, 4]);
  path(); g.strokeStyle = '#8c8064'; g.lineWidth = 41; g.stroke();
  g.setLineDash([]);
  g.lineCap = 'round';
  path(); g.strokeStyle = '#6f664c'; g.lineWidth = 34; g.stroke(); // parapet
  path(); g.strokeStyle = '#2d281e'; g.lineWidth = 26; g.stroke();
  path(); g.strokeStyle = '#1c1913'; g.lineWidth = 14; g.stroke();
  // Duckboards along the bottom.
  g.setLineDash([3, 6]);
  path(); g.strokeStyle = '#4b4232'; g.lineWidth = 6; g.stroke();
  g.setLineDash([]);
}
