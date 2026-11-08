import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, runToEnd } from '../src/sim/match.js';
import { createAI } from '../src/sim/ai.js';
import { applyCommand } from '../src/sim/commands.js';
import { strayImpact } from '../src/sim/combat.js';
import { callArtillery } from '../src/sim/features.js';
import { cutWire } from '../src/sim/squads.js';
import { step } from '../src/sim/battle.js';
import { quietBattle, run, squadSoldiers, place, remove } from './helpers.js';

test('AI vs AI battles always finish within the time limit', () => {
  for (const seed of [3, 4, 5, 'Ypres']) {
    const m = createMatch({ seed, controllers: [createAI(0), createAI(1)] });
    const r = runToEnd(m, m.state.durationTicks + 10);
    assert.ok(r, `seed ${seed} should finish`);
    assert.ok(r.tick <= m.state.durationTicks);
    assert.ok(['narrow', 'clear', 'crushing', 'draw'].includes(r.margin));
  }
});

test('a short battle ends on time with the higher score winning', () => {
  const s = quietBattle(5, { battle: { durationSec: 30 } });
  const B = s.sites.find((x) => x.id === 'B');
  B.owner = 1;
  run(s, 30 * 30 + 5);
  assert.ok(s.result);
  assert.equal(s.result.reason, 'time');
  assert.equal(s.result.winner, 1);
  assert.equal(s.result.scores[1], 30);
});

test('objectives capture, stall when contested, and flip', () => {
  const s = quietBattle();
  const B = s.sites.find((x) => x.id === 'B');
  const secs = s.cfg.capture.objectiveSec;
  place(s, 0, B.x, B.y); // ISA squad on B
  run(s, Math.round((secs + 1) * 30));
  assert.equal(B.owner, 0, 'ISA should own B');

  // Helghast squad arrives while ISA is still there: contested, no progress.
  const hgh = s.squads.find((q) => q.side === 1).id;
  place(s, hgh, B.x + 20, B.y + 20);
  run(s, 90);
  assert.equal(B.owner, 0);
  assert.equal(B.cap, 0, 'contested capture bar should not move');

  // ISA leaves: the Helghast fill the bar and take it.
  remove(s, 0);
  run(s, Math.round((secs / 2) * 30));
  assert.equal(B.owner, 0, 'not yet');
  assert.ok(B.cap > 0.3 && B.capSide === 1);
  run(s, Math.round((secs / 2 + 1) * 30));
  assert.equal(B.owner, 1, 'Helghast should have flipped B');
});

test('routing soldiers do not capture', () => {
  const s = quietBattle();
  const A = s.sites.find((x) => x.id === 'A');
  place(s, 0, A.x, A.y);
  s.squads[0].mode = 'rout';
  s.platoons[0].broken = true;
  for (let i = 0; i < 30 * 20; i++) { place(s, 0, A.x, A.y); step(s); }
  assert.equal(A.owner, null);
});

test('pinned squads do not advance', () => {
  const s = quietBattle();
  assert.ok(applyCommand(s, { tick: 0, side: 0, type: 'move', params: { platoon: 0, x: 1400, y: 300 } }).ok);
  const pinnedSq = s.squads[0], freeSq = s.squads[1];
  pinnedSq.supp = 100;
  step(s); // suppression is checked at the end of the tick
  const before = squadSoldiers(s, pinnedSq.id).map((m) => m.x);
  const freeBefore = squadSoldiers(s, freeSq.id).map((m) => m.x);
  for (let i = 0; i < 90; i++) { pinnedSq.supp = 100; pinnedSq.lastHitTick = s.tick; step(s); }
  assert.ok(pinnedSq.pinned);
  assert.deepEqual(squadSoldiers(s, pinnedSq.id).map((m) => m.x), before);
  assert.match(pinnedSq.status, /^Pinned/);
  const moved = squadSoldiers(s, freeSq.id).some((m, i) => m.x > freeBefore[i] + 10);
  assert.ok(moved, 'the unpinned squad should have advanced');
});

test('suppression wears off and the squad unpins', () => {
  const s = quietBattle();
  const sq = s.squads[0];
  sq.supp = 100;
  step(s);
  assert.ok(sq.pinned);
  run(s, 30 * 6);
  assert.ok(!sq.pinned);
});

test('wire slows infantry until it is cut', () => {
  const s = quietBattle();
  const m = s.map;
  // Find a wire cell with open ground (no cover slowdown) around it.
  let wi = m.wire.findIndex((v, i) => v > 0 && m.grid[i] === 0 && (i % m.cols) * m.cell < m.width / 2);
  const wx = (wi % m.cols) * m.cell + 5, wy = Math.floor(wi / m.cols) * m.cell + 5;
  const sol = squadSoldiers(s, 0)[0];
  const stride = () => {
    sol.x = wx; sol.y = wy; sol.tx = wx; sol.ty = wy + 200;
    const y0 = sol.y;
    step(s);
    return sol.y - y0;
  };
  // Keep the rest of the squad from wandering: idle order, only this soldier moves.
  const slow = stride();
  cutWire(s, wx, wy, 40, 5);
  assert.equal(m.wire[wi], 0);
  const fast = stride();
  assert.ok(slow > 0 && fast > slow * 3, `wire ${slow} vs cut ${fast}`);
});

test('engineers cut wire on their route', () => {
  const s = quietBattle();
  const eng = s.squads.find((q) => q.side === 0 && q.role === 'engineer');
  const m = s.map;
  const total = () => m.wire.reduce((a, v, i) => a + ((i % m.cols) * m.cell < m.width / 2 ? v : 0), 0);
  const before = total();
  // Stand the engineers just short of a wire cell and order the platoon across it.
  const wi = m.wire.findIndex((v, i) => v > 0 && (i % m.cols) * m.cell < m.width / 2 && Math.floor(i / m.cols) * m.cell > 300);
  const wx = (wi % m.cols) * m.cell + 5, wy = Math.floor(wi / m.cols) * m.cell + 5;
  place(s, eng.id, wx - 60, wy);
  const k = s.platoons[eng.platoon].squads.indexOf(eng.id) - 1;
  applyCommand(s, { tick: 0, side: 0, type: 'move', params: { platoon: eng.platoon, x: wx + 300, y: wy - k * s.cfg.squad.slotSpacing } });
  let sawCutting = false;
  for (let i = 0; i < 30 * 40; i++) { step(s); if (eng.status === 'Cutting wire') sawCutting = true; }
  assert.ok(sawCutting, 'engineers should have stopped to cut wire');
  assert.ok(total() < before - 1, 'some wire should be gone');
});

test('petrusite tanks explode once', () => {
  const s = quietBattle();
  const tank = s.tanks[0];
  let blasts = 0;
  s.events = [];
  strayImpact(s, tank.x, tank.y);
  strayImpact(s, tank.x + 1, tank.y);
  blasts += s.events.filter((e) => e.type === 'tankBlast' && e.x === tank.x && e.y === tank.y).length;
  assert.equal(tank.exploded, true);
  assert.equal(blasts, 1);
  // Shelling the wreck later does not set it off again.
  callArtillery(s, 0, tank.x, tank.y);
  for (let i = 0; i < 30 * 8; i++) {
    step(s);
    blasts += s.events.filter((e) => e.type === 'tankBlast' && e.x === tank.x && e.y === tank.y).length;
  }
  assert.equal(blasts, 1);
});

test('tank blasts hurt everyone nearby, friend or foe', () => {
  const s = quietBattle();
  const tank = s.tanks[0];
  place(s, 0, tank.x - 30, tank.y);
  const hgh = s.squads.find((q) => q.side === 1).id;
  place(s, hgh, tank.x + 30, tank.y);
  strayImpact(s, tank.x, tank.y);
  assert.ok(squadSoldiers(s, 0).some((m) => m.hp < m.maxHp));
  assert.ok(squadSoldiers(s, hgh).some((m) => m.hp < m.maxHp));
});

test('orders cost order points and are refused when you cannot pay', () => {
  const s = quietBattle();
  assert.equal(s.sides[0].op, 3);
  assert.ok(applyCommand(s, { tick: 0, side: 0, type: 'artillery', params: { x: 1500, y: 500 } }).ok);
  assert.ok(s.sides[0].op < 1e-9);
  const r = applyCommand(s, { tick: 0, side: 0, type: 'move', params: { platoon: 0, x: 600, y: 300 } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /order points/);
  // Stance changes are free.
  assert.ok(applyCommand(s, { tick: 0, side: 0, type: 'stance', params: { platoon: 0, stance: 'cautious' } }).ok);
  // You cannot order the other side's platoons.
  s.sides[0].op = 6;
  assert.equal(applyCommand(s, { tick: 0, side: 0, type: 'hold', params: { platoon: 4 } }).ok, false);
});

test('owning the comms post refills order points faster', () => {
  const a = quietBattle(), b = quietBattle();
  a.sides[0].op = 0; b.sides[0].op = 0;
  b.sites.find((x) => x.kind === 'comms').owner = 0;
  run(a, 300); run(b, 300);
  assert.ok(b.sides[0].op > a.sides[0].op * 1.5);
});

test('a broken platoon regroups at its edge, rallies once, then runs for good', () => {
  const s = quietBattle();
  const pl = s.platoons[0];
  const all = pl.squads.flatMap((id) => squadSoldiers(s, id));
  all.slice(0, 11).forEach((m) => { m.alive = false; });
  run(s, 30);
  assert.ok(pl.broken);
  assert.match(s.squads[pl.squads[2]].status, /Routing|Regrouping/);
  // They are already near their edge, so the regroup clock starts.
  run(s, 30 * 10);
  assert.ok(pl.rallyAt > 0, 'regrouping should have started');
  assert.ok(all.filter((m) => m.alive).every((m) => !m.fled), 'nobody leaves the field the first time');
  run(s, 30 * (s.cfg.battle.rallySec + 2));
  assert.equal(pl.broken, false);
  assert.ok(pl.rallied);
  assert.equal(pl.order.type, 'hold');
  // Break again: this time they run off the field.
  all.filter((m) => m.alive).slice(0, 3).forEach((m) => { m.alive = false; });
  run(s, 30);
  assert.ok(pl.broken);
  run(s, 30 * 30);
  assert.ok(all.filter((m) => m.alive).every((m) => m.fled));
});

test('the map is the same for both sides (turned 180 degrees)', () => {
  const s = quietBattle(99);
  const m = s.map;
  for (let i = 0; i < m.grid.length; i += 7) {
    const mirror = m.grid.length - 1 - i;
    assert.equal(m.grid[i], m.grid[mirror]);
    assert.equal(m.wire[i], m.wire[mirror]);
  }
});
