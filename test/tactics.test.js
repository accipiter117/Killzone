// Turn-based battles: units on a grid, reach, shown odds, rolled shots that
// alone cause losses, overwatch, grenades, breaking, objectives and the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, step } from '../src/sim/battle.js';
import {
  createTactics, reachable, shotOdds, moveUnit, fireUnit, grenadeUnit, overwatchUnit, endTurn, aiTurn, liveUnits, unitById, soldiersLeft,
} from '../src/tactics/tactics.js';

function battle(seed = 'tb') {
  const s = createBattle(seed, {});
  createTactics(s);
  return s;
}
const run = (s, n) => { for (let i = 0; i < n; i++) step(s); };
const casualties = (s) => s.sides[0].casualties + s.sides[1].casualties;

test('every platoon and tank gets a tile and two actions; the ISA go first', () => {
  const s = battle();
  const tb = s.tb;
  assert.equal(liveUnits(tb, 0).length, 4);
  assert.equal(liveUnits(tb, 1).length, 4);
  assert.equal(tb.active, 0);
  const tiles = new Set(tb.units.map((u) => `${u.tx},${u.ty}`));
  assert.equal(tiles.size, tb.units.length, 'one unit a tile');
  assert.ok(tb.units.every((u) => u.ap === 2));
});

test('the live fight harms nobody: only the turn rules cause losses', () => {
  const s = battle('quiet');
  // March everyone into each other and let them shoot for a minute.
  for (const u of s.tb.units) { u.tx = 12; }
  for (const pl of s.platoons) pl.order = { type: 'move', x: 1500, y: s.map.height / 2 };
  run(s, 30 * 60);
  assert.equal(casualties(s), 0);
  assert.equal(s.result, null, 'no end by the clock either');
});

test('moves: one action for a near tile, both for a dash; out of reach is refused', () => {
  const s = battle('move');
  const u = liveUnits(s.tb, 0).find((x) => x.kind === 'platoon');
  const reach = reachable(s, u);
  const near = [...reach].find(([, c]) => c === 1), far = [...reach].find(([, c]) => c === 2);
  assert.ok(near && far);
  const [nx, ny] = near[0].split(',').map(Number);
  assert.ok(moveUnit(s, u.id, nx, ny).ok);
  assert.equal(u.ap, 1);
  assert.equal(moveUnit(s, u.id, u.tx + 9, u.ty).ok, false);
});

test('a shot shows its odds and, rolled, kills soldiers or pins', () => {
  const s = battle('shoot');
  const a = liveUnits(s.tb, 0).find((x) => x.kind === 'platoon');
  const t = liveUnits(s.tb, 1).find((x) => x.kind === 'platoon');
  t.tx = a.tx + 3; t.ty = a.ty;
  const odds = shotOdds(s, a, t);
  assert.ok(odds && odds.chance > 0 && odds.lines.length);
  const before = soldiersLeft(s, t);
  const r = fireUnit(s, a.id, t.id);
  assert.ok(r.ok);
  assert.equal(a.ap, 0, 'firing ends its turn');
  assert.ok(r.hit ? soldiersLeft(s, t) < before : t.pinned);
});

test('flanking gets round cover', () => {
  const s = battle('flank');
  const a = liveUnits(s.tb, 0).find((x) => x.kind === 'platoon');
  const t = liveUnits(s.tb, 1).find((x) => x.kind === 'platoon');
  // Find a covered tile for the target.
  let spot = null;
  for (let x = 4; x < s.tb.cols - 4 && !spot; x++) for (let y = 3; y < s.tb.rows - 3 && !spot; y++) {
    const o = shotOdds(s, { ...a, tx: x - 3, ty: y }, { ...t, tx: x, ty: y });
    if (o && o.lines.some((l) => /cover/.test(l))) spot = [x, y];
  }
  assert.ok(spot, 'a covered tile exists');
  const [x, y] = spot;
  t.tx = x; t.ty = y;
  const front = shotOdds(s, { ...a, tx: x - 3, ty: y }, t);
  const side = shotOdds(s, { ...a, tx: x, ty: y - 3 }, t);
  if (side) assert.ok(side.lines.some((l) => /Flanked/.test(l)) && side.chance > front.chance);
});

test('overwatch fires at an enemy moving into its sights', () => {
  const s = battle('ow');
  const a = liveUnits(s.tb, 0).find((x) => x.kind === 'platoon');
  assert.ok(overwatchUnit(s, a.id).ok);
  endTurn(s);
  const e = liveUnits(s.tb, 1).find((x) => x.kind === 'platoon');
  e.tx = a.tx + 4; e.ty = a.ty;
  const r = moveUnit(s, e.id, ...[...reachable(s, e)].map(([k]) => k.split(',').map(Number)).sort((p, q) => Math.hypot(p[0] - a.tx, p[1] - a.ty) - Math.hypot(q[0] - a.tx, q[1] - a.ty))[0]);
  assert.ok(r.ok);
  assert.ok(r.lines.some((l) => /Overwatch/.test(l)), 'overwatch fired');
  assert.equal(a.ow, false);
});

test('grenades always land, ignore cover and pin; then they need time', () => {
  const s = battle('nade');
  const a = liveUnits(s.tb, 0).find((x) => x.kind === 'platoon');
  const t = liveUnits(s.tb, 1).find((x) => x.kind === 'platoon');
  t.tx = a.tx + 2; t.ty = a.ty;
  const before = soldiersLeft(s, t);
  assert.ok(grenadeUnit(s, a.id, t.id).ok);
  assert.equal(soldiersLeft(s, t), before - s.tb.c.grenade.kills);
  assert.ok(t.pinned);
  assert.equal(grenadeUnit(s, a.id, t.id).ok, false, 'cooling down');
});

test('a battle between two AIs runs its ten turns (or a rout) to a result', () => {
  const s = battle('ai');
  let g = 0;
  while (!s.result && g++ < 40) { aiTurn(s, s.tb.active); run(s, 30); }
  assert.ok(s.result, 'finished');
  assert.ok(['time', 'broken'].includes(s.result.reason));
  assert.ok(casualties(s) > 0, 'there was fighting');
  assert.equal(s.result.platoons.length, 6, 'survivors reported for the war map');
});

test('a broken platoon leaves the fight and runs', () => {
  const s = battle('break');
  const t = liveUnits(s.tb, 1).find((x) => x.kind === 'platoon');
  const a = liveUnits(s.tb, 0).find((x) => x.kind === 'platoon');
  t.tx = a.tx + 1; t.ty = a.ty;
  for (let k = 0; k < 8 && !t.out; k++) { a.ap = 2; a.grenadeReady = 0; grenadeUnit(s, a.id, t.id); }
  assert.ok(t.out);
  assert.ok(s.platoons[t.pl].broken);
  void unitById;
});
