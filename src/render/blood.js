// Blood: picture only. Nothing here is read by the rules, it uses the
// cosmetic random source, and battles and replays play out exactly the
// same with it on or off (menu: Blood).
// - Hit spray: gunfire throws a burst of hard-edged red squares out of the
//   far side of the wound, dense at the wound and thinning with distance;
//   blasts throw a bigger burst every way. Gone in about half a second.
// - Pools: a soldier who dies bleeds a pool that spreads under him over a
//   few seconds and stays; a downed soldier a smaller one that grows if he
//   dies and stays a stain if a medic gets him up. Blast deaths bleed
//   more. Finished pools are painted into the battlefield picture, so they
//   cost nothing to draw afterwards; while growing they are drawn live,
//   under the soldiers, wrecks and effects.
// Numbers in config blood.

import { CONFIG } from '../config.js';
import { fx } from './fx-random.js';

const B = CONFIG.blood;
const ease = (t) => 1 - (1 - t) * (1 - t);

export function createBlood() {
  return { on: true, drops: [], pools: new Map(), baked: [] };
}

// Turn a batch of events into sprays and pools. ly maps a ground point to
// where it is drawn (the tilted look lifts raised ground).
export function ingestBlood(bl, fxs, events, now) {
  if (!bl.on) return;
  const ly = fxs.ly || ((x, y) => y);
  const shots = events.filter((e) => e.type === 'shot' && e.hit);
  const zaps = events.filter((e) => e.type === 'zap');
  const blasted = new Set();
  for (const e of events) {
    if (e.type !== 'hit' || e.id === undefined) continue;
    const y = ly(e.x, e.y) - B.spray.woundUp;
    // Gunfire (or an arc bolt) that ended on this soldier: spray away from it.
    const src = shots.find((s) => Math.abs(s.x2 - e.x) < 8 && Math.abs(s.y2 - e.y) < 22) || zaps.find((z) => Math.abs(z.x2 - e.x) < 8 && Math.abs(z.y2 - e.y) < 8);
    if (src) spray(bl, e.x, y, Math.atan2(e.y - src.y1, e.x - src.x1), B.spray, now);
    else { spray(bl, e.x, y, null, { ...B.spray, ...B.blast }, now); blasted.add(e.id); }
  }
  for (const e of events) {
    if (e.type === 'death' || e.type === 'downed') {
      const full = e.type === 'death';
      const size = (blasted.has(e.id) ? B.pool.blastSize : B.pool.size) * (full ? 1 : B.pool.downedShare);
      const old = bl.pools.get(e.id);
      if (old && !old.baked) { old.to = Math.max(old.to, size); old.t0 = now; old.from = old.cur; continue; }
      bl.pools.set(e.id, makePool(e.x, ly(e.x, e.y), size, now));
    } else if (e.type === 'revived') {
      const p = bl.pools.get(e.id);
      if (p) { p.to = p.cur; p.t0 = now - B.pool.growSec; } // stops where it is: a stain
    }
  }
}

function spray(bl, x, y, ang, cfg, now) {
  if (bl.drops.length > B.maxDrops) bl.drops.splice(0, bl.drops.length - B.maxDrops);
  for (let k = 0; k < cfg.count; k++) {
    // Most droplets stay close to the wound; a few fly out to the full spread.
    const r = fx(), d = cfg.spread * r * r * (0.6 + 0.4 * fx());
    let a;
    if (ang === null) a = fx() * Math.PI * 2;
    else if (fx() < cfg.back) a = ang + Math.PI + (fx() - 0.5) * cfg.cone; // a little splash back towards the shot
    else a = ang + (fx() - 0.5) * 2 * cfg.cone;
    bl.drops.push({
      x, y, dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.8 + (fx() - 0.3) * 3, t0: now,
      life: cfg.life * (0.6 + 0.4 * fx()), size: B.pixel * (cfg.sizes[0] + Math.floor(fx() * cfg.sizes[1])),
      col: B.colours[Math.floor(fx() * fx() * B.colours.length)],
    });
  }
}

// A pool's shape: overlapping flattened ovals, painted as hard pixels onto
// a little canvas once (rim, darker; centre, brighter; a few wet glints).
function makePool(x, y, size, now) {
  const p = B.pool, px = B.pixel, R = size * 0.75;
  const n = p.blobs[0] + Math.floor(fx() * (p.blobs[1] - p.blobs[0] + 1));
  const blobs = [];
  for (let k = 0; k < n; k++) {
    const a = fx() * Math.PI * 2, d = k ? fx() * size * 0.28 : 0, r = size * (0.32 + fx() * 0.2);
    blobs.push([Math.cos(a) * d, Math.sin(a) * d * p.flatten, r, r * p.flatten * (0.85 + fx() * 0.3)]);
  }
  const cells = Math.ceil((2 * R) / px);
  const c = document.createElement('canvas');
  c.width = c.height = cells;
  const g = c.getContext('2d');
  const inside = (cx, cy) => blobs.some(([bx, by, rx, ry]) => ((cx - bx) / rx) ** 2 + ((cy - by) / ry) ** 2 <= 1);
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const cx = (i + 0.5) * px - R, cy = (j + 0.5) * px - R;
    if (!inside(cx, cy)) continue;
    const edge = !inside(cx + px, cy) || !inside(cx - px, cy) || !inside(cx, cy + px) || !inside(cx, cy - px);
    g.fillStyle = edge ? p.rim : p.centre;
    g.fillRect(i, j, 1, 1);
  }
  for (let k = 0; k < 3; k++) {
    const [bx, by] = blobs[k % blobs.length];
    const i = Math.floor((bx + R) / px + (fx() - 0.5) * 3), j = Math.floor((by + R) / px - 1 + (fx() - 0.5) * 2);
    g.fillStyle = p.shine;
    g.fillRect(i, j, 1, 1);
  }
  return { x, y, R, canvas: c, t0: now, from: 0.15, to: 1, cur: 0.15, size, baked: false, full: size };
}

const drawPool = (g, p, k) => {
  g.imageSmoothingEnabled = false;
  const r = p.R * k;
  g.drawImage(p.canvas, p.x - r, p.y - r, 2 * r, 2 * r);
};

// Growing pools, drawn live on the ground. Finished ones are painted into
// the battlefield picture and forgotten here (kept in a list to repaint).
export function drawPools(g, bl, terrain, now) {
  if (!bl.on) return;
  for (const [id, p] of bl.pools) {
    if (p.baked) continue;
    const t = Math.min(1, (now - p.t0) / B.pool.growSec);
    p.cur = p.from + (p.to - p.from) * ease(t);
    if (t >= 1 && terrain) {
      // The pool is as big as it will get (unless a downed man dies): bake it.
      const tg = terrain.canvas.getContext('2d');
      drawPool(tg, p, p.cur);
      p.baked = true;
      bl.baked.push({ p, k: p.cur });
      if (bl.baked.length > B.maxPools) bl.baked.shift();
      continue;
    }
    drawPool(g, p, p.cur);
  }
  // A downed man whose pool has been baked and who then dies: grow it again.
  for (const [id, p] of bl.pools) if (p.baked && p.to > p.cur + 0.01) { p.baked = false; p.t0 = now; p.from = p.cur; }
}

// After the battlefield picture is painted afresh (the tilted look switched,
// painted ground arriving), put the finished pools back.
export function rebakeBlood(bl, terrain) {
  if (!bl.on || !terrain) return;
  const tg = terrain.canvas.getContext('2d');
  for (const { p, k } of bl.baked) drawPool(tg, p, k);
}

// Spray: squares flying out from the wound and fading.
export function drawSpray(g, bl, now) {
  if (!bl.on || !bl.drops.length) return;
  bl.drops = bl.drops.filter((d) => now - d.t0 < d.life);
  for (const d of bl.drops) {
    const t = (now - d.t0) / d.life, k = ease(Math.min(1, t * 1.6));
    g.globalAlpha = 1 - t * t;
    g.fillStyle = d.col;
    const s = d.size;
    g.fillRect(Math.round((d.x + d.dx * k) / B.pixel) * B.pixel - s / 2, Math.round((d.y + d.dy * k) / B.pixel) * B.pixel - s / 2, s, s);
  }
  g.globalAlpha = 1;
}
