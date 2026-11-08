// Creating a battle and advancing it by one fixed tick.

import { CONFIG, SIDE_NAMES, PLATOON_NAMES } from '../config.js';
import { seedFrom, range } from './rng.js';
import { generateMap } from './map.js';
import { updateVision, updateFiring, updateSuppression } from './combat.js';
import { updateSites, updateEmplacements, updateStrikes, updateSmokes } from './features.js';
import { thinkSquad, moveSoldiers, resetPlans } from './squads.js';
import { updateThrows } from './abilities.js';
import { platoonAlive, feed, sideName } from './util.js';

// Deep merge so tests and the menu can override a few numbers.
export function mergeConfig(base, over) {
  if (!over) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(over)) {
    const v = over[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? mergeConfig(base[k], v) : v;
  }
  return out;
}

export function createBattle(seed, options = {}) {
  const cfg = mergeConfig(CONFIG, options.config);
  const seedInt = seedFrom(seed);
  const map = generateMap(seedInt, cfg);
  const state = {
    seed, cfg, tick: 0, rng: seedInt,
    map,
    sites: map.sites,
    tanks: map.tanks,
    sides: SIDE_NAMES.map((name, id) => ({ id, name, op: cfg.orders.start, score: 0, casualties: 0, fled: 0, artReadyTick: 0, spotted: null, captures: 0, abilities: 0, rallies: 0, reinforceReadyTick: 0, reinforcements: 0 })),
    platoons: [], squads: [], soldiers: [],
    strikes: [], smokes: [], throws: [],
    events: [], feed: [],
    result: null,
  };
  const W = map.width, H = map.height;
  const jitter = {};
  for (const side of [0, 1]) {
    cfg.platoons.forEach((roles, pi) => {
      const pl = {
        id: state.platoons.length, side, index: pi, name: PLATOON_NAMES[pi],
        squads: [], order: { type: 'idle' }, orderTick: 0, stance: 'balanced', broken: false, rallied: false, rallyAt: -1, breakBase: 0, paidTick: -1, brokeTick: 0, size: roles.length * cfg.soldiersPerSquad,
      };
      state.platoons.push(pl);
      const baseY = H * cfg.deploy.spreadY[pi];
      roles.forEach((role, k) => {
        const sq = {
          id: state.squads.length, platoon: pl.id, side, role, soldiers: [],
          supp: 0, pinned: false, lastHitTick: -9999, lastFiredTick: -9999, tally: {},
          mode: 'idle', status: 'Awaiting orders', bound: null, pauseUntil: 0, holdSpot: null, flankDone: false, waitSince: -1, cx: 0, cy: 0,
          bestD: Infinity, bestTick: 0, pushUntil: 0, path: null, pathTo: null, pathTick: 0,
          abilityReady: 0, barrageUntil: 0, chargeUntil: 0, chargeTarget: -1,
        };
        state.squads.push(sq);
        pl.squads.push(sq.id);
        for (let n = 0; n < cfg.soldiersPerSquad; n++) {
          // ISA lays out its deployment; the Helghast copy is turned 180 degrees.
          // Random spacing is drawn once and shared, so the two sides start
          // as exact mirror images.
          const key = `${pi}.${k}.${n}`;
          if (side === 0) jitter[key] = [range(state, -25, 25), range(state, 0, 1)];
          let x = cfg.deploy.x + jitter[key][0] - (n % 2) * 14;
          let y = baseY + (k - 1) * 62 + (n - 2) * 11;
          if (side === 1) { x = W - x; y = H - y; }
          const hp = cfg.roles[role].hp;
          const s = { id: state.soldiers.length, squad: sq.id, side, role, x, y, tx: x, ty: y, hp, maxHp: hp, alive: true, fled: false, cd: jitter[key][1], target: -1, retarget: 0, markUntil: 0 };
          state.soldiers.push(s);
          sq.soldiers.push(s.id);
        }
      });
    });
  }
  for (const sd of state.sides) sd.spotted = new Array(state.soldiers.length).fill(0);
  // Squad centres start where the squads deploy (used for platoon pacing).
  for (const sq of state.squads) {
    const ms = sq.soldiers.map((id) => state.soldiers[id]);
    sq.cx = ms.reduce((a, m) => a + m.x, 0) / ms.length;
    sq.cy = ms.reduce((a, m) => a + m.y, 0) / ms.length;
  }
  state.durationTicks = Math.round(cfg.battle.durationSec * cfg.tickRate);
  updateVision(state);
  return state;
}

// Advance the battle by exactly one tick. Commands for this tick must already
// have been applied (see match.js).
export function step(state) {
  if (state.result) return;
  const cfg = state.cfg;
  const dt = 1 / cfg.tickRate;
  state.events = state.cmdEvents || [];
  state.cmdEvents = [];

  for (const sd of state.sides) {
    const comms = state.sites.some((s) => s.kind === 'comms' && s.owner === sd.id);
    sd.op = Math.min(cfg.orders.cap, sd.op + (dt / cfg.orders.regenSec) * (comms ? cfg.orders.commsRegenMult : 1));
  }
  if (state.tick % cfg.combat.visionEveryTicks === 0) updateVision(state);
  const thinkEvery = cfg.squad.thinkEveryTicks;
  const perSide = state.squads.length / 2;
  // Mirrored squads on both sides think on the same tick.
  for (const sq of state.squads) if ((state.tick + (sq.id % perSide)) % thinkEvery === 0) thinkSquad(state, sq);

  moveSoldiers(state, dt);
  updateFiring(state, dt);
  updateEmplacements(state, dt);
  updateStrikes(state);
  updateThrows(state);
  updateSmokes(state);
  updateSuppression(state, dt);
  updateSites(state, dt);
  checkMorale(state);

  state.tick++;
  if (state.tick % cfg.tickRate === 0) {
    for (const site of state.sites) {
      if (site.kind === 'objective' && site.owner !== null) state.sides[site.owner].score += cfg.battle.scorePerObjectiveSec;
    }
  }
  checkEnd(state);
}

// Morale. A platoon that falls below its break point routs to its own edge.
// The first time, the survivors regroup there and come back into the fight
// after a while (a chance to recover); a platoon that breaks a second time
// runs off the field for good.
function checkMorale(state) {
  const b = state.cfg.battle;
  const W = state.map.width;
  const label = (pl) => (pl.side === 0 ? pl.name : `Helghast ${pl.name}`);
  for (const pl of state.platoons) {
    const alive = platoonAlive(state, pl);
    if (pl.broken) {
      if (pl.rallied || alive === 0) continue;
      if (pl.rallyAt < 0) {
        // Start the clock once most survivors have reached the rally zone,
        // or after a while regardless, so one straggler caught on the far
        // side of a hill cannot hold the whole platoon up for good.
        let total = 0, back = 0;
        for (const id of pl.squads) for (const sid of state.squads[id].soldiers) {
          const s = state.soldiers[sid];
          if (!s.alive || s.fled) continue;
          total++;
          if (pl.side === 0 ? s.x < b.rallyZone : s.x > W - b.rallyZone) back++;
        }
        const waited = (state.tick - pl.brokeTick) / state.cfg.tickRate;
        if (back >= total * b.rallyShareHome || waited > b.rallyMaxWaitSec) pl.rallyAt = state.tick + Math.round(b.rallySec * state.cfg.tickRate);
      } else if (state.tick >= pl.rallyAt) {
        pl.broken = false;
        pl.rallied = true;
        pl.breakBase = alive;
        pl.order = { type: 'hold' };
        pl.orderTick = state.tick;
        resetPlans(state, pl);
        for (const id of pl.squads) { const sq = state.squads[id]; sq.supp = 0; sq.pinned = false; sq.mode = 'hold'; }
        state.sides[pl.side].rallies++;
        feed(state, `${label(pl)} has rallied`, pl.side);
        state.events.push({ type: 'rallied', platoon: pl.id, side: pl.side });
      }
      continue;
    }
    const breaking = pl.rallied ? alive < pl.breakBase * b.rallyBreakShare : alive / pl.size < b.breakAt;
    if (breaking) {
      pl.broken = true;
      pl.rallyAt = -1;
      pl.brokeTick = state.tick;
      pl.order = { type: 'rout' };
      feed(state, pl.rallied ? `${label(pl)} has broken again and is running` : `${label(pl)} has broken`, pl.side);
      state.events.push({ type: 'broken', platoon: pl.id, side: pl.side });
    }
  }
}

export const sideBroken = (state, side) => state.platoons.every((pl) => pl.side !== side || pl.broken);

function checkEnd(state) {
  const b0 = sideBroken(state, 0), b1 = sideBroken(state, 1);
  if (b0 || b1) return finish(state, b0 && b1 ? null : b0 ? 1 : 0, 'broken');
  if (state.tick >= state.durationTicks) {
    const [s0, s1] = state.sides.map((s) => s.score);
    finish(state, s0 === s1 ? null : s0 > s1 ? 0 : 1, 'time');
  }
}

function finish(state, winner, reason) {
  const cfg = state.cfg.battle;
  const [s0, s1] = state.sides.map((s) => s.score);
  let margin = 'draw';
  if (winner !== null) {
    const gap = Math.abs(s0 - s1) / Math.max(1, s0 + s1);
    margin = reason === 'broken' ? 'crushing' : gap < cfg.margin.narrow ? 'narrow' : gap < cfg.margin.clear ? 'clear' : 'crushing';
  }
  state.result = {
    winner, margin, reason,
    tick: state.tick,
    durationSec: Math.round(state.tick / state.cfg.tickRate),
    scores: [s0, s1],
    casualties: state.sides.map((s) => s.casualties),
    fled: state.sides.map((s) => s.fled),
    captures: state.sides.map((s) => s.captures),
    abilities: state.sides.map((s) => s.abilities),
    rallies: state.sides.map((s) => s.rallies),
    reinforcements: state.sides.map((s) => s.reinforcements),
    held: [0, 1].map((side) => state.sites.filter((s) => s.kind === 'objective' && s.owner === side).map((s) => s.id)),
  };
  const text = winner === null ? 'The battle ends in a stalemate' : `${sideName(winner)} victory (${margin})`;
  feed(state, text, winner);
}

// A compact fingerprint of the battle, used to prove replays match.
export function fingerprint(state) {
  return JSON.stringify({
    t: state.tick,
    r: state.rng,
    s: state.sides.map((s) => [s.score, s.casualties, s.fled, +s.op.toFixed(6)]),
    p: state.soldiers.map((s) => [+s.x.toFixed(4), +s.y.toFixed(4), +s.hp.toFixed(4), s.alive ? 1 : 0, s.fled ? 1 : 0]),
    o: state.sites.map((s) => [s.owner, s.capSide, +s.cap.toFixed(6)]),
    k: state.tanks.map((t) => (t.exploded ? 1 : 0)),
    w: state.result,
  });
}
