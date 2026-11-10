// AI against AI wars on the province board: win rates by side, how wars
// end and how long they last. The board is mirrored and both sides run the
// same campaign and battle AI; the Helghast push and the player's
// objectives are switched off here so both sides play by the same rules
// (the ISA still move first each turn). Battles are fought for real
// (headless), so this takes a while: start small.
//
//   node tools/campaign-balance.mjs [wars] [turns] [battle seconds]
//   node tools/campaign-balance.mjs 6 18 90

import { createCampaignMatch, aiRound } from '../src/campaign/match.js';
import { held } from '../src/campaign/state.js';

const wars = Number(process.argv[2]) || 4;
const turns = Number(process.argv[3]) || 18;
const battleSec = Number(process.argv[4]) || 90;
const t0 = Date.now();
const tally = { wins: [0, 0], capital: 0, turns: 0, battles: 0, firstWins: 0 };
for (let k = 1; k <= wars; k++) {
  // Odd wars the ISA move first each turn, even wars the Helghast.
  const first = (k + 1) % 2;
  const cm = createCampaignMatch(`balance-${Math.ceil(k / 2)}`, { turns, playerSide: -1, firstSide: first, config: { battle: { durationSec: battleSec }, pushSupply: 0, objective: { reward: 0 } } });
  const s = cm.state;
  while (s.phase !== 'over' && s.turn <= turns + 1) aiRound(cm);
  tally.wins[s.winner]++;
  if (s.winner === first) tally.firstWins++;
  if (/capital/.test(s.winReason)) tally.capital++;
  tally.turns += Math.min(s.turn, turns);
  tally.battles += s.history.length;
  console.log(`war ${k} (${first === 0 ? 'ISA' : 'Helghast'} first): ${s.winner === 0 ? 'ISA' : 'Helghast'} won on turn ${Math.min(s.turn, turns)}: ${s.winReason}; provinces ${held(s, 0)} to ${held(s, 1)}; ${s.history.length} battles`);
}
const pct = (n) => `${Math.round((100 * n) / wars)}%`;
console.log(`\nWars: ${wars} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
console.log(`ISA ${pct(tally.wins[0])}  Helghast ${pct(tally.wins[1])}  (the side moving first won ${pct(tally.firstWins)})`);
console.log(`Won by taking the capital: ${pct(tally.capital)}  on provinces at the end: ${pct(wars - tally.capital)}`);
console.log(`Average length ${(tally.turns / wars).toFixed(1)} turns, ${(tally.battles / wars).toFixed(1)} battles`);
