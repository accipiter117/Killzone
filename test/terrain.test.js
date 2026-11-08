import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, step } from '../src/sim/battle.js';
import { heightAt, rampAt, cellIndex, canStep } from '../src/sim/map.js';
import { findPath, straightClear } from '../src/sim/path.js';
import { hitChance, weaponRange } from '../src/sim/combat.js';
import { applyCommand } from '../src/sim/commands.js';
import { squadSoldiers } from './helpers.js';

// Find a cliff: a low cell next to a raised one, with no ramp on either.
function findCliff(map) {
  for (let i = 0; i < map.elev.length - 1; i++) {
    const j = i + 1;
    if (map.elev[i] === 0 && map.elev[j] === 1 && !map.ramp[i] && !map.ramp[j] && (i % map.cols) < map.cols - 2) {
      const c = map.cell;
      return { low: { x: (i % map.cols) * c + c / 2, y: Math.floor(i / map.cols) * c + c / 2 }, high: { x: (j % map.cols) * c + c / 2, y: Math.floor(j / map.cols) * c + c / 2 } };
    }
  }
  return null;
}

test('every map has high ground and every objective can be reached', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const s = createBattle(seed);
    assert.ok(s.map.hasHeight, `seed ${seed} should have raised ground`);
    const B = s.sites.find((x) => x.id === 'B');
    assert.equal(heightAt(s.map, B.x, B.y), 2, 'B sits on the top of the central hill');
    for (const site of s.sites) {
      const p = findPath(s.map, { x: 190, y: 550 }, site, { maxNodes: 60000 });
      const end = p[p.length - 1];
      assert.ok(Math.hypot(end.x - site.x, end.y - site.y) < 1, `seed ${seed}: ${site.id} reachable`);
    }
  }
});

test('high ground is mirrored so both sides get the same hills', () => {
  const s = createBattle(8);
  const n = s.map.elev.length;
  for (let i = 0; i < n; i += 5) {
    assert.equal(s.map.elev[i], s.map.elev[n - 1 - i]);
    assert.equal(s.map.ramp[i], s.map.ramp[n - 1 - i]);
  }
});

test('cliffs cannot be walked through; routes use the ramps', () => {
  const s = createBattle(3);
  const cliff = findCliff(s.map);
  assert.ok(cliff);
  assert.equal(canStep(s.map, cellIndex(s.map, cliff.low.x, cliff.low.y), cellIndex(s.map, cliff.high.x, cliff.high.y)), false);
  assert.equal(straightClear(s.map, cliff.low, cliff.high), false);
  const path = findPath(s.map, cliff.low, cliff.high, { maxNodes: 60000 });
  assert.ok(path && path.length > 2, 'there is a way round');
  // Every step of the route is a legal step.
  let prev = cellIndex(s.map, cliff.low.x, cliff.low.y);
  let usedRamp = false;
  for (const p of path) {
    const i = cellIndex(s.map, p.x, p.y);
    assert.ok(canStep(s.map, prev, i));
    if (rampAt(s.map, p.x, p.y)) usedRamp = true;
    prev = i;
  }
  assert.ok(usedRamp, 'the way up is a ramp');
});

test('a soldier walking into a cliff does not pass through it', () => {
  const s = createBattle(3);
  const cliff = findCliff(s.map);
  const sol = squadSoldiers(s, 0)[0];
  for (const m of squadSoldiers(s, 0)) { m.fled = m !== sol; }
  sol.x = cliff.low.x; sol.y = cliff.low.y; sol.tx = cliff.high.x + 30; sol.ty = cliff.low.y;
  s.squads[0].mode = 'move';
  for (let i = 0; i < 60; i++) { sol.tx = cliff.high.x + 30; sol.ty = cliff.low.y; step(s); }
  assert.equal(heightAt(s.map, sol.x, sol.y), 0);
});

test('high ground gives range and accuracy', () => {
  const s = createBattle(3);
  const B = s.sites.find((x) => x.id === 'B');
  const low = { x: 190, y: 550, role: 'rifle' };
  const high = { x: B.x, y: B.y, role: 'rifle' };
  assert.ok(weaponRange(s, high) > weaponRange(s, low) * 1.2);
  const fromHigh = hitChance(s, 0.5, 100, 260, low, false, high);
  const fromLow = hitChance(s, 0.5, 100, 260, high, false, low);
  assert.ok(fromHigh > fromLow * 1.4, `${fromHigh} vs ${fromLow}`);
});

test('a platoon ordered onto the hill climbs it by a ramp', () => {
  const s = createBattle(5);
  applyCommand(s, { tick: 0, side: 0, type: 'take', params: { platoon: 1, site: 'B' } });
  for (let i = 0; i < 30 * 70; i++) step(s);
  const up = s.platoons[1].squads.flatMap((id) => squadSoldiers(s, id)).filter((m) => m.alive && heightAt(s.map, m.x, m.y) >= 1);
  assert.ok(up.length >= 5, `only ${up.length} soldiers reached the high ground`);
});
