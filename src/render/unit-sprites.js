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
    // The full size atlas plus its smaller copies (half and quarter size)
    // for zooming out; all loaded up front so switching between them is
    // instant. Older atlases without copies just have the one level.
    const levels = [{ image: meta.image, shrink: 1, frames: meta.frames }, ...(meta.levels || [])];
    const imgs = await Promise.all(levels.map(async (l) => {
      const img = new Image();
      img.src = base + l.image;
      await img.decode();
      return { img, shrink: l.shrink, frames: l.frames };
    }));
    SPRITES.units[key] = { meta, img: imgs[0].img, levels: imgs };
  })).then(() => { SPRITES.ready = true; }).catch(() => { SPRITES.ready = false; });
}

// Objective flags (tools/sprites/build_flags.py): a waving loop and a
// limp-to-flying sequence per side, each frame with its hoist corner.
export const FLAGS = { ready: false, img: null, frames: {} };
export function loadFlags(base = 'assets/sprites/') {
  return fetch(`${base}flags.json`).then((r) => r.json()).then(async (meta) => {
    const img = new Image();
    img.src = base + meta.image;
    await img.decode();
    Object.assign(FLAGS, { img, frames: meta.frames, ready: true });
  }).catch(() => { FLAGS.ready = false; });
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

// The code-drawn troopers are about this many pixels tall; the sprites are
// scaled to match (whatever height their atlas was cut at).
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
//
// Level of detail: the atlas comes in a full size and smaller copies. Each
// draw picks the smallest copy that still has at least one of its pixels
// for every screen pixel, so zoomed in shows the full detail and zoomed
// out uses a properly shrunk copy (no shimmer, less work). Shrinking is
// smoothed; enlarging keeps hard pixels.
export function drawUnit(g, key, frame, dir, x, y, s, k = 0) {
  const u = SPRITES.units[key];
  if (!u) return false;
  const name = `${sheetFrame(frame)}:${dir}`;
  if (!u.meta.frames[name]) return false;
  k = k || (s * SIZE) / u.meta.height;
  const m = g.getTransform();
  const screen = k * Math.hypot(m.a, m.b); // screen pixels per full size atlas pixel
  let lv = u.levels[0];
  for (const l of u.levels) if (l.frames[name] && screen * l.shrink <= 1.001) lv = l;
  const [sx, sy, w, h, fx, fy] = lv.frames[name];
  const kk = k * lv.shrink;
  const smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = screen * lv.shrink < 0.999;
  if (g.imageSmoothingEnabled) g.imageSmoothingQuality = 'high';
  g.drawImage(lv.img, sx, sy, w, h, x - fx * kk, y - fy * kk, w * kk, h * kk);
  g.imageSmoothingEnabled = smooth;
  return y - fy * kk;
}
