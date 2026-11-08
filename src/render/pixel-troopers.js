// Hand placed pixel art troopers: one rifleman per faction, about 40 pixels
// tall, three quarter view facing right (mirrored to face left). Original
// art drawn in code; the style (proportions, muted palette, strong shading)
// follows the references Matthew supplied, nothing is traced.
//
// Each grid row is a string of palette letters; '.' is transparent. Walk,
// fire, prone and fallen frames are built from the standing grid.

// Palette letters shared by both factions:
// K outline, D dark, A mid, L light, H highlight (armour or helmet)
// U undersuit, C coat dark, c coat mid, d coat light
// M mask or visor frame, m mask dark, E eye or visor glow, e glow core
// P webbing, p webbing light, S skin or glove, R armband, Y marking
// G gun dark, g gun light, B boot, b boot light, F flash, f flash outer
const PAL = {
  isa: {
    K: '#0d1014', D: '#262d35', A: '#3d4b5a', L: '#5d7186', H: '#8ea4ba', U: '#1d2228',
    C: '#2a3138', c: '#3b4652', d: '#52606e',
    M: '#2f3a45', m: '#1a2027', E: '#4fb2ea', e: '#c9efff',
    P: '#454b39', p: '#646b52', S: '#b8785a', R: '#c7a94a', Y: '#e3cf62',
    G: '#121417', g: '#3c424a', B: '#18191c', b: '#33353a', F: '#ffffff', f: '#cfe6ff',
  },
  hgh: {
    K: '#0b0b0c', D: '#232427', A: '#393b3f', L: '#53565b', H: '#777b80', U: '#1c1d1f',
    C: '#2e2f2b', c: '#43443d', d: '#5c5d54',
    M: '#4c4f53', m: '#2b2d30', E: '#ff4f14', e: '#ffc27a',
    P: '#34352e', p: '#4d4e44', S: '#2a2a2c', R: '#8b2a1c', Y: '#c8461b',
    G: '#111214', g: '#3a3d42', B: '#151516', b: '#2e2f31', F: '#fff1c2', f: '#ff8a3a',
  },
};

// Helghast rifleman: peaked helmet, gas mask with glowing eyes and a hose,
// shoulder armour over a long greatcoat split at the front, heavy boots.
const HGH = [
  '.........KKKKK',
  '.......KKDAAADKK',
  '......KDAALLLAADK',
  '......KDALHHLLAADK',
  '.....KKDALLLLAAADKK',
  '.....KDDDDDDDDDDDDDK',
  '......KmMMMMMMMMmK',
  '......KmeEMMMeEMmK',
  '......KmEEMMMEEMmK',
  '.......KmMMHMMmKK',
  '........KmMMMmKMK',
  '.......KKKmmKKDMK',
  '....KKDDAAKKKAADDMKK',
  '...KDAALHLAADAALHLADK',
  '...KDALHLAPPPPPALHLADK',
  '...KDRRAAPPpPpPPAALADK',
  '...KDRRAPPPPPPPPAAADK',
  '...KDAAKSKKPPPPKKKDADK',
  '...KDDKSSGGGGGGGGGGGGGGGGGGGGGK',
  '....KKKSSgggggGGgggggggggggGK',
  '....KCcKKKKGGKKSSKKKKKKKKKKK',
  '...KCccdcKGGKcPSSK',
  '...KCcdccKKKKccccCK',
  '..KCccdcccDccccdcCK',
  '..KCccdccDDcccccdcCK',
  '..KCcdcccDKcccccdccCK',
  '.KCccdccDKUKccccdccCK',
  '.KCccdccDKUUKcccdcccCK',
  '.KCcdcccKUUUKKccccdcCK',
  '.KKCccccKUAUK.KccccCCK',
  '..KKKCccKUAUK..KKcCKKK',
  '....KKKKKUUUK...KKKK',
  '.......KUUAUK..KUUUK',
  '.......KUUAUK..KUAUK',
  '.......KUUUUK..KUUUUK',
  '......KBBBBBK..KBBBBK',
  '......KBbbBBBK.KBbbBBK',
  '.....KBBBBBBBK.KBBBBBBK',
  '.....KKKKKKKKK.KKKKKKKK',
];

// ISA rifleman: rounded combat helmet with a blue visor on the leading side,
// layered armour plates over a dark undersuit, webbing and pouches, thigh
// plates and knee pads, rifle held across the chest with bare hands.
const ISA = [
  '.........KKKKK',
  '.......KKDAAADKK',
  '......KDAALLLAADK',
  '......KDALHHLLAADK',
  '......KDALHLLAMMMK',
  '......KDAALLAMEEeMK',
  '......KDAAAAAMEEEMK',
  '.......KDDAAAAMMMK',
  '........KKDDDDDKK',
  '......KKKKDUUUDKKKK',
  '....KKDAALAKUKALAADKK',
  '...KDALHHLAKKKALHHLADK',
  '...KDALHLAADYDAALHLADK',
  '...KDAALAAPPPPPAALAADK',
  '...KDDAADKPpPPpPKDAADDK',
  '...KDALDKPPPPPPPKDLADK',
  '...KDAAKSKKPPPPKKKDAADK',
  '...KDDKSSGGGGGGGGGGGGGGGGGGGGGK',
  '....KKKSSgggggGGggggggggggggGK',
  '......KKKKKGGKKSSKKKKKKKKKKKK',
  '.......KUPKGGKPPSSK',
  '.......KUPPKKPPPPUK',
  '.......KUPpPPPPpPUK',
  '.......KUUUUUUUUUUK',
  '.......KDAALAKDALAADK',
  '.......KDALHAKDALHADK',
  '.......KDAAAAKKDAAADK',
  '.......KUUUUUK.KUUUUK',
  '.......KUUUUK..KUUUUK',
  '.......KDLHAK..KDLHAK',
  '.......KDAAAK..KDAAAK',
  '.......KUUUUK..KUUUUK',
  '.......KUUUUK..KUUUUK',
  '.......KUAUUK..KUUAUK',
  '.......KUUUUK..KUUUUK',
  '......KBBBBBK..KBBBBBK',
  '......KBbbBBBK.KBbbBBBK',
  '.....KBBBBBBBK.KBBBBBBK',
  '.....KKKKKKKKK.KKKKKKKK',
];

const LEGS = { isa: 27, hgh: 31 }; // rows from here down are legs (moved when walking)
const GUN_ROW = { isa: 17, hgh: 18 };

const pad = (rows) => {
  const w = Math.max(...rows.map((r) => r.length)) + 6; // room for a muzzle flash
  return rows.map((r) => r.padEnd(w, '.'));
};
const BASE = { isa: pad(ISA), hgh: pad(HGH) };

// Walking: swap the leg rows for a stride. The left leg moves forward and the
// right back, then the reverse, by shifting each leg's columns.
function stride(rows, dir, side) {
  const out = rows.slice();
  const split = 14; // column between the two legs
  for (let y = LEGS[side]; y < rows.length; y++) {
    const row = rows[y];
    const left = row.slice(0, split), right = row.slice(split);
    const shiftL = dir, shiftR = -dir;
    const mv = (s, n) => (n > 0 ? '.'.repeat(n) + s.slice(0, s.length - n) : n < 0 ? s.slice(-n) + '.'.repeat(-n) : s);
    out[y] = mv(left, shiftL) + mv(right, shiftR);
  }
  return out;
}

// One pixel bob for the passing frames of the walk.
const bob = (rows, side) => ['.'.repeat(rows[0].length), ...rows.slice(0, LEGS[side] - 1), ...rows.slice(LEGS[side])];

function fire(rows, side) {
  const out = rows.slice();
  const gunRow = GUN_ROW[side];
  const r = out[gunRow];
  const tip = r.lastIndexOf('K');
  const put = (y, x, ch) => { out[y] = out[y].slice(0, x) + ch + out[y].slice(x + 1); };
  put(gunRow, tip + 1, 'F'); put(gunRow, tip + 2, 'f'); put(gunRow, tip + 3, 'f');
  put(gunRow - 1, tip + 1, 'f'); put(gunRow + 1, tip + 1, 'f');
  return out;
}

// Turn a grid a quarter (lying down). cw = head to the right (prone, facing
// the enemy); otherwise head to the left (fallen backwards).
function quarter(rows, cw) {
  const h = rows.length, w = rows[0].length;
  const out = [];
  for (let x = 0; x < w; x++) {
    let line = '';
    for (let y = 0; y < h; y++) line += cw ? rows[h - 1 - y][x] : rows[y][w - 1 - x];
    out.push(line);
  }
  return out.filter((l) => /[^.]/.test(l));
}

export const PIXEL_FRAMES = ['stand', 'walk1', 'walk2', 'walk3', 'walk4', 'fire'];

function frameRows(side, frame) {
  const b = BASE[side];
  switch (frame) {
    case 'walk1': return stride(b, 1, side);
    case 'walk2': return bob(b, side);
    case 'walk3': return stride(b, -1, side);
    case 'walk4': return bob(b, side);
    case 'fire': return fire(b, side);
    case 'prone': return quarter(b, true);
    case 'dead': return quarter(b, false);
    default: return b;
  }
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const cache = new Map();

// A canvas for one faction ('isa' or 'hgh'), frame, facing (1 right, -1 left).
export function getPixelTrooper(side, frame, facing = 1) {
  const key = `${side}|${frame}|${facing}`;
  let c = cache.get(key);
  if (c) return c;
  const rows = frameRows(side, frame);
  const pal = PAL[side];
  const h = rows.length, w = rows[0].length;
  c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const dim = frame === 'dead' ? 0.7 : 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][facing === 1 ? x : w - 1 - x];
      if (ch === '.' || !pal[ch]) continue;
      const [r, gr, b] = hex(pal[ch]);
      const glow = ch === 'E' || ch === 'e' || ch === 'F' || ch === 'f';
      const m = glow ? 1 : dim;
      img.data.set([r * m, gr * m, b * m, 255], (y * w + x) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}
