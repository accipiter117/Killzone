// A match runs one battle tick by tick. It feeds commands in from the player
// (issue), from AI controllers, or from a recorded log (replay), and records
// every accepted command so the battle can be replayed from seed + log.

import { createBattle, step } from './battle.js';
import { applyCommand } from './commands.js';

export function createMatch({ seed, options = {}, controllers = [], replayLog = null }) {
  const state = createBattle(seed, options);
  return {
    state,
    controllers,
    replay: replayLog ? { commands: replayLog.commands, i: 0 } : null,
    log: { seed, options, commands: [] },
  };
}

function record(match, cmd) {
  match.log.commands.push({ tick: cmd.tick, side: cmd.side, type: cmd.type, params: { ...(cmd.params || {}) } });
}

// Player or AI order. Stamped with the current tick, applied now, logged if accepted.
export function issue(match, side, type, params = {}) {
  if (match.replay) return { ok: false, reason: 'Watching a replay' };
  const cmd = { tick: match.state.tick, side, type, params };
  const res = applyCommand(match.state, cmd);
  if (res.ok) record(match, cmd);
  return res;
}

// One tick: replayed commands (or AI decisions) for this tick, then the sim.
export function advance(match) {
  const s = match.state;
  if (s.result) return;
  if (match.replay) {
    const r = match.replay;
    while (r.i < r.commands.length && r.commands[r.i].tick <= s.tick) {
      const cmd = r.commands[r.i++];
      if (applyCommand(s, cmd).ok) record(match, cmd);
    }
  } else {
    for (const c of match.controllers) {
      if (!c.due(s)) continue;
      for (const cmd of c.think(s)) issue(match, cmd.side, cmd.type, cmd.params);
    }
  }
  step(s);
}

export function runToEnd(match, maxTicks = Infinity) {
  const s = match.state;
  while (!s.result && s.tick < maxTicks) advance(match);
  return s.result;
}
