import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCampaignMatch, replayCampaign, aiRound } from '../src/campaign/match.js';
import { applyCampaignCommand } from '../src/campaign/commands.js';
import { refreshSupply, incomeFor, capitalOf, sectorOwner, connectedCells } from '../src/campaign/state.js';

// Short battles keep the AI campaign tests quick.
const FAST = { battle: { durationSec: 45 } };

test('campaign map: mirrored ground, sectors and sites', () => {
  const s = createCampaignMatch('mirror').state;
  const n = s.owner.length;
  for (let i = 0; i < n; i++) assert.equal(s.owner[i], 1 - s.owner[n - 1 - i]);
  const half = s.sectors.length / 2;
  for (let i = 0; i < n; i++) assert.equal(s.sector[n - 1 - i], (s.sector[i] + half) % s.sectors.length);
  assert.equal(s.sites.length % 2, 0);
  for (const site of s.sites) assert.equal(s.owner[site.cell], site.home, 'each side starts holding its own sites');
  assert.equal(s.platoons.filter((p) => p.side === 0).length, 6);
});

test('same seed + same campaign command log gives the same campaign', () => {
  const cm = createCampaignMatch('det', { nights: 1, config: FAST });
  aiRound(cm);
  aiRound(cm);
  const again = replayCampaign('det', { nights: 1, config: FAST }, JSON.parse(JSON.stringify(cm.log)));
  assert.equal(JSON.stringify(again.state), JSON.stringify(cm.state));
});

// Cut a sector off: give the enemy a ring of cells all round it.
function cutOff(s, sectorId, side) {
  const { cols } = s;
  for (let i = 0; i < s.owner.length; i++) {
    if (s.sector[i] !== sectorId) continue;
    for (const j of [i - 1, i + 1, i - cols, i + cols]) if (j >= 0 && j < s.owner.length && s.sector[j] !== sectorId) s.owner[j] = 1 - side;
  }
  refreshSupply(s);
}

test('supply: a cut off platoon cannot refill; a cut off site pays nothing', () => {
  const s = createCampaignMatch('supply').state;
  const pl = s.platoons.find((p) => p.side === 0);
  pl.alive = [2, 5, 5];
  cutOff(s, pl.sector, 0);
  assert.ok(pl.cut);
  const r = applyCampaignCommand(s, { side: 0, type: 'refill', params: { platoon: pl.id } });
  assert.equal(r.ok, false);
  const site = s.sites.find((x) => x.home === 0 && x.kind === 'factory' && x.defence === 2);
  const before = incomeFor(s, 0).materiel;
  cutOff(s, site.sector, 0);
  assert.equal(site.connected, false);
  assert.ok(incomeFor(s, 0).materiel < before);
  assert.equal(connectedCells(s, 0)[site.cell], 0);
});

// A hand made battle at a site's sector, won by `winner` with `margin`.
function fight(s, sector, attacker, winner, margin) {
  s.phase = 'battles';
  s.battles = [{ id: 't', sector, sectorName: 'test', attacker, meeting: false, forces: [{ platoons: [] }, { platoons: [] }], result: null }];
  s.battles[0].id = `t-${s.history.length}`;
  return applyCampaignCommand(s, { side: attacker, type: 'battleResult', params: { battle: s.battles[0].id, result: { winner, margin, platoons: [], log: [] } } });
}

test('site defence counts down with each defeat and the site only falls at zero', () => {
  const s = createCampaignMatch('defence', { config: FAST }).state;
  const site = s.sites.find((x) => x.home === 0 && x.kind === 'city' && x.defence === 2);
  // The Helghast already hold the ground round the city.
  for (let i = 0; i < s.owner.length; i++) if (s.sector[i] === site.sector && i !== site.cell) s.owner[i] = 1;
  for (let k = 0; k < 3; k++) {
    assert.ok(fight(s, site.sector, 1, 1, 'crushing').ok);
    if (k < 2) assert.equal(s.owner[site.cell], 0, `still held after ${k + 1} defeats`);
  }
  assert.equal(site.defence, 0);
  assert.equal(s.owner[site.cell], 1, 'falls once its defences are gone');
});

test('the front moves further for bigger margins', () => {
  const gained = {};
  for (const margin of ['narrow', 'clear', 'crushing']) {
    const s = createCampaignMatch('push', { config: FAST }).state;
    const target = s.sectors.find((x) => x.half === 1 && sectorOwner(s, x.id) === 1 && x.neighbours.some((nb) => s.sectors[nb].half === 0) && !s.sites.some((st) => st.sector === x.id));
    const count = () => s.owner.filter((o) => o === 0).length;
    const before = count();
    fight(s, target.id, 0, 0, margin);
    gained[margin] = count() - before;
  }
  assert.ok(gained.narrow > 0 && gained.clear > gained.narrow && gained.crushing > gained.clear, JSON.stringify(gained));
});

test('an AI against AI campaign runs to a winner within the night limit', () => {
  const cm = createCampaignMatch('war', { nights: 1, config: FAST });
  let guard = 0;
  while (cm.state.phase !== 'over' && guard++ < 10) aiRound(cm);
  assert.equal(cm.state.phase, 'over');
  assert.ok(cm.state.winner === 0 || cm.state.winner === 1);
  assert.ok(cm.state.night <= 2);
  assert.ok(capitalOf(cm.state, 0));
});
