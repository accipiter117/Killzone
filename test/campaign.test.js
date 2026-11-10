// The war map campaign: a mirrored board, orders and their rules, battles
// that flip provinces and push armies back, supply, and AI wars that end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCampaignMatch, issueCampaign, aiRound, replayCampaign } from '../src/campaign/match.js';
import { armyAt, connected, incomeOf, oddsOf, ordersFor, capitalOf, soldiers } from '../src/campaign/state.js';

const quick = { config: { battle: { durationSec: 40 }, ceasefire: 0 } };
const cmd = (cm, side, type, params = {}) => issueCampaign(cm, { side, type, params });
// A battle result handed in directly, so rule tests do not run battles.
const fake = (rec, winner, survivors = 4) => ({ winner, margin: 'clear', reason: 'time', durationSec: 40, scores: [0, 0], casualties: [0, 0], platoons: rec.forces.flatMap((f) => f.platoons.map((p) => ({ ref: p.ref, broken: false, survivors: p.alive.map(() => survivors) }))), log: [] });

test('the board is mirrored: the Helghast half is the ISA half turned round', () => {
  const s = createCampaignMatch('mirror', quick).state;
  const n = s.provinces.length;
  for (const p of s.provinces) {
    const m = s.provinces[n - 1 - p.id];
    assert.equal(m.site, p.site);
    assert.equal(m.home, 1 - p.home);
    p.pts.forEach(([x, y], i) => {
      const [mx, my] = m.pts[(i + 4) % 8]; // turned round, its outline starts from the opposite corner
      assert.ok(Math.abs(mx - (s.width - x)) < 0.11 && Math.abs(my - (s.height - y)) < 0.11, 'mirrored outline');
    });
  }
  for (const a of s.armies.filter((x) => x.side === 0)) {
    const twin = s.armies.find((b) => b.side === 1 && b.at === n - 1 - a.at);
    assert.ok(twin && twin.platoons.length === a.platoons.length, 'mirrored armies');
  }
});

test('orders: march on your own ground, take empty enemy ground, one move a turn', () => {
  const cm = createCampaignMatch('orders', quick);
  const s = cm.state;
  const a = s.armies.find((x) => x.side === 0);
  const orders = ordersFor(s, a);
  assert.ok(orders.length > 0);
  const take = orders.find((o) => o.kind === 'take');
  assert.ok(take, 'an empty enemy province next door');
  assert.ok(cmd(cm, 0, 'attack', { army: a.id, to: take.to }).ok);
  assert.equal(s.provinces[take.to].owner, 0);
  assert.equal(a.at, take.to);
  assert.equal(cmd(cm, 0, 'march', { army: a.id, to: s.provinces[take.to].neighbours[0] }).ok, false, 'already moved');
  assert.equal(cmd(cm, 1, 'march', { army: s.armies.find((x) => x.side === 1).id, to: 0 }).ok, false, 'not their turn');
});

test('an attack on an army starts a battle; winning takes the province and pushes the defenders back', () => {
  const cm = createCampaignMatch('battle', quick);
  const s = cm.state;
  const a = s.armies.find((x) => x.side === 0);
  const foe = s.armies.find((x) => x.side === 1);
  // Put the enemy army on a province next to ours.
  const target = s.provinces[a.at].neighbours.find((n) => s.provinces[n].owner === 1);
  foe.at = target;
  assert.ok(oddsOf(s, a, target) > 0 && oddsOf(s, a, target) < 1);
  assert.ok(cmd(cm, 0, 'attack', { army: a.id, to: target }).ok);
  assert.equal(s.phase, 'battle');
  assert.equal(cmd(cm, 0, 'march', { army: s.armies[1].id, to: 0 }).ok, false, 'nothing else while a battle is on');
  const rec = s.battle;
  assert.ok(cmd(cm, 0, 'battleResult', { battle: rec.id, result: fake(rec, 0) }).ok);
  assert.equal(s.provinces[target].owner, 0);
  assert.equal(a.at, target);
  assert.notEqual(foe.at, target, 'the beaten army fell back');
  assert.equal(soldiers(a), a.platoons.length * 12, 'survivors carried back');
});

test('supply comes only from provinces joined to the capital; cut-off armies wither', () => {
  const cm = createCampaignMatch('supply', quick);
  const s = cm.state;
  const before = incomeOf(s, 0);
  // Cut a province off: everything round it goes to the enemy.
  const far = s.provinces.find((p) => p.owner === 0 && p.site !== 'capital' && p.neighbours.length === 2);
  for (const n of far.neighbours) s.provinces[n].owner = 1;
  assert.ok(!connected(s, 0).has(far.id));
  assert.ok(incomeOf(s, 0) < before);
  const a = s.armies.find((x) => x.side === 0);
  a.at = far.id;
  const n0 = soldiers(a);
  cmd(cm, 0, 'endTurn');
  cmd(cm, 1, 'endTurn');
  assert.ok(soldiers(a) < n0, 'lost soldiers while cut off');
  assert.equal(cmd(cm, 0, 'refill', { army: a.id }).ok, false, 'no refills while cut off');
});

test('taking the enemy capital wins the war', () => {
  const cm = createCampaignMatch('capital', quick);
  const s = cm.state;
  const cap = capitalOf(s, 1);
  const a = s.armies.find((x) => x.side === 0);
  for (const b of s.armies.filter((x) => x.side === 1)) b.at = s.provinces.find((p) => p.owner === 1 && p.id !== cap.id && !armyAt(s, p.id)).id;
  s.armies = s.armies.filter((x) => x.side === 0 || x.at !== cap.id);
  a.at = cap.neighbours.find((n) => !armyAt(s, n) || armyAt(s, n) === a);
  s.provinces[a.at].owner = 0;
  if (armyAt(s, cap.id)) armyAt(s, cap.id).at = -1;
  assert.ok(cmd(cm, 0, 'attack', { army: a.id, to: cap.id }).ok);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 0);
});

test('the same seed and orders give the same war (replay from the log)', () => {
  const cm = createCampaignMatch('determinism', { turns: 3, ...quick });
  for (let i = 0; i < 3 && cm.state.phase !== 'over'; i++) aiRound(cm);
  const again = replayCampaign('determinism', { turns: 3, ...quick }, cm.log);
  assert.equal(JSON.stringify(again.state), JSON.stringify(cm.state));
});

test('no attacks during the opening ceasefire', () => {
  const cm = createCampaignMatch('ceasefire', { config: { battle: { durationSec: 40 } } });
  const s = cm.state;
  const a = s.armies.find((x) => x.side === 0);
  assert.ok(ordersFor(s, a).every((o) => o.kind === 'march'));
  const enemy = s.provinces[a.at].neighbours.find((n) => s.provinces[n].owner === 1);
  assert.match(cmd(cm, 0, 'attack', { army: a.id, to: enemy }).reason, /Ceasefire/);
});

test('an AI against AI war reaches a winner', () => {
  const cm = createCampaignMatch('ai-war', { turns: 8, ...quick });
  let guard = 0;
  while (cm.state.phase !== 'over' && guard++ < 20) aiRound(cm);
  assert.equal(cm.state.phase, 'over');
  assert.ok(cm.state.winner === 0 || cm.state.winner === 1);
  assert.ok(cm.state.history.length > 0, 'battles were fought');
});
