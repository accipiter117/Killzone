// Turning the war map's contacts into battles, and running them. A battle
// record holds everything needed to fight (or replay) it: seed, map type,
// each side's platoons as they stood, and the extras their sites gave.
// Auto-resolved battles run the real battle sim headless, AI against AI.

import { CONFIG } from '../config.js';
import { next } from '../sim/rng.js';
import { createMatch, runToEnd } from '../sim/match.js';
import { createAI } from '../sim/ai.js';
import { extrasFor } from './state.js';

// The battle options (createBattle's forces and config) for a record.
export function battleOptions(rec) {
  return {
    config: { map: { type: rec.mapType }, world: { ...CONFIG.mapSizes[rec.mapType] }, battle: { durationSec: rec.durationSec } },
    forces: rec.forces,
  };
}

// Run a battle to its end: AI on both sides, or replaying a played battle's
// command log (which holds both the player's and the AI's orders).
export function resolveBattle(rec, log = null) {
  const options = battleOptions(rec);
  const m = log
    ? createMatch({ seed: rec.seed, options, replayLog: { commands: log } })
    : createMatch({ seed: rec.seed, options, controllers: [createAI(0), createAI(1)] });
  const r = runToEnd(m);
  return {
    winner: r.winner, margin: r.margin, reason: r.reason, durationSec: r.durationSec,
    scores: r.scores, casualties: r.casualties, platoons: r.platoons,
    log: m.log.commands,
  };
}

// A battle record for an attack: everything needed to fight it (or replay
// it): seed, map, both armies' platoons as they stand and the extras each
// side's sites give. The defenders fight from trenches when dug in or on
// their own home ground.
export function makeBattle(state, attacker, provId) {
  const prov = state.provinces[provId];
  const defender = state.armies.find((a) => a.at === provId);
  state.battleCount = (state.battleCount || 0) + 1;
  const seed = Math.floor(next(state) * 2 ** 31);
  const bySide = attacker.side === 0 ? [attacker, defender] : [defender, attacker];
  const forces = [0, 1].map((side) => {
    const ex = extrasFor(state, side);
    const army = bySide[side];
    return {
      army: army.id,
      platoons: army.platoons.map((pl) => ({
        ref: pl.id, name: pl.sergeant,
        // Without an airfield, jetpack troopers fight on foot as riflemen.
        roles: pl.roles.map((r) => (r === 'jump' && !ex.airfield ? 'rifle' : r)),
        alive: pl.alive.slice(),
      })),
      tank: ex.tank, artillery: ex.artillery, opBonus: ex.opBonus,
      fortified: army === defender && (defender.dug || prov.home === defender.side),
    };
  });
  return {
    id: `t${state.turn}-${state.battleCount}`, turn: state.turn, province: provId, provinceName: prov.name,
    attacker: attacker.side, attackerArmy: attacker.id, defenderArmy: defender.id,
    seed, mapType: prov.kit, durationSec: state.cc.battle.durationSec, forces, result: null, log: null,
  };
}
