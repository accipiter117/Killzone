// Fog of war and ambushes: troops lying still in cover are hard to spot,
// shots from unseen troops hit harder, and a platoon holding fire waits
// until the enemy is close.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateVision, updateFiring } from '../src/sim/combat.js';
import { applyCommand } from '../src/sim/commands.js';
import { T, forCells } from '../src/sim/map.js';
import { quietBattle, place, squadSoldiers } from './helpers.js';

function pair() {
  const s = quietBattle(7);
  const spotter = s.squads.find((q) => q.side === 0 && q.role === 'rifle');
  const hider = s.squads.find((q) => q.side === 1 && q.role === 'rifle');
  for (const m of s.soldiers) if (m.squad !== spotter.id && m.squad !== hider.id) m.fled = true;
  place(s, spotter.id, 900, 500);
  place(s, hider.id, 1150, 500); // 250 away: inside rifle sight (300)
  return { s, spotter, hider };
}
const seen = (s, sq) => squadSoldiers(s, sq.id).some((m) => s.sides[0].spotted[m.id]);

test('troops lying still in cover are hidden until close, firing or moving', () => {
  const { s, hider } = pair();
  s.tick = 1000;
  for (const m of squadSoldiers(s, hider.id)) { m.lastMoveTick = 0; m.lastShotTick = -9999; }
  updateVision(s);
  assert.ok(seen(s, hider), 'in the open: seen');
  forCells(s.map, 1100, 470, 1200, 530, (i) => { s.map.grid[i] = T.trench; });
  updateVision(s);
  assert.equal(seen(s, hider), false, 'still in a trench: hidden at this range');
  for (const m of squadSoldiers(s, hider.id)) m.lastShotTick = s.tick;
  updateVision(s);
  assert.ok(seen(s, hider), 'firing gives them away');
});

test('a platoon holding fire waits until an enemy is close, then opens up', () => {
  const { s, spotter, hider } = pair();
  const pl = s.platoons[spotter.platoon];
  assert.ok(applyCommand(s, { tick: s.tick, side: 0, type: 'holdfire', params: { platoon: pl.id, on: true } }).ok);
  updateVision(s);
  for (const m of squadSoldiers(s, spotter.id)) m.cd = 0;
  const shots = () => s.events.filter((e) => e.type === 'shot').length;
  s.events = [];
  updateFiring(s, 1 / 30);
  assert.equal(shots(), 0, 'holding fire at 250');
  assert.ok(pl.holdFire);
  place(s, hider.id, 1000, 500); // now 100 away
  updateVision(s);
  for (const m of squadSoldiers(s, spotter.id)) m.cd = 0;
  updateFiring(s, 1 / 30);
  assert.equal(pl.holdFire, false, 'sprung');
  assert.ok(shots() > 0, 'opened fire');
});
