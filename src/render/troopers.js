// Style candidates: one regular rifleman per faction, built in more detail
// than the first 2.5D soldiers, with a silhouette of their own rather than
// just a different colour. Once the style is approved the other roles are
// built the same way.
//
// Same block model approach as sprites25d.js (x forward, y to the soldier's
// right, z up, feet at the origin), just taller (about 20 blocks) so helmets,
// faces, webbing and weapons have room for detail.

import { box, tip, drawVoxels, paletteRGB } from './sprites25d.js';
import { DIRECTIONS } from './sprites.js';

export const TROOPER_SIZE = { w: 34, h: 42, ax: 17, ay: 33 };

// Letters: f boots, t trousers, b armour or coat, s shade and straps,
// q light armour plates, h helmet, l visor or goggle glow, n skin or gloves,
// m respirator, p pack and pouches, c bedroll or coat skirt, g gun, k gun
// highlight, x faction marking, F/E muzzle flash, r blood, o outline.
const PAL = [
  { // ISA trooper: steel blue armour plates over a darker suit, olive kit
    f: '#3a2f25', t: '#34465c', b: '#4f7fb6', s: '#2f4b6c', q: '#86aedb', h: '#9fbadb', l: '#d9f1ff', n: '#c99a78',
    m: '#5d6670', p: '#5f6a43', c: '#7a7350', g: '#2c3036', k: '#7d848f', x: '#f0d35a', F: '#ffffff', E: '#cfe6ff',
    r: '#5a1410', o: '#101824',
  },
  { // Helghast trooper: charcoal greatcoat, rounded helmet and respirator, glowing eyes
    f: '#1c1c1f', t: '#34363b', b: '#5c6068', s: '#3b3e44', q: '#80848d', h: '#41444b', l: '#ff7424', n: '#45464b',
    m: '#8a8e96', p: '#6e5639', c: '#4b4e55', g: '#26272b', k: '#767a82', x: '#e2541c', F: '#fff1c2', E: '#ff8a3a',
    r: '#5a1410', o: '#08080a',
  },
];
const RGB = PAL.map(paletteRGB);

// pose: swing (stride), bob, recoil, flash
function isaTrooper(pose = {}) {
  const v = [];
  const sw = pose.swing || 0, bob = pose.bob || 0, rec = pose.recoil || 0;
  // Boots and legs, with a knee pad on each.
  box(v, sw - 1, sw + 1, -2, -1, 0, 1, 'f');
  box(v, sw - 1, sw, -2, -1, 2, 6 + bob, 't');
  v.push({ x: sw + 1, y: -2, z: 4, k: 'q' });
  box(v, -sw - 1, -sw + 1, 1, 2, 0, 1, 'f');
  box(v, -sw - 1, -sw, 1, 2, 2, 6 + bob, 't');
  v.push({ x: -sw + 1, y: 2, z: 4, k: 'q' });
  const z = 7 + bob;
  // Belt with pouches, armoured torso, pale chest plate and shoulder pads.
  box(v, -1, 1, -3, 3, z, z, 's');
  box(v, 2, 2, -3, -2, z, z + 1, 'p');
  box(v, 2, 2, 2, 3, z, z + 1, 'p');
  box(v, -1, 1, -3, 3, z + 1, z + 6, 'b');
  box(v, 2, 2, -2, 2, z + 2, z + 5, 'q');
  v.push({ x: 2, y: -2, z: z + 5, k: 'x' }); // unit flash on the chest
  box(v, -1, 1, -4, -4, z + 4, z + 6, 'q');
  box(v, -1, 1, 4, 4, z + 4, z + 6, 'q');
  // Pack with a bedroll on top.
  box(v, -3, -2, -2, 2, z + 1, z + 5, 'p');
  box(v, -3, -2, -3, 3, z + 6, z + 6, 'c');
  // Face under a helmet with a brim; a pale visor strip across the eyes.
  box(v, 0, 1, -1, 1, z + 7, z + 8, 'n');
  box(v, -2, 1, -2, 2, z + 9, z + 11, 'h');
  box(v, -1, 0, -1, 1, z + 12, z + 12, 'h');
  box(v, 2, 2, -2, 2, z + 9, z + 9, 'h');
  box(v, 2, 2, -1, 1, z + 8, z + 8, 'l');
  // Arms up to the rifle, gloved hands.
  const gz = z + 4;
  box(v, 0, 1 - rec, 4, 4, gz, gz + 1, 's');
  box(v, 1, 3 - rec, 2, 3, gz, gz, 's');
  v.push({ x: 3 - rec, y: 1, z: gz - 1, k: 'n' });
  box(v, 0, 3 - rec, -4, -4, gz, gz + 1, 's');
  box(v, 3 - rec, 6 - rec, -3, 0, gz, gz, 's');
  v.push({ x: 6 - rec, y: 1, z: gz - 1, k: 'n' });
  // Rifle: stock at the shoulder, magazine, barrel.
  const g0 = -1 - rec, g1 = g0 + 12;
  box(v, g0, g1, 1, 1, gz, gz, 'g');
  box(v, g0 + 1, g1 - 3, 1, 1, gz + 1, gz + 1, 'k');
  box(v, g0 + 5, g0 + 6, 1, 1, gz - 2, gz - 1, 'g');
  if (pose.flash) flash(v, g1, gz);
  return v;
}

function helghastTrooper(pose = {}) {
  const v = [];
  const sw = pose.swing || 0, bob = pose.bob || 0, rec = pose.recoil || 0;
  // Heavy boots and dark trousers.
  box(v, sw - 1, sw + 1, -2, -1, 0, 1, 'f');
  box(v, sw - 1, sw, -2, -1, 2, 5 + bob, 't');
  box(v, -sw - 1, -sw + 1, 1, 2, 0, 1, 'f');
  box(v, -sw - 1, -sw, 1, 2, 2, 5 + bob, 't');
  const z = 7 + bob;
  // Long greatcoat: the skirt flares over the thighs, split at the front.
  box(v, -2, 1, -3, 3, z - 3, z, 'c');
  box(v, 2, 2, -3, -1, z - 3, z, 'c');
  box(v, 2, 2, 1, 3, z - 3, z, 'c');
  // Coat body with crossed webbing straps and a belt.
  box(v, -1, 1, -3, 3, z, z, 's');
  box(v, -1, 1, -3, 3, z + 1, z + 6, 'b');
  for (let i = 0; i < 5; i++) { v.push({ x: 2, y: -2 + i, z: z + 1 + i, k: 'p' }); v.push({ x: 2, y: 2 - i, z: z + 1 + i, k: 'p' }); }
  // Angular shoulder pads with an orange edge.
  box(v, -1, 1, -4, -4, z + 4, z + 6, 'q');
  box(v, -1, 1, 4, 4, z + 4, z + 6, 'q');
  box(v, 0, 1, -4, -4, z + 6, z + 6, 'x');
  box(v, 0, 1, 4, 4, z + 6, z + 6, 'x');
  // Pack.
  box(v, -3, -2, -2, 2, z + 1, z + 5, 'p');
  // Rounded helmet over a respirator: a snout with a filter, and two
  // glowing eyes. The helmet sits low with a neck guard at the back.
  box(v, -1, 1, -1, 1, z + 7, z + 7, 's');
  box(v, -2, 1, -2, 2, z + 8, z + 11, 'h');
  box(v, -1, 0, -1, 1, z + 12, z + 12, 'h');
  box(v, -3, -3, -2, 2, z + 7, z + 9, 'h');
  box(v, 2, 3, -1, 1, z + 8, z + 8, 'm');
  v.push({ x: 4, y: 0, z: z + 8, k: 'm' });
  v.push({ x: 2, y: -1, z: z + 10, k: 'l' }, { x: 2, y: 1, z: z + 10, k: 'l' });
  // Arms up to the rifle.
  const gz = z + 4;
  box(v, 0, 1 - rec, 4, 4, gz, gz + 1, 's');
  box(v, 1, 3 - rec, 2, 3, gz, gz, 's');
  v.push({ x: 3 - rec, y: 1, z: gz - 1, k: 'n' });
  box(v, 0, 3 - rec, -4, -4, gz, gz + 1, 's');
  box(v, 3 - rec, 6 - rec, -3, 0, gz, gz, 's');
  v.push({ x: 6 - rec, y: 1, z: gz - 1, k: 'n' });
  // Rifle: bulkier, with a long curved magazine and an orange sight.
  const g0 = -1 - rec, g1 = g0 + 12;
  box(v, g0, g1, 1, 1, gz, gz, 'g');
  box(v, g0 + 2, g1 - 4, 1, 1, gz + 1, gz + 1, 'k');
  box(v, g0 + 5, g0 + 5, 1, 1, gz - 3, gz - 1, 'g');
  v.push({ x: g0 + 6, y: 1, z: gz - 3, k: 'g' });
  v.push({ x: g0 + 4, y: 1, z: gz + 2, k: 'x' });
  if (pose.flash) flash(v, g1, gz);
  return v;
}

function flash(v, tipX, z) {
  v.push({ x: tipX + 1, y: 1, z, k: 'F' }, { x: tipX + 2, y: 1, z, k: 'E' }, { x: tipX + 3, y: 1, z, k: 'E' },
    { x: tipX + 1, y: 1, z: z + 1, k: 'E' }, { x: tipX + 1, y: 1, z: z - 1, k: 'E' }, { x: tipX + 1, y: 0, z, k: 'E' }, { x: tipX + 1, y: 2, z, k: 'E' });
}

function build(side, frame) {
  const make = side === 0 ? isaTrooper : helghastTrooper;
  const noGun = (p) => p.k !== 'g' && p.k !== 'k' && p.k !== 'F' && p.k !== 'E';
  switch (frame) {
    case 'walk1': return make({ swing: 2 });
    case 'walk2': return make({ bob: 1 });
    case 'walk3': return make({ swing: -2 });
    case 'walk4': return make({ bob: 1 });
    case 'fire': return make({ recoil: 1, flash: true });
    case 'prone1':
    case 'prone2': {
      let v = tip(make().filter(noGun), 90, 4).map((p) => ({ ...p, x: p.x - 8 }));
      if (frame === 'prone2') v = v.map((p) => (p.x < -5 ? { ...p, y: p.y + (p.y < 0 ? -1 : 1) } : p));
      box(v, 6, 17, 1, 1, 2, 2, 'g');
      box(v, 7, 13, 1, 1, 3, 3, 'k');
      return v;
    }
    case 'fall1':
    case 'fall2':
    case 'dead': {
      const stage = ['fall1', 'fall2', 'dead'].indexOf(frame);
      const v = tip(make().filter(noGun), [-35, -70, -90][stage], stage === 2 ? 2 : 0);
      for (let i = 0; i < 11; i++) v.push({ x: 3 + i * 0.6, y: 4 + i * 0.5, z: 0, k: 'g' });
      if (stage === 2) box(v, -9, -3, -2, 2, 0, 0, 'r');
      return v.map((p) => ({ ...p, z: Math.max(0, p.z) }));
    }
    default: return make();
  }
}

export const TROOPER_FRAMES = ['stand', 'walk1', 'walk2', 'walk3', 'walk4', 'fire', 'prone1', 'prone2', 'fall1', 'fall2', 'dead'];

const cache = new Map();
export function getTrooper(side, frame, dir) {
  const key = `${side}|${frame}|${dir}`;
  let c = cache.get(key);
  if (!c) {
    const dim = frame === 'dead' ? 0.7 : frame.startsWith('fall') ? 0.85 : 1;
    c = drawVoxels(build(side, frame), RGB[side], (dir / DIRECTIONS) * Math.PI * 2, dim, TROOPER_SIZE);
    cache.set(key, c);
  }
  return c;
}
