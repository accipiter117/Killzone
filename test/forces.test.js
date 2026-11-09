import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle } from '../src/sim/battle.js';
import { createMatch, runToEnd } from '../src/sim/match.js';
import { createAI } from '../src/sim/ai.js';
import { applyCommand } from '../src/sim/commands.js';
import { T } from '../src/sim/map.js';

const forces = () => [
  { platoons: [{ roles: ['rifle', 'heavy', 'engineer'], alive: [5, 2, 0], name: 'Sgt Rook', ref: 'isa-1' }], tank: false, artillery: false, opBonus: 2, fortified: true },
  { platoons: [{ roles: ['rifle', 'heavy', 'engineer'], ref: 'hgh-1' }, { roles: ['assault', 'rifle', 'recon'], ref: 'hgh-2' }], tank: true, artillery: true },
];

test('campaign forces: own platoons, survivors, extras', () => {
  const s = createBattle(9, { forces: forces() });
  assert.equal(s.platoons.filter((p) => p.side === 0).length, 1);
  assert.equal(s.platoons.filter((p) => p.side === 1).length, 2);
  const isa = s.platoons[0];
  const alive = isa.squads.map((id) => s.squads[id].soldiers.filter((x) => s.soldiers[x].alive).length);
  assert.deepEqual(alive, [5, 2, 0]);
  assert.equal(s.squads[isa.squads[2]].mode, 'dead');
  assert.ok(s.vehicles[0].absent && !s.vehicles[1].absent);
  assert.equal(s.sides[0].op, s.cfg.orders.start + 2);
  assert.equal(applyCommand(s, { tick: 0, side: 0, type: 'artillery', params: { x: 1000, y: 500 } }).ok, false);
  assert.equal(applyCommand(s, { tick: 0, side: 0, type: 'vmove', params: { x: 500, y: 500 } }).ok, false);
  assert.ok(s.map.grid.some((c) => c === T.sandbag), 'the defender dug in');
});

test('a campaign battle runs to a result that reports each platoon', () => {
  const m = createMatch({ seed: 4, options: { forces: forces(), config: { battle: { durationSec: 120 } } }, controllers: [createAI(0), createAI(1)] });
  const r = runToEnd(m);
  assert.equal(r.platoons.length, 3);
  assert.equal(r.platoons[0].ref, 'isa-1');
  assert.ok(r.platoons[0].survivors.every((n) => n <= 5)); // in-battle reinforcements can refill a squad
});
