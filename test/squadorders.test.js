import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../src/sim/commands.js';
import { quietBattle, run, squadSoldiers } from './helpers.js';

const cmd = (s, type, params) => applyCommand(s, { tick: s.tick, side: 0, type, params });
const centre = (s, sq) => {
  const ms = squadSoldiers(s, sq.id).filter((m) => m.alive);
  return { x: ms.reduce((a, m) => a + m.x, 0) / ms.length, y: ms.reduce((a, m) => a + m.y, 0) / ms.length };
};

function setup() {
  const s = quietBattle(7);
  const pl = s.platoons.find((p) => p.side === 0 && p.index === 0);
  const sqs = pl.squads.map((id) => s.squads[id]);
  return { s, pl, sqs };
}

test('a squad can be sent on its own while the platoon keeps its shared goal', () => {
  const { s, pl, sqs } = setup();
  const [a, b] = sqs;
  const start = centre(s, a);
  assert.ok(cmd(s, 'move', { platoon: pl.id, x: start.x + 200, y: start.y }).ok);
  const op = s.sides[0].op;
  const to = { x: Math.round(start.x + 60), y: Math.round(start.y - 160) };
  assert.ok(cmd(s, 'squad', { platoon: pl.id, role: b.role, what: 'move', ...to }).ok);
  assert.equal(s.sides[0].op, op - s.cfg.orders.cost.squad, 'a squad order costs a point');
  assert.equal(b.order.type, 'move');
  assert.equal(a.order, null, 'the others still follow the platoon');
  run(s, 30 * 12);
  const cb = centre(s, b);
  assert.ok(Math.hypot(cb.x - to.x, cb.y - to.y) < 60, `detached squad near its own goal (${Math.round(cb.x)},${Math.round(cb.y)})`);
});

test('a new platoon order brings every squad back to the shared goal', () => {
  const { s, pl, sqs } = setup();
  const c = centre(s, sqs[1]);
  assert.ok(cmd(s, 'squad', { platoon: pl.id, role: sqs[1].role, what: 'hold' }).ok);
  assert.equal(sqs[1].order.type, 'hold');
  run(s, 30 * 6); // past the free change window
  assert.ok(cmd(s, 'move', { platoon: pl.id, x: Math.round(c.x + 150), y: Math.round(c.y) }).ok);
  assert.ok(sqs.every((q) => q.order === null));
});

test('rejoin is free and only works on a squad that is away from its platoon', () => {
  const { s, pl, sqs } = setup();
  assert.equal(cmd(s, 'squad', { platoon: pl.id, role: sqs[0].role, what: 'rejoin' }).ok, false);
  assert.ok(cmd(s, 'squad', { platoon: pl.id, role: sqs[0].role, what: 'hold' }).ok);
  const op = s.sides[0].op;
  assert.ok(cmd(s, 'squad', { platoon: pl.id, role: sqs[0].role, what: 'rejoin' }).ok);
  assert.equal(s.sides[0].op, op);
  assert.equal(sqs[0].order, null);
});

test('a squad order can be changed free for a few seconds', () => {
  const { s, pl, sqs } = setup();
  const c = centre(s, sqs[2]);
  assert.ok(cmd(s, 'squad', { platoon: pl.id, role: sqs[2].role, what: 'move', x: Math.round(c.x + 80), y: Math.round(c.y) }).ok);
  const op = s.sides[0].op;
  assert.ok(cmd(s, 'squad', { platoon: pl.id, role: sqs[2].role, what: 'move', x: Math.round(c.x + 100), y: Math.round(c.y) }).ok);
  assert.equal(s.sides[0].op, op);
});
