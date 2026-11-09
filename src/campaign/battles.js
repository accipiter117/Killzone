// Turning the war map's contacts into battles, and running them. A battle
// record holds everything needed to fight (or replay) it: seed, map type,
// each side's platoons as they stood, and the extras their sites gave.
// Auto-resolved battles run the real battle sim headless, AI against AI.

import { CONFIG } from '../config.js';
import { next } from '../sim/rng.js';
import { createMatch, runToEnd } from '../sim/match.js';
import { createAI } from '../sim/ai.js';
import { extrasFor, sectorOwner } from './state.js';

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

// Build this round's battles from the attack orders. One battle per
// (target sector, attacking side); two sides attacking each other's sectors
// meet in one battle. Defenders are the enemy platoons standing in the
// target sector that are not off attacking somewhere else.
export function makeBattles(state) {
  const cc = state.cc;
  const attackers = state.platoons.filter((pl) => pl.order && pl.order.type === 'attack');
  const target = (pl) => pl.order.sector;
  // Meeting engagements first: platoons attacking each other's sectors.
  const battles = [];
  const busy = new Set();
  const sorted = [...attackers].sort((a, b) => target(a) - target(b) || a.side - b.side || (a.id < b.id ? -1 : 1));
  for (const pl of sorted) {
    if (busy.has(pl.id)) continue;
    const foes = sorted.filter((o) => o.side !== pl.side && !busy.has(o.id) && target(o) === pl.sector && o.sector === target(pl));
    if (!foes.length) continue;
    const mine = sorted.filter((o) => o.side === pl.side && !busy.has(o.id) && target(o) === target(pl) && o.sector === pl.sector);
    const a = mine.slice(0, cc.maxPerSide), d = foes.slice(0, cc.maxPerSide);
    for (const x of [...a, ...d]) busy.add(x.id);
    battles.push(record(state, target(pl), pl.side, a, d, true));
  }
  // A platoon whose own sector comes under attack stays to defend it: its
  // own attack is called off.
  const underAttack = new Set(sorted.filter((p) => !busy.has(p.id)).map((p) => `${target(p)}:${1 - p.side}`));
  const stays = (p) => !busy.has(p.id) && underAttack.has(`${p.sector}:${p.side}`);
  const groups = new Map();
  for (const pl of sorted) {
    if (busy.has(pl.id) || stays(pl)) continue;
    const key = `${target(pl)}:${pl.side}`;
    if (!groups.has(key)) groups.set(key, { sector: target(pl), side: pl.side, platoons: [] });
    groups.get(key).platoons.push(pl);
  }
  for (const g of groups.values()) {
    const a = g.platoons.slice(0, cc.maxPerSide);
    const d = state.platoons.filter((p) => p.side !== g.side && p.sector === g.sector && !busy.has(p.id)).slice(0, cc.maxPerSide);
    for (const x of [...a, ...d]) busy.add(x.id);
    battles.push(record(state, g.sector, g.side, a, d, false));
  }
  return battles;
}

function record(state, sector, attackerSide, attackers, defenders, meeting) {
  const cc = state.cc;
  state.battleCount = (state.battleCount || 0) + 1;
  const id = `n${state.night}r${state.round}-${state.battleCount}`;
  const seed = Math.floor(next(state) * 2 ** 31);
  const bySide = attackerSide === 0 ? [attackers, defenders] : [defenders, attackers];
  const defenderSide = 1 - attackerSide;
  const forces = [0, 1].map((side) => {
    const ex = extrasFor(state, side);
    const fortified = !meeting && side === defenderSide && !!state.fort[`${sector}:${side}`];
    return {
      platoons: bySide[side].map((pl) => ({
        ref: pl.id, name: pl.sergeant,
        // Without an airfield, jetpack troopers fight on foot as riflemen.
        roles: pl.roles.map((r) => (r === 'jump' && !ex.airfield ? 'rifle' : r)),
        alive: pl.alive.slice(),
      })),
      tank: ex.tank, artillery: ex.artillery, opBonus: ex.opBonus, fortified,
    };
  });
  return {
    id, night: state.night, round: state.round, sector, sectorName: state.sectors[sector].region,
    attacker: attackerSide, meeting, walkover: defenders.length === 0,
    holder: sectorOwner(state, sector),
    seed, mapType: state.sectors[sector].kit, durationSec: cc.battle.durationSec,
    forces, key: state.key === sector && bySide[state.playerSide].length > 0 && defenders.length > 0,
    // Nobody to fight: the attackers walk in.
    result: defenders.length === 0 ? { winner: attackerSide, margin: 'clear', walkover: true, platoons: [], log: [] } : null,
  };
}
