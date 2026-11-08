import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../src/sim/commands.js';
import { step } from '../src/sim/battle.js';
import { updateVision } from '../src/sim/combat.js';
import { updateVehicleVision, damageVehicle } from '../src/sim/vehicles.js';
import { T, cellIndex } from '../src/sim/map.js';
import { quietBattle, run, place } from './helpers.js';

const cmd = (s, side, type, params = {}) => applyCommand(s, { tick: s.tick, side, type, params });
const see = (s) => { updateVision(s); updateVehicleVision(s); };
// Hold every soldier's fire so a test only measures what it sets up.
const holdFire = (s) => { for (const m of s.soldiers) m.cd = 99; };

test('each side starts with one tank, placed as mirror images', () => {
  const s = quietBattle(5);
  assert.equal(s.vehicles.length, 2);
  const [a, b] = s.vehicles;
  assert.equal(a.side, 0);
  assert.equal(b.side, 1);
  assert.equal(a.x + b.x, s.map.width);
  assert.equal(a.y + b.y, s.map.height);
  assert.equal(a.hp, b.hp);
});

test('a tank drives where it is told, and a fresh order is free to change for a few seconds', () => {
  const s = quietBattle(5);
  const v = s.vehicles[0];
  const op = s.sides[0].op;
  assert.ok(cmd(s, 0, 'vmove', { x: v.x + 150, y: v.y }).ok);
  assert.equal(s.sides[0].op, op - s.cfg.orders.cost.vmove);
  assert.ok(cmd(s, 0, 'vmove', { x: v.x + 120, y: v.y }).ok);
  assert.equal(s.sides[0].op, op - s.cfg.orders.cost.vmove, 'the amendment was free');
  const x0 = v.x;
  run(s, 60);
  assert.ok(v.x > x0 + 30, 'the tank moved forward');
  assert.ok(cmd(s, 1, 'vmove', { x: 2000, y: 500 }).ok);
  assert.equal(s.vehicles[1].order.type, 'move', 'a Helghast order moves their own tank');
  assert.equal(v.order.x, x0 + 120 - (x0 - Math.round(x0)), 'and not ours');
});

test('a tank never parks inside a ruin', () => {
  const s = quietBattle(5);
  const i = s.map.grid.findIndex((c) => c === T.building);
  const x = (i % s.map.cols) * s.map.cell + 5, y = Math.floor(i / s.map.cols) * s.map.cell + 5;
  assert.ok(cmd(s, 0, 'vmove', { x, y }).ok);
  const o = s.vehicles[0].order;
  assert.notEqual(s.map.grid[cellIndex(s.map, o.x, o.y)], T.building);
});

test('rifles barely scratch a tank; heavies hurt it', () => {
  const hurt = (role) => {
    const s = quietBattle(7);
    const v = s.vehicles[1];
    v.x = 400; v.y = 300;
    s.vehicles[0].x = 1500; s.vehicles[0].y = 1000; // out of the way
    // Only the chosen squad shoots (the rest are kept far off and quiet).
    const sq = s.squads.find((q) => q.side === 0 && q.role === role);
    place(s, sq.id, 250, 300);
    see(s);
    for (let i = 0; i < 30 * 15; i++) {
      for (const m of s.soldiers) if (m.squad !== sq.id) m.cd = 99;
      step(s);
    }
    return v.maxHp - v.hp;
  };
  const rifle = hurt('rifle'), heavy = hurt('heavy');
  assert.ok(heavy > rifle * 3, `heavy ${heavy} vs rifle ${rifle}`);
});

test('engineers plant a breaching charge on a nearby enemy tank', () => {
  const s = quietBattle(7);
  const v = s.vehicles[1];
  v.x = 300; v.y = 300;
  const pl = s.platoons.find((p) => p.side === 0 && p.squads.some((id) => s.squads[id].role === 'engineer'));
  const sq = pl.squads.map((id) => s.squads[id]).find((q) => q.role === 'engineer');
  place(s, sq.id, 160, 300);
  see(s);
  assert.ok(cmd(s, 0, 'ability', { platoon: pl.id, role: 'engineer' }).ok);
  assert.equal(sq.abilityUsed, 'breach');
  const hp0 = v.hp;
  for (let i = 0; i < 30 * 10; i++) { holdFire(s); v.mgCd = 99; v.gunReady = s.tick + 99; step(s); }
  assert.ok(hp0 - v.hp >= s.cfg.breach.damage * 0.99, `charge damage ${hp0 - v.hp}`);
});

test('with no enemy tank about, the engineer ability is still sandbags', () => {
  const s = quietBattle(7);
  const pl = s.platoons.find((p) => p.side === 0 && p.squads.some((id) => s.squads[id].role === 'engineer'));
  const sq = pl.squads.map((id) => s.squads[id]).find((q) => q.role === 'engineer');
  place(s, sq.id, 160, 300);
  see(s);
  assert.ok(cmd(s, 0, 'ability', { platoon: pl.id, role: 'engineer' }).ok);
  assert.equal(sq.abilityUsed, 'sandbags');
});

test('Overwatch needs a target, fires a heavy shell at the enemy tank, then cools down', () => {
  const s = quietBattle(7);
  const [a, b] = s.vehicles;
  assert.equal(cmd(s, 0, 'vability').ok, false, 'nothing in sight at the start');
  a.x = 300; a.y = 300; b.x = 600; b.y = 300;
  see(s);
  let hit = false;
  for (let k = 0; k < 6 && !hit; k++) {
    a.abilityReady = 0;
    const hp = b.hp;
    assert.ok(cmd(s, 0, 'vability').ok);
    hit = b.hp < hp;
  }
  assert.ok(hit, 'an aimed shell should hit within a few tries');
  assert.equal(cmd(s, 0, 'vability').ok, false, 'cooling down');
});

test('a destroyed tank leaves a wreck that is cover and takes no more orders', () => {
  const s = quietBattle(7);
  const v = s.vehicles[0];
  v.x = 300; v.y = 300;
  damageVehicle(s, v, 99999, 'test');
  assert.equal(v.alive, false);
  assert.equal(s.map.grid[cellIndex(s.map, 300, 300)], T.rubble);
  assert.equal(cmd(s, 0, 'vmove', { x: 500, y: 300 }).ok, false);
  assert.ok(s.sides[0].tankLost);
});

test('infantry close behind their own tank are covered from fire in front', () => {
  const s = quietBattle(7);
  const v = s.vehicles[0];
  v.x = 300; v.y = 300;
  const sq = s.squads.find((q) => q.side === 0);
  place(s, sq.id, 280, 300);
  const me = s.soldiers[sq.soldiers[2]];
  me.x = 270; me.y = 300;
  const shooter = { x: 600, y: 300, side: 1 };
  const covered = hitChanceFrom(s, me, shooter);
  v.alive = false;
  const open = hitChanceFrom(s, me, shooter);
  assert.ok(covered < open * 0.7, `${covered} vs ${open}`);
});

import { hitChance } from '../src/sim/combat.js';
function hitChanceFrom(s, target, shooter) {
  const d = Math.hypot(target.x - shooter.x, target.y - shooter.y);
  return hitChance(s, 0.5, d, 400, target, false, shooter);
}

// A solid wire belt across open flat ground at x 500 to 530.
function wireBelt(s) {
  const m = s.map;
  for (let i = 0; i < m.wire.length; i++) m.wire[i] = 0;
  for (let y = 5; y < m.height; y += 10) for (let x = 505; x <= 525; x += 10) {
    const i = Math.floor(y / 10) * m.cols + Math.floor(x / 10);
    m.wire[i] = 1; m.grid[i] = T.open; m.elev[i] = 0;
  }
}

function crossingTime(crush) {
  const s = quietBattle(7);
  wireBelt(s);
  const v = s.vehicles[0];
  if (crush) {
    v.x = 435; v.y = 300;
    cmd(s, 0, 'vmove', { x: 600, y: 300 });
    for (let i = 0; i < 30 * 8; i++) { holdFire(s); step(s); }
  } else { v.x = 100; v.y = 100; }
  const pl = s.platoons[0];
  for (const id of pl.squads) place(s, id, 445, s.squads[id].role === 'rifle' ? 300 : 700);
  const sq = s.squads[pl.squads.find((id) => s.squads[id].role === 'rifle')];
  cmd(s, 0, 'move', { platoon: pl.id, x: 615, y: 300 });
  const t0 = s.tick;
  for (let i = 0; i < 30 * 40; i++) {
    holdFire(s);
    step(s);
    if (sq.soldiers.every((id) => s.soldiers[id].x > 540)) return { s, sec: (s.tick - t0) / 30 };
  }
  return { s, sec: Infinity };
}

test('a tank rolls barbed wire flat, opening a lane infantry walk straight through', () => {
  const crushed = crossingTime(true);
  for (let dy = -30; dy <= 30; dy += 10) assert.equal(crushed.s.map.wire[cellIndex(crushed.s.map, 515, 300 + dy)], 0, `lane open at ${dy}`);
  const blocked = crossingTime(false);
  assert.ok(crushed.sec < blocked.sec / 2, `through the lane ${crushed.sec}s, through wire ${blocked.sec}s`);
});
