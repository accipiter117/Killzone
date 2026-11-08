// Detailed pixel art riflemen, one per faction, about 70 pixels tall in a
// three quarter view facing right (mirrored to face left). Each is a puppet
// of shaped pieces rendered by puppet.js, posed from a simple skeleton so
// walking, firing, lying down and falling are re-drawn cleanly. Original
// art drawn in code; the equipment follows the references Matthew supplied
// (Helghast gas mask, peaked helmet, greatcoat; ODST style ISA armour).

import { cap, ell, poly, box, materials, rasterise, rotatePieces, shiftPieces } from './puppet.js';

export const PT_W = 112;
export const PT_H = 90;
export const PT_FOOT = [40, 84]; // where the soldier's feet touch the ground

const MATS = {
  hgh: materials({
    helmet: '#4a4d51', helmetDark: '#2e3033', mask: '#5b5e61', metal: '#7d8083', rubber: '#2b2c2d',
    lens: { glow: true, ramp: [0, 0, 0, [255, 84, 26], [255, 84, 26]], core: [255, 214, 150] },
    sight: { glow: true, ramp: [0, 0, 0, [255, 60, 30], [255, 60, 30]], core: [255, 170, 120] },
    coat: '#4b4c43', coatDark: '#383930', armour: '#5a5d60', pouch: '#504f41', strap: '#3a3a31',
    leather: '#40382d', trousers: '#3d3f3c', boot: '#28282a', glove: '#303032', red: '#922c1d',
    gun: '#2d2f32', gunLight: '#4f5358',
    flash: { glow: true, ramp: [0, 0, 0, [255, 150, 60], [255, 150, 60]], core: [255, 244, 200] },
  }),
  isa: materials({
    armour: '#566b80', armourDark: '#39475a', under: '#2f353c', visor: { base: '#3d9bd8', gloss: true },
    metal: '#80878e', olive: '#5a6342', oliveDark: '#41482f', skin: '#b5795a', boot: '#27282b',
    gun: '#2b2d31', gunLight: '#4c5158', glass: { base: '#5fb8e8', gloss: true }, yellow: '#d8c35a',
    flash: { glow: true, ramp: [0, 0, 0, [190, 225, 255], [190, 225, 255]], core: [255, 255, 255] },
  }),
};

// ---- Skeleton -------------------------------------------------------------

const GROUND = 82;
const legFrom = (hip, thigh, shin, l1 = 11, l2 = 11) => {
  const a = (thigh * Math.PI) / 180, b = ((thigh + shin) * Math.PI) / 180;
  const knee = [hip[0] + Math.sin(a) * l1, hip[1] + Math.cos(a) * l1];
  const ankle = [knee[0] + Math.sin(b) * l2, knee[1] + Math.cos(b) * l2];
  return { hip, knee, ankle };
};

// Leg angles (thigh from vertical, then shin relative to thigh), forward +.
const LEG_POSES = {
  stand: { back: [-5, 2], front: [7, -2], bob: 0 },
  walk1: { back: [-20, 28], front: [22, -6], bob: 0 },
  walk2: { back: [-4, 24], front: [3, 0], bob: -1 },
  walk3: { back: [22, -6], front: [-20, 28], bob: 0 },
  walk4: { back: [3, 0], front: [-4, 24], bob: -1 },
};

// Place a weapon drawn along +x (butt at the origin) at a point and angle.
const place = (pieces, at, deg) => shiftPieces(rotatePieces(pieces, [0, 0], deg), at[0], at[1]);

// ---- Helghast ----------------------------------------------------------

function hghRifle(z) {
  return [
    poly([[0, -2], [9, -3], [10, 3], [1, 4]], 'gun', z),
    box(9, -3, 27, 3, 'gunLight', z + 1),
    box(11, -1, 25, 0, 'gun', z + 2), // ejection port line
    poly([[13, 2], [16, 2], [15, 9], [12, 8]], 'gun', z + 1),
    poly([[19, 2], [23, 2], [25, 11], [21, 12]], 'gun', z + 2), // curved magazine
    box(27, -2, 38, 2, 'gun', z + 1),
    box(29, -1, 30, 1, 'gunLight', z + 2), box(32, -1, 33, 1, 'gunLight', z + 2), box(35, -1, 36, 1, 'gunLight', z + 2),
    cap([38, 0], [48, 0], 1.1, 1.1, 'gun', z + 1),
    box(47, -1.6, 51, 1.6, 'gunLight', z + 2), // muzzle brake
    box(13, -6, 23, -3, 'gunLight', z + 2), // sight housing
    ell([22, -4.5], 1.1, 1.1, 'sight', z + 3),
  ];
}

function helghast(legs, { recoil = 0, flash = false, arms = 'ready', gun = true } = {}) {
  const P = [];
  const lb = legFrom([31, 55], ...legs.back), lf = legFrom([38, 55], ...legs.front);
  const boot = (L, z) => {
    const [x, y] = L.ankle;
    P.push(poly([[x - 3.5, y - 2], [x + 3, y - 2], [x + 6.5, y + 3], [x + 6.5, y + 6], [x - 4, y + 6], [x - 4.5, y + 1]], 'boot', z));
    P.push(cap([x - 3.5, y + 0.5], [x + 3.5, y + 0.5], 0.7, 0.7, 'strap', z + 0.2));
    P.push(box(x - 4.5, y + 5, x + 6.5, y + 6, 'helmetDark', z + 0.1)); // sole
  };
  // Back leg (behind the coat skirt), then the back of the coat.
  P.push(cap(lb.hip, lb.knee, 4, 3.5, 'trousers', 6), cap(lb.knee, lb.ankle, 3.4, 3, 'trousers', 6));
  P.push(ell(lb.knee, 3, 2.6, 'armour', 6.5));
  boot(lb, 7);
  P.push(poly([[25, 54], [34, 54], [33, 71], [21, 70]], 'coatDark', 5));
  // Back arm (holding the pistol grip), drawn behind the body.
  const sB = [28, 38], sF = [43, 38];
  const handsReady = { back: [37 - recoil, 50], front: [54 - recoil, 50] };
  const hands = arms === 'up' ? { back: [33, 10], front: [41, 6] } : arms === 'limp' ? { back: [27, 56], front: [46, 56] } : handsReady;
  const eB = arms === 'up' ? [26, 26] : arms === 'limp' ? [26, 47] : [27, 47];
  const eF = arms === 'up' ? [47, 26] : arms === 'limp' ? [46, 47] : [49, 45];
  P.push(cap(sB, eB, 3.2, 2.9, 'coat', 10), cap(eB, hands.back, 2.8, 2.4, 'coat', 10));
  P.push(cap([sB[0] + (eB[0] - sB[0]) * 0.25, sB[1] + (eB[1] - sB[1]) * 0.25], [sB[0] + (eB[0] - sB[0]) * 0.45, sB[1] + (eB[1] - sB[1]) * 0.45], 3.3, 3.1, 'red', 10.5));
  P.push(ell(sB, 4.4, 3.8, 'armour', 11));
  // Front leg, then the body of the coat.
  P.push(cap(lf.hip, lf.knee, 4.2, 3.7, 'trousers', 14), cap(lf.knee, lf.ankle, 3.6, 3.1, 'trousers', 14));
  P.push(ell(lf.knee, 3.2, 2.8, 'armour', 14.5));
  boot(lf, 15);
  P.push(poly([[26, 35], [45, 35], [47, 55], [24, 55]], 'coat', 20));
  // Chest rig: armoured vest, crossed straps, pouches, belt.
  P.push(poly([[29, 37], [43, 37], [44, 50], [28, 50]], 'armour', 22));
  P.push(cap([29, 38], [42, 49], 0.8, 0.8, 'strap', 23), cap([42, 38], [30, 49], 0.8, 0.8, 'strap', 23));
  P.push(box(29, 44, 33, 49, 'pouch', 24), box(34, 44, 38, 49, 'pouch', 24), box(39, 44, 43, 49, 'pouch', 24));
  P.push(box(30, 44, 32, 45, 'strap', 24.5), box(35, 44, 37, 45, 'strap', 24.5), box(40, 44, 42, 45, 'strap', 24.5));
  P.push(box(24, 52, 47, 55, 'leather', 25), box(34, 52, 37, 55, 'metal', 26));
  P.push(box(26, 55, 30, 59, 'pouch', 26), box(41, 55, 45, 59, 'pouch', 26));
  // Front of the greatcoat, split to show the legs.
  P.push(poly([[37, 55], [47, 55], [51, 71], [41, 72]], 'coat', 30));
  P.push(cap([39, 57], [43, 71], 0.5, 0.5, 'coatDark', 30.5)); // fold
  // Collar, then helmet and gas mask.
  P.push(poly([[28, 30], [43, 31], [45, 36], [27, 36]], 'coatDark', 31));
  P.push(poly([[26, 21], [31, 21], [32, 31], [25, 30]], 'helmet', 32)); // neck guard
  P.push(poly([[29, 25], [44, 26], [44, 32], [40, 35], [31, 34], [29, 30]], 'mask', 33));
  P.push(ell([36, 20], 9.5, 8, 'helmet', 34));
  P.push(poly([[27, 22], [45, 23], [45, 26], [27, 25]], 'helmetDark', 35)); // rim band
  P.push(poly([[39, 23], [50, 26], [49, 28], [38, 26]], 'helmet', 36)); // peak
  P.push(cap([29, 14], [41, 15], 0.6, 0.6, 'helmetDark', 35)); // crest ridge
  P.push(ell([36, 29], 2.9, 2.7, 'metal', 37), ell([42, 29], 2.7, 2.6, 'metal', 37));
  P.push(ell([36, 29], 2, 1.9, 'lens', 38), ell([42, 29], 1.9, 1.8, 'lens', 38));
  P.push(poly([[37, 32], [44, 31], [46, 35], [40, 38], [36, 36]], 'metal', 39)); // respirator
  P.push(ell([46.5, 35], 2.7, 2.7, 'mask', 40), ell([47, 35], 1.1, 1.1, 'rubber', 41)); // filter
  P.push(cap([40, 38], [37, 43], 1.3, 1.3, 'rubber', 40), cap([37, 43], [33, 46], 1.3, 1.3, 'rubber', 40)); // hose
  // Front arm, rifle, gloves on top.
  P.push(ell(sF, 4.8, 4, 'armour', 41));
  P.push(cap(sF, eF, 3.4, 3, 'coat', 42), cap(eF, hands.front, 3, 2.6, 'coat', 42));
  if (gun) P.push(...place(hghRifle(44), [25 - recoil, arms === 'up' ? 24 : 46], arms === 'up' ? -86 : 4.5));
  P.push(ell(hands.back, 2.4, 2.2, 'glove', 48), ell(hands.front, 2.6, 2.3, 'glove', 48));
  if (flash) P.push(ell([77 - recoil, 50], 3, 2, 'flash', 50), ell([81 - recoil, 50.3], 2, 1.2, 'flash', 50));
  return P;
}

// ---- ISA -----------------------------------------------------------------

function isaRifle(z) {
  return [
    poly([[0, -2], [24, -3], [26, 3], [1, 4]], 'gunLight', z), // bullpup body
    box(2, -1, 22, 0, 'gun', z + 1),
    box(6, 3, 10, 11, 'gun', z + 1), // magazine behind the grip
    poly([[15, 3], [18, 3], [17, 9], [14, 8]], 'gun', z + 1), // grip
    box(24, -2, 34, 2, 'gun', z + 1),
    cap([34, 0], [45, 0], 1, 1, 'gun', z + 1),
    box(44, -1.4, 47, 1.4, 'gunLight', z + 2),
    cap([11, -6], [23, -6], 1.8, 1.6, 'gun', z + 2), // scope
    box(14, -4.5, 16, -3, 'gun', z + 2), box(19, -4.5, 21, -3, 'gun', z + 2),
    ell([23.5, -6], 0.9, 1.3, 'glass', z + 3),
  ];
}

function isa(legs, { recoil = 0, flash = false, arms = 'ready', gun = true } = {}) {
  const P = [];
  const lb = legFrom([31, 55], ...legs.back), lf = legFrom([38, 55], ...legs.front);
  const leg = (L, z) => {
    P.push(cap(L.hip, L.knee, 4.2, 3.6, 'under', z), cap(L.knee, L.ankle, 3.5, 3, 'under', z));
    const mid = [(L.hip[0] + L.knee[0]) / 2, (L.hip[1] + L.knee[1]) / 2 - 0.5];
    P.push(ell(mid, 3.4, 4, 'armour', z + 0.2)); // thigh plate
    P.push(ell(L.knee, 3.3, 2.8, 'armourDark', z + 0.3)); // knee pad
    const shin = [(L.knee[0] * 0.4 + L.ankle[0] * 0.6), (L.knee[1] * 0.4 + L.ankle[1] * 0.6)];
    P.push(ell(shin, 3, 4, 'armour', z + 0.25)); // shin guard
    const [x, y] = L.ankle;
    P.push(poly([[x - 3.5, y - 2], [x + 3, y - 2], [x + 6.5, y + 3], [x + 6.5, y + 6], [x - 4, y + 6], [x - 4.5, y + 1]], 'boot', z + 0.4));
    P.push(box(x - 4.5, y + 5, x + 6.5, y + 6, 'under', z + 0.5));
  };
  leg(lb, 6);
  const sB = [27, 37], sF = [44, 37];
  const handsReady = { back: [37 - recoil, 50], front: [53 - recoil, 50] };
  const hands = arms === 'up' ? { back: [33, 10], front: [41, 6] } : arms === 'limp' ? { back: [26, 56], front: [47, 56] } : handsReady;
  const eB = arms === 'up' ? [25, 26] : arms === 'limp' ? [25, 47] : [26, 47];
  const eF = arms === 'up' ? [48, 26] : arms === 'limp' ? [47, 47] : [49, 45];
  // Back arm: undersuit sleeve, forearm guard, shoulder pauldron.
  P.push(cap(sB, eB, 3, 2.7, 'under', 10), cap(eB, hands.back, 2.7, 2.3, 'under', 10));
  P.push(cap([eB[0] + (hands.back[0] - eB[0]) * 0.15, eB[1] + (hands.back[1] - eB[1]) * 0.15], [eB[0] + (hands.back[0] - eB[0]) * 0.7, eB[1] + (hands.back[1] - eB[1]) * 0.7], 3, 2.7, 'armour', 10.5));
  P.push(ell([sB[0], sB[1] + 1], 5, 4.4, 'armour', 11));
  leg(lf, 14);
  // Torso: undersuit, chest plate with a centre ridge, webbing and pouches.
  P.push(poly([[26, 33], [45, 33], [46, 55], [25, 55]], 'under', 20));
  P.push(poly([[28, 34], [44, 34], [45, 45], [36, 48], [27, 45]], 'armour', 22));
  P.push(cap([36, 35], [36, 46], 0.6, 0.6, 'armourDark', 23));
  P.push(box(30, 37, 33, 39, 'yellow', 23)); // unit marking
  P.push(box(28, 47, 32, 53, 'olive', 24), box(33, 47, 37, 53, 'olive', 24), box(38, 47, 42, 53, 'olive', 24));
  P.push(box(28, 47, 32, 48, 'oliveDark', 24.5), box(33, 47, 37, 48, 'oliveDark', 24.5), box(38, 47, 42, 48, 'oliveDark', 24.5));
  P.push(box(24, 53, 47, 56, 'oliveDark', 25), box(34, 53, 37, 56, 'metal', 26));
  P.push(ell([44, 57], 2, 2, 'metal', 26)); // grenade
  P.push(poly([[25, 55], [32, 55], [31, 62], [24, 61]], 'armour', 27)); // hip plates
  P.push(poly([[39, 55], [46, 55], [47, 61], [40, 62]], 'armour', 27));
  // Collar and helmet with a wide blue visor and a chin guard.
  P.push(poly([[29, 29], [42, 29], [44, 34], [27, 34]], 'armourDark', 31));
  P.push(ell([35, 20], 9.5, 8.5, 'armour', 34));
  P.push(cap([27, 16], [40, 12], 0.7, 0.7, 'armourDark', 35)); // crest
  P.push(ell([29.5, 23], 2.6, 3.2, 'metal', 35)); // ear piece
  P.push(poly([[33, 26], [43, 26], [42, 31], [34, 31]], 'armourDark', 36)); // chin guard
  P.push(poly([[36, 17], [45.5, 18], [45.5, 25], [38, 26], [35, 22]], 'armourDark', 36)); // visor frame
  P.push(poly([[37, 18.5], [44.5, 19.3], [44.5, 24], [38.3, 24.8], [36.2, 22]], 'visor', 37));
  P.push(cap([39, 19.8], [42.5, 20.2], 0.5, 0.5, 'glass', 38)); // glint
  // Front arm, rifle, hands.
  P.push(ell([sF[0], sF[1] + 1], 5.4, 4.6, 'armour', 41), ell([sF[0] + 1, sF[1] + 5], 4.2, 2.4, 'armourDark', 40.5));
  P.push(cap(sF, eF, 3.2, 2.8, 'under', 42), cap(eF, hands.front, 2.9, 2.5, 'under', 42));
  P.push(cap([eF[0] + (hands.front[0] - eF[0]) * 0.15, eF[1] + (hands.front[1] - eF[1]) * 0.15], [eF[0] + (hands.front[0] - eF[0]) * 0.7, eF[1] + (hands.front[1] - eF[1]) * 0.7], 3.1, 2.8, 'armour', 42.5));
  if (gun) P.push(...place(isaRifle(44), [27 - recoil, arms === 'up' ? 24 : 46], arms === 'up' ? -86 : 4.5));
  P.push(ell(hands.back, 2.3, 2.1, 'skin', 48), ell(hands.front, 2.4, 2.2, 'skin', 48));
  if (flash) P.push(ell([74 - recoil, 49.6], 3, 2, 'flash', 50), ell([78 - recoil, 49.9], 2, 1.2, 'flash', 50));
  return P;
}

// ---- Frames ----------------------------------------------------------------

const BUILD = { isa, hgh: helghast };

function lowestY(pieces) {
  let m = -Infinity;
  for (const p of pieces) {
    if (p.kind === 'cap') m = Math.max(m, p.a[1] + p.ra, p.b[1] + p.rb);
    else if (p.kind === 'ell') m = Math.max(m, p.c[1] + p.ry);
    else for (const q of p.pts) m = Math.max(m, q[1]);
  }
  return m;
}

function leftmostX(pieces) {
  let m = Infinity;
  for (const p of pieces) {
    if (p.kind === 'cap') m = Math.min(m, p.a[0] - p.ra, p.b[0] - p.rb);
    else if (p.kind === 'ell') m = Math.min(m, p.c[0] - p.rx);
    else for (const q of p.pts) m = Math.min(m, q[0]);
  }
  return m;
}

function piecesFor(side, frame) {
  const make = BUILD[side];
  if (LEG_POSES[frame] || frame === 'fire') {
    const L = LEG_POSES[frame] || LEG_POSES.stand;
    let P = make(L, { recoil: frame === 'fire' ? 1 : 0, flash: frame === 'fire' });
    // Keep the lowest boot on the ground, so strides lower the body naturally.
    return shiftPieces(P, 0, GROUND - lowestY(P.filter((p) => p.mat === 'boot')) + L.bob);
  }
  if (frame === 'prone1' || frame === 'prone2') {
    // Lying on the front, rifle forward, legs trailing (crawl bends a knee).
    const legs = frame === 'prone1' ? { back: [-2, 0], front: [2, 0] } : { back: [-6, 30], front: [3, 0] };
    const P = rotatePieces(make(legs, { arms: 'up' }), [38, 80], 90);
    return shiftPieces(P, -24, GROUND - lowestY(P) + 1);
  }
  // Falling backwards, then lying still with the rifle dropped beside them.
  const deg = { fall1: -28, fall2: -62, dead: -90 }[frame] ?? 0;
  let P = rotatePieces(make(LEG_POSES.stand, { arms: 'limp', gun: false }), [38, 82], deg);
  P = shiftPieces(P, Math.max(0, 3 - leftmostX(P)), GROUND - lowestY(P));
  if (frame === 'dead') P.push(...place((side === 'isa' ? isaRifle : hghRifle)(5), [52, GROUND - 3], -8));
  return P;
}

export const PIXEL_FRAMES = ['stand', 'walk1', 'walk2', 'walk3', 'walk4', 'fire', 'prone1', 'prone2', 'fall1', 'fall2', 'dead'];

const cache = new Map();

// A canvas for one faction ('isa' or 'hgh'), frame, facing (1 right, -1 left).
export function getPixelTrooper(side, frame, facing = 1) {
  const key = `${side}|${frame}|${facing}`;
  let c = cache.get(key);
  if (c) return c;
  const px = rasterise(piecesFor(side, frame), MATS[side], PT_W, PT_H, { dim: frame === 'dead' ? 0.72 : frame.startsWith('fall') ? 0.88 : 1 });
  c = document.createElement('canvas');
  c.width = PT_W;
  c.height = PT_H;
  const g = c.getContext('2d');
  const img = g.createImageData(PT_W, PT_H);
  if (facing === 1) img.data.set(px);
  else {
    for (let y = 0; y < PT_H; y++) for (let x = 0; x < PT_W; x++) {
      const s = (y * PT_W + x) * 4, d = (y * PT_W + (PT_W - 1 - x)) * 4;
      img.data.set(px.subarray(s, s + 4), d);
    }
  }
  g.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}
