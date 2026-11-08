// Tanks, one per faction, drawn in code with the same puppet renderer as the
// troopers: a three quarter side view facing right (mirrored to face left),
// about three soldiers long. Original designs with a distinct look per side:
// the ISA tank is low, angular and clean; the Helghast tank is tall, hunched,
// riveted and lit by glowing orange vents.

import { cap, ell, poly, box, detail, materials, rasterise, shiftPieces, rotatePieces } from './puppet.js';

export const TANK_W = 210;
export const TANK_H = 130;
export const TANK_FOOT = [104, 120]; // the middle of the tank where it meets the ground

const MATS = {
  isa: materials({
    armour: '#5d7489', armourLight: '#7f98b0', armourDark: '#3c4d5f', track: '#26292d', trackLight: '#4a4f56',
    wheel: '#3b4048', metal: '#8a929b', gun: '#2c3036', gunLight: '#4f5660', yellow: '#d8c35a',
    glass: { base: '#5fb8e8', gloss: true },
    light: { glow: true, ramp: [0, 0, [60, 120, 200], [140, 200, 255], [140, 200, 255]], core: [235, 248, 255] },
    flash: { glow: true, ramp: [0, 0, [120, 170, 230], [200, 230, 255], [200, 230, 255]], core: [255, 255, 255] },
    scorch: '#2a2724',
  }),
  hgh: materials({
    iron: '#4e5155', ironLight: '#6b6e72', ironDark: '#2f3134', rust: '#6e4a32', track: '#1f2022', trackLight: '#45474a',
    wheel: '#35373a', metal: '#7d8083', gun: '#262729', gunLight: '#4a4c50', rivet: '#8e9093',
    slot: { glow: true, ramp: [0, 0, [140, 40, 12], [230, 90, 28], [230, 90, 28]], core: [255, 180, 100] },
    eye: { glow: true, ramp: [0, 0, [176, 38, 12], [255, 92, 28], [255, 92, 28]], core: [255, 226, 160] },
    flash: { glow: true, ramp: [0, 0, [220, 90, 20], [255, 160, 60], [255, 160, 60]], core: [255, 244, 200] },
    scorch: '#262320',
  }),
};

// Tracks and road wheels, shared by both (sizes and wheel count differ).
// phase 0..1 turns the wheels and slides the track links when driving.
function running(P, { x0, x1, y0, y1, wheels, wr, phase, mats }) {
  const r = (y1 - y0) / 2;
  P.push(cap([x0 + r, y0 + r], [x1 - r, y0 + r], r, r, mats.track, 10));
  // Track links along the top and bottom runs.
  const pitch = 6;
  for (let x = x0 + r - pitch + (phase * pitch); x < x1 - r; x += pitch) {
    P.push(...detail(box(x, y0, x + 2.5, y0 + 2, mats.trackLight, 10.5), box(x, y1 - 2, x + 2.5, y1, mats.trackLight, 10.5)));
  }
  const step = (x1 - x0 - 2 * r) / (wheels - 1);
  for (let k = 0; k < wheels; k++) {
    const cx = x0 + r + k * step, cy = y0 + r + 1;
    P.push(ell([cx, cy], wr, wr, mats.wheel, 11));
    P.push(ell([cx, cy], wr * 0.45, wr * 0.45, 'metal', 11.5));
    // Spokes that turn with the wheel.
    for (let s = 0; s < 3; s++) {
      const a = phase * Math.PI * 2 / 3 + (s * Math.PI * 2) / 3;
      P.push(...detail(cap([cx + Math.cos(a) * wr * 0.5, cy + Math.sin(a) * wr * 0.5], [cx + Math.cos(a) * wr * 0.85, cy + Math.sin(a) * wr * 0.85], 0.7, 0.7, mats.trackLight, 11.6)));
    }
  }
}

// ---- ISA: low, angular and clean -----------------------------------------

function isaTank({ phase = 0, recoil = 0, flash = false } = {}) {
  const P = [];
  running(P, { x0: 26, x1: 178, y0: 92, y1: 120, wheels: 6, wr: 8, phase, mats: { track: 'track', trackLight: 'trackLight', wheel: 'wheel' } });
  // Side skirt over the top of the tracks, with panel joints.
  P.push(poly([[24, 84], [176, 84], [184, 98], [20, 98]], 'armour', 14));
  for (const x of [56, 92, 128, 160]) P.push(...detail(cap([x, 86], [x + 2, 96], 0.5, 0.5, 'armourDark', 14.5)));
  // Hull: a long sloped wedge with a lighter deck.
  P.push(poly([[24, 64], [146, 60], [186, 78], [182, 86], [22, 86]], 'armour', 16));
  P.push(poly([[30, 62], [146, 59], [176, 72], [32, 70]], 'armourLight', 16.5));
  P.push(...detail(cap([150, 62], [184, 79], 0.6, 0.6, 'armourDark', 16.7))); // glacis edge
  P.push(ell([180, 81], 2, 1.6, 'light', 17), ell([172, 80], 1.6, 1.3, 'light', 17)); // blue running lights
  P.push(box(30, 66, 44, 72, 'armourDark', 17)); // engine deck grille
  for (const x of [32, 36, 40]) P.push(...detail(box(x, 67, x + 1.5, 71, 'gun', 17.2)));
  // Turret: a low, clean wedge with a sensor block and hatch.
  const tx = -recoil * 0.4;
  P.push(poly([[66 + tx, 44], [124 + tx, 41], [142 + tx, 51], [134 + tx, 62], [70 + tx, 62], [60 + tx, 54]], 'armour', 20));
  P.push(poly([[70 + tx, 43], [124 + tx, 41], [136 + tx, 48], [72 + tx, 50]], 'armourLight', 20.5));
  P.push(box(80 + tx, 52, 92 + tx, 57, 'yellow', 21)); // unit marking
  P.push(ell([100 + tx, 40], 6, 2.5, 'armourDark', 21)); // hatch
  P.push(box(110 + tx, 34, 122 + tx, 41, 'armourDark', 21), box(117 + tx, 35, 121 + tx, 39, 'glass', 21.5)); // sensor
  P.push(cap([86 + tx, 40], [80 + tx, 14], 0.5, 0.5, 'metal', 19)); // antenna
  // Main gun: long and smooth, with a muzzle brake and a fume extractor.
  const g = 138 - recoil * 5;
  P.push(cap([g, 50], [g + 54, 48.5], 3, 2.6, 'gun', 22));
  P.push(ell([g + 26, 49.2], 4, 3.6, 'gunLight', 22.5));
  P.push(box(g + 52, 45.5, g + 58, 52, 'gunLight', 23));
  P.push(cap([124 + tx, 58], [134 + tx, 58], 1, 1, 'gun', 21)); // coaxial gun
  if (flash) P.push(ell([g + 64, 48.8], 6, 4, 'flash', 30), ell([g + 72, 48.8], 4, 2.4, 'flash', 30));
  return P;
}

// ---- Helghast: tall, hunched, riveted, glowing ----------------------------

function hghTank({ phase = 0, recoil = 0, flash = false } = {}) {
  const P = [];
  running(P, { x0: 22, x1: 182, y0: 90, y1: 120, wheels: 5, wr: 10, phase, mats: { track: 'track', trackLight: 'trackLight', wheel: 'wheel' } });
  // Track guard with rivets, the tracks left exposed below it.
  P.push(poly([[20, 84], [180, 84], [186, 92], [16, 92]], 'ironDark', 14));
  for (let x = 26; x < 180; x += 12) P.push(...detail(ell([x, 88], 0.8, 0.8, 'rivet', 14.5)));
  // Hull: high at the back, hunched forward, riveted plates and rust.
  P.push(poly([[18, 50], [70, 44], [152, 52], [188, 70], [184, 86], [18, 86]], 'iron', 16));
  P.push(poly([[24, 50], [70, 46], [150, 54], [168, 62], [26, 60]], 'ironLight', 16.5));
  for (const x of [50, 90, 130]) P.push(...detail(cap([x, 48], [x + 4, 85], 0.6, 0.6, 'ironDark', 16.7))); // plate seams
  for (let x = 30; x < 150; x += 10) P.push(...detail(ell([x, 63], 0.7, 0.7, 'rivet', 16.8)));
  P.push(poly([[30, 68], [52, 68], [56, 80], [28, 80]], 'rust', 16.6), poly([[118, 72], [140, 70], [138, 82], [116, 82]], 'rust', 16.6));
  // A row of glowing orange slot vents along the side.
  for (let k = 0; k < 6; k++) P.push(box(62 + k * 12, 70, 69 + k * 12, 74, 'slot', 17));
  // Front: a grille of slats and two round glowing "eyes", like the masks.
  for (let k = 0; k < 5; k++) P.push(...detail(cap([170 + k * 3, 66 + k * 2], [168 + k * 3, 82], 0.7, 0.7, 'ironDark', 17.2)));
  P.push(ell([178, 70], 3.2, 3, 'ironDark', 17.3), ell([178, 70], 2.2, 2, 'eye', 17.5));
  P.push(ell([186, 76], 2.8, 2.6, 'ironDark', 17.3), ell([186, 76], 1.8, 1.7, 'eye', 17.5));
  // Exhaust stacks at the back.
  P.push(cap([30, 50], [28, 26], 3, 3, 'iron', 15), cap([40, 48], [39, 30], 2.6, 2.6, 'iron', 15));
  P.push(ell([28, 25], 3, 1.4, 'gun', 15.5), ell([39, 29], 2.6, 1.2, 'gun', 15.5));
  // Turret: tall and angular with a heavy mantlet.
  const tx = -recoil * 0.4;
  P.push(poly([[62 + tx, 34], [118 + tx, 30], [140 + tx, 42], [136 + tx, 56], [66 + tx, 56], [56 + tx, 46]], 'iron', 20));
  P.push(poly([[66 + tx, 33], [118 + tx, 30], [132 + tx, 38], [68 + tx, 40]], 'ironLight', 20.5));
  for (let x = 72; x < 130; x += 10) P.push(...detail(ell([x + tx, 49], 0.7, 0.7, 'rivet', 20.7)));
  P.push(box(128 + tx, 38, 146 + tx, 56, 'ironDark', 21)); // mantlet
  P.push(box(96 + tx, 36, 112 + tx, 39, 'slot', 21)); // sight slit
  P.push(box(70 + tx, 42, 84 + tx, 46, 'rust', 20.8));
  // Main gun: long and heavy with ringed sections and a big muzzle.
  const g = 142 - recoil * 5;
  P.push(cap([g, 46], [g + 60, 45], 3.6, 3, 'gun', 22));
  for (const k of [12, 24, 36]) P.push(...detail(cap([g + k, 41.5], [g + k, 49.5], 0.8, 0.8, 'gunLight', 22.5)));
  P.push(box(g + 56, 41, g + 64, 50, 'gunLight', 23));
  if (flash) P.push(ell([g + 70, 45.5], 7, 4.5, 'flash', 30), ell([g + 79, 45.5], 4.5, 2.6, 'flash', 30));
  return P;
}

const BUILD = { isa: isaTank, hgh: hghTank };

// Frames: idle, move1..move4 (wheels turning), fire, wreck.
export const TANK_FRAMES = ['idle', 'move1', 'move2', 'move3', 'move4', 'fire', 'wreck'];

function piecesFor(side, frame) {
  const make = BUILD[side];
  if (frame.startsWith('move')) return make({ phase: (Number(frame.slice(4)) - 1) / 4 });
  if (frame === 'fire') return make({ recoil: 1, flash: true });
  if (frame === 'wreck') {
    // Knocked out: the turret thrown askew and the hull scorched.
    const P = make();
    const out = P.map((p) => (p.z >= 20 && p.z < 30 ? rotatePieces([p], [100, 50], -9)[0] : p));
    const shifted = out.map((p) => (p.z >= 20 && p.z < 30 ? shiftPieces([p], -4, 3)[0] : p));
    shifted.push(ell([96, 66], 14, 7, 'scorch', 17.9), ell([140, 72], 9, 5, 'scorch', 17.9), ell([60, 74], 8, 4, 'scorch', 17.9));
    return shifted.filter((p) => !['light', 'eye', 'slot', 'glass'].includes(p.mat));
  }
  return make();
}

const cache = new Map();

// A canvas for one faction's tank ('isa' or 'hgh'), frame and facing.
export function getTank(side, frame, facing = 1) {
  const key = `${side}|${frame}|${facing}`;
  let c = cache.get(key);
  if (c) return c;
  const px = rasterise(piecesFor(side, frame), MATS[side], TANK_W, TANK_H, { dim: frame === 'wreck' ? 0.55 : 1 });
  c = document.createElement('canvas');
  c.width = TANK_W;
  c.height = TANK_H;
  const g = c.getContext('2d');
  const img = g.createImageData(TANK_W, TANK_H);
  if (facing === 1) img.data.set(px);
  else {
    for (let y = 0; y < TANK_H; y++) for (let x = 0; x < TANK_W; x++) {
      const s = (y * TANK_W + x) * 4, d = (y * TANK_W + (TANK_W - 1 - x)) * 4;
      img.data.set(px.subarray(s, s + 4), d);
    }
  }
  g.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}
