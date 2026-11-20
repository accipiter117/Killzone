// Replay codes: a finished battle packed into text and back, replaying to
// exactly the same result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, runToEnd } from '../src/sim/match.js';
import { createAI } from '../src/sim/ai.js';
import { fingerprint } from '../src/sim/battle.js';
import { encodeReplay, decodeReplay } from '../src/ui/replay-code.js';
import { MIRROR } from './helpers.js';

test('a battle packed into a replay code replays to the same result', async () => {
  const m = createMatch({ seed: 9, options: { config: MIRROR }, controllers: [createAI(0), createAI(1)] });
  runToEnd(m, 30 * 120);
  const print = fingerprint(m.state);
  const code = await encodeReplay(m.log, print);
  assert.match(code, /^KZR[01]\.[A-Za-z0-9_-]+$/, 'URL-safe');
  assert.ok(code.length < JSON.stringify(m.log).length / 2, `short: ${code.length} characters`);
  const back = await decodeReplay(`https://example.org/Killzone/?replay=${code}`);
  assert.equal(back.print, print);
  const r = createMatch({ seed: back.log.seed, options: back.log.options, replayLog: back.log });
  runToEnd(r, 30 * 120);
  assert.equal(fingerprint(r.state), print, 'identical replay');
});

test('a mangled code is refused with a plain reason', async () => {
  await assert.rejects(decodeReplay('hello'), /replay code/);
});
