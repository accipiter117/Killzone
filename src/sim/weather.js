// Helghan weather. Each battle has one kind, chosen from the seed (weighted
// by map: the river valley draws storms, the refinery its petrusite pall,
// the city its dust) or set in the menu, and its strength rises and falls
// through the battle in slow waves. It changes the fight the same way for
// both sides:
// - electrical storm: rain shortens sight, soaks the ground (tanks slow off
//   the roads), supercharges the arc towers, and every so often lightning
//   strikes tall metal (pylons, stacks, masts, the arc tower), hurting and
//   pinning anyone sheltering beside it;
// - ash and dust storm: sight cut hard at the height of each gust;
// - petrusite haze and drizzle: a milder cut to sight;
// - clear: the baseline.
// No randomness of its own: strengths and strikes come from the tick and a
// hash of the seed, so a battle replays exactly and never draws on state.rng.

import { hash, surfAt, S } from './map.js';
import { isActive, feed } from './util.js';
import { damageSoldier, suppress } from './combat.js';
import { damageVehicle } from './vehicles.js';

export const WEATHER_KINDS = ['clear', 'storm', 'dust', 'haze'];

export function chooseWeather(state, seedInt) {
  const w = state.cfg.weather;
  // The old mirrored test map is always clear, so the mechanics tests see
  // the rules on their own.
  let kind = state.cfg.map.weather || (state.map.bespoke ? 'random' : 'clear');
  if (!WEATHER_KINDS.includes(kind)) {
    const odds = w.odds[state.map.kind] || w.odds.trenches;
    let roll = hash(seedInt & 0xffff, (seedInt >>> 16) & 0xffff, 0x5ea7) * odds.reduce((a, [, p]) => a + p, 0);
    kind = odds[odds.length - 1][0];
    for (const [k, p] of odds) { if (roll < p) { kind = k; break; } roll -= p; }
  }
  state.weather = { kind, seed: seedInt >>> 0, strength: 0, nextStrike: strikeAfter(state, 0, seedInt) };
  state.weather.strength = strength(state, 0);
}

// How strong the weather is at a tick, 0 to 1: a base with two slow waves
// on top (gusts of dust, bursts of rain).
export function strength(state, tick) {
  const k = state.cfg.weather.kinds[state.weather.kind];
  const t = tick / state.cfg.tickRate, ph = (state.weather.seed % 997) / 997 * 6.28;
  const wave = 0.5 + 0.3 * Math.sin(t / k.waveSec * 6.28 + ph) + 0.2 * Math.sin(t / (k.waveSec * 0.37) * 6.28 + ph * 1.7);
  return Math.max(0, Math.min(1, k.base + (1 - k.base) * wave * k.swing));
}

const strikeAfter = (state, tick, seedInt) => {
  const l = state.cfg.weather.kinds.storm.lightning;
  const r = hash(tick, seedInt & 0xffff, 0x11a);
  return tick + Math.round((l.everySec[0] + r * (l.everySec[1] - l.everySec[0])) * state.cfg.tickRate);
};

// What weather does to sight: a multiplier on every soldier's and tank's.
export const sightMult = (state) => {
  if (!state.weather) return 1;
  const k = state.cfg.weather.kinds[state.weather.kind];
  return 1 - k.sightCut * state.weather.strength;
};

// Tanks off the roads in a soaking storm.
export const tankGroundMult = (state, x, y) => {
  if (!state.weather || state.weather.kind !== 'storm') return 1;
  const s = surfAt(state.map, x, y);
  return s === S.road || s === S.deck ? 1 : 1 - state.cfg.weather.kinds.storm.tankBog * state.weather.strength;
};

// The arc towers draw on the storm.
export const arcMult = (state) => (state.weather && state.weather.kind === 'storm' ? state.cfg.weather.kinds.storm.arcBoost : 1);

// Tall metal that draws lightning: pylons, stacks, silos, the crane,
// lamps, and the arc and comms posts.
const RODS = new Set(['pylon', 'stack', 'silo', 'crane', 'lamp']);
function lightningRods(state) {
  if (!state.weather.rods) {
    const rods = state.map.props.filter((p) => RODS.has(p.kind)).map((p) => ({ x: p.x, y: p.y }));
    for (const s of state.sites) if (s.kind === 'arc' || s.kind === 'comms') rods.push({ x: s.x, y: s.y });
    state.weather.rods = rods;
  }
  return state.weather.rods;
}

export function updateWeather(state) {
  const w = state.weather;
  if (!w) return;
  w.strength = strength(state, state.tick);
  if (w.kind !== 'storm' || state.tick < w.nextStrike) return;
  w.nextStrike = strikeAfter(state, state.tick, w.seed);
  const l = state.cfg.weather.kinds.storm.lightning;
  if (w.strength < l.minStrength) return;
  const rods = lightningRods(state);
  if (!rods.length) return;
  const rod = rods[Math.floor(hash(state.tick, w.seed & 0xffff, 0x2b) * rods.length) % rods.length];
  state.events.push({ type: 'lightning', x: rod.x, y: rod.y });
  let hurt = 0;
  const hit = new Set();
  for (const s of state.soldiers) {
    if (!isActive(s) || (s.x - rod.x) ** 2 + (s.y - rod.y) ** 2 > l.radius * l.radius) continue;
    damageSoldier(state, s, l.damage, 'lightning');
    hit.add(s.squad);
    hurt++;
  }
  for (const id of [...hit].sort((a, b) => a - b)) suppress(state, state.squads[id], l.suppress, 'blast', rod);
  for (const v of state.vehicles) if (v.alive && (v.x - rod.x) ** 2 + (v.y - rod.y) ** 2 < (l.radius + v.radius) ** 2) damageVehicle(state, v, l.damage, 'blast');
  if (hurt) feed(state, `Lightning strikes beside ${hurt === 1 ? 'a soldier' : `${hurt} soldiers`}`, null, rod);
}
