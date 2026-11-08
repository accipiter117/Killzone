import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, runToEnd, issue, advance } from '../src/sim/match.js';
import { createAI } from '../src/sim/ai.js';
import { fingerprint } from '../src/sim/battle.js';

const aiMatch = (seed) => createMatch({ seed, controllers: [createAI(0), createAI(1)] });

test('same seed with the same AI gives an identical battle', () => {
  const a = aiMatch(7);
  const b = aiMatch(7);
  runToEnd(a);
  runToEnd(b);
  assert.equal(fingerprint(a.state), fingerprint(b.state));
});

test('seed + command log replays to an identical battle', () => {
  const original = aiMatch(21);
  runToEnd(original);
  assert.ok(original.log.commands.length > 5, 'the AI should have issued orders');
  const replay = createMatch({ seed: 21, replayLog: original.log });
  runToEnd(replay);
  assert.equal(fingerprint(replay.state), fingerprint(original.state));
  assert.deepEqual(replay.log.commands, original.log.commands);
});

test('a player command log (mixed with AI) also replays exactly', () => {
  const m = createMatch({ seed: 'Pyrrhus', controllers: [createAI(1)] });
  const plan = { 30: ['take', { platoon: 0, site: 'A' }], 300: ['move', { platoon: 1, x: 900, y: 600 }], 900: ['smoke', { x: 1100, y: 500 }], 1500: ['stance', { platoon: 2, stance: 'aggressive' }] };
  while (!m.state.result && m.state.tick < 4000) {
    const p = plan[m.state.tick];
    if (p) issue(m, 0, p[0], p[1]);
    advance(m);
  }
  const r = createMatch({ seed: 'Pyrrhus', replayLog: m.log });
  while (r.state.tick < m.state.tick) advance(r);
  assert.equal(fingerprint(r.state), fingerprint(m.state));
});

test('different seeds give different battles', () => {
  const a = aiMatch(1), b = aiMatch(2);
  for (let i = 0; i < 600; i++) { advance(a); advance(b); }
  assert.notEqual(fingerprint(a.state), fingerprint(b.state));
});
