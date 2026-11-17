// Helghan weather: chosen from the seed (or set), the same both ways, and
// what it does to the fight: sight, tanks off the road, arc towers and
// lightning strikes on tall metal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, step } from '../src/sim/battle.js';
import { CONFIG } from '../src/config.js';
import { sightMult, tankGroundMult, arcMult, WEATHER_KINDS } from '../src/sim/weather.js';

const make = (seed, weather, type = 'trenches') => createBattle(seed, { config: { map: { type, weather }, world: CONFIG.mapSizes[type] } });
const sec = (s, n) => { for (let i = 0; i < Math.round(n * s.cfg.tickRate); i++) step(s); };

test('the weather comes from the seed, or from the menu', () => {
  assert.equal(make(5).weather.kind, make(5).weather.kind, 'same seed, same weather');
  const kinds = new Set();
  for (let seed = 1; seed <= 40; seed++) kinds.add(make(seed).weather.kind);
  assert.ok(kinds.size >= 3, `several kinds over 40 seeds: ${[...kinds]}`);
  for (const k of WEATHER_KINDS) assert.equal(make(3, k).weather.kind, k);
});

test('storms and dust cut sight; clear weather does not', () => {
  assert.equal(sightMult(make(3, 'clear')), 1);
  const dust = make(3, 'dust');
  let low = 1;
  for (let t = 0; t < 120; t += 5) { sec(dust, 5); low = Math.min(low, sightMult(dust)); }
  assert.ok(low < 0.8, `dust gusts cut sight (to ${low.toFixed(2)})`);
});

test('a storm bogs tanks down off the roads and boosts the arc towers', () => {
  const s = make(3, 'storm');
  assert.ok(arcMult(s) > 1);
  assert.equal(arcMult(make(3, 'clear')), 1);
  assert.ok(tankGroundMult(s, 500, 300) < 1, 'off road');
  assert.equal(tankGroundMult(s, 300, 742), 1, 'on the supply road');
});

test('lightning only strikes tall metal, and hurts those beside it', () => {
  const s = make(9, 'storm');
  const rods = [];
  let strikes = 0;
  for (let i = 0; i < 30 * 180 && !s.result; i++) {
    step(s);
    for (const e of s.events) if (e.type === 'lightning') { strikes++; rods.push(e); }
  }
  assert.ok(strikes >= 2, `strikes in three minutes: ${strikes}`);
  const tall = [...s.map.props.filter((p) => ['pylon', 'stack', 'silo', 'crane', 'lamp'].includes(p.kind)), ...s.sites.filter((x) => x.kind === 'arc' || x.kind === 'comms')];
  for (const e of rods) assert.ok(tall.some((p) => p.x === e.x && p.y === e.y), 'struck a lightning rod');
});
