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
  // Send the defenders far off and sit an ISA platoon on the HQ.
  const off = s.sites.find((x) => x.kind === 'hq' && x.home === 0);
  for (const q of s.squads) if (q.side === 1) place(s, q.id, (off.x + hq.x) / 2, (off.y + hq.y) / 2);
  for (const q of s.squads) if (q.side === 0) place(s, q.id, off.x, off.y);
  for (const id of s.platoons.find((p) => p.side === 0).squads) place(s, id, hq.x, hq.y);
  run(s, (CONFIG.skirmish.hqSec + 10) * CONFIG.tickRate);
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
