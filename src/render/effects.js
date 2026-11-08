// Turns simulation events into short-lived visuals: tracers, muzzle flashes,
// hit puffs, explosions, arc tower zaps, smoke puffs and fallen soldiers.
// Purely cosmetic; uses its own random source.

import { fx } from './fx-random.js';

export const COLOURS = {
  isa: { body: '#6f9fd6', dark: '#2b4a70', rim: '#1f3a5c', light: '#d9e9fb', tracer: 'rgba(225,240,255,0.95)', flash: '#eaf4ff' },
  hgh: { body: '#454850', dark: '#16171a', rim: '#e0581f', light: '#ff5a1f', tracer: 'rgba(255,110,50,0.95)', flash: '#ffb070' },
};
export const sideColours = (side) => (side === 0 ? COLOURS.isa : COLOURS.hgh);

export function createEffects() {
  return {
    tracers: [], flashes: [], puffs: [], booms: [], zaps: [], bodies: [], smokes: new Map(), rings: [],
    lastShot: new Map(), // soldier id -> time of their last shot (for the firing frame)
    shake: 0, reduced: false, terrain: null,
  };
}

const MAX = 700;

// Called after every sim tick with that tick's events.
export function ingest(fxs, events, now) {
  for (const e of events) {
    switch (e.type) {
      case 'shot': {
        if (fxs.tracers.length < MAX) {
          fxs.tracers.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, side: e.side, t0: now, life: 0.12 + fx() * 0.05, heavy: e.src === 'mg' });
          // Soldiers show their own muzzle flash in the sprite; MG nests get a drawn one.
          if (e.id >= 0) fxs.lastShot.set(e.id, now);
          else fxs.flashes.push({ x: e.x1, y: e.y1, side: e.side, t0: now, life: 0.06 });
        }
        break;
      }
      case 'hit':
        if (fxs.puffs.length < MAX) fxs.puffs.push({ x: e.x + fx.range(-3, 3), y: e.y + fx.range(-3, 3), t0: now, life: 0.35, r: 4, colour: '120,30,20' });
        break;
      case 'death':
        fxs.bodies.push({ id: e.id, x: e.x, y: e.y, side: e.side, t0: now, dir: null });
        if (fxs.bodies.length > 400) fxs.bodies.shift();
        break;
      case 'shell':
        boom(fxs, e.x, e.y, 46, now, '255,200,120');
        fxs.shake = Math.max(fxs.shake, 5);
        break;
      case 'tankBlast':
        boom(fxs, e.x, e.y, 100, now, '255,120,40');
        fxs.shake = Math.max(fxs.shake, 10);
        break;
      case 'crater':
        if (fxs.terrain) fxs.terrain.addCrater({ x: e.x, y: e.y, r: e.r });
        break;
      case 'zap':
        fxs.zaps.push({ ...e, t0: now, life: 0.3 });
        break;
      case 'smoke':
        break; // smoke clouds are drawn from the sim's smoke list
      case 'capture':
        fxs.rings.push({ site: e.site, side: e.side, t0: now, life: 1.2 });
        break;
      default:
    }
  }
}

function boom(fxs, x, y, r, now, colour) {
  fxs.booms.push({ x, y, r, t0: now, life: 0.55, colour });
  for (let i = 0; i < 10; i++) {
    const a = fx() * Math.PI * 2, d = fx() * r * 0.5;
    fxs.puffs.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, t0: now + fx() * 0.15, life: 1.4 + fx(), r: r * fx.range(0.25, 0.5), colour: '70,64,54', drift: fx.range(-6, 6) });
  }
}

// Smoke puffs for each live smoke cloud, created once per cloud.
function smokePuffs(fxs, sm) {
  const key = `${sm.x},${sm.y},${sm.end}`;
  let puffs = fxs.smokes.get(key);
  if (!puffs) {
    puffs = [];
    for (let i = 0; i < 14; i++) {
      const a = fx() * Math.PI * 2, d = Math.sqrt(fx()) * sm.r * 0.75;
      puffs.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: sm.r * fx.range(0.3, 0.5), ph: fx() * 6.28 });
    }
    fxs.smokes.set(key, puffs);
  }
  return puffs;
}

export function prune(fxs, now) {
  const alive = (p) => now - p.t0 < p.life;
  fxs.tracers = fxs.tracers.filter(alive);
  fxs.flashes = fxs.flashes.filter(alive);
  fxs.puffs = fxs.puffs.filter(alive);
  fxs.booms = fxs.booms.filter(alive);
  fxs.zaps = fxs.zaps.filter(alive);
  fxs.rings = fxs.rings.filter(alive);
}

export function drawSmoke(g, fxs, smokes, now, tickNow, tickRate) {
  for (const sm of smokes) {
    const left = (sm.end - tickNow) / tickRate;
    const fade = Math.min(1, left / 3);
    for (const p of smokePuffs(fxs, sm)) {
      const wob = Math.sin(now * 0.6 + p.ph) * 6;
      const grad = g.createRadialGradient(sm.x + p.dx + wob, sm.y + p.dy, 0, sm.x + p.dx + wob, sm.y + p.dy, p.r);
      grad.addColorStop(0, `rgba(200,200,195,${0.55 * fade})`);
      grad.addColorStop(1, 'rgba(200,200,195,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(sm.x + p.dx + wob, sm.y + p.dy, p.r, 0, Math.PI * 2);
      g.fill();
    }
  }
}

// Effects drawn above the soldiers. px = world units per screen pixel.
export function drawEffects(g, fxs, now, px) {
  for (const p of fxs.puffs) {
    const k = (now - p.t0) / p.life;
    if (k < 0) continue;
    g.fillStyle = `rgba(${p.colour},${0.5 * (1 - k)})`;
    g.beginPath();
    g.arc(p.x + (p.drift || 0) * k, p.y - k * 6, p.r * (0.6 + k * 0.8), 0, Math.PI * 2);
    g.fill();
  }
  g.lineCap = 'round';
  for (const t of fxs.tracers) {
    const k = (now - t.t0) / t.life;
    // A short streak that races from muzzle to impact.
    const a = Math.max(0, k - 0.35), b = Math.min(1, k + 0.05);
    const c = sideColours(t.side);
    g.strokeStyle = c.tracer;
    g.lineWidth = Math.max(1, (t.heavy ? 1.6 : 1.1) * px);
    g.globalAlpha = 1 - k * 0.5;
    g.beginPath();
    g.moveTo(t.x1 + (t.x2 - t.x1) * a, t.y1 + (t.y2 - t.y1) * a);
    g.lineTo(t.x1 + (t.x2 - t.x1) * b, t.y1 + (t.y2 - t.y1) * b);
    g.stroke();
  }
  g.globalAlpha = 1;
  if (!fxs.reduced) {
    for (const f of fxs.flashes) {
      const k = (now - f.t0) / f.life;
      g.fillStyle = sideColours(f.side).flash;
      g.globalAlpha = 1 - k;
      g.beginPath();
      g.arc(f.x, f.y, Math.max(2.5, 2.2 * px), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  for (const b of fxs.booms) {
    const k = (now - b.t0) / b.life;
    if (k < 0) continue;
    g.fillStyle = `rgba(${b.colour},${0.85 * (1 - k)})`;
    g.beginPath();
    g.arc(b.x, b.y, b.r * (0.3 + k * 0.9), 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(255,240,210,${0.6 * (1 - k)})`;
    g.lineWidth = 3 * px;
    g.beginPath();
    g.arc(b.x, b.y, b.r * (0.5 + k * 1.2), 0, Math.PI * 2);
    g.stroke();
  }
  for (const z of fxs.zaps) {
    const k = (now - z.t0) / z.life;
    g.strokeStyle = `rgba(150,220,255,${1 - k})`;
    g.lineWidth = Math.max(1.5, 2 * px);
    g.beginPath();
    g.moveTo(z.x1, z.y1);
    const n = 7;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      g.lineTo(z.x1 + (z.x2 - z.x1) * t + fx.range(-9, 9), z.y1 + (z.y2 - z.y1) * t + fx.range(-9, 9));
    }
    g.lineTo(z.x2, z.y2);
    g.stroke();
  }
}

export function shakeOffset(fxs, dt) {
  if (fxs.reduced || fxs.shake < 0.2) { fxs.shake = 0; return { x: 0, y: 0 }; }
  fxs.shake *= Math.pow(0.02, dt);
  return { x: fx.range(-1, 1) * fxs.shake, y: fx.range(-1, 1) * fxs.shake };
}
