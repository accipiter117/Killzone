// Squads that get pinned are not stuck for good: they crawl onto the post
// they are taking or into cover, their platoon mates come up to help, MG
// nests can be silenced, Vanish shakes off pinning, and engineers can
// patch up their own tank.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../src/sim/commands.js';
import { step } from '../src/sim/battle.js';
import { thinkSquad } from '../src/sim/squads.js';
import { updateEmplacements, blast } from '../src/sim/features.js';
import { updateVision } from '../src/sim/combat.js';
import { updateVehicleVision } from '../src/sim/vehicles.js';
import { quietBattle, run, place, squadSoldiers } from './helpers.js';

const cmd = (s, type, params = {}) => applyCommand(s, { tick: s.tick, side: 0, type, params });
const pin = (sq, s) => { sq.supp = 100; sq.pinned = true; sq.hitFrom = { x: 900, y: 300, tick: s.tick }; };
const squadOf = (s, pl, role) => pl.squads.map((id) => s.squads[id]).find((q) => q.role === role);
const centre = (s, sq) => {
  const ms = squadSoldiers(s, sq.id).filter((m) => m.alive);
  return { x: ms.reduce((a, m) => a + m.x, 0) / ms.length, y: ms.reduce((a, m) => a + m.y, 0) / ms.length };
};

test('a pinned squad at the edge of the post it is taking crawls onto it', () => {
  const s = quietBattle(7);
  const pl = s.platoons.find((p) => p.side === 0 && p.index === 0);
  const site = s.sites.find((x) => x.kind !== 'objective' && x.owner !== 0) || s.sites[0];
  assert.ok(cmd(s, 'take', { platoon: pl.id, site: site.id }).ok);
  const sq = s.squads[pl.squads[0]];
  place(s, sq.id, site.x - site.r - 40, site.y);
  pin(sq, s);
  thinkSquad(s, sq);
  assert.equal(sq.mode, 'crawl');
  assert.match(sq.status, /crawling onto/);
  const before = Math.hypot(centre(s, sq).x - site.x, centre(s, sq).y - site.y);
  for (let i = 0; i < 30 * 4; i++) { sq.supp = 100; sq.pinned = true; step(s); }
  const after = Math.hypot(centre(s, sq).x - site.x, centre(s, sq).y - site.y);
  assert.ok(after < before - 20, `crawled in: ${before.toFixed(0)} to ${after.toFixed(0)}`);
});

test('platoon mates move up to help a pinned squad', () => {
  const s = quietBattle(7);
  const pl = s.platoons.find((p) => p.side === 0 && p.index === 0);
  assert.ok(cmd(s, 'move', { platoon: pl.id, x: 600, y: 300 }).ok);
  const [a, b] = pl.squads.map((id) => s.squads[id]);
  place(s, a.id, 450, 300);
  place(s, b.id, 200, 300);
  pin(a, s);
  a.hitFrom = { x: 760, y: 300, tick: s.tick };
  thinkSquad(s, b);
  assert.match(b.status, /help/);
  assert.ok(b.lastGoal.x > 300, 'heading towards the shooter');
});

test('fire and blasts on an MG nest slow it and can silence it', () => {
  const s = quietBattle(7);
  const nest = s.sites.find((x) => x.kind === 'mg');
  assert.ok(nest, 'this map has an MG nest');
  nest.owner = 1;
  blast(s, nest.x, nest.y, 40, 0, 0, 0, 'blast');
  blast(s, nest.x, nest.y, 40, 0, 0, 0, 'blast');
  updateEmplacements(s, 1 / 30);
  assert.ok(nest.silenced, `silenced at ${nest.supp.toFixed(0)}`);
  // It recovers once left alone.
  for (let i = 0; i < 30 * 6; i++) updateEmplacements(s, 1 / 30);
  assert.equal(nest.silenced, false);
});

test('Vanish shakes off being pinned', () => {
  const s = quietBattle(7);
  const pl = s.platoons.find((p) => p.side === 0 && p.squads.some((id) => s.squads[id].role === 'infiltrator'));
  const sq = squadOf(s, pl, 'infiltrator');
  pin(sq, s);
  // Vanish needs an enemy in sight: put one close by.
  const foe = s.soldiers.find((m) => m.side === 1);
  const c = centre(s, sq);
  foe.x = c.x + 150; foe.y = c.y;
  updateVision(s); updateVehicleVision(s);
  assert.ok(cmd(s, 'ability', { platoon: pl.id, role: 'infiltrator' }).ok);
  assert.equal(sq.pinned, false);
  assert.ok(sq.supp < s.cfg.suppression.pinAt * s.cfg.suppression.unpinShare);
});

test('engineers repair their own damaged tank', () => {
  const s = quietBattle(7);
  const v = s.vehicles[0];
  v.x = 300; v.y = 300;
  v.hp = v.maxHp * 0.4;
  const pl = s.platoons.find((p) => p.side === 0 && p.squads.some((id) => s.squads[id].role === 'engineer'));
  const sq = squadOf(s, pl, 'engineer');
  place(s, sq.id, 180, 300);
  updateVision(s); updateVehicleVision(s);
  assert.ok(cmd(s, 'ability', { platoon: pl.id, role: 'engineer' }).ok);
  assert.equal(sq.abilityUsed, 'repair');
  const hp0 = v.hp;
  run(s, 30 * 10);
  assert.ok(v.hp >= hp0 + v.maxHp * s.cfg.repair.heal * 0.99, `repaired from ${hp0} to ${v.hp}`);
  // A healthy tank gets no repair: the ability is sandbags again.
  v.hp = v.maxHp;
  assert.notEqual(s.squads[sq.id].abilityUsed === 'repair' && sq.repairUntil > s.tick, true);
});
