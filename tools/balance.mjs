// AI vs AI balance runs. Every seed is played twice with the two AI profiles
// swapped between ISA and the Helghast, so a profile's win rate is not just
// the map (or turn order) favouring one side. With the same profile on both
// sides every game gets its own map, so N seeds means 2N distinct battles.
//
//   node tools/balance.mjs [seeds] [profileA] [profileB]
//   node tools/balance.mjs 10 standard aggressive

import { createMatch, runToEnd } from '../src/sim/match.js';
import { createAI } from '../src/sim/ai.js';

const seeds = Number(process.argv[2]) || 10;
const A = process.argv[3] || 'standard';
const B = process.argv[4] || 'standard';

const tally = { sides: [0, 0], draws: 0, profiles: { [A + ' (A)']: 0, [B + ' (B)']: 0 }, margins: {}, reasons: {}, length: 0, games: 0, tanks: 0 };
const t0 = Date.now();
// With the same profile on both sides, swapping them would just replay the
// identical game, so each run uses its own map instead.
const same = A === B;
for (let seed = 1; seed <= seeds; seed++) {
  for (const swap of [false, true]) {
    const profiles = swap ? [B, A] : [A, B];
    const mapSeed = same ? seed * 2 - (swap ? 0 : 1) : seed;
    const m = createMatch({ seed: mapSeed, controllers: [createAI(0, profiles[0]), createAI(1, profiles[1])] });
    const r = runToEnd(m);
    tally.games++;
    tally.length += r.durationSec;
    tally.margins[r.margin] = (tally.margins[r.margin] || 0) + 1;
    tally.reasons[r.reason] = (tally.reasons[r.reason] || 0) + 1;
    tally.tanks += m.state.tanks.filter((t) => t.exploded).length;
    if (r.winner === null) tally.draws++;
    else {
      tally.sides[r.winner]++;
      const winnerIsA = (r.winner === 0) !== swap;
      tally.profiles[winnerIsA ? A + ' (A)' : B + ' (B)']++;
    }
    console.log(`seed ${String(mapSeed).padStart(3)} ${swap ? 'swapped' : 'normal '}  ISA ${profiles[0].padEnd(10)} vs Helghast ${profiles[1].padEnd(10)}  winner ${r.winner === null ? 'draw' : r.winner === 0 ? 'ISA     ' : 'Helghast'}  ${r.margin.padEnd(8)} ${r.reason.padEnd(6)} ${String(r.durationSec).padStart(3)}s  score ${r.scores.join('-')}  dead ${r.casualties.join('/')}`);
  }
}
const pct = (n) => `${Math.round((100 * n) / tally.games)}%`;
console.log('\nGames:', tally.games, `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log('By side:    ISA', pct(tally.sides[0]), ' Helghast', pct(tally.sides[1]), ' draws', pct(tally.draws));
console.log('By profile:', Object.entries(tally.profiles).map(([k, v]) => `${k} ${pct(v)}`).join('  '));
console.log('Average battle length:', Math.round(tally.length / tally.games), 's');
console.log('Margins:', tally.margins, ' Endings:', tally.reasons, ' Tanks exploded per battle:', (tally.tanks / tally.games).toFixed(1));
