// Detailed pixel art soldiers for every role and both factions, about 70 pixels tall in a
// three quarter view facing right (mirrored to face left). Each is a puppet
// of shaped pieces rendered by puppet.js, posed from a simple skeleton so
// walking, firing, lying down and falling are re-drawn cleanly. Original
// art drawn in code; the equipment follows the references Matthew supplied
// (Helghast gas mask, peaked helmet, greatcoat; ODST style ISA armour).

import { cap, ell, poly, box, detail, materials, rasterise, rotatePieces, shiftPieces } from './puppet.js';

export const PT_W = 112;
export const PT_H = 90;
export const PT_FOOT = [40, 84]; // where the soldier's feet touch the ground

const MATS = {
  hgh: materials({
    helmet: '#4a4d51', helmetDark: '#2e3033', helmetHi: '#6b6f74', mask: '#45484b', maskDark: '#2a2c2f', maskLight: '#a3a49f', brass: '#a8873c', metal: '#7d8083', rubber: '#2b2c2d', hose: '#3a3631',
    slot: { glow: true, ramp: [0, 0, [130, 36, 12], [214, 84, 26], [214, 84, 26]], core: [214, 84, 26] }, gunDark: '#18191b',
    lens: { glow: true, ramp: [0, 0, [176, 38, 12], [255, 92, 28], [255, 92, 28]], core: [255, 226, 160] },
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
    brass: '#a8873c', leather: '#4a4232', gunDark: '#18191b',
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


// ---- Weapons for the other roles (drawn along +x, butt at the origin) ----

// Helghast machine gun: long slotted body, a deep box magazine, perforated
// barrel jacket, carry handle and a folded bipod.
function hghLMG(z) {
  const P = [
    poly([[0, -3], [10, -3.5], [10, 4], [0, 5]], 'gun', z),
    box(9, -4.5, 34, 3.5, 'gunLight', z + 1),
    box(10, -6.5, 32, -4.5, 'gun', z + 1.2),
    cap([22, -6.5], [24, -10], 0.8, 0.8, 'gun', z + 1.3), cap([24, -10], [31, -10], 0.8, 0.8, 'gun', z + 1.3), cap([31, -10], [32.5, -6.5], 0.8, 0.8, 'gun', z + 1.3),
    poly([[13, 3.5], [16.5, 3.5], [15.5, 10], [12, 9]], 'gun', z + 1.4),
    box(18, 3.5, 29, 12, 'gun', z + 1.4), // box magazine
    box(19, 6, 28, 7, 'gunLight', z + 1.5),
    box(34, -3.5, 53, 2.5, 'gun', z + 1),
    cap([53, -0.5], [60, -0.5], 1.1, 1.1, 'gun', z + 1),
    box(58, -2.2, 62, 1.6, 'gunLight', z + 1.5),
    cap([48, 2.5], [46, 10], 0.55, 0.55, 'gunLight', z + 0.9), cap([50, 2.5], [53, 10], 0.55, 0.55, 'gunLight', z + 0.9), // bipod
  ];
  for (let k = 0; k < 5; k++) P.push(box(11 + 4.5 * k, -2.6, 13.8 + 4.5 * k, 0.6, 'slot', z + 2));
  for (let k = 0; k < 5; k++) P.push(ell([37 + 3.4 * k, -0.5], 0.9, 1.2, 'gunDark', z + 1.6)); // jacket holes
  return { P, len: 62 };
}

// Helghast assault gun: short and brutal, with a drum magazine and a thick
// barrel over a tube.
function hghAssault(z) {
  const P = [
    poly([[0, -2], [7, -2.5], [7, 2.5], [0, 3.5]], 'gun', z),
    box(6, -4, 25, 3, 'gunLight', z + 1),
    box(7, -5.5, 23, -4, 'gun', z + 1.2),
    poly([[11, 3], [14, 3], [13, 9], [10, 8]], 'gun', z + 1.4),
    ell([19, 7.5], 4.6, 4.6, 'gun', z + 1.5), ell([19, 7.5], 2.2, 2.2, 'gunLight', z + 1.6), // drum
    box(25, -3.5, 36, 1, 'gun', z + 1),
    cap([25, 2.3], [34, 2.3], 1.1, 1.1, 'gunDark', z + 0.9),
    box(35, -4, 39, 1.8, 'gunLight', z + 1.5),
  ];
  for (let k = 0; k < 3; k++) P.push(box(9 + 4.5 * k, -2.4, 11.8 + 4.5 * k, 0.4, 'slot', z + 2));
  return { P, len: 39 };
}

// Helghast sniper rifle: long and thin, a big scope with a glowing lens,
// a long barrel ending in a muzzle brake.
function hghSniper(z) {
  const P = [
    poly([[0, -2], [15, -3], [15, 3], [0, 5.5]], 'gun', z),
    box(2, -0.5, 10, 2.5, 'gunDark', z + 0.5),
    box(14, -3, 35, 2.5, 'gunLight', z + 1),
    poly([[18, 2.5], [21, 2.5], [20, 8.5], [17, 8]], 'gun', z + 1.4),
    box(26, 2.5, 30, 8, 'gun', z + 1.4),
    box(20, -6, 22, -3, 'gun', z + 1.3), box(29, -6, 31, -3, 'gun', z + 1.3),
    cap([17, -8], [34, -8], 2.2, 2, 'gun', z + 1.5),
    ell([34.4, -8], 1, 1.6, 'sight', z + 2),
    cap([35, -0.5], [64, -0.5], 0.9, 0.9, 'gun', z + 1),
    box(62, -2, 67, 1.2, 'gunLight', z + 1.5),
  ];
  for (let k = 0; k < 3; k++) P.push(box(16 + 5 * k, -1.8, 18.4 + 5 * k, 0.6, 'slot', z + 2));
  return { P, len: 67 };
}

// ISA machine gun: squared body, box magazine, ventilated barrel jacket,
// carry handle and bipod.
function isaLMG(z) {
  return { P: [
    poly([[0, -2.5], [9, -3], [9, 4], [0, 5]], 'gun', z),
    box(8, -4, 32, 4, 'gunLight', z + 1),
    box(10, -1, 30, 0, 'gun', z + 1.2),
    cap([18, -4], [20, -8], 0.8, 0.8, 'gun', z + 1.3), cap([20, -8], [27, -8], 0.8, 0.8, 'gun', z + 1.3), cap([27, -8], [29, -4], 0.8, 0.8, 'gun', z + 1.3),
    poly([[12, 4], [15, 4], [14, 10], [11, 9]], 'gun', z + 1.4),
    box(17, 4, 27, 12, 'gun', z + 1.4),
    box(32, -3, 50, 2.5, 'gun', z + 1),
    box(35, -2, 37, 1, 'gunLight', z + 1.6), box(40, -2, 42, 1, 'gunLight', z + 1.6), box(45, -2, 47, 1, 'gunLight', z + 1.6),
    cap([50, -0.3], [57, -0.3], 1, 1, 'gun', z + 1),
    box(56, -1.8, 59, 1.4, 'gunLight', z + 1.5),
    cap([45, 2.5], [43, 10], 0.55, 0.55, 'gunLight', z + 0.9), cap([47, 2.5], [50, 10], 0.55, 0.55, 'gunLight', z + 0.9),
  ], len: 59 };
}

// ISA pump shotgun: wooden-free, all business: receiver, tube magazine and
// a chunky pump under a short barrel.
function isaShotgun(z) {
  return { P: [
    poly([[0, -2], [9, -2.5], [9, 3], [0, 4]], 'gun', z),
    box(8, -3.5, 22, 2.5, 'gunLight', z + 1),
    poly([[12, 2.5], [15, 2.5], [14, 8.5], [11, 8]], 'gun', z + 1.4),
    cap([22, -1], [38, -1], 1.2, 1.2, 'gun', z + 1),
    cap([22, 1.6], [35, 1.6], 1, 1, 'gun', z + 0.9),
    box(25, -0.5, 32, 4, 'gunLight', z + 1.5), // pump
    box(26, 1, 31, 2, 'gun', z + 1.6),
    box(37, -2.6, 40, 0.6, 'gunLight', z + 1.5),
  ], len: 40 };
}

// ISA sniper rifle: long barrel, big scope with a glass lens.
function isaSniper(z) {
  return { P: [
    poly([[0, -2], [22, -3], [24, 3], [1, 4.5]], 'gunLight', z),
    box(2, -1, 20, 0, 'gun', z + 1),
    box(6, 3, 10, 10, 'gun', z + 1),
    poly([[15, 3], [18, 3], [17, 9], [14, 8]], 'gun', z + 1),
    cap([24, -0.4], [58, -0.4], 0.9, 0.9, 'gun', z + 1),
    box(56, -1.8, 60, 1.2, 'gunLight', z + 1.5),
    cap([8, -7.5], [25, -7.5], 2.2, 2, 'gun', z + 2),
    box(12, -5.5, 14, -3, 'gun', z + 2), box(19, -5.5, 21, -3, 'gun', z + 2),
    ell([25.5, -7.5], 1, 1.7, 'glass', z + 3),
    cap([46, 1], [44, 8], 0.5, 0.5, 'gunLight', z + 0.9), cap([48, 1], [51, 8], 0.5, 0.5, 'gunLight', z + 0.9),
  ], len: 60 };
}

const WEAPONS = {
  hgh: { rifle: hghRifle, heavy: hghLMG, assault: hghAssault, engineer: hghRifle, recon: hghSniper },
  isa: { rifle: isaRifle, heavy: isaLMG, assault: isaShotgun, engineer: isaRifle, recon: isaSniper },
};

// Put a weapon in the hands and, when firing, a flash at its muzzle.
function arm(P, weapon, origin, deg, flash, z) {
  const w = weapon(z);
  P.push(...place(w.P, origin, deg));
  if (flash) {
    const a = (deg * Math.PI) / 180;
    const mx = origin[0] + Math.cos(a) * (w.len + 3), my = origin[1] + Math.sin(a) * (w.len + 3);
    P.push(ell([mx, my], 3, 2, 'flash', 50), ell([mx + Math.cos(a) * 4, my + Math.sin(a) * 4], 2, 1.2, 'flash', 50));
  }
}

// Kit carried on the back, drawn behind the body.
function pack(P, kind, mats) {
  if (kind === 'ammo') {
    P.push(box(16.5, 36, 26, 56, mats.pack, 9), box(16.5, 40, 26, 41.5, 'metal', 9.2), box(16.5, 50, 26, 51.5, 'metal', 9.2));
    P.push(cap([24, 55], [31, 58.5], 1.3, 1.3, 'brass', 30.6), cap([31, 58.5], [39, 56.5], 1.3, 1.3, 'brass', 30.6)); // ammunition belt
    for (const x of [26, 29, 32, 35, 38]) P.push(...detail(cap([x, 55.5 + (x < 31 ? (x - 24) * 0.45 : 3 - (x - 31) * 0.25)], [x, 58 + (x < 31 ? (x - 24) * 0.45 : 3 - (x - 31) * 0.25)], 0.45, 0.45, 'gunDark', 30.7)));
  } else if (kind === 'tools') {
    P.push(box(17, 38, 26, 55, mats.pack, 9));
    P.push(cap([19.5, 31], [20, 38], 0.8, 0.8, 'brass', 8.8), cap([23.5, 30], [23.5, 38], 0.8, 0.8, 'metal', 8.8)); // tool handles
    P.push(ell([21.5, 50], 3.6, 3.6, 'leather', 9.3), ell([21.5, 50], 1.8, 1.8, mats.pack, 9.4)); // coil of wire
    P.push(box(17, 43, 26, 44.5, 'brass', 9.2));
  }
}

// ---- Helghast ----------------------------------------------------------

// Helghast rifle: a long slotted body with glowing orange windows, a top
// spine and carry handle, an open skeleton stock, a magazine ahead of the
// pistol grip, and a ringed front shroud ending in a stepped muzzle.
function hghRifle(z) {
  return { P: hghRiflePieces(z), len: 53 };
}

function hghRiflePieces(z) {
  const P = [
    poly([[0, -3], [10, -3], [10, 3], [0, 4]], 'gun', z), // skeleton stock
    box(2, -1, 8, 1.5, 'gunDark', z + 0.5),
    box(9, -4, 36, 3, 'gunLight', z + 1), // body
    box(10, -6, 34, -4, 'gun', z + 1.2), // top spine
    cap([19, -6], [21, -9], 0.8, 0.8, 'gun', z + 1.3), cap([21, -9], [31, -9], 0.8, 0.8, 'gun', z + 1.3), cap([31, -9], [33, -6], 0.8, 0.8, 'gun', z + 1.3), // carry handle
    poly([[16, 3], [19.5, 3], [18.5, 10], [15, 9]], 'gun', z + 1.4), // pistol grip
    poly([[22, 3], [26, 3], [27.5, 11.5], [23.5, 12]], 'gun', z + 1.4), // magazine
    poly([[29, 3], [37, 3], [35.5, 6], [30, 6]], 'gun', z + 1.4), // handguard
    box(36, -3, 46, 2.5, 'gun', z + 1),
    cap([46, 0], [51, 0], 1, 1, 'gun', z + 1),
    box(50, -1.8, 53, 1.8, 'gunLight', z + 1.5), // muzzle
  ];
  for (let k = 0; k < 6; k++) P.push(box(12 + 4 * k, -2.2, 14.6 + 4 * k, 0.8, 'slot', z + 2)); // glowing windows
  for (const x of [38.5, 41.5, 44.5]) P.push(cap([x, -2.6], [x, 2.1], 0.55, 0.55, 'gunLight', z + 1.6)); // shroud rings
  return P;
}

function helghast(legs, { recoil = 0, flash = false, arms = 'ready', gun = true, role = 'rifle' } = {}) {
  const P = [];
  const coat = role !== 'assault'; // assault infantry fight in vest and trousers
  const pad = { heavy: 1.35, assault: 1.15, recon: 0.9 }[role] || 1;
  if (role === 'heavy') pack(P, 'ammo', { pack: 'leather' });
  if (role === 'engineer') pack(P, 'tools', { pack: 'pouch' });
  if (role === 'recon') P.push(poly([[20, 32], [46, 32], [49, 71], [17, 73]], 'coatDark', 4)); // scout cloak
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
  if (coat) P.push(poly([[25, 54], [34, 54], [33, 71], [21, 70]], 'coatDark', 5));
  // Back arm (holding the pistol grip), drawn behind the body.
  const sB = [28, 38], sF = [43, 38];
  const handsReady = { back: [37 - recoil, 52], front: [54 - recoil, 52] };
  const hands = arms === 'up' ? { back: [33, 10], front: [41, 6] } : arms === 'limp' ? { back: [27, 56], front: [46, 56] } : handsReady;
  const eB = arms === 'up' ? [26, 26] : arms === 'limp' ? [26, 47] : [27, 48];
  const eF = arms === 'up' ? [47, 26] : arms === 'limp' ? [46, 47] : [49, 46.5];
  P.push(cap(sB, eB, 3.2, 2.9, 'coat', 10), cap(eB, hands.back, 2.8, 2.4, 'coat', 10));
  P.push(cap([sB[0] + (eB[0] - sB[0]) * 0.25, sB[1] + (eB[1] - sB[1]) * 0.25], [sB[0] + (eB[0] - sB[0]) * 0.45, sB[1] + (eB[1] - sB[1]) * 0.45], 3.3, 3.1, 'red', 10.5));
  P.push(ell(sB, 4.4 * pad, 3.8 * pad, 'armour', 11));
  // Front leg, then the body of the coat.
  P.push(cap(lf.hip, lf.knee, 4.2, 3.7, 'trousers', 14), cap(lf.knee, lf.ankle, 3.6, 3.1, 'trousers', 14));
  P.push(ell(lf.knee, 3.2, 2.8, 'armour', 14.5));
  boot(lf, 15);
  P.push(poly([[26, 35], [45, 35], [47, 55], [24, 55]], coat ? 'coat' : 'trousers', 20));
  // Chest rig: armoured vest, crossed straps, pouches, belt.
  P.push(poly([[29, 37], [43, 37], [44, 50], [28, 50]], 'armour', 22));
  if (role === 'assault') P.push(poly([[28, 36], [44, 36], [45, 44], [36, 46], [27, 44]], 'helmet', 23.5), cap([36, 37], [36, 44], 0.5, 0.5, 'helmetHi', 23.6)); // heavy chest plate
  P.push(cap([29, 38], [42, 49], 0.8, 0.8, 'strap', 23), cap([42, 38], [30, 49], 0.8, 0.8, 'strap', 23));
  P.push(box(29, 44, 33, 49, 'pouch', 24), box(34, 44, 38, 49, 'pouch', 24), box(39, 44, 43, 49, 'pouch', 24));
  P.push(box(30, 44, 32, 45, 'strap', 24.5), box(35, 44, 37, 45, 'strap', 24.5), box(40, 44, 42, 45, 'strap', 24.5));
  P.push(box(24, 52, 47, 55, 'leather', 25), box(34, 52, 37, 55, 'metal', 26));
  P.push(box(26, 55, 30, 59, 'pouch', 26), box(41, 55, 45, 59, 'pouch', 26));
  // Front of the greatcoat, split to show the legs.
  if (coat) {
    P.push(poly([[37, 55], [47, 55], [51, 71], [41, 72]], role === 'recon' ? 'coatDark' : 'coat', 30));
    P.push(cap([39, 57], [43, 71], 0.5, 0.5, 'coatDark', 30.5)); // fold
  }
  // Collar, then helmet and gas mask.
  P.push(poly([[28, 30], [43, 31], [45, 36], [27, 36]], 'coatDark', 31));
  // Helmet: a rounded dome with a thick band round it, a small lip, ear cups
  // and a couple of rivets.
  P.push(poly([[24, 19], [32, 20], [33, 29], [29.5, 31.5], [23.5, 28.5]], 'helmet', 32)); // side over the ear
  P.push(ell([27.8, 27], 2.8, 3.4, 'helmetDark', 32.5)); // ear cup
  // Gas mask face plate with a rounded jaw.
  P.push(poly([[30, 24], [45.5, 25], [46.5, 31], [44, 36.5], [39.5, 39], [33, 37.5], [30, 32]], 'mask', 33));
  P.push(ell([35, 17.5], 10, 9.5, 'helmet', 34));
  P.push(ell([31.5, 12.5], 3, 1.6, 'helmetHi', 34.5)); // light on the dome
  P.push(ell([29, 16], 0.7, 0.7, 'metal', 34.6), ell([38, 13.5], 0.7, 0.7, 'metal', 34.6)); // rivets
  P.push(poly([[24.5, 19.5], [45.5, 20.5], [46.5, 24.5], [24.5, 24]], 'helmetDark', 35.5)); // thick band
  P.push(cap([25, 19.8], [45.5, 20.8], 0.5, 0.5, 'helmetHi', 35.6));
  P.push(cap([24.8, 24.6], [46.6, 25], 0.6, 0.6, 'helmet', 35.7)); // lip
  if (role === 'recon') {
    // Hood drawn over the helmet, open at the face.
    P.push(ell([34.5, 17], 11, 10.5, 'coatDark', 35.8), poly([[22, 16], [29, 20], [31, 37], [21, 40]], 'coatDark', 35.9));
    P.push(cap([26, 11], [40, 8.5], 0.6, 0.6, 'coat', 35.85)); // fold in the hood
  }
  // Goggles: two slanted oval lenses in raised pale rims, joined by a bridge.
  P.push(...detail(ell([35.6, 28.4], 3.8, 2.9, 'maskLight', 37), ell([42.6, 28.4], 3.3, 2.7, 'maskLight', 37)));
  P.push(...detail(box(38.6, 27.4, 40, 29.4, 'maskLight', 37.1))); // bridge
  P.push(ell([35.6, 28.6], 2.7, 1.9, 'lens', 38), ell([42.6, 28.6], 2.3, 1.7, 'lens', 38));
  P.push(poly([[37.2, 25.8], [39.2, 26.2], [38.6, 28], [37, 27.4]], 'mask', 38.5), poly([[40.2, 26.2], [41.8, 25.8], [42, 27.2], [40.6, 27.8]], 'mask', 38.5)); // inner brows (slant)
  // Breathing piece: a triangle running down from the nose to a chin
  // connector with a brass ring, a round filter on the cheek, and a ribbed
  // hose hanging from the chin down to the chest.
  P.push(...detail(poly([[34.5, 30.5], [45.8, 30.5], [42.4, 39.2], [37.6, 39.2]], 'maskLight', 39))); // pale frame
  P.push(poly([[37.2, 32], [43.2, 32], [41.1, 37.9], [38.9, 37.9]], 'maskDark', 39.1)); // dark cone inside
  P.push(...detail(cap([33.8, 33.2], [35.6, 32.6], 0.8, 0.8, 'maskLight', 39.05))); // strap to the cheek filter
  P.push(...detail(ell([32.3, 33.6], 2.6, 2.9, 'maskLight', 39), ell([32.3, 33.6], 1.5, 1.7, 'rubber', 39.2), ell([32.3, 33.6], 0.7, 0.8, 'metal', 39.3)));
  P.push(box(38.2, 38.2, 41.8, 39.6, 'brass', 43), box(38.4, 39.6, 41.6, 41, 'metal', 43));
  const hose = [[40, 41], [39, 43.5], [36.5, 45.5], [33.5, 46.5], [30.5, 46.5]];
  for (let k = 0; k < hose.length - 1; k++) P.push(cap(hose[k], hose[k + 1], 1.5, 1.5, 'hose', 43.5));
  for (const h of hose.slice(1)) P.push(ell(h, 1.7, 1.2, 'rubber', 43.6)); // ribs
  // Front arm, rifle, gloves on top.
  P.push(ell(sF, 4.8 * pad, 4 * pad, 'armour', 41));
  if (role === 'heavy') P.push(ell([sF[0] + 1, sF[1] + 4.5], 4.4, 2.2, 'helmetDark', 40.8));
  P.push(cap(sF, eF, 3.4, 3, coat ? 'coat' : 'trousers', 42), cap(eF, hands.front, 3, 2.6, coat ? 'coat' : 'trousers', 42));
  if (gun) arm(P, WEAPONS.hgh[role] || hghRifle, [25 - recoil, arms === 'up' ? 24 : 48], arms === 'up' ? -86 : 4.5, flash, 44);
  P.push(ell(hands.back, 2.4, 2.2, 'glove', 48), ell(hands.front, 2.6, 2.3, 'glove', 48));
  return P;
}

// ---- ISA -----------------------------------------------------------------

function isaRifle(z) {
  return { P: isaRiflePieces(z), len: 47 };
}

function isaRiflePieces(z) {
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

function isa(legs, { recoil = 0, flash = false, arms = 'ready', gun = true, role = 'rifle' } = {}) {
  const P = [];
  const pad = { heavy: 1.3, assault: 1.1, recon: 0.85 }[role] || 1;
  if (role === 'heavy') pack(P, 'ammo', { pack: 'oliveDark' });
  if (role === 'engineer') pack(P, 'tools', { pack: 'olive' });
  if (role === 'recon') P.push(poly([[19, 31], [46, 31], [48, 64], [18, 66]], 'olive', 4)); // camouflage cape
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
  P.push(ell([sB[0], sB[1] + 1], 5 * pad, 4.4 * pad, 'armour', 11));
  leg(lf, 14);
  // Torso: undersuit, chest plate with a centre ridge, webbing and pouches.
  P.push(poly([[26, 33], [45, 33], [46, 55], [25, 55]], 'under', 20));
  P.push(poly([[28, 34], [44, 34], [45, 45], [36, 48], [27, 45]], 'armour', 22));
  P.push(cap([36, 35], [36, 46], 0.6, 0.6, 'armourDark', 23));
  P.push(box(30, 37, 33, 39, 'yellow', 23)); // unit marking
  if (role === 'assault') P.push(box(28.5, 39.5, 43.5, 41.5, 'armourDark', 23.2), box(29, 42.5, 43, 44.5, 'armourDark', 23.2)); // extra plates
  P.push(box(28, 47, 32, 53, 'olive', 24), box(33, 47, 37, 53, 'olive', 24), box(38, 47, 42, 53, 'olive', 24));
  P.push(box(28, 47, 32, 48, 'oliveDark', 24.5), box(33, 47, 37, 48, 'oliveDark', 24.5), box(38, 47, 42, 48, 'oliveDark', 24.5));
  P.push(box(24, 53, 47, 56, 'oliveDark', 25), box(34, 53, 37, 56, 'metal', 26));
  P.push(ell([44, 57], 2, 2, 'metal', 26)); // grenade
  P.push(poly([[25, 55], [32, 55], [31, 62], [24, 61]], 'armour', 27)); // hip plates
  P.push(poly([[39, 55], [46, 55], [47, 61], [40, 62]], 'armour', 27));
  // Collar and helmet with a wide blue visor and a chin guard.
  P.push(poly([[29, 29], [42, 29], [44, 34], [27, 34]], 'armourDark', 31));
  P.push(ell([35, 20], 9.5, 8.5, 'armour', 34));
  P.push(cap([27, 16], [40, 12], 0.7, 0.7, role === 'engineer' ? 'yellow' : 'armourDark', 35)); // crest (yellow stripe for engineers)
  if (role === 'recon') P.push(ell([28, 30], 5, 3, 'olive', 33), ell([43, 31], 5, 3, 'olive', 40.9)); // scarf
  P.push(ell([29.5, 23], 2.6, 3.2, 'metal', 35)); // ear piece
  P.push(poly([[33, 26], [43, 26], [42, 31], [34, 31]], 'armourDark', 36)); // chin guard
  P.push(poly([[36, 17], [45.5, 18], [45.5, 25], [38, 26], [35, 22]], 'armourDark', 36)); // visor frame
  P.push(poly([[37, 18.5], [44.5, 19.3], [44.5, 24], [38.3, 24.8], [36.2, 22]], 'visor', 37));
  P.push(cap([39, 19.8], [42.5, 20.2], 0.5, 0.5, 'glass', 38)); // glint
  // Front arm, rifle, hands.
  P.push(ell([sF[0], sF[1] + 1], 5.4 * pad, 4.6 * pad, 'armour', 41), ell([sF[0] + 1, sF[1] + 5], 4.2 * pad, 2.4 * pad, 'armourDark', 40.5));
  P.push(cap(sF, eF, 3.2, 2.8, 'under', 42), cap(eF, hands.front, 2.9, 2.5, 'under', 42));
  P.push(cap([eF[0] + (hands.front[0] - eF[0]) * 0.15, eF[1] + (hands.front[1] - eF[1]) * 0.15], [eF[0] + (hands.front[0] - eF[0]) * 0.7, eF[1] + (hands.front[1] - eF[1]) * 0.7], 3.1, 2.8, 'armour', 42.5));
  if (gun) arm(P, WEAPONS.isa[role] || isaRifle, [27 - recoil, arms === 'up' ? 24 : 46], arms === 'up' ? -86 : 4.5, flash, 44);
  P.push(ell(hands.back, 2.3, 2.1, 'skin', 48), ell(hands.front, 2.4, 2.2, 'skin', 48));
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

function piecesFor(side, frame, role) {
  const make = (legs, opts) => BUILD[side](legs, { ...opts, role });
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
  if (frame === 'dead') P.push(...place((WEAPONS[side][role] || WEAPONS[side].rifle)(5).P, [52, GROUND - 3], -8));
  return P;
}

export const PIXEL_FRAMES = ['stand', 'walk1', 'walk2', 'walk3', 'walk4', 'fire', 'prone1', 'prone2', 'fall1', 'fall2', 'dead'];

const cache = new Map();

// A canvas for one faction ('isa' or 'hgh'), frame, facing (1 right, -1 left)
// and role (rifle, heavy, assault, engineer, recon).
export function getPixelTrooper(side, frame, facing = 1, role = 'rifle') {
  const key = `${side}|${role}|${frame}|${facing}`;
  let c = cache.get(key);
  if (c) return c;
  const px = rasterise(piecesFor(side, frame, role), MATS[side], PT_W, PT_H, { dim: frame === 'dead' ? 0.72 : frame.startsWith('fall') ? 0.88 : 1 });
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
