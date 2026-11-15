// The tank's extra orders: routes with stops, waiting for GO, escorting a
// platoon, hull down and smoke launchers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../src/sim/commands.js';
import { step } from '../src/sim/battle.js';
import { damageVehicle } from '../src/sim/vehicles.js';
import { quietBattle, squadSoldiers } from './helpers.js';

const cmd = (s, type, params = {}, side = 0) => applyCommand(s, { tick: s.tick, side, type, params });
const run = (s, n) => { for (let i = 0; i < n; i++) step(s); };
const tankOf = (s, side = 0) => s.vehicles.find((v) => v.side === side);

test('a tank route goes through its stops in order', () => {
  const s = quietBattle(7);
  const v = tankOf(s);
  const stop = { x: Math.round(v.x + 200), y: Math.round(v.y - 200) };
  assert.ok(cmd(s, 'vmove', { x: Math.round(v.x + 400), y: Math.round(v.y), via: [stop] }).ok);
  assert.equal(v.order.via.length, 1);
  for (let i = 0; i < 30 * 40 && v.order.via.length; i++) step(s);
  assert.equal(v.order.via.length, 0, 'reached the stop');
  assert.ok(v.y < s.map.height / 2 - 100, 'went up to the stop rather than straight across');
});

test('a tank order can wait for GO', () => {
  const s = quietBattle(7);
  const v = tankOf(s);
  assert.ok(cmd(s, 'vmove', { x: 700, y: 300, wait: true }).ok);
  assert.ok(v.pending);
  assert.notEqual(v.order.type, 'move');
  assert.ok(cmd(s, 'go').ok);
  assert.equal(v.order.type, 'move');
  assert.equal(v.pending, null);
});

test('an escorting tank follows its platoon from behind', () => {
  const s = quietBattle(7);
  const v = tankOf(s);
  const pl = s.platoons.find((p) => p.side === 0 && p.index === 1);
  assert.ok(cmd(s, 'vescort', { platoon: pl.id }).ok);
  assert.ok(cmd(s, 'move', { platoon: pl.id, x: 800, y: 300 }).ok);
  run(s, 30 * 35);
  const ms = pl.squads.flatMap((id) => squadSoldiers(s, id)).filter((m) => m.alive);
  const cx = ms.reduce((a, m) => a + m.x, 0) / ms.length, cy = ms.reduce((a, m) => a + m.y, 0) / ms.length;
  assert.equal(v.order.type, 'escort');
  assert.ok(Math.hypot(v.x - cx, v.y - cy) < 200, 'kept close to the platoon');
  assert.ok(v.x < cx, 'stayed behind it');
});

test('hull down stops the tank and soaks up hits from the front only', () => {
  const s = quietBattle(7);
  const v = tankOf(s);
  assert.ok(cmd(s, 'vmove', { x: 700, y: v.y }).ok);
  assert.ok(cmd(s, 'vability', { kind: 'hulldown' }).ok);
  assert.ok(v.hullDown);
  const x0 = v.x;
  run(s, 60);
  assert.ok(Math.abs(v.x - x0) < 1, 'does not drive while dug in');
  v.facing = 1;
  const hp = v.hp;
  damageVehicle(s, v, 100, 'shell', { x: v.x + 300, y: v.y });
  const front = hp - v.hp;
  damageVehicle(s, v, 100, 'shell', { x: v.x - 300, y: v.y });
  const rear = hp - front - v.hp;
  assert.ok(front < rear * 0.5, `front ${front} vs rear ${rear}`);
  // A move order brings it out.
  assert.ok(cmd(s, 'vmove', { x: 300, y: 300 }).ok);
  assert.equal(v.hullDown, false);
});

test('smoke launchers drop a screen on the tank and then recharge', () => {
  const s = quietBattle(7);
  const v = tankOf(s);
  const n = s.smokes.length;
  assert.ok(cmd(s, 'vability', { kind: 'smoke' }).ok);
  assert.equal(s.smokes.length, n + 1);
  assert.ok(Math.hypot(s.smokes.at(-1).x - v.x, s.smokes.at(-1).y - v.y) < 1);
  assert.equal(cmd(s, 'vability', { kind: 'smoke' }).ok, false, 'not ready again straight away');
});
