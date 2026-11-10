// The war map, drawn on a canvas like a painted war table: provinces in
// each side's colour with a painted texture, dark borders, the front as a
// trench where the two sides meet, then names, sites, army standards and
// order badges on top. The painted board is drawn once into an offscreen
// picture and repainted only when a province changes hands; everything on
// top is drawn every frame at a fixed size on screen.

import { worldMatrix, toScreen } from './camera.js';
import { strengthOf } from '../campaign/state.js';

const SCALE = 3; // offscreen picture pixels per world unit
// World units round the board, so its edges never sit under the bars: more
// above (the top bar and objective) and below (the army bar) than at the sides.
const MARGIN = { side: 20, top: 110, bottom: 80 };
const FILL = ['#2b4663', '#5f2b20'];
const FLAG = [['#4682c8', '#24507f'], ['#bd4a2c', '#6e2414']];
const LIGHT = ['#7fb6ff', '#ff8a52'];

function hash(x, y, s = 0) {
  let h = Math.imul((x * 73856093) ^ (y * 19349663) ^ (s * 83492791), 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// Smooth value noise, a few octaves: the painted mottling of the table.
function paintNoise(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const smooth = (t) => t * t * (3 - 2 * t);
  const value = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c2 = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * xf + (c2 - a) * yf + (a - b - c2 + d) * xf * yf;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0, amp = 0.5, f = 1 / 48;
      for (let o = 0; o < 4; o++) { v += value(x * f, y * f, o + 3) * amp; amp *= 0.5; f *= 2; }
      const grain = hash(x, y, 9) * 0.25;
      const k = Math.max(0, Math.min(255, (v * 0.85 + grain) * 255));
      const i = (y * w + x) * 4;
      img.data[i] = k; img.data[i + 1] = k * 0.94; img.data[i + 2] = k * 0.8; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function createWarmap(state) {
  const W = state.width, H = state.height;
  const paths = state.provinces.map((p) => {
    const path = new Path2D();
    p.pts.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();
    return path;
  });
  const base = document.createElement('canvas');
  base.width = W * SCALE;
  base.height = H * SCALE;
  return { W, H, CW: W + MARGIN.side * 2, CH: H + MARGIN.top + MARGIN.bottom, ox: MARGIN.side, oy: MARGIN.top, paths, base, noise: null, sig: null, hits: [], badgeHits: [], pos: new Map() };
}

const ownerSig = (state) => state.provinces.map((p) => p.owner).join('');

// The shared border between a province and a neighbour (three points:
// corner, bend, corner), from the province's own outline.
function sharedEdge(state, a, b) {
  const pa = state.provinces[a];
  if (b === a + 1) return pa.pts.slice(2, 5);
  if (b === a + state.cols) return pa.pts.slice(4, 7);
  if (b === a - 1) return [pa.pts[6], pa.pts[7], pa.pts[0]];
  return [pa.pts[0], pa.pts[1], pa.pts[2]];
}

export function refreshBase(wm, state) {
  const sig = ownerSig(state);
  if (sig === wm.sig) return;
  wm.sig = sig;
  if (!wm.noise) wm.noise = paintNoise(Math.ceil(wm.W * 1.5), Math.ceil(wm.H * 1.5));
  const g = wm.base.getContext('2d');
  g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  g.clearRect(0, 0, wm.W, wm.H);
  state.provinces.forEach((p, i) => { g.fillStyle = FILL[p.owner]; g.fill(wm.paths[i]); });
  // Painted texture over everything.
  g.globalCompositeOperation = 'soft-light';
  g.globalAlpha = 0.9;
  g.drawImage(wm.noise, 0, 0, wm.W, wm.H);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  // Borders: dark lines with a faint light edge.
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const path of wm.paths) { g.strokeStyle = '#0a0b08'; g.lineWidth = 3; g.stroke(path); }
  for (const path of wm.paths) { g.strokeStyle = 'rgba(255,240,210,0.08)'; g.lineWidth = 1; g.stroke(path); }
  // The front: a trench along every border between the two sides.
  const front = new Path2D();
  for (const p of state.provinces) {
    for (const n of p.neighbours) {
      if (n < p.id || state.provinces[n].owner === p.owner) continue;
      const e = sharedEdge(state, p.id, n);
      front.moveTo(e[0][0], e[0][1]); front.lineTo(e[1][0], e[1][1]); front.lineTo(e[2][0], e[2][1]);
    }
  }
  g.strokeStyle = 'rgba(255,90,50,0.25)'; g.lineWidth = 15; g.stroke(front);
  g.strokeStyle = '#150f0a'; g.lineWidth = 9; g.stroke(front);
  g.strokeStyle = '#5a3d24'; g.lineWidth = 5; g.stroke(front);
  g.strokeStyle = 'rgba(217,185,138,0.9)'; g.lineWidth = 1.2; g.setLineDash([3, 4]); g.stroke(front); g.setLineDash([]);
  // A dark rim.
  const grad = g.createRadialGradient(wm.W / 2, wm.H / 2, Math.min(wm.W, wm.H) * 0.35, wm.W / 2, wm.H / 2, Math.max(wm.W, wm.H) * 0.62);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = grad;
  g.fillRect(0, 0, wm.W, wm.H);
}

// Which province a world point is in (or -1).
export function provinceAt(wm, state, wx, wy, g) {
  const x = wx - wm.ox, y = wy - wm.oy;
  for (let i = 0; i < wm.paths.length; i++) if (g.isPointInPath(wm.paths[i], x, y)) return i;
  return -1;
}

// ---- Site icons ---------------------------------------------------------------
const GLYPH = {
  capital(g) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 2.6 : 6.2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); },
  city(g) { g.fillRect(-6, -2, 4, 7); g.fillRect(-1.5, -6, 4, 11); g.fillRect(3.5, -3, 3, 8); },
  factory(g) { g.beginPath(); g.moveTo(-6.5, 5); g.lineTo(-6.5, -1); g.lineTo(-2.5, 1.5); g.lineTo(-2.5, -1); g.lineTo(1.5, 1.5); g.lineTo(1.5, -6); g.lineTo(4.5, -6); g.lineTo(4.5, 1.5); g.lineTo(6.5, 1.5); g.lineTo(6.5, 5); g.closePath(); g.fill(); },
  tankworks(g) { g.fillRect(-6.5, 0, 13, 4.5); g.fillRect(-3.5, -3.5, 6, 4); g.fillRect(2, -2.5, 5.5, 1.6); },
  power(g) { g.beginPath(); g.moveTo(1.5, -7); g.lineTo(-4.5, 1); g.lineTo(-0.5, 1); g.lineTo(-1.5, 7); g.lineTo(4.5, -1); g.lineTo(0.5, -1); g.closePath(); g.fill(); },
  comms(g) { g.fillRect(-0.9, -2, 1.8, 8); g.beginPath(); g.arc(0, -3, 1.8, 0, Math.PI * 2); g.fill(); g.lineWidth = 1.4; for (const r of [4, 6.5]) { g.beginPath(); g.arc(0, -3, r, -Math.PI * 0.85, -Math.PI * 0.15); g.stroke(); } },
  airfield(g) { g.beginPath(); g.moveTo(0, -7); g.lineTo(1.2, -2); g.lineTo(7, 1); g.lineTo(7, 2.5); g.lineTo(1.2, 1); g.lineTo(1, 4.5); g.lineTo(3, 6.5); g.lineTo(-3, 6.5); g.lineTo(-1, 4.5); g.lineTo(-1.2, 1); g.lineTo(-7, 2.5); g.lineTo(-7, 1); g.lineTo(-1.2, -2); g.closePath(); g.fill(); },
  none() {},
};
export const SITE_LABEL = { capital: 'Capital', city: 'City', factory: 'Factory', tankworks: 'Tank works', power: 'Power plant', comms: 'Comms hub', airfield: 'Airfield', none: 'Open ground' };

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// view: { dpr, now, selected (army id), province (picked province id),
//   orders ([{to, kind, odds}] for the chosen army), threats (Set of province
//   ids the enemy can hit), objective (province ids), playerSide, fighting }
export function drawWarmap(g, wm, state, cam, view) {
  refreshBase(wm, state);
  const dpr = view.dpr;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#0d0e0b';
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  const m = worldMatrix(cam);
  g.setTransform(m[0] * dpr, m[1] * dpr, m[2] * dpr, m[3] * dpr, m[4] * dpr, m[5] * dpr);
  g.translate(wm.ox, wm.oy);
  // The table edge.
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(-6, -6, wm.W + 12, wm.H + 12);
  g.imageSmoothingEnabled = true;
  g.drawImage(wm.base, 0, 0, wm.W, wm.H);
  const pulse = 0.5 + 0.5 * Math.sin(view.now * 4.5);
  const px = 1 / cam.z;
  // Where the chosen army can go.
  for (const o of view.orders || []) {
    g.fillStyle = o.kind === 'march' ? 'rgba(255,250,235,0.14)' : o.kind === 'take' ? `rgba(232,192,74,${0.16 + 0.1 * pulse})` : `rgba(255,70,40,${0.14 + 0.12 * pulse})`;
    g.fill(wm.paths[o.to]);
  }
  // Objective targets: a gold dashed outline.
  g.lineJoin = 'round';
  for (const id of view.objective || []) {
    g.strokeStyle = 'rgba(232,192,74,0.9)'; g.lineWidth = 2 * px; g.setLineDash([5 * px, 4 * px]);
    g.stroke(wm.paths[id]);
  }
  g.setLineDash([]);
  // Where the enemy may strike next: pulsing red.
  for (const id of view.threats || []) {
    g.strokeStyle = `rgba(255,74,46,${0.35 + 0.65 * pulse})`; g.lineWidth = 2.5 * px; g.setLineDash([7 * px, 5 * px]);
    g.stroke(wm.paths[id]);
  }
  g.setLineDash([]);
  if (view.province != null && view.province >= 0) { g.strokeStyle = '#e8c04a'; g.lineWidth = 2.5 * px; g.stroke(wm.paths[view.province]); }
  if (state.battle) { g.fillStyle = `rgba(255,200,60,${0.12 + 0.18 * pulse})`; g.fill(wm.paths[state.battle.province]); }

  // ---- Screen space from here.
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const S = (x, y) => toScreen(cam, x + wm.ox, y + wm.oy);
  const k = Math.max(0.8, Math.min(1.4, cam.z * 1.05));
  const zz = cam.z;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Names, sites and supply.
  for (const p of state.provinces) {
    const c = S(p.cx, p.cy);
    const y = c.y - 44 * zz;
    g.font = `600 ${Math.round(10 * k)}px Oswald, system-ui, sans-serif`;
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.fillText(p.name.toUpperCase(), c.x + 1, y + 1);
    g.fillStyle = '#f4ecd8';
    g.fillText(p.name.toUpperCase(), c.x, y);
    // Site icon and supply.
    const sy = y + 13 * k;
    const text = `+${p.supply}`;
    g.font = `600 ${Math.round(9.5 * k)}px Inter, system-ui, sans-serif`;
    const tw = g.measureText(text).width;
    const hasIcon = p.site !== 'none';
    const total = (hasIcon ? 14 * k : 0) + tw;
    let x0 = c.x - total / 2;
    if (hasIcon) {
      g.save(); g.translate(x0 + 6 * k, sy); g.scale(k * 0.8, k * 0.8);
      g.fillStyle = p.site === 'capital' ? '#e8c04a' : '#f4ecd8'; g.strokeStyle = g.fillStyle;
      GLYPH[p.site](g); g.restore();
      x0 += 14 * k;
    }
    g.textAlign = 'left';
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(text, x0 + 1, sy + 1);
    g.fillStyle = '#e0c27a'; g.fillText(text, x0, sy);
    g.textAlign = 'center';
  }

  // Army standards (gliding to where they now stand).
  wm.hits = [];
  const fw = 30 * k, fh = 34 * k;
  for (const a of state.armies) {
    const p = state.provinces[a.at];
    let cur = wm.pos.get(a.id);
    if (!cur) { cur = { x: p.cx, y: p.cy }; wm.pos.set(a.id, cur); }
    cur.x += (p.cx - cur.x) * 0.18; cur.y += (p.cy - cur.y) * 0.18;
    const c = S(cur.x, cur.y);
    const x = c.x - fw / 2, y = c.y - 2 * zz - fh / 2;
    const sel = view.selected === a.id;
    const done = a.moved && a.side === view.playerSide && state.active === view.playerSide;
    g.globalAlpha = done ? 0.55 : 1;
    if (sel) {
      g.strokeStyle = '#e8c04a'; g.lineWidth = 2.5;
      roundRect(g, x - 4, y - 4, fw + 8, fh + 16 * k, 6); g.stroke();
      g.strokeStyle = `rgba(232,192,74,${0.5 * (1 - pulse)})`; g.lineWidth = 6;
      roundRect(g, x - 7, y - 7, fw + 14, fh + 22 * k, 8); g.stroke();
    }
    // The flag: a pennant with the army's numeral.
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.beginPath(); g.moveTo(x - 1, y - 1); g.lineTo(x + fw + 1, y - 1); g.lineTo(x + fw + 1, y + fh * 0.72 + 1); g.lineTo(x + fw / 2, y + fh + 2); g.lineTo(x - 1, y + fh * 0.72 + 1); g.closePath(); g.fill();
    const grad = g.createLinearGradient(0, y, 0, y + fh);
    grad.addColorStop(0, FLAG[a.side][0]); grad.addColorStop(1, FLAG[a.side][1]);
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + fw, y); g.lineTo(x + fw, y + fh * 0.72); g.lineTo(x + fw / 2, y + fh); g.lineTo(x, y + fh * 0.72); g.closePath(); g.fill();
    g.fillStyle = '#fff';
    g.font = `700 ${Math.round(13 * k)}px Oswald, system-ui, sans-serif`;
    g.fillText(a.num, x + fw / 2, y + fh * 0.36);
    if (a.dug) {
      g.fillStyle = '#b59a68';
      for (const [dx, dy] of [[-6, 0], [0, 0], [6, 0], [-3, -3], [3, -3]]) { g.beginPath(); g.ellipse(x + fw + 4 * k + dx * 0.6 * k, y + fh * 0.85 + dy * k, 2.6 * k, 1.8 * k, 0, 0, Math.PI * 2); g.fill(); }
    }
    // Strength bar and platoon pips.
    const by = y + fh + 4 * k;
    g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x + 2, by, fw - 4, 4 * k);
    const s = strengthOf(a);
    g.fillStyle = s < 0.4 ? '#ff6b5f' : s < 0.7 ? '#e8c04a' : '#9fd38a';
    g.fillRect(x + 2, by, (fw - 4) * s, 4 * k);
    for (let i = 0; i < a.platoons.length; i++) {
      g.fillStyle = LIGHT[a.side];
      g.beginPath(); g.arc(c.x + (i - (a.platoons.length - 1) / 2) * 7 * k, by + 9 * k, 2.4 * k, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    wm.hits.push({ x: x - 6, y: y - 6, w: fw + 12, h: fh + 26 * k, id: a.id });
  }

  // Order badges: March, Take, Fight with the odds.
  wm.badgeHits = [];
  for (const o of view.orders || []) {
    const p = state.provinces[o.to];
    const c = S(p.cx, p.cy);
    const text = o.kind === 'march' ? 'MARCH' : o.kind === 'take' ? 'TAKE' : `FIGHT ${Math.round(o.odds * 100)}%`;
    g.font = `700 ${Math.round(11 * k)}px Oswald, system-ui, sans-serif`;
    const w = g.measureText(text).width + 20 * k, h = 24 * k;
    const occupied = state.armies.some((a) => a.at === o.to);
    const y = c.y + (occupied ? 40 : 6) * zz - (occupied ? 0 : h / 2);
    const x = c.x - w / 2;
    g.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(g, x - 1, y + 1, w + 2, h + 2, h / 2); g.fill();
    g.fillStyle = o.kind === 'march' ? '#e9e3d2' : o.kind === 'take' ? '#e8c04a' : o.odds >= 0.5 ? '#d8432a' : '#7e2a1c';
    roundRect(g, x, y, w, h, h / 2); g.fill();
    g.fillStyle = o.kind === 'fight' ? (o.odds >= 0.5 ? '#fff' : '#ffd9cc') : '#1d1a15';
    g.fillText(text, c.x, y + h / 2 + 0.5);
    wm.badgeHits.push({ x: x - 4, y: y - 4, w: w + 8, h: h + 8, to: o.to, kind: o.kind });
  }
}

// What is under a screen point: a badge, an army, or a province.
export function pick(wm, state, cam, sx, sy, toWorldFn, g) {
  for (const h of wm.badgeHits) if (sx >= h.x && sx <= h.x + h.w && sy >= h.y && sy <= h.y + h.h) return { badge: h };
  for (let i = wm.hits.length - 1; i >= 0; i--) {
    const h = wm.hits[i];
    if (sx >= h.x && sx <= h.x + h.w && sy >= h.y && sy <= h.y + h.h) return { army: h.id };
  }
  const w = toWorldFn(cam, sx, sy);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  const id = provinceAt(wm, state, w.x, w.y, g);
  g.restore();
  return id >= 0 ? { province: id } : null;
}
