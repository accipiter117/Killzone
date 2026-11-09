// Downed soldiers, medics and stance-dependent pinned behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../src/sim/commands.js';
import { damageSoldier } from '../src/sim/combat.js';
import { thinkSquad } from '../src/sim/squads.js';
import { quietBattle, run, place, squadSoldiers } from './helpers.js';

const cmd = (s, type, params = {}) => applyCommand(s, { tick: s.tick, side: 0, type, params });
const holdFire = (s) => { for (const m of s.soldiers) m.cd = 99; };

test('every squad has one medic', () => {
  const s = quietBattle(7);
  for (const sq of s.squads) assert.equal(squadSoldiers(s, sq.id).filter((m) => m.medic).length, 1);
});

test('bullets leave a soldier downed; shells and blasts kill outright', () => {
  const s = quietBattle(7);
  const [a, b] = squadSoldiers(s, s.squads[0].id).slice(1);
  damageSoldier(s, a, 999, 'rifle');
  damageSoldier(s, b, 999, 'artillery');
  assert.equal(a.downed, true);
  assert.equal(b.downed, false);
  assert.equal(a.alive, false);
});

test('a medic gets a downed squad mate back up', () => {
  const s = quietBattle(7);
  const sq = s.squads[0];
  place(s, sq.id, 300, 300);
  const [medic, hurt] = [squadSoldiers(s, sq.id).find((m) => m.medic), squadSoldiers(s, sq.id).find((m) => !m.medic)];
  hurt.x = 360; hurt.y = 320;
  const cas = s.sides[0].casualties;
  damageSoldier(s, hurt, 999, 'rifle');
  assert.equal(s.sides[0].casualties, cas + 1);
  for (let i = 0; i < 30 * 10 && !hurt.alive; i++) { holdFire(s); run(s, 1); }
  assert.equal(hurt.alive, true, 'revived');
  assert.ok(hurt.hp > 0 && hurt.hp < hurt.maxHp, 'on part of their health');
  assert.equal(s.sides[0].casualties, cas, 'no longer counted as lost');
  assert.equal(s.sides[0].revived, 1);
  void medic;
});

test('with no medic to reach them, the downed bleed out', () => {
  const s = quietBattle(7);
  const sq = s.squads[0];
  const ms = squadSoldiers(s, sq.id);
  for (const m of ms.filter((x) => x.medic)) damageSoldier(s, m, 999, 'grenade'); // medic killed outright
  // and every other medic in the platoon is far away
  const pl = s.platoons[sq.platoon];
  for (const id of pl.squads) for (const m of squadSoldiers(s, id)) if (m.medic && m.alive) { m.x = 5; m.y = 5; m.tx = 5; m.ty = 5; }
  const hurt = ms.find((x) => !x.medic);
  hurt.x = 700; hurt.y = 300;
  damageSoldier(s, hurt, 999, 'rifle');
  for (let i = 0; i < 30 * 26; i++) { holdFire(s); for (const id of pl.squads) for (const m of squadSoldiers(s, id)) if (m.medic && m.alive) { m.x = 5; m.y = 5; } run(s, 1); }
  assert.equal(hurt.downed, false);
  assert.equal(hurt.alive, false, 'bled out');
});

function pinnedNearPost(stance, gap) {
  const s = quietBattle(7);
  const pl = s.platoons.find((p) => p.side === 0 && p.index === 0);
  const site = s.sites.find((x) => x.kind !== 'objective' && x.owner !== 0) || s.sites[0];
  cmd(s, 'stance', { platoon: pl.id, stance });
  cmd(s, 'take', { platoon: pl.id, site: site.id });
  const sq = s.squads[pl.squads[0]];
  place(s, sq.id, site.x - site.r - gap, site.y);
  sq.supp = 100; sq.pinned = true;
  thinkSquad(s, sq);
  return sq;
}

test('stance sets how far out a pinned squad will crawl onto its post', () => {
  assert.notEqual(pinnedNearPost('aggressive', 180).mode, 'pinned', 'aggressive crawls in from further out');
  assert.equal(pinnedNearPost('balanced', 180).status.includes('onto'), false);
  assert.equal(pinnedNearPost('cautious', 90).status.includes('onto'), false, 'cautious will not crawl in from there');
});

test('aggressive squads get up from being pinned sooner than cautious ones', () => {
  const st = quietBattle(7).cfg.stances;
  const getUp = (k) => st[k].pinMult * st[k].unpinShare;
  assert.ok(getUp('aggressive') > getUp('balanced') && getUp('balanced') > getUp('cautious'));
});
