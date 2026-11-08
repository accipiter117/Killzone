import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../src/sim/commands.js';
import { step } from '../src/sim/battle.js';
import { updateVision } from '../src/sim/combat.js';
import { quietBattle, run, place } from './helpers.js';

const cmd = (s, type, params) => applyCommand(s, { tick: s.tick, side: 0, type, params });

// ISA 1st Platoon faces two Helghast squads; the far one is further away,
// so without focus fire it would be shot second.
function setup() {
  const s = quietBattle(7);
  const pl = s.platoons.find((p) => p.side === 0 && p.index === 0);
  pl.squads.forEach((id, k) => place(s, id, 150, 260 + k * 30));
  const foes = s.squads.filter((q) => q.side === 1);
  const [near, far] = [foes[0], foes[1]];
  place(s, near.id, 330, 290);
  place(s, far.id, 380, 330);
  updateVision(s);
  return { s, pl, near, far };
}

test('focus fire costs a point and turns the platoon on the chosen squad', () => {
  const { s, pl, far } = setup();
  const op = s.sides[0].op;
  assert.ok(cmd(s, 'focus', { platoon: pl.id, target: far.id }).ok);
  assert.equal(s.sides[0].op, op - s.cfg.orders.cost.focus);
  let atFar = 0, atOther = 0;
  for (let i = 0; i < 60; i++) {
    step(s);
    for (const e of s.events) {
      if (e.type !== 'shot' || e.side !== 0) continue;
      const t = s.soldiers.find((m) => m.side === 1 && Math.hypot(m.x - e.x2, m.y - e.y2) < 30);
      if (t && t.squad === far.id) atFar++; else if (t) atOther++;
    }
  }
  assert.ok(atFar > atOther, `shots at the focused squad ${atFar}, at others ${atOther}`);
});

test('focus fire is refused on a squad nobody can see, or on your own side', () => {
  const s = quietBattle(7);
  const pl = s.platoons.find((p) => p.side === 0);
  const hidden = s.squads.find((q) => q.side === 1);
  assert.equal(cmd(s, 'focus', { platoon: pl.id, target: hidden.id }).ok, false);
  assert.equal(cmd(s, 'focus', { platoon: pl.id, target: s.squads.find((q) => q.side === 0).id }).ok, false);
});

test('focus fire wears off after its time', () => {
  const { s, pl, far } = setup();
  assert.ok(cmd(s, 'focus', { platoon: pl.id, target: far.id }).ok);
  for (const m of s.soldiers) m.cd = 1e9; // nobody shoots, so the squad survives
  run(s, Math.round(s.cfg.focus.durationSec * s.cfg.tickRate) + 5);
  for (const m of s.soldiers) m.cd = 0;
  step(s);
  assert.equal(pl.focus, -1);
});
