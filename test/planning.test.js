// Planning and timing: routes with stops, orders held for the GO signal,
// setting up before the battle, and timed barrages kept secret until their
// warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../src/sim/commands.js';
import { step } from '../src/sim/battle.js';
import { quietBattle, squadSoldiers } from './helpers.js';

const cmd = (s, type, params = {}, side = 0) => applyCommand(s, { tick: s.tick, side, type, params });
const run = (s, n) => { for (let i = 0; i < n; i++) step(s); };
const centre = (s, pl) => {
  const ms = pl.squads.flatMap((id) => squadSoldiers(s, id)).filter((m) => m.alive && !m.fled);
  return { x: ms.reduce((a, m) => a + m.x, 0) / ms.length, y: ms.reduce((a, m) => a + m.y, 0) / ms.length };
};

test('a route takes the platoon through its stops in order', () => {
  const s = quietBattle(7);
  const pl = s.platoons.find((p) => p.side === 0 && p.index === 1);
  const c = centre(s, pl);
  const stop = { x: Math.round(c.x + 40), y: Math.round(c.y - 260) };
  assert.ok(cmd(s, 'move', { platoon: pl.id, x: Math.round(c.x + 300), y: Math.round(c.y), via: [stop] }).ok);
  assert.equal(pl.order.via.length, 1);
  let reached = false;
  for (let i = 0; i < 30 * 40 && pl.order.via.length; i++) { step(s); if (Math.hypot(centre(s, pl).x - stop.x, centre(s, pl).y - stop.y) < 130) reached = true; }
  assert.ok(reached, 'went by the stop');
  assert.equal(pl.order.via.length, 0, 'then on to the end');
});

test('orders held for the signal wait, then GO sends them all at once', () => {
  const s = quietBattle(7);
  const [a, b] = s.platoons.filter((p) => p.side === 0);
  assert.ok(cmd(s, 'move', { platoon: a.id, x: 900, y: 300, wait: true }).ok);
  assert.ok(cmd(s, 'move', { platoon: b.id, x: 900, y: 600, wait: true }).ok);
  assert.ok(a.pending && b.pending);
  assert.notEqual(a.order.type, 'move', 'not moving yet');
  assert.ok(cmd(s, 'go').ok);
  assert.equal(a.order.type, 'move');
  assert.equal(b.order.type, 'move');
  assert.equal(a.pending, null);
  assert.equal(cmd(s, 'go').ok, false, 'nothing left to send');
});

test('platoons can be set up in your own zone only before the battle starts', () => {
  const s = quietBattle(7);
  const pl = s.platoons.find((p) => p.side === 0);
  assert.equal(cmd(s, 'deploy', { platoon: pl.id, x: 1500, y: 500 }).ok, false, 'outside the zone');
  assert.ok(cmd(s, 'deploy', { platoon: pl.id, x: 450, y: 250 }).ok);
  const c = centre(s, pl);
  assert.ok(Math.hypot(c.x - 450, c.y - 250) < 30, 'moved there at once');
  run(s, 1);
  assert.equal(cmd(s, 'deploy', { platoon: pl.id, x: 300, y: 250 }).ok, false, 'not once it has started');
});

test('a timed barrage lands later and is a secret until its warning', () => {
  const s = quietBattle(7);
  assert.ok(cmd(s, 'artillery', { x: 1500, y: 500, delay: 10 }).ok);
  const st = s.strikes[0];
  const warn = s.cfg.artillery.warningSec;
  assert.equal(st.start, Math.round((10 + warn) * s.cfg.tickRate));
  assert.equal(st.announced, false);
  run(s, 30 * 5);
  assert.equal(st.announced, false, 'still secret');
  run(s, 30 * 6);
  assert.equal(st.announced, true, 'heard coming');
});
