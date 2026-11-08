import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../src/sim/commands.js';
import { step } from '../src/sim/battle.js';
import { updateVision } from '../src/sim/combat.js';
import { heightAt, cellIndex, canStep } from '../src/sim/map.js';
import { quietBattle, run, squadSoldiers, place } from './helpers.js';

const squadOf = (s, side, role) => s.squads.find((q) => q.side === side && q.role === role);

test('jetpack troopers fly straight over cliffs that block everyone else', () => {
  const s = quietBattle(3);
  const jump = squadOf(s, 0, 'jump');
  // Find a cliff: low ground with raised ground right next to it, no ramp.
  const m = s.map;
  let i = m.elev.findIndex((h, k) => h === 0 && m.elev[k + 1] === 1 && !m.ramp[k] && !m.ramp[k + 1] && (k % m.cols) < m.cols - 3);
  const x = (i % m.cols) * m.cell + 5, y = Math.floor(i / m.cols) * m.cell + 5;
  assert.equal(canStep(m, cellIndex(m, x, y), cellIndex(m, x + 10, y)), false, 'a real cliff');
  const sol = squadSoldiers(s, jump.id)[0];
  for (const o of squadSoldiers(s, jump.id)) if (o !== sol) o.fled = true;
  jump.mode = 'move';
  for (let t = 0; t < 30; t++) { sol.tx = x + 60; sol.ty = y; step(s); jump.mode = 'move'; if (t === 0) { sol.x = x; sol.y = y; } }
  assert.ok(sol.x > x + 20, `flew on to ${sol.x}`);
});

test('infiltrators are hidden until they fire or someone comes close', () => {
  const s = quietBattle(7);
  const inf = squadOf(s, 1, 'infiltrator');
  const watcher = s.squads.find((q) => q.side === 0 && q.role === 'rifle');
  place(s, watcher.id, 120, 300);
  place(s, inf.id, 120 + 200, 300); // well inside rifle sight, beyond reveal distance
  updateVision(s);
  const spy = squadSoldiers(s, inf.id)[0];
  assert.equal(s.sides[0].spotted[spy.id], 0, 'hidden at 200');
  spy.lastShotTick = s.tick; // just fired
  updateVision(s);
  assert.equal(s.sides[0].spotted[spy.id], 1, 'seen after firing');
  spy.lastShotTick = -9999;
  place(s, inf.id, 120 + 80, 300); // inside reveal distance
  updateVision(s);
  assert.equal(s.sides[0].spotted[squadSoldiers(s, inf.id)[0].id], 1, 'seen up close');
});

test('vanish hides infiltrators even up close, for a while', () => {
  const s = quietBattle(7);
  const inf = squadOf(s, 0, 'infiltrator');
  const pl = s.platoons[inf.platoon];
  const foe = s.squads.find((q) => q.side === 1 && q.role === 'rifle');
  place(s, inf.id, 120, 300);
  place(s, foe.id, 190, 300);
  updateVision(s);
  assert.ok(applyCommand(s, { tick: s.tick, side: 0, type: 'ability', params: { platoon: pl.id, role: 'infiltrator' } }).ok);
  updateVision(s);
  assert.equal(s.sides[1].spotted[squadSoldiers(s, inf.id)[0].id], 0, 'vanished');
  s.tick += 30 * (s.cfg.abilities.vanish.durationSec + 1);
  updateVision(s);
  assert.equal(s.sides[1].spotted[squadSoldiers(s, inf.id)[0].id], 1, 'visible again once it wears off (they are close)');
});

test('dive lands on the enemy and hurts them', () => {
  const s = quietBattle(7);
  const jump = squadOf(s, 0, 'jump');
  const pl = s.platoons[jump.platoon];
  const foe = s.squads.find((q) => q.side === 1 && q.role === 'rifle');
  place(s, jump.id, 120, 300);
  place(s, foe.id, 360, 300);
  updateVision(s);
  const before = squadSoldiers(s, foe.id).reduce((a, m) => a + m.hp, 0);
  assert.ok(applyCommand(s, { tick: s.tick, side: 0, type: 'ability', params: { platoon: pl.id, role: 'jump' } }).ok);
  for (let t = 0; t < 45; t++) { for (const m of s.soldiers) m.cd = 99; step(s); }
  const after = squadSoldiers(s, foe.id).reduce((a, m) => a + m.hp, 0);
  assert.ok(after < before, 'the landing hurt them');
  assert.ok(squadSoldiers(s, jump.id).some((m) => Math.abs(m.x - 360) < 60), 'they landed among them');
});
