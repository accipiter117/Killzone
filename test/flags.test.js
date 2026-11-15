// Objective flags follow the capture: the holder's flag comes down over the
// first half of an enemy capture, then the taker's goes up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flagState } from '../src/render/renderer.js';

const site = (owner, capSide, cap) => ({ owner, capSide, cap });

test('an unheld objective has a bare pole until someone starts taking it', () => {
  assert.equal(flagState(site(null, null, 0)), null);
  assert.deepEqual(flagState(site(null, 1, 0.25)), { side: 1, h: 0.25 });
});

test('a held objective flies its flag at the top', () => {
  assert.deepEqual(flagState(site(0, null, 0)), { side: 0, h: 1 });
});

test('an enemy capture lowers the flag, then raises theirs', () => {
  assert.deepEqual(flagState(site(0, 1, 0.25)), { side: 0, h: 0.5 });
  assert.deepEqual(flagState(site(0, 1, 0.5)), { side: 1, h: 0 });
  assert.deepEqual(flagState(site(0, 1, 0.75)), { side: 1, h: 0.5 });
});
