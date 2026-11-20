// Aircraft call-ins: the gunship rakes a strip of ground, the dropship puts
// fresh soldiers down into the most depleted platoon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../src/sim/commands.js';
import { quietBattle, run, place, squadSoldiers } from './helpers.js';

const cmd = (s, side, type, params = {}) => applyCommand(s, { tick: s.tick, side, type, params });
// The old mirrored test map has no depots: give each side one at home.
function addDepots(s) {
  for (const side of [0, 1]) s.sites.push({ ...s.sites[0], id: `depot${side}`, kind: 'depot', name: 'test depot', x: side ? 2800 : 200, y: 550, owner: side, cap: 0, capSide: null });
}
function ready(s) {
  addDepots(s);
  run(s, 30);
  s.sides[0].op = 6;
}

test('a gunship rakes the strip it is sent along: enemy there are hit and pinned', () => {
  const s = quietBattle(3);
  ready(s);
  const foe = s.squads.find((q) => q.side === 1);
  place(s, foe.id, 1500, 550);
  const hp0 = squadSoldiers(s, foe.id).reduce((a, m) => a + m.hp, 0);
  assert.ok(cmd(s, 0, 'callin', { what: 'gunship', x: 1500, y: 550 }).ok);
  assert.equal(s.aircraft.length, 1);
  assert.ok(!cmd(s, 0, 'callin', { what: 'gunship', x: 1500, y: 550 }).ok, 'one gunship out at a time');
  for (let i = 0; i < 30 * 12 && s.aircraft.length; i++) { place(s, foe.id, 1500, 550); run(s, 1); }
  assert.equal(s.aircraft.length, 0, 'it flies off');
  const hp1 = squadSoldiers(s, foe.id).reduce((a, m) => a + Math.max(0, m.hp), 0);
  assert.ok(hp1 < hp0 * 0.8, `hurt them: ${hp0} to ${hp1}`);
  assert.ok(foe.tally.gunship > 0, 'and pinned them');
});

test('a dropship lands fresh soldiers for the most depleted platoon', () => {
  const s = quietBattle(4);
  ready(s);
  const pl = s.platoons.find((p) => p.side === 0 && p.index === 1);
  const sq = s.squads[pl.squads[0]];
  for (const m of squadSoldiers(s, sq.id)) { m.alive = false; m.fled = true; m.hp = 0; }
  sq.mode = 'dead';
  assert.ok(cmd(s, 0, 'callin', { what: 'dropship', x: 600, y: 500 }).ok);
  run(s, 30 * 20);
  const back = squadSoldiers(s, sq.id).filter((m) => m.alive);
  assert.equal(back.length, 5, 'the whole squad is back');
  assert.notEqual(sq.mode, 'dead');
});

test('aircraft need a depot, and the dropship needs someone to reinforce', () => {
  const s = quietBattle(5);
  addDepots(s);
  run(s, 30);
  for (const site of s.sites) if (site.kind === 'depot') site.owner = null;
  s.sides[0].op = 6;
  assert.match(cmd(s, 0, 'callin', { what: 'gunship', x: 1500, y: 550 }).reason, /depot/);
  for (const site of s.sites) if (site.kind === 'depot') site.owner = 0;
  assert.match(cmd(s, 0, 'callin', { what: 'dropship', x: 600, y: 500 }).reason, /full strength/);
});
