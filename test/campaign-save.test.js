// Campaign saves: a save survives the round trip (plain and as a text
// code), plays on identically afterwards, and old or foreign saves are
// handled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCampaignMatch, aiRound } from '../src/campaign/match.js';
import { packSave, unpackSave, upgradeSave, exportCode, importCode } from '../src/campaign/save.js';

const quick = { turns: 3, config: { battle: { durationSec: 40 } } };

test('a saved campaign loads and plays on exactly as before', () => {
  const a = createCampaignMatch('save-1', quick);
  aiRound(a);
  const b = unpackSave(JSON.parse(JSON.stringify(packSave(a))));
  aiRound(a);
  aiRound(b);
  assert.equal(JSON.stringify(b.state), JSON.stringify(a.state));
});

test('a campaign code round-trips', async () => {
  const a = createCampaignMatch('save-2', quick);
  aiRound(a);
  const code = await exportCode(a);
  assert.match(code, /^KZ[01]\./);
  const b = await importCode(code);
  assert.equal(JSON.stringify(b.state), JSON.stringify(a.state));
  await assert.rejects(() => importCode('hello'), /campaign code/);
});

test('saves are versioned and checked', () => {
  const a = createCampaignMatch('save-3', quick);
  const data = JSON.parse(JSON.stringify(packSave(a)));
  delete data.state.reports;
  assert.deepEqual(upgradeSave(data).state.reports, [[]]);
  assert.throws(() => upgradeSave({ ...data, version: 1 }), /old war map/);
  assert.throws(() => upgradeSave({ kind: 'something else' }), /not a Front Line/);
  assert.throws(() => upgradeSave({ ...data, version: 999 }), /newer version/);
});
