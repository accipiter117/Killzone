// A campaign run: the state plus the command log that made it. Every
// accepted command is logged, so seed + log rebuilds the campaign exactly
// (saves, replays, and later pass-and-play or online play).

import { createCampaign } from './state.js';
import { applyCampaignCommand } from './commands.js';
import { nextCommand } from './ai.js';

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
      const rec = cm.state.history.find((b) => b.id === params.battle);
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

// Let the AI play one side's whole turn. resolve(rec) settles each battle
// it starts (by default the battle is run here, AI against AI).
export function aiTurn(cm, side, resolve = null) {
  const s = cm.state;
  let guard = 0;
  while (s.phase !== 'over' && s.active === side && guard++ < 200) {
    if (s.phase === 'battle') { settle(cm, resolve); continue; }
    const cmd = nextCommand(s, side);
    if (!cmd) break;
    const res = issueCampaign(cm, cmd);
    if (!res.ok) issueCampaign(cm, { side, type: 'endTurn', params: {} });
    if (cmd.type === 'endTurn') break;
  }
  if (s.phase === 'battle') settle(cm, resolve);
}

function settle(cm, resolve) {
  const rec = cm.state.battle;
  issueCampaign(cm, { side: rec.attacker, type: 'battleResult', params: { battle: rec.id, result: resolve ? resolve(rec) : undefined } });
}

// One whole turn with the AI on both sides (for tests and the balance tool).
export function aiRound(cm, resolve = null) {
  const first = cm.state.first;
  aiTurn(cm, first, resolve);
  aiTurn(cm, 1 - first, resolve);
}
