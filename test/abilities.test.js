import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../src/sim/commands.js';
import { step } from '../src/sim/battle.js';
import { updateVision, hitChance } from '../src/sim/combat.js';
import { T } from '../src/sim/map.js';
import { quietBattle, run, squadSoldiers, place } from './helpers.js';

// Put ISA platoon 0's squad of `role` and one Helghast squad on open flat
// ground a set distance apart, facing each other.
function setup(role, gap) {
  const s = quietBattle(7);
  const pl = s.platoons.find((p) => p.side === 0 && p.squads.some((id) => s.squads[id].role === role));
  const sq = pl.squads.map((id) => s.squads[id]).find((q) => q.role === role);
  const foe = s.squads.find((q) => q.side === 1);
  // A quiet strip of the ISA rear: flat, open, no wire.
  place(s, sq.id, 120, 300);
  place(s, foe.id, 120 + gap, 300);
  updateVision(s);
  return { s, pl, sq, foe };
}
const use = (s, pl, role) => applyCommand(s, { tick: s.tick, side: 0, type: 'ability', params: { platoon: pl.id, role } });

test('grenade lands after its fuse and hurts the target squad; cooldown applies', () => {
  const { s, pl, sq, foe } = setup('rifle', 150);
  assert.ok(use(s, pl, 'rifle').ok);
  assert.equal(use(s, pl, 'rifle').ok, false, 'cooling down');
  const before = squadSoldiers(s, foe.id).reduce((a, m) => a + m.hp, 0);
  // Keep everyone still and quiet while the grenade flies.
  for (let i = 0; i < 45; i++) { for (const m of s.soldiers) m.cd = 99; step(s); }
  const after = squadSoldiers(s, foe.id).reduce((a, m) => a + m.hp, 0);
  assert.ok(after < before, 'the blast should have hurt them');
  run(s, 30 * s.cfg.abilities.grenade.cooldownSec);
  assert.ok(s.tick >= sq.abilityReady);
});

test('abilities that need a target are refused without one', () => {
  const { s, pl } = setup('rifle', 600);
  const r = use(s, pl, 'rifle');
  assert.equal(r.ok, false);
  assert.match(r.reason, /range/);
});

test('sandbags build cover in front of the engineers', () => {
  const { s, pl } = setup('engineer', 300);
  const before = s.map.grid.filter((t) => t === T.sandbag).length;
  assert.ok(use(s, pl, 'engineer').ok);
  const after = s.map.grid.filter((t) => t === T.sandbag).length;
  assert.ok(after - before >= 4, `built ${after - before} cells`);
});

test('mark reveals enemies and makes them easier to hit', () => {
  const { s, pl, foe } = setup('recon', 300);
  assert.ok(use(s, pl, 'recon').ok);
  const t = squadSoldiers(s, foe.id)[0];
  assert.ok(t.markUntil > s.tick);
  const marked = hitChance(s, 0.5, 100, 260, t, false);
  t.markUntil = 0;
  const plain = hitChance(s, 0.5, 100, 260, t, false);
  assert.ok(marked > plain * 1.3);
});

test('charge shakes off suppression and closes the distance fast', () => {
  const { s, pl, sq, foe } = setup('assault', 220);
  sq.supp = 100; sq.pinned = true;
  assert.ok(use(s, pl, 'assault').ok);
  assert.equal(sq.pinned, false);
  const start = squadSoldiers(s, sq.id)[0].x;
  for (let i = 0; i < 30; i++) { for (const m of s.soldiers) m.cd = 99; step(s); }
  const moved = squadSoldiers(s, sq.id)[0].x - start;
  assert.ok(moved > s.cfg.roles.assault.speed * 1.5, `moved ${moved}`);
  assert.equal(sq.status, 'Charging!');
});

test('barrage fires much faster', () => {
  const count = (barrage) => {
    const { s, pl } = setup('heavy', 250);
    if (barrage) assert.ok(use(s, pl, 'heavy').ok);
    let shots = 0;
    for (let i = 0; i < 90; i++) { step(s); shots += s.events.filter((e) => e.type === 'shot' && e.side === 0).length; }
    return shots;
  };
  const plain = count(false), fast = count(true);
  assert.ok(fast > plain * 1.6, `${fast} vs ${plain}`);
});
