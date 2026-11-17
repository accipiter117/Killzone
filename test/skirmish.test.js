import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, isExplored } from '../src/sim/battle.js';
import { createAI } from '../src/sim/ai.js';
import { CONFIG } from '../src/config.js';
import { run, place } from './helpers.js';

// Skirmish: a generated map twice the size, fog of war over unexplored
// ground, and a headquarters on each side to find and take.
const SKIRMISH = { map: { type: 'random', weather: 'clear' }, world: CONFIG.mapSizes.random };
const skirmish = (seed) => createBattle(seed, { config: SKIRMISH });

test('every generated map has two HQs, supply points and home ground known', () => {
  for (const seed of [1, 2, 3, 4]) {
    const s = skirmish(seed);
    assert.equal(s.map.width, 6000);
    const hqs = s.sites.filter((x) => x.kind === 'hq');
    assert.equal(hqs.length, 2);
    for (const hq of hqs) {
      assert.equal(hq.owner, hq.home);
      assert.ok(isExplored(s, hq.home, hq.x, hq.y), 'a side knows its own HQ');
      assert.ok(!isExplored(s, 1 - hq.home, hq.x, hq.y), 'but not the enemy HQ');
    }
    assert.ok(s.sites.filter((x) => x.kind === 'supply').length >= 4, 'supply points to fight over');
    assert.equal(s.durationTicks, CONFIG.skirmish.durationSec * CONFIG.tickRate);
  }
});

test('the same seed makes the same map', () => {
  const a = skirmish(7), b = skirmish(7);
  assert.deepEqual(a.sites.map((x) => [x.id, x.x, x.y]), b.sites.map((x) => [x.id, x.x, x.y]));
  assert.deepEqual([...a.map.grid], [...b.map.grid]);
});

test('ground is explored as soldiers walk over it', () => {
  const s = skirmish(3);
  const sq = s.squads.find((q) => q.side === 0);
  const far = s.sites.find((x) => x.kind === 'hq' && x.home === 1);
  assert.ok(!isExplored(s, 0, far.x, far.y));
  place(s, sq.id, far.x - 60, far.y);
  run(s, CONFIG.combat.visionEveryTicks + 1);
  assert.ok(isExplored(s, 0, far.x, far.y));
});

test('taking the enemy HQ wins the battle', () => {
  const s = skirmish(2);
  const hq = s.sites.find((x) => x.kind === 'hq' && x.home === 1);
  // Send the defenders far off (their tank too) and sit an ISA platoon on the HQ.
  const off = s.sites.find((x) => x.kind === 'hq' && x.home === 0);
  for (const q of s.squads) if (q.side === 1) place(s, q.id, (off.x + hq.x) / 2, (off.y + hq.y) / 2);
  for (const q of s.squads) if (q.side === 0) place(s, q.id, off.x, off.y);
  for (const v of s.vehicles) if (v.side === 1) { v.alive = false; v.hp = 0; }
  for (const id of s.platoons.find((p) => p.side === 0).squads) place(s, id, hq.x, hq.y);
  run(s, (2 * CONFIG.skirmish.hqSec + 15) * CONFIG.tickRate); // neutralise, then take
  assert.ok(s.result, 'the battle ended');
  assert.equal(s.result.winner, 0);
  assert.equal(s.result.reason, 'hq');
});

test('the AI does not head for an HQ it has not found', () => {
  const s = skirmish(5);
  const ai = createAI(0);
  const cmds = ai.think(s) || [];
  const hq = s.sites.find((x) => x.kind === 'hq' && x.home === 1);
  assert.ok(!cmds.some((c) => c.type === 'take' && c.params.site === hq.id), 'no take order on the unknown HQ');
  assert.ok(cmds.length > 0, 'but it does give orders (scouting or taking known ground)');
});

test('reserve platoons wait off the field until enough supply is held, then march out of the HQ', async () => {
  const { applyCommand } = await import('../src/sim/commands.js');
  const s = skirmish(4);
  const reserves = s.platoons.filter((p) => p.side === 0 && p.reserve);
  assert.equal(reserves.length, CONFIG.skirmish.reserves);
  assert.ok(reserves.every((p) => p.squads.every((id) => s.squads[id].soldiers.every((sid) => !s.soldiers[sid].alive))));
  run(s, 30);
  s.sides[0].op = 6;
  const r1 = applyCommand(s, { tick: s.tick, side: 0, type: 'callin', params: { what: 'platoon' } });
  assert.ok(!r1.ok, 'blocked without supply points');
  const supply = s.sites.filter((x) => x.kind === 'supply');
  for (const x of supply.slice(0, CONFIG.callins.platoon.needSupply[0])) x.owner = 0;
  const r2 = applyCommand(s, { tick: s.tick, side: 0, type: 'callin', params: { what: 'platoon' } });
  assert.ok(r2.ok, r2.reason);
  const pl = reserves[0];
  assert.ok(!pl.reserve);
  const hq = s.sites.find((x) => x.kind === 'hq' && x.home === 0);
  const men = pl.squads.flatMap((id) => s.squads[id].soldiers.map((sid) => s.soldiers[sid]));
  assert.ok(men.every((m) => m.alive && Math.hypot(m.x - hq.x, m.y - hq.y) < 150), 'all at the HQ');
  // The next one needs more ground.
  s.sides[0].op = 6;
  assert.ok(!applyCommand(s, { tick: s.tick, side: 0, type: 'callin', params: { what: 'platoon' } }).ok);
  run(s, 60);
  assert.ok(!pl.broken, 'a fresh platoon is not broken');
});
