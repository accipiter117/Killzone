import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, runToEnd } from '../src/sim/match.js';
import { createAI } from '../src/sim/ai.js';

test('every death has a cause, the strength history is kept, and feed messages carry a place', () => {
  const m = createMatch({ seed: 5, controllers: [createAI(0), createAI(1)] });
  const r = runToEnd(m);
  for (const side of [0, 1]) {
    const total = Object.values(r.lossBy[side]).reduce((a, n) => a + n, 0);
    assert.equal(total, r.casualties[side], `side ${side}: causes add up to the dead`);
    for (const k of Object.keys(r.lossBy[side])) assert.ok(m.state.cfg.causes[k], `cause ${k} has words for the player`);
  }
  assert.ok(r.history.length > 5);
  assert.ok(r.history.every((row) => row[1] <= 45 && row[2] <= 45));
  const wiped = m.state.feed.filter((f) => /wiped out/.test(f.text));
  assert.ok(wiped.length > 0 && wiped.every((f) => /mostly by/.test(f.text) && f.x !== null));
});
