// Pixel art soldiers, drawn in code. Each sprite is built on a 17 x 17 grid
// of palette letters (facing right, seen from above), rotated into 16
// directions with nearest-pixel sampling, then given a dark outline so it
// reads against the mud. Built lazily and cached.
//
// Palette letters: b armour, s armour shade, h helmet, l helmet light (ISA)
// or glowing goggles (Helghast), g gun, k gun highlight, f boots, p pack,
// n shadow under the helmet, x faction marking, y tool, c cloak, F/E muzzle flash, r blood, o outline.

export const SPRITE_SIZE = 17;
export const DIRECTIONS = 16;
const N = SPRITE_SIZE;
const MID = N / 2;

const PALETTES = [
  { // ISA: steel blue armour, olive kit, pale highlights
    b: '#5b8cc4', s: '#3c6597', h: '#c4d5e8', l: '#ffffff', n: '#1f3047', g: '#8b919c', k: '#c9ced6', f: '#2e2924',
    p: '#5b6441', x: '#e3cf62', y: '#e0b43a', c: '#56653f', F: '#ffffff', E: '#cfe6ff', r: '#5a1410', o: '#121c29',
  },
  { // Helghast: dark grey armour, rust kit, orange goggles and trim
    b: '#62656e', s: '#45474e', h: '#2a2c31', l: '#ff7a2a', n: '#141518', g: '#80838b', k: '#b4b7be', f: '#1b1b1d',
    p: '#5a4a35', x: '#e0521c', y: '#c99a2e', c: '#4a4840', F: '#fff1c2', E: '#ff8a3a', r: '#5a1410', o: '#09090b',
  },
];

// Frames every soldier has. Walking cycles walk1, stand, walk2, stand.
export const FRAMES = ['stand', 'walk1', 'walk2', 'fire', 'prone1', 'prone2', 'fall1', 'fall2', 'dead'];

// What changes between roles: build, weapon and kit.
const ROLES = {
  rifle: { rx: 3, ry: 5, gun: 6, thick: 1, kit: 'pack' },
  assault: { rx: 3.4, ry: 5.2, gun: 4, thick: 2, kit: 'plates' },
  heavy: { rx: 3.8, ry: 5.8, gun: 7, thick: 2, kit: 'ammo' },
  engineer: { rx: 3, ry: 5, gun: 5, thick: 1, kit: 'tools' },
  recon: { rx: 2.8, ry: 4.6, gun: 8, thick: 1, kit: 'cloak' },
};

// ---- Tiny pixel drawing kit on a letter grid ---------------------------

const blank = () => new Array(N * N).fill('.');
function put(g, x, y, k) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && y >= 0 && x < N && y < N) g[y * N + x] = k;
}
function rect(g, x0, y0, x1, y1, k) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, k);
}
function ell(g, cx, cy, rx, ry, k, shadeBelow = null) {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(g, x, y, shadeBelow !== null && y > cy + ry * 0.35 ? shadeBelow : k);
    }
  }
}
function line(g, x0, y0, x1, y1, k) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) put(g, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, k);
}

// ---- The soldier, part by part --------------------------------------------

function kitBehind(g, r, prone) {
  if (prone) {
    if (r.kit === 'cloak') ell(g, 6, 8, 4, 3, 'c');
    else rect(g, 5, 7, 7, 9, 'p');
    if (r.kit === 'tools') line(g, 5, 7, 7, 9, 'y');
    return;
  }
  if (r.kit === 'cloak') { ell(g, 6, 8, 3, 5.4, 'c'); return; }
  if (r.kit === 'ammo') { rect(g, 3, 4, 5, 12, 'p'); rect(g, 3, 5, 3, 11, 'x'); return; }
  rect(g, 4, 5, 5, 11, 'p');
  if (r.kit === 'tools') { line(g, 3, 5, 5, 8, 'y'); line(g, 3, 11, 5, 8, 'y'); }
}

// Rifle held along the right hand side (row 9 when facing right).
function gun(g, r, x0, row) {
  const end = Math.min(N - 1, x0 + r.gun - 1);
  rect(g, x0, row, end, row + r.thick - 1, 'g');
  line(g, x0 + 1, row, end - 1, row, 'k');
  if (r.kit === 'ammo') rect(g, x0 + 1, row + 2, x0 + 2, row + 2, 'x'); // belt box
  if (r.kit === 'cloak') put(g, x0 + 2, row - 1, 'k'); // scope
  return end;
}

// Helmet with a shadow ring; ISA get a highlight, Helghast two goggle eyes
// (both drawn as 'l', which each palette colours differently).
function helmet(g, cx, cy, rad, eyes = true) {
  ell(g, cx, cy, rad + 0.8, rad + 0.8, 'n');
  ell(g, cx, cy, rad, rad, 'h');
  if (eyes) { put(g, cx + rad - 0.4, cy - 1, 'l'); put(g, cx + rad - 0.4, cy + 1, 'l'); }
}

function upright(r, { feet = null, recoil = 0, flash = false, slump = 0 } = {}) {
  const g = blank();
  if (feet === 1) { rect(g, 12, 6, 12, 7, 'f'); rect(g, 3, 10, 3, 11, 'f'); }
  if (feet === 2) { rect(g, 12, 11, 12, 12, 'f'); rect(g, 3, 5, 3, 6, 'f'); }
  kitBehind(g, r, false);
  ell(g, 8 - slump, 8, r.rx, r.ry, 'b', 's');
  if (r.kit === 'plates') { rect(g, 7, 3, 9, 4, 's'); rect(g, 7, 12, 9, 13, 's'); }
  put(g, 8 - slump, 8 - Math.round(r.ry) + 1, 'x'); // shoulder marking
  // Arms reach forward to the weapon.
  line(g, 8 - slump, 12, 11 - recoil - slump, 10, 's');
  line(g, 9 - slump, 5, 13 - recoil - slump, 9, 's');
  const end = gun(g, r, 10 - recoil - slump, 9);
  helmet(g, 8.5 - slump, 8, 2.2);
  if (flash) {
    put(g, end + 1, 9, 'F'); put(g, end + 2, 9, 'E'); put(g, end + 1, 8, 'E'); put(g, end + 1, 10, 'E');
  }
  return g;
}

function proneSprite(r, crawl) {
  const g = blank();
  // Legs trailing behind.
  if (crawl) { line(g, 2, 6, 4, 7, 's'); line(g, 2, 11, 4, 9, 's'); put(g, 1, 6, 'f'); put(g, 1, 11, 'f'); }
  else { line(g, 1, 7, 4, 7, 's'); line(g, 1, 9, 4, 9, 's'); put(g, 1, 7, 'f'); put(g, 1, 9, 'f'); }
  ell(g, 7, 8, 3.6, 2.6, 'b', 's');
  kitBehind(g, r, true);
  gun(g, { ...r, kit: r.kit === 'cloak' ? 'cloak' : 'pack' }, 12, 9);
  helmet(g, 11, 8, 1.7);
  return g;
}

function fallen(r, stage) {
  const g = blank();
  if (stage === 2) ell(g, 7, 9, 3.5, 2.2, 'r');
  if (stage === 0) { // knees buckling
    kitBehind(g, r, false);
    ell(g, 7, 8, r.rx, r.ry - 0.6, 's');
    ell(g, 7.5, 8, 2.1, 2.1, 'h');
    line(g, 9, 9, 13, 11, 'g');
    return g;
  }
  if (stage === 1) { // toppling backwards
    ell(g, 6.5, 8, 3.4, 4.2, 's');
    ell(g, 5, 8, 2, 2, 'h');
    line(g, 9, 11, 13, 13, 'g');
    return g;
  }
  // Lying still, weapon dropped beside them.
  ell(g, 7, 8, 2.8, 4.2, 's');
  rect(g, 9, 6, 10, 10, 'f');
  ell(g, 4.5, 8, 1.8, 1.8, 'h');
  line(g, 9, 3, 14, 5, 'g');
  return g;
}

function buildGrid(role, frame) {
  const r = ROLES[role] || ROLES.rifle;
  switch (frame) {
    case 'walk1': return upright(r, { feet: 1 });
    case 'walk2': return upright(r, { feet: 2 });
    case 'fire': return upright(r, { recoil: 1, flash: true });
    case 'prone1': return proneSprite(r, false);
    case 'prone2': return proneSprite(r, true);
    case 'fall1': return fallen(r, 0);
    case 'fall2': return fallen(r, 1);
    case 'dead': return fallen(r, 2);
    default: return upright(r);
  }
}

// ---- Rotation, outline and painting -------------------------------------

function rotate(src, angle) {
  if (!angle) return src.slice();
  const out = blank();
  const ca = Math.cos(angle), sa = Math.sin(angle);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - MID, dy = y + 0.5 - MID;
      const sx = Math.floor(ca * dx + sa * dy + MID), sy = Math.floor(-sa * dx + ca * dy + MID);
      if (sx >= 0 && sy >= 0 && sx < N && sy < N) out[y * N + x] = src[sy * N + sx];
    }
  }
  return out;
}

const NO_OUTLINE = new Set(['.', 'F', 'E', 'r', 'o']);
function outline(g) {
  const out = g.slice();
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (g[y * N + x] !== '.') continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < N && ny < N && !NO_OUTLINE.has(g[ny * N + nx]);
      });
      if (near) out[y * N + x] = 'o';
    }
  }
  return out;
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RGB = PALETTES.map((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, hex(v)])));

// Paint a letter grid as pixels. dim darkens everything but blood (the dead).
export function paintGrid(g, side, dim = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(N, N);
  for (let i = 0; i < g.length; i++) {
    const k = g[i];
    if (k === '.') continue;
    const [r, gr, b] = RGB[side][k];
    const m = k === 'r' || k === 'o' ? 1 : dim;
    img.data.set([r * m, gr * m, b * m, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const cache = new Map();

// The sprite for a side, role and frame, turned to face direction dir (0..15,
// 0 = facing right, counting clockwise on screen).
export function getSprite(side, role, frame, dir) {
  const key = `${side}|${role}|${frame}|${dir}`;
  let c = cache.get(key);
  if (!c) {
    const grid = outline(rotate(buildGrid(role, frame), (dir / DIRECTIONS) * Math.PI * 2));
    const dim = frame === 'dead' ? 0.72 : frame.startsWith('fall') ? 0.8 : 1;
    c = paintGrid(grid, side, dim);
    cache.set(key, c);
  }
  return c;
}

export function dirIndex(angle) {
  const d = Math.round((angle / (Math.PI * 2)) * DIRECTIONS);
  return ((d % DIRECTIONS) + DIRECTIONS) % DIRECTIONS;
}

export const ROLE_NAMES = Object.keys(ROLES);
