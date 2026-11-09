// The war map, drawn on a canvas. The ground (terrain by kit, who holds
// each cell, sector and region borders and the trench line along the front)
// is painted once into an offscreen picture and repainted only when the
// front moves. Sites, platoons, orders and highlights are drawn over it
// every frame at a fixed size on screen, so they stay readable at any zoom.

import { worldMatrix, toScreen } from './camera.js';
import { strengthOf } from '../campaign/state.js';

export const CELL = 16;
const SCALE = 2; // offscreen picture pixels per world unit
const SIDE_FILL = ['#2f67b3', '#b8461a'];
const SIDE_LIGHT = ['#7fb6ff', '#ff8a52'];
const SIDE_TINT = ['rgba(60,125,215,0.30)', 'rgba(215,85,30,0.30)'];
const KIT_RGB = { trenches: [104, 88, 64], industrial: [92, 95, 92], city: [118, 112, 102] };

function hash(x, y, s = 0) {
  let h = Math.imul((x * 73856093) ^ (y * 19349663) ^ (s * 83492791), 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function createWarmap(state) {
  const { cols, rows, sector } = state;
  const W = cols * CELL, H = rows * CELL;
  const paths = state.sectors.map(() => new Path2D());
  const outlines = state.sectors.map(() => new Path2D());
  for (let i = 0; i < sector.length; i++) {
    const x = i % cols, y = (i / cols) | 0, s = sector[i];
    paths[s].rect(x * CELL, y * CELL, CELL, CELL);
    const edge = (x0, y0, x1, y1) => { outlines[s].moveTo(x0 * CELL, y0 * CELL); outlines[s].lineTo(x1 * CELL, y1 * CELL); };
    if (x === 0 || sector[i - 1] !== s) edge(x, y, x, y + 1);
    if (x === cols - 1 || sector[i + 1] !== s) edge(x + 1, y, x + 1, y + 1);
    if (y === 0 || sector[i - cols] !== s) edge(x, y, x + 1, y);
    if (y === rows - 1 || sector[i + cols] !== s) edge(x, y + 1, x + 1, y + 1);
  }
  // Region name anchors: the middle of each region's cells.
  const sums = new Map();
  for (let i = 0; i < sector.length; i++) {
    const sec = state.sectors[sector[i]];
    const key = `${sec.half}:${sec.region}`;
    const e = sums.get(key) || { name: sec.region, half: sec.half, x: 0, y: 0, n: 0 };
    e.x += (i % cols) + 0.5; e.y += ((i / cols) | 0) + 0.5; e.n++;
    sums.set(key, e);
  }
  const labels = [...sums.values()].map((e) => ({ name: e.name, half: e.half, x: (e.x / e.n) * CELL, y: (e.y / e.n) * CELL }));
  const base = document.createElement('canvas');
  base.width = W * SCALE;
  base.height = H * SCALE;
  // A margin round the map, so the top bar and the screen edges never hide
  // the outermost sites. The camera's world is the map plus this margin.
  const ox = 110, oy = 110; // room for the top bar, whichever way the map is turned
  return { W, H, ox, oy, CW: W + ox * 2, CH: H + oy + 50, paths, outlines, labels, base, sig: null, hits: [], siteHits: [] };
}

const ownerSig = (owner) => { let s = 0; for (let i = 0; i < owner.length; i++) s = (Math.imul(s, 31) + owner[i] * (i + 1)) | 0; return s; };

// Repaint the ground picture if the front has moved since last time.
export function refreshBase(wm, state) {
  const sig = ownerSig(state.owner);
  if (sig === wm.sig) return;
  wm.sig = sig;
  const g = wm.base.getContext('2d');
  const { cols, rows, owner, sector, sectors } = state;
  g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  g.clearRect(0, 0, wm.W, wm.H);
  // Ground by terrain kit, with a little texture.
  for (let i = 0; i < owner.length; i++) {
    const x = i % cols, y = (i / cols) | 0;
    const kit = sectors[sector[i]].kit;
    const [r, gg, b] = KIT_RGB[kit];
    const v = (hash(x, y) - 0.5) * 16;
    g.fillStyle = `rgb(${r + v | 0},${gg + v | 0},${b + v | 0})`;
    g.fillRect(x * CELL, y * CELL, CELL, CELL);
    const h2 = hash(x, y, 2);
    if (kit === 'city' && h2 < 0.55) {
      // Ruined blocks.
      g.fillStyle = 'rgba(40,36,32,0.38)';
      const w = 5 + hash(x, y, 3) * 7, hh = 5 + hash(x, y, 4) * 7;
      g.fillRect(x * CELL + 2, y * CELL + 2, w, hh);
    } else if (kit === 'industrial' && h2 < 0.25) {
      // Sheds and tanks.
      g.fillStyle = 'rgba(30,34,36,0.4)';
      if (hash(x, y, 5) < 0.5) g.fillRect(x * CELL + 3, y * CELL + 4, 10, 6);
      else { g.beginPath(); g.arc(x * CELL + 8, y * CELL + 8, 3.5, 0, Math.PI * 2); g.fill(); }
    } else if (kit === 'trenches' && h2 < 0.12) {
      // Shell craters.
      g.fillStyle = 'rgba(40,32,22,0.45)';
      g.beginPath(); g.arc(x * CELL + 4 + hash(x, y, 6) * 8, y * CELL + 4 + hash(x, y, 7) * 8, 2.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = SIDE_TINT[owner[i]];
    g.fillRect(x * CELL, y * CELL, CELL, CELL);
  }
  // Sector borders (thin) and region borders (thicker).
  const thin = new Path2D(), thick = new Path2D();
  const regionOf = (i) => `${sectors[sector[i]].half}:${sectors[sector[i]].region}`;
  for (let i = 0; i < owner.length; i++) {
    const x = i % cols, y = (i / cols) | 0;
    for (const [j, x0, y0, x1, y1] of [[x < cols - 1 ? i + 1 : -1, x + 1, y, x + 1, y + 1], [y < rows - 1 ? i + cols : -1, x, y + 1, x + 1, y + 1]]) {
      if (j < 0 || sector[j] === sector[i]) continue;
      const p = regionOf(i) !== regionOf(j) ? thick : thin;
      p.moveTo(x0 * CELL, y0 * CELL);
      p.lineTo(x1 * CELL, y1 * CELL);
    }
  }
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(20,18,14,0.28)'; g.lineWidth = 1; g.stroke(thin);
  g.strokeStyle = 'rgba(20,18,14,0.55)'; g.lineWidth = 2.2; g.setLineDash([6, 4]); g.stroke(thick); g.setLineDash([]);
  // The front: a wandering trench wherever the two sides' ground meets.
  // Shared corners get the same nudge, so the line runs on unbroken.
  const jit = (cx, cy) => {
    if (cx <= 0 || cy <= 0 || cx >= cols || cy >= rows) return [cx * CELL, cy * CELL];
    return [(cx + (hash(cx, cy, 11) - 0.5) * 0.7) * CELL, (cy + (hash(cx, cy, 12) - 0.5) * 0.7) * CELL];
  };
  const front = new Path2D();
  for (let i = 0; i < owner.length; i++) {
    const x = i % cols, y = (i / cols) | 0;
    if (x < cols - 1 && owner[i + 1] !== owner[i]) { front.moveTo(...jit(x + 1, y)); front.lineTo(...jit(x + 1, y + 1)); }
    if (y < rows - 1 && owner[i + cols] !== owner[i]) { front.moveTo(...jit(x, y + 1)); front.lineTo(...jit(x + 1, y + 1)); }
  }
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(25,20,14,0.85)'; g.lineWidth = 8; g.stroke(front);
  g.strokeStyle = '#4a3b29'; g.lineWidth = 4.5; g.stroke(front);
  g.strokeStyle = 'rgba(200,190,160,0.55)'; g.lineWidth = 1; g.setLineDash([2, 3]); g.stroke(front); g.setLineDash([]);
  // A dark rim round the edge of the world.
  const grad = g.createLinearGradient(0, 0, 0, wm.H);
  grad.addColorStop(0, 'rgba(0,0,0,0.25)'); grad.addColorStop(0.08, 'rgba(0,0,0,0)'); grad.addColorStop(0.92, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = grad;
  g.fillRect(0, 0, wm.W, wm.H);
}

// World (map) point to screen, allowing for the margin.
const T = (cam, wm, x, y) => toScreen(cam, x + wm.ox, y + wm.oy);

// Which sector a world point is in (or -1 off the map).
export function sectorAt(state, wx, wy) {
  const x = Math.floor(wx / CELL), y = Math.floor(wy / CELL);
  if (x < 0 || y < 0 || x >= state.cols || y >= state.rows) return -1;
  return state.sector[y * state.cols + x];
}

export const cellCentre = (state, i) => ({ x: ((i % state.cols) + 0.5) * CELL, y: (((i / state.cols) | 0) + 0.5) * CELL });

// ---- Site icons ---------------------------------------------------------------
const GLYPH = {
  capital(g) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 2.6 : 6.2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); },
  city(g) { g.fillRect(-6, -2, 4, 7); g.fillRect(-1.5, -6, 4, 11); g.fillRect(3.5, -3, 3, 8); },
  factory(g) { g.beginPath(); g.moveTo(-6.5, 5); g.lineTo(-6.5, -1); g.lineTo(-2.5, 1.5); g.lineTo(-2.5, -1); g.lineTo(1.5, 1.5); g.lineTo(1.5, -6); g.lineTo(4.5, -6); g.lineTo(4.5, 1.5); g.lineTo(6.5, 1.5); g.lineTo(6.5, 5); g.closePath(); g.fill(); },
  tankworks(g) { g.fillRect(-6.5, 0, 13, 4.5); g.fillRect(-3.5, -3.5, 6, 4); g.fillRect(2, -2.5, 5.5, 1.6); },
  power(g) { g.beginPath(); g.moveTo(1.5, -7); g.lineTo(-4.5, 1); g.lineTo(-0.5, 1); g.lineTo(-1.5, 7); g.lineTo(4.5, -1); g.lineTo(0.5, -1); g.closePath(); g.fill(); },
  comms(g) { g.fillRect(-0.9, -2, 1.8, 8); g.beginPath(); g.arc(0, -3, 1.8, 0, Math.PI * 2); g.fill(); g.lineWidth = 1.4; for (const r of [4, 6.5]) { g.beginPath(); g.arc(0, -3, r, -Math.PI * 0.85, -Math.PI * 0.15); g.stroke(); } },
  airfield(g) { g.beginPath(); g.moveTo(0, -7); g.lineTo(1.2, -2); g.lineTo(7, 1); g.lineTo(7, 2.5); g.lineTo(1.2, 1); g.lineTo(1, 4.5); g.lineTo(3, 6.5); g.lineTo(-3, 6.5); g.lineTo(-1, 4.5); g.lineTo(-1.2, 1); g.lineTo(-7, 2.5); g.lineTo(-7, 1); g.lineTo(-1.2, -2); g.closePath(); g.fill(); },
};

export const SITE_LABEL = { capital: 'Capital', city: 'City', factory: 'Factory', tankworks: 'Tank works', power: 'Power plant', comms: 'Comms hub', airfield: 'Airfield' };

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function arrow(g, a, b, colour, k, dashed = false) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 8) return;
  const ex = b.x - Math.cos(ang) * 4 * k, ey = b.y - Math.sin(ang) * 4 * k;
  g.save();
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 6 * k; g.lineCap = 'round';
  if (dashed) g.setLineDash([7 * k, 6 * k]);
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(ex, ey); g.stroke();
  g.strokeStyle = colour; g.lineWidth = 3 * k;
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(ex, ey); g.stroke();
  g.setLineDash([]);
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(b.x, b.y);
  g.lineTo(b.x - Math.cos(ang - 0.45) * 13 * k, b.y - Math.sin(ang - 0.45) * 13 * k);
  g.lineTo(b.x - Math.cos(ang + 0.45) * 13 * k, b.y - Math.sin(ang + 0.45) * 13 * k);
  g.closePath(); g.fill();
  g.restore();
}

function star(g, x, y, r, fill) {
  g.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath();
  g.fillStyle = fill; g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1.2; g.stroke();
}

// view: { dpr, now, selected (platoon id), sector (picked sector id),
// move (Set of sector ids), attack (array of sector ids), playerSide }
export function drawWarmap(g, wm, state, cam, view) {
  refreshBase(wm, state);
  const dpr = view.dpr;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#16140f';
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  const m = worldMatrix(cam);
  g.setTransform(m[0] * dpr, m[1] * dpr, m[2] * dpr, m[3] * dpr, m[4] * dpr, m[5] * dpr);
  g.translate(wm.ox, wm.oy);
  g.imageSmoothingEnabled = true;
  g.drawImage(wm.base, 0, 0, wm.W, wm.H);
  // Highlights: where the chosen platoon can move (pale) and attack (red).
  const pulse = 0.5 + 0.5 * Math.sin(view.now * 4);
  for (const s of view.move || []) { g.fillStyle = 'rgba(255,255,240,0.16)'; g.fill(wm.paths[s]); }
  for (const s of view.attack || []) { g.fillStyle = `rgba(255,70,40,${0.16 + 0.12 * pulse})`; g.fill(wm.paths[s]); }
  g.lineCap = 'round';
  for (const s of view.move || []) { g.strokeStyle = 'rgba(255,255,240,0.65)'; g.lineWidth = 1.5 / cam.z; g.stroke(wm.outlines[s]); }
  for (const s of view.attack || []) { g.strokeStyle = 'rgba(255,90,60,0.95)'; g.lineWidth = 2 / cam.z; g.stroke(wm.outlines[s]); }
  if (view.sector != null && view.sector >= 0) { g.strokeStyle = '#e8c04a'; g.lineWidth = 2.5 / cam.z; g.stroke(wm.outlines[view.sector]); }
  // Battles being fought this round.
  for (const rec of state.battles) {
    if (rec.result) continue;
    g.fillStyle = `rgba(255,200,60,${0.1 + 0.15 * pulse})`;
    g.fill(wm.paths[rec.sector]);
  }

  // ---- Screen space from here: icons keep their size as you zoom.
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const k = Math.max(0.85, Math.min(1.45, cam.z * 1.15));
  // Region names.
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${Math.round(11 * k)}px system-ui, sans-serif`;
  for (const l of wm.labels) {
    const p = T(cam, wm, l.x, l.y - CELL * 4.2);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillText(l.name.toUpperCase(), p.x + 1, p.y + 1);
    g.fillStyle = 'rgba(245,238,220,0.78)';
    g.fillText(l.name.toUpperCase(), p.x, p.y);
  }

  // Sites.
  wm.siteHits = [];
  const r = 11 * k;
  for (const site of state.sites) {
    const c = cellCentre(state, site.cell);
    const p = T(cam, wm, c.x, c.y - CELL * 0.8);
    const own = site.owner ?? state.owner[site.cell];
    g.beginPath(); g.arc(p.x, p.y, r + 2, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fill();
    g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fillStyle = SIDE_FILL[own]; g.fill();
    g.lineWidth = 1.6;
    if (site.connected === false) { g.setLineDash([3, 2]); g.strokeStyle = '#ff6b5f'; } else g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.stroke(); g.setLineDash([]);
    g.save(); g.translate(p.x, p.y); g.scale(k, k); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; GLYPH[site.kind](g); g.restore();
    // Defence pips: filled while the defences stand.
    if (site.maxDefence > 0) {
      const pw = 5 * k, gap = 2;
      const total = site.maxDefence * pw + (site.maxDefence - 1) * gap;
      for (let d = 0; d < site.maxDefence; d++) {
        const x = p.x - total / 2 + d * (pw + gap), y = p.y + r + 3;
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x - 1, y - 1, pw + 2, pw + 2);
        g.fillStyle = d < site.defence ? '#e8c04a' : 'rgba(255,255,255,0.18)';
        g.fillRect(x, y, pw, pw);
      }
    }
    if (cam.z > 1.05) {
      g.font = `600 ${Math.round(10 * k)}px system-ui, sans-serif`;
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(site.name, p.x + 1, p.y - r - 7 * k + 1);
      g.fillStyle = '#f2ede0'; g.fillText(site.name, p.x, p.y - r - 7 * k);
    }
    wm.siteHits.push({ x: p.x, y: p.y, r: r + 4, id: site.id });
  }

  // Dug in sectors (this round) and the key battle.
  for (const key of Object.keys(state.fort)) {
    const [s, side] = key.split(':').map(Number);
    if (side !== view.playerSide) continue;
    const c = cellCentre(state, state.sectors[s].centre);
    const p = T(cam, wm, c.x, c.y);
    const x = p.x - r - 16 * k, y = p.y - CELL * 0.8 * cam.z;
    g.fillStyle = '#b59a68'; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1;
    for (const [dx, dy] of [[-5, 3], [0, 3], [5, 3], [-2.5, -1], [2.5, -1]]) {
      g.beginPath(); g.ellipse(x + dx * k, y + dy * k, 3 * k, 2 * k, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    }
  }
  if (state.key != null) {
    const c = cellCentre(state, state.sectors[state.key].centre);
    const p = T(cam, wm, c.x, c.y);
    star(g, p.x + r + 14 * k, p.y - CELL * 0.8 * cam.z - 2, 8 * k, '#e8c04a');
  }

  // Platoon tokens, below each sector's centre; attack orders as arrows.
  wm.hits = [];
  const bySector = new Map();
  for (const pl of state.platoons) {
    if (!bySector.has(pl.sector)) bySector.set(pl.sector, []);
    bySector.get(pl.sector).push(pl);
  }
  const tw = 24 * k, th = 17 * k, gap = 3;
  const arrows = [];
  for (const [s, list] of bySector) {
    list.sort((a, b) => (a.side === view.playerSide ? 0 : 1) - (b.side === view.playerSide ? 0 : 1) || (a.id < b.id ? -1 : 1));
    const c = cellCentre(state, state.sectors[s].centre);
    const p = T(cam, wm, c.x, c.y);
    const perRow = 4;
    list.forEach((pl, idx) => {
      const row = Math.floor(idx / perRow), inRow = Math.min(perRow, list.length - row * perRow);
      const col = idx % perRow;
      const x = p.x - (inRow * tw + (inRow - 1) * gap) / 2 + col * (tw + gap);
      const y = p.y + 4 * k + row * (th + gap);
      const sel = view.selected === pl.id;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(g, x - 1.5, y - 1.5, tw + 3, th + 3, 5); g.fill();
      g.fillStyle = SIDE_FILL[pl.side];
      roundRect(g, x, y, tw, th, 4); g.fill();
      if (sel || pl.cut) {
        g.lineWidth = sel ? 2.5 : 1.6;
        g.strokeStyle = sel ? '#e8c04a' : '#ff6b5f';
        if (!sel) g.setLineDash([3, 2]);
        roundRect(g, x - 1, y - 1, tw + 2, th + 2, 5); g.stroke(); g.setLineDash([]);
      }
      // Number, then a strength bar along the bottom.
      g.fillStyle = '#fff';
      g.font = `800 ${Math.round(10 * k)}px system-ui, sans-serif`;
      g.fillText(pl.id.split('-')[1], x + tw / 2, y + th * 0.42);
      const st = strengthOf(pl);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x + 3, y + th - 4.5 * k, tw - 6, 2.5 * k);
      g.fillStyle = st < 0.4 ? '#ff6b5f' : st < 0.7 ? '#e8c04a' : SIDE_LIGHT[pl.side];
      g.fillRect(x + 3, y + th - 4.5 * k, (tw - 6) * st, 2.5 * k);
      if (pl.order && pl.order.type === 'move') {
        // Moved this round: a small tick.
        g.strokeStyle = '#aaffaa'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(x + tw - 7, y + 4); g.lineTo(x + tw - 5, y + 6); g.lineTo(x + tw - 2, y + 2); g.stroke();
      }
      if (pl.order && pl.order.type === 'attack') arrows.push({ from: { x: x + tw / 2, y: y + th / 2 }, to: state.sectors[pl.order.sector].centre, side: pl.side });
      wm.hits.push({ x, y, w: tw, h: th, id: pl.id });
    });
  }
  for (const a of arrows) {
    const c = cellCentre(state, a.to);
    const to = T(cam, wm, c.x, c.y + CELL * 0.2);
    arrow(g, a.from, to, a.side === view.playerSide ? '#ff5a3c' : '#ffb04a', k);
  }
}

// What is under a screen point: a platoon, a site, or a sector.
export function pick(wm, state, cam, sx, sy, toWorldFn) {
  for (let i = wm.hits.length - 1; i >= 0; i--) {
    const h = wm.hits[i];
    if (sx >= h.x - 4 && sx <= h.x + h.w + 4 && sy >= h.y - 4 && sy <= h.y + h.h + 4) return { platoon: h.id };
  }
  const w = toWorldFn(cam, sx, sy);
  const sector = sectorAt(state, w.x - wm.ox, w.y - wm.oy);
  for (const h of wm.siteHits) if (Math.hypot(sx - h.x, sy - h.y) <= h.r) return { site: h.id, sector: state.sites[h.id].sector };
  return sector >= 0 ? { sector } : null;
}
