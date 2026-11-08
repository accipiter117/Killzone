import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, runToEnd } from '../src/sim/match.js';
import { createAI } from '../src/sim/ai.js';

// A blunt player strategy: everything at B, aggressive, every ability as
// soon as it is ready. The AI used to lose to this three times in four.
const rush = (side) => ({
  side,
  due: (s) => s.tick % 60 === 0,
  think(s) {
    const out = [];
    for (const pl of s.platoons.filter((p) => p.side === side && !p.broken)) {
      if (!(pl.order.type === 'take' && pl.order.siteId === 'B')) out.push({ side, type: 'take', params: { platoon: pl.id, site: 'B' } });
      if (pl.stance !== 'aggressive') out.push({ side, type: 'stance', params: { platoon: pl.id, stance: 'aggressive' } });
      for (const id of pl.squads) if (s.tick >= s.squads[id].abilityReady) out.push({ side, type: 'ability', params: { platoon: pl.id, role: s.squads[id].role } });
    }
    return out;
  },
});

test('the AI holds its own against an all-in rush on B', () => {
  let aiWins = 0, games = 0;
  for (const seed of [1, 2, 3]) {
    for (const rusher of [0, 1]) {
      const r = runToEnd(createMatch({ seed, controllers: [rush(rusher), createAI(1 - rusher)] }));
      games++;
      if (r.winner === 1 - rusher) aiWins++;
    }
  }
  assert.ok(aiWins >= games / 2, `AI won only ${aiWins} of ${games}`);
});

test('both AI controllers decide from the same moment (no second mover edge)', () => {
  // Mirrored AIs on a mirrored map: over a handful of seeds neither side
  // should win everything.
  const wins = [0, 0];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const r = runToEnd(createMatch({ seed, controllers: [createAI(0), createAI(1)] }));
    if (r.winner !== null) wins[r.winner]++;
  }
  assert.ok(wins[0] >= 1 && wins[1] >= 1, `wins ${wins}`);
});
