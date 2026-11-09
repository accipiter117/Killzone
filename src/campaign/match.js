// A campaign run: the state plus the command log that made it. Every
// accepted command is logged, so seed + log rebuilds the campaign exactly
// (saves, replays, and later pass-and-play or online play).

import { createCampaign } from './state.js';
import { applyCampaignCommand } from './commands.js';
import { planFor } from './ai.js';

export function createCampaignMatch(seed, options = {}) {
  return { seed, options, state: createCampaign(seed, options), log: [] };
}

export function issueCampaign(cm, cmd) {
  const res = applyCampaignCommand(cm.state, cmd);
  if (res.ok) {
    // Battle results are logged with their battle's command log only (the
    // result itself is rebuilt from it), to keep saves small and honest.
    const params = { ...(cmd.params || {}) };
    if (cmd.type === 'battleResult') {
      const rec = cm.state.history.concat(cm.state.battles, cm.state.lastBattles || []).find((b) => b.id === params.battle);
      params.log = rec ? rec.log : params.log;
      delete params.result;
    }
    cm.log.push({ side: cmd.side, type: cmd.type, params });
  }
  return res;
}

export function replayCampaign(seed, options, log) {
  const cm = createCampaignMatch(seed, options);
  for (const cmd of log) issueCampaign(cm, cmd);
  return cm;
}

// Plan for each AI side, then (when every side has ended planning) settle
// every battle that is not the player's to fight. resolver(record) returns
// a result; by default the battle is run here.
export function aiPlan(cm, sides) {
  for (const side of sides) for (const cmd of planFor(cm.state, side)) issueCampaign(cm, cmd);
}

export function autoResolve(cm, { skipKey = true } = {}) {
  for (const rec of [...cm.state.battles]) {
    if (rec.result || (skipKey && rec.key)) continue;
    issueCampaign(cm, { side: rec.attacker, type: 'battleResult', params: { battle: rec.id } });
  }
}

// One whole round with the AI on both sides (for tests and the balance tool).
export function aiRound(cm) {
  const round = `${cm.state.night}.${cm.state.round}`;
  aiPlan(cm, [0, 1]);
  autoResolve(cm, { skipKey: false });
  return round;
}
