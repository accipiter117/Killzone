// Turn-based battles, AI against AI: win rates by side and by who moves
// first, how battles end and how bloody they are. Each seed is played
// twice, once with each side moving first.
//
//   node tools/tb-balance.mjs [seeds] [map]
//   node tools/tb-balance.mjs 20 trenches

import { createBattle, step } from '../src/sim/battle.js';
import { createTactics, aiTurn } from '../src/tactics/tactics.js';
import { CONFIG } from '../src/config.js';

const seeds = Number(process.argv[2]) || 10;
const maps = process.argv[3] ? [process.argv[3]] : ['trenches', 'industrial', 'city'];
const t = { games: 0, side: [0, 0], first: 0, draws: 0, broken: 0, cas: 0, turns: 0 };
for (const type of maps) {
  for (let k = 1; k <= seeds; k++) {
    for (const first of [0, 1]) {
      const s = createBattle(`tb-${type}-${k}`, { config: { map: { type }, world: { ...CONFIG.mapSizes[type] } } });
      const tb = createTactics(s);
      tb.firstSide = first; tb.active = first;
      let g = 0;
      while (!s.result && g++ < 60) { aiTurn(s, tb.active); for (let i = 0; i < 20; i++) step(s); }
      const r = s.result;
      t.games++;
      if (r.winner === null) t.draws++; else { t.side[r.winner]++; if (r.winner === first) t.first++; }
      if (r.reason === 'broken') t.broken++;
      t.cas += r.casualties[0] + r.casualties[1];
      t.turns += Math.min(tb.turn, tb.c.turns);
    }
  }
}
const pct = (n) => `${Math.round((100 * n) / t.games)}%`;
console.log(`Games: ${t.games} on ${maps.join(', ')}`);
console.log(`ISA ${pct(t.side[0])}  Helghast ${pct(t.side[1])}  draws ${pct(t.draws)}`);
console.log(`Side moving first won ${pct(t.first)}`);
console.log(`Ended by a rout ${pct(t.broken)}; average ${(t.turns / t.games).toFixed(1)} turns, ${(t.cas / t.games).toFixed(1)} soldiers lost`);
