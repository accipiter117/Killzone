// Fire and manoeuvre: squads face their threat, cover only works that way,
// and fire from the side or rear gets round it, hits harder and pins faster.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aspectOf, hitChance } from '../src/sim/combat.js';
import { thinkSquad } from '../src/sim/squads.js';
import { quietBattle, place, squadSoldiers } from './helpers.js';
import { T, forCells } from '../src/sim/map.js';
import { updateVision } from '../src/sim/combat.js';

function setup() {
  const s = quietBattle(7);
  const sq = s.squads.find((q) => q.side === 1);
  place(s, sq.id, 1500, 500);
  sq.face = { x: -1, y: 0 }; // facing the ISA side (west)
  const target = squadSoldiers(s, sq.id)[0];
  return { s, sq, target };
}

test('a shot from in front, the side or behind is told apart', () => {
  const { s, target } = setup();
  assert.equal(aspectOf(s, { x: 1200, y: 500 }, target), 0, 'front');
  assert.equal(aspectOf(s, { x: 1500, y: 200 }, target), 1, 'side');
  assert.equal(aspectOf(s, { x: 1800, y: 500 }, target), 2, 'rear');
});

test('cover works from the front only', () => {
  const { s, target } = setup();
  // Put the target in a trench.
  forCells(s.map, target.x - 20, target.y - 20, target.x + 20, target.y + 20, (i) => { s.map.grid[i] = T.trench; });
  const front = hitChance(s, 0.5, 200, 260, target, false, { x: target.x - 200, y: target.y });
  const side = hitChance(s, 0.5, 200, 260, target, false, { x: target.x, y: target.y - 200 });
  const rear = hitChance(s, 0.5, 200, 260, target, false, { x: target.x + 200, y: target.y });
  assert.ok(front < side && side < rear, `front ${front.toFixed(3)} side ${side.toFixed(3)} rear ${rear.toFixed(3)}`);
});

test('squads turn towards a threat over a few seconds, but not while pinned', () => {
  const s = quietBattle(7);
  const sq = s.squads.find((q) => q.side === 0);
  const foe = s.squads.find((q) => q.side === 1);
  place(s, sq.id, 800, 500);
  place(s, foe.id, 800, 250); // to the north
  sq.face = { x: 1, y: 0 };
  for (const m of s.soldiers) if (m.squad !== sq.id && m.squad !== foe.id) m.fled = true;
  updateVision(s);
  thinkSquad(s, sq);
  assert.ok(sq.face.y < 0 && sq.face.y > -0.5, 'turning, not snapped round');
  for (let i = 0; i < 20; i++) thinkSquad(s, sq);
  assert.ok(sq.face.y < -0.9, 'now facing north');
  sq.face = { x: 1, y: 0 };
  sq.pinned = true;
  sq.supp = 100;
  thinkSquad(s, sq);
  assert.deepEqual(sq.face, { x: 1, y: 0 }, 'pinned squads cannot turn');
});
