// AI against AI campaigns: win rates by side and how long wars last.
// The war map is mirrored and both sides run the same campaign and battle
// AI, so a fair campaign should split about evenly. Battles are fought for
// real (headless), so this takes a while: start small.
//
//   node tools/campaign-balance.mjs [seeds] [nights] [battle seconds]
//   node tools/campaign-balance.mjs 4 4 120

import { createCampaignMatch, aiRound } from '../src/campaign/match.js';
import { siteValue } from '../src/campaign/state.js';

const seeds = Number(process.argv[2]) || 4;
const nights = Number(process.argv[3]) || 4;
const battleSec = Number(process.argv[4]) || 120;
const t0 = Date.now();
const tally = { wins: [0, 0], capital: 0, value: 0, rounds: 0, battles: 0, played: 0 };
for (let k = 1; k <= seeds; k++) {
  // Each seed is played on its own map; "sides swapped" means the seed's
  // map is the mirror of the next one's, so swapping is built in.
  const cm = createCampaignMatch(`balance-${k}`, { nights, config: { battle: { durationSec: battleSec } } });
  const s = cm.state;
  let rounds = 0;
  while (s.phase !== 'over' && rounds < nights * s.cc.roundsPerNight + 2) { aiRound(cm); rounds++; }
  tally.wins[s.winner]++;
  if (/capital/.test(s.winReason)) tally.capital++; else tally.value++;
  tally.rounds += rounds;
  tally.battles += s.history.length;
  tally.played += s.history.filter((b) => !b.walkover).length;
  console.log(`seed ${k}: ${s.winner === 0 ? 'ISA' : 'Helghast'} won after ${rounds} rounds (night ${Math.min(s.night, nights)}): ${s.winReason}; site value ${siteValue(s, 0)} to ${siteValue(s, 1)}; ${s.history.length} battles (${s.history.filter((b) => !b.walkover).length} fought)`);
}
const pct = (n) => `${Math.round((100 * n) / seeds)}%`;
console.log(`\nCampaigns: ${seeds} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
console.log(`ISA ${pct(tally.wins[0])}  Helghast ${pct(tally.wins[1])}`);
console.log(`Won by capital: ${pct(tally.capital)}  by site value at the final night: ${pct(tally.value)}`);
console.log(`Average rounds ${(tally.rounds / seeds).toFixed(1)}, battles ${(tally.battles / seeds).toFixed(1)} (${(tally.played / seeds).toFixed(1)} fought, the rest unopposed)`);
