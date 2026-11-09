// Infantry sprites from the owner's ChatGPT sheets (docs/SPRITE-GUIDE.md),
// cut into atlases by tools/sprites/build_atlas.py: one shared set per
// faction for every infantry squad (specialists get their own sets later),
// plus the ISA v Helghast grapple. Loaded in the background; until they are
// ready (or if they fail) the code-drawn troopers are used instead.

const UNITS = { isa: 'isa-rifle-blue', hgh: 'hgh-rifle', grapple: 'grapple', 'isa-tank': 'isa-tank', 'hgh-tank': 'hgh-tank' };
export const SPRITES = { ready: false, units: {} };

export function loadUnitSprites(base = 'assets/sprites/') {
  return Promise.all(Object.entries(UNITS).map(async ([key, file]) => {
    const meta = await (await fetch(`${base}${file}.json`)).json();
    const img = new Image();
    img.src = base + meta.image;
    await img.decode();
    SPRITES.units[key] = { meta, img };
  })).then(() => { SPRITES.ready = true; }).catch(() => { SPRITES.ready = false; });
}

// The 8 drawn directions, from a screen angle (radians, y down, 0 = east):
// columns are S, SE, E, NE, N, NW, W, SW.
const BY_OCTANT = [2, 1, 0, 7, 6, 5, 4, 3]; // octant 0 = E, 1 = SE, 2 = S ...
export function dirFromAngle(a) {
  const k = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  return BY_OCTANT[k];
}

// The game's animation frames, as named in the sheets.
const FRAME = { walk1: 'run1', walk2: 'run2', walk3: 'run3', walk4: 'run4', fall1: 'hit', fall2: 'fall' };
export const sheetFrame = (f) => FRAME[f] || f;

// A standing soldier in the sheets is this many pixels tall; the code-drawn
// troopers are about 80, so the new sprites are scaled to match.
const SIZE = 80;

// Tanks: the side view is drawn this many code-drawn tank pixels long, so
// the new tanks come out the size the old ones were.
const TANK_LEN = 190;
export const tankScale = (key, ps) => {
  const u = SPRITES.units[key];
  const side = u && u.meta.frames['idle:2'];
  return side ? (ps * TANK_LEN) / side[2] : 0;
};

// Draw a frame with its feet at (x, y); s is the code-drawn trooper scale
// (or, with k given, the exact sprite scale). Returns the top of the drawn
// figure, or false if the frame is missing.
export function drawUnit(g, key, frame, dir, x, y, s, k = 0) {
  const u = SPRITES.units[key];
  if (!u) return false;
  const r = u.meta.frames[`${sheetFrame(frame)}:${dir}`];
  if (!r) return false;
  const [sx, sy, w, h, fx, fy] = r;
  k = k || (s * SIZE) / u.meta.height;
  g.drawImage(u.img, sx, sy, w, h, x - fx * k, y - fy * k, w * k, h * k);
  return y - fy * k;
}
