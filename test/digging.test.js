// Digging in: squads that hold still fortify their ground in stages, a Dig
// in order starts at once and digs faster, and the earthworks are real cover.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../src/sim/commands.js';
import { T } from '../src/sim/map.js';
import { quietBattle, run } from './helpers.js';

const cmd = (s, type, params = {}, side = 0) => applyCommand(s, { tick: s.tick, side, type, params });
const sec = (s, n) => run(s, Math.round(n * s.cfg.tickRate));
const dugCount = (s, v) => (s.map.dug ? s.map.dug.filter((x) => x === v).length : 0);
const squad = (s) => s.squads.find((q) => q.side === 0);

test('a squad waiting in place digs foxholes, then sandbags, then a trench', () => {
  const s = quietBattle(7);
  const sq = squad(s);
  sec(s, 4);
  assert.equal(dugCount(s, 1), 0, 'nothing in the first few seconds');
  sec(s, 5 + 6);
  assert.ok(sq.dig.level >= 1, 'foxholes after the wait and a few seconds of digging');
  assert.ok(dugCount(s, 1) > 0);
  const bags = s.map.grid.filter((g) => g === T.sandbag).length;
  sec(s, 12);
  assert.ok(sq.dig.level >= 2);
  assert.ok(s.map.grid.filter((g) => g === T.sandbag).length > bags, 'sandbags went up');
  sec(s, 16);
  assert.equal(sq.dig.level, 3);
  assert.ok(dugCount(s, 2) > 0, 'a trench was dug');
  assert.match(sq.status, /in trench/);
});

test('a Dig in order starts straight away and digs faster', () => {
  const s = quietBattle(7);
  const pl = s.platoons.find((p) => p.side === 0);
  assert.ok(cmd(s, 'hold', { platoon: pl.id }).ok);
  sec(s, 6);
  const sq = s.squads[pl.squads[0]];
  assert.ok(sq.dig.level >= 1, 'foxholes within 6 seconds of the order');
  sec(s, 16);
  assert.equal(sq.dig.level, 3, 'a full trench in about 20 seconds');
});

test('pinned squads do not dig, and moving off starts again', () => {
  const s = quietBattle(7);
  const sq = squad(s);
  sec(s, 6);
  sq.supp = 999; // pinned and kept that way
  const work = sq.dig.work;
  for (let i = 0; i < 60; i++) { sq.supp = 999; sq.pinned = true; run(s, 1); }
  assert.ok(sq.dig.work - work < 0.2, 'no digging while pinned');
  const pl = s.platoons[sq.platoon];
  sq.supp = 0; sq.pinned = false;
  assert.ok(cmd(s, 'move', { platoon: pl.id, x: 800, y: 550 }).ok);
  sec(s, 8);
  assert.equal(sq.dig.level, 0, 'progress starts again after moving');
});
