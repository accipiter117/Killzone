// 2.5D pixel art soldiers. Each soldier is a tiny 3D model made of blocks
// (voxels) built in code, posed for the frame (walking, firing, prone,
// falling), turned to one of 16 facings and drawn into pixels from a three
// quarter view, lit from the upper right, with a dark outline. Sprites are
// built the first time they are needed and cached.
//
// Model axes: x forward, y to the soldier's right, z up, feet at the origin.

import { DIRECTIONS } from './sprites.js';

export const W25 = 26; // sprite width in pixels
export const H25 = 32; // sprite height in pixels
export const ANCHOR_X = 13; // the soldier's feet sit at this pixel
export const ANCHOR_Y = 25;

const PAL = [
  { // ISA: steel blue armour, olive webbing and pack, pale helmet and visor
    b: '#5b8cc4', s: '#3e6697', t: '#3a4f66', h: '#b9cde4', l: '#eaf6ff', g: '#3a3e45', k: '#8a909b', f: '#2e2924',
    p: '#5b6441', x: '#e3cf62', y: '#e0b43a', c: '#56653f', F: '#ffffff', E: '#cfe6ff', r: '#5a1410', o: '#121c29',
  },
  { // Helghast: dark grey armour, dark helmet with glowing goggles, orange trim
    b: '#5d6069', s: '#44464d', t: '#2f3034', h: '#2c2e33', l: '#ff7a2a', g: '#73767e', k: '#a9acb3', f: '#1b1b1d',
    p: '#5a4a35', x: '#e0521c', y: '#c99a2e', c: '#4a4840', F: '#fff1c2', E: '#ff8a3a', r: '#5a1410', o: '#09090b',
  },
];
const GLOW = new Set(['l', 'F', 'E']); // drawn at full brightness, unshaded
const NO_OUTLINE = new Set(['F', 'E', 'r']);

const BUILD = {
  rifle: { wide: 3, gun: 8, thick: 1, kit: 'pack' },
  assault: { wide: 3, gun: 5, thick: 2, kit: 'plates' },
  heavy: { wide: 4, gun: 9, thick: 2, kit: 'ammo' },
  engineer: { wide: 3, gun: 6, thick: 1, kit: 'tools' },
  recon: { wide: 3, gun: 11, thick: 1, kit: 'cloak' },
};

// ---- Building the model ------------------------------------------------------

export function box(v, x0, x1, y0, y1, z0, z1, k) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) v.push({ x, y, z, k });
}

// pose: swing (leg stride, -2..2), bob (body lift), recoil, flash
function soldier(role, pose = {}) {
  const r = BUILD[role] || BUILD.rifle;
  const v = [];
  const sw = pose.swing || 0, bob = pose.bob || 0, rec = pose.recoil || 0;
  // Legs and boots; the stride swings one leg forward and the other back.
  box(v, sw - 1, sw, -2, -1, 0, 0, 'f');
  box(v, sw - 1, sw, -2, -1, 1, 4 + bob, 't');
  box(v, -sw - 1, -sw, 1, 2, 0, 0, 'f');
  box(v, -sw - 1, -sw, 1, 2, 1, 4 + bob, 't');
  const z0 = 5 + bob;
  // Torso: armour with a darker belt and a faction marking on the chest.
  box(v, -1, 1, -r.wide, r.wide, z0, z0 + 5, 'b');
  box(v, -1, 1, -r.wide, r.wide, z0, z0, 's');
  v.push({ x: 2, y: -1, z: z0 + 3, k: 'x' });
  if (r.kit === 'plates') { box(v, -1, 1, -r.wide - 1, -r.wide - 1, z0 + 3, z0 + 5, 's'); box(v, -1, 1, r.wide + 1, r.wide + 1, z0 + 3, z0 + 5, 's'); }
  // Kit on the back.
  if (r.kit === 'cloak') box(v, -3, -2, -r.wide, r.wide, z0 - 2, z0 + 5, 'c');
  else if (r.kit === 'ammo') { box(v, -4, -2, -3, 3, z0, z0 + 5, 'p'); box(v, -4, -4, -3, 3, z0 + 2, z0 + 2, 'x'); }
  else {
    box(v, -3, -2, -2, 2, z0 + 1, z0 + 5, 'p');
    if (r.kit === 'tools') { box(v, -4, -4, -2, 2, z0 + 3, z0 + 3, 'y'); box(v, -4, -4, 0, 0, z0 + 1, z0 + 5, 'y'); }
  }
  // Head and helmet; the front face carries the visor or goggles.
  box(v, -1, 1, -1, 1, z0 + 6, z0 + 7, 's');
  box(v, -2, 1, -2, 2, z0 + 8, z0 + 9, 'h');
  box(v, -1, 1, -1, 1, z0 + 10, z0 + 10, 'h');
  v.push({ x: 2, y: -1, z: z0 + 7, k: 'l' }, { x: 2, y: 1, z: z0 + 7, k: 'l' });
  // Arms bring the weapon up to the shoulder.
  const gz = z0 + 4;
  box(v, 0, 2 - rec, r.wide + 1, r.wide + 1, gz, z0 + 5, 's');
  box(v, 1, 3 - rec, 1, r.wide, gz, gz, 's');
  box(v, 0, 4 - rec, -r.wide - 1, -r.wide - 1, gz, z0 + 5, 's');
  box(v, 3 - rec, 5 - rec, -r.wide, 0, gz, gz, 's');
  // The weapon, held along the right side of the chest.
  const gx0 = 1 - rec, gx1 = gx0 + r.gun;
  box(v, gx0, gx1, 1, 1, gz - (r.thick - 1), gz, 'g');
  box(v, gx0 + 1, gx1 - 1, 1, 1, gz + 1, gz + 1, 'k');
  if (r.kit === 'ammo') box(v, gx0 + 2, gx0 + 3, 1, 2, gz - 2, gz - 2, 'x');
  if (r.kit === 'cloak') box(v, gx0 + 3, gx0 + 4, 1, 1, gz + 2, gz + 2, 'k'); // scope
  if (pose.flash) {
    v.push({ x: gx1 + 1, y: 1, z: gz, k: 'F' }, { x: gx1 + 2, y: 1, z: gz, k: 'E' }, { x: gx1 + 1, y: 1, z: gz + 1, k: 'E' }, { x: gx1 + 1, y: 0, z: gz, k: 'E' }, { x: gx1 + 1, y: 2, z: gz, k: 'E' });
  }
  return v;
}

// Tip the whole model about the feet: +90 = flat on the face, -90 = on the back.
export function tip(v, deg, lift = 0) {
  const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  return v.map((p) => ({ ...p, x: p.x * ca + p.z * sa, z: -p.x * sa + p.z * ca + lift }));
}

// Lying on the belly, weapon forward, legs trailing.
function prone(role, crawl) {
  const r = BUILD[role] || BUILD.rifle;
  const body = soldier(role).filter((p) => p.k !== 'g' && p.k !== 'k' && p.k !== 'F' && p.k !== 'E');
  let v = tip(body, 90, 4).map((p) => ({ ...p, x: p.x - 6 }));
  if (crawl) v = v.map((p) => (p.x < -4 ? { ...p, y: p.y + (p.y < 0 ? -1 : 1) } : p));
  box(v, 5, 5 + r.gun, 1, 1, 2, 2, 'g');
  box(v, 6, 4 + r.gun, 1, 1, 3, 3, 'k');
  return v;
}

function fallen(role, stage) {
  const deg = [-35, -70, -90][stage];
  const body = soldier(role).filter((p) => p.k !== 'g' && p.k !== 'k');
  const v = tip(body, deg, stage === 2 ? 2 : 0);
  const r = BUILD[role] || BUILD.rifle;
  // The weapon drops beside them.
  for (let i = 0; i < r.gun; i++) v.push({ x: 2 + i * 0.6, y: 4 + i * 0.5, z: 0, k: 'g' });
  if (stage === 2) box(v, -6, -2, -2, 2, 0, 0, 'r');
  return v.map((p) => ({ ...p, z: Math.max(0, p.z) }));
}

function pose(role, frame) {
  switch (frame) {
    case 'walk1': return soldier(role, { swing: 2 });
    case 'walk2': return soldier(role, { swing: 0, bob: 1 });
    case 'walk3': return soldier(role, { swing: -2 });
    case 'walk4': return soldier(role, { swing: 0, bob: 1 });
    case 'fire': return soldier(role, { recoil: 1, flash: true });
    case 'prone1': return prone(role, false);
    case 'prone2': return prone(role, true);
    case 'fall1': return fallen(role, 0);
    case 'fall2': return fallen(role, 1);
    case 'dead': return fallen(role, 2);
    default: return soldier(role);
  }
}

export const FRAMES_25D = ['stand', 'walk1', 'walk2', 'walk3', 'walk4', 'fire', 'prone1', 'prone2', 'fall1', 'fall2', 'dead'];

// ---- Drawing the model into pixels ------------------------------------------

const LIGHT = (() => { const l = [0.8, -0.5, 1]; const n = Math.hypot(...l); return l.map((c) => c / n); })();
const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RGB = PAL.map((p) => Object.fromEntries(Object.entries(p).map(([k, c]) => [k, hex(c)])));

// Draw a posed block model into a pixel sprite. rgb is a palette of
// [r, g, b] by letter; size gives the canvas and where the feet sit.
export function drawVoxels(voxels, rgb, angle, dim, size = { w: W25, h: H25, ax: ANCHOR_X, ay: ANCHOR_Y }) {
  const { w: W, h: H, ax, ay } = size;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const solid = new Set(voxels.map((p) => `${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.z)}`));
  const n = W * H;
  const depth = new Float32Array(n).fill(-1e9);
  const col = new Array(n).fill(null);
  for (const p of voxels) {
    // Light: the brightest exposed face of this block, after turning.
    let lit = 0.55;
    const rx = Math.round(p.x), ry = Math.round(p.y), rz = Math.round(p.z);
    for (const [nx, ny, nz] of FACES) {
      if (solid.has(`${rx + nx},${ry + ny},${rz + nz}`)) continue;
      const wx = nx * ca - ny * sa, wy = nx * sa + ny * ca;
      const d = wx * LIGHT[0] + wy * LIGHT[1] + nz * LIGHT[2];
      lit = Math.max(lit, 0.62 + 0.48 * Math.max(0, d) + (wy > 0.5 ? 0.04 : 0));
    }
    const glow = GLOW.has(p.k);
    const base = rgb[p.k];
    const m = glow ? 1 : lit * (p.k === 'r' ? 1 : dim);
    const c = [Math.min(255, base[0] * m), Math.min(255, base[1] * m), Math.min(255, base[2] * m)];
    // Each block is sampled at 8 points so turned models have no gaps.
    for (const ox of [-0.25, 0.25]) for (const oy of [-0.25, 0.25]) for (const oz of [-0.25, 0.25]) {
      const x = p.x + ox, y = p.y + oy, z = p.z + oz;
      const wx = x * ca - y * sa, wy = x * sa + y * ca;
      const px = Math.floor(wx + ax), py = Math.floor(wy * 0.5 - z + ay);
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const d = wy + z * 1.2; // nearer the viewer and higher up wins
      const i = py * W + px;
      if (d > depth[i]) { depth[i] = d; col[i] = { rgb: c, k: p.k }; }
    }
  }
  // Dark outline round the figure so it reads on mud.
  const out = col.slice();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (col[y * W + x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const c = nx >= 0 && ny >= 0 && nx < W && ny < H ? col[ny * W + nx] : null;
        if (c && !NO_OUTLINE.has(c.k)) { out[y * W + x] = { rgb: rgb.o, k: 'o' }; break; }
      }
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  out.forEach((c, i) => { if (c) img.data.set([c.rgb[0], c.rgb[1], c.rgb[2], 255], i * 4); });
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function render(voxels, side, angle, dim) {
  return drawVoxels(voxels, RGB[side], angle, dim);
}

export const paletteRGB = (pal) => Object.fromEntries(Object.entries(pal).map(([k, c]) => [k, hex(c)]));

const cache = new Map();

// Sprite for a side, role and frame facing direction dir (0..15, 0 = right).
export function getSprite25(side, role, frame, dir) {
  const key = `${side}|${role}|${frame}|${dir}`;
  let c = cache.get(key);
  if (!c) {
    const dim = frame === 'dead' ? 0.7 : frame.startsWith('fall') ? 0.85 : 1;
    c = render(pose(role, frame), side, (dir / DIRECTIONS) * Math.PI * 2, dim);
    cache.set(key, c);
  }
  return c;
}
