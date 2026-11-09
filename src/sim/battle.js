// Creating a battle and advancing it by one fixed tick.

import { CONFIG, SIDE_NAMES, PLATOON_NAMES } from '../config.js';
import { seedFrom, range } from './rng.js';
import { generateMap, forCells, T } from './map.js';
import { updateVision, updateFiring, updateSuppression } from './combat.js';
import { updateSites, updateEmplacements, updateStrikes, updateSmokes } from './features.js';
import { thinkSquad, moveSoldiers, resetPlans, updateMedics } from './squads.js';
import { updateThrows, updateDives } from './abilities.js';
import { platoonAlive, feed, sideName } from './util.js';
import { createVehicles, updateVehicles, updateCharges, updateVehicleVision } from './vehicles.js';

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
    sides: SIDE_NAMES.map((name, id) => ({ id, name, op: cfg.orders.start, score: 0, casualties: 0, fled: 0, artReadyTick: 0, spotted: null, captures: 0, abilities: 0, rallies: 0, reinforceReadyTick: 0, reinforcements: 0, revived: 0, lossBy: {} })),
    platoons: [], squads: [], soldiers: [],
    strikes: [], smokes: [], throws: [], charges: [], vehicles: [],
    events: [], feed: [], history: [],
    result: null,
  };
  const W = map.width, H = map.height;
  const jitter = {};
  // Forces: the standard three platoons a side, or (from the campaign) each
  // side's own platoons with their own squads and survivors, and extras
  // won by holding sites: the tank, artillery, extra order points, and
  // trenches dug in for the defender.
  const forces = options.forces || null;
  for (const side of [0, 1]) {
    const f = forces && forces[side];
    const list = f ? f.platoons : cfg.platoons.map((roles, pi) => ({ roles, name: PLATOON_NAMES[pi] }));
    const spread = list.length === 3 ? cfg.deploy.spreadY : list.map((_, i) => (i + 1) / (list.length + 1));
    list.forEach(({ roles, name, alive, ref }, pi) => {
      const pl = {
        id: state.platoons.length, side, index: pi, name: name || PLATOON_NAMES[pi] || `Platoon ${pi + 1}`, ref: ref ?? null,
        squads: [], order: { type: 'idle' }, orderTick: 0, stance: 'balanced', broken: false, rallied: false, rallyAt: -1, reinforceReadyTick: 0, breakBase: 0, paidTick: -1, brokeTick: 0, focus: -1, focusUntil: 0, size: roles.length * cfg.soldiersPerSquad,
      };
      state.platoons.push(pl);
      const baseY = H * spread[pi];
      roles.forEach((role, k) => {
        const sq = {
          id: state.squads.length, platoon: pl.id, side, role, soldiers: [],
          supp: 0, pinned: false, lastHitTick: -9999, lastFiredTick: -9999, tally: {}, lossBy: {}, hitFrom: null,
          mode: 'idle', status: 'Awaiting orders', bound: null, pauseUntil: 0, holdSpot: null, flankDone: false, waitSince: -1, cx: 0, cy: 0,
          bestD: Infinity, bestTick: 0, pushUntil: 0, path: null, pathTo: null, pathTick: 0,
          order: null, paidTick: -1, abilityReady: 0, barrageUntil: 0, chargeUntil: 0, chargeTarget: -1, diveUntil: 0, diveTarget: null, vanishUntil: 0, breachUntil: 0, breachVehicle: -1, repairUntil: 0, repairVehicle: -1, repairDoneTick: 0,
        };
        state.squads.push(sq);
        pl.squads.push(sq.id);
        for (let n = 0; n < cfg.soldiersPerSquad; n++) {
          // ISA lays out its deployment; the Helghast copy is turned 180 degrees.
          // Random spacing is drawn once and shared, so the two sides start
          // as exact mirror images.
          const key = `${pi}.${k}.${n}`;
          if (!jitter[key]) jitter[key] = [range(state, -25, 25), range(state, 0, 1)];
          let x = cfg.deploy.x + jitter[key][0] - (n % 2) * 14;
          let y = baseY + (k - 1) * 62 + (n - 2) * 11;
          if (side === 1) { x = W - x; y = H - y; }
          const hp = cfg.roles[role].hp;
          // A campaign platoon short of men: the empty places are filled as
          // absent (off the field) so reinforcements can still fill them.
          const here = !alive || n < alive[k];
          const s = { id: state.soldiers.length, squad: sq.id, side, role, x, y, tx: x, ty: y, hp: here ? hp : 0, maxHp: hp, alive: here, fled: !here, cd: jitter[key][1], target: -1, retarget: 0, markUntil: 0, lastShotTick: -9999,
            // The first soldier of every squad is its medic (the first place
            // is never empty, even in a short-handed campaign squad).
            medic: n === 0, downed: false, bleedUntil: 0, medicBy: -1, healTarget: -1, healDone: 0, healing: false };
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
  createVehicles(state);
  if (forces) {
    for (const side of [0, 1]) {
      const f = forces[side];
      const sd = state.sides[side];
      if (!f.tank) { const v = state.vehicles[side]; v.alive = false; v.absent = true; v.hp = 0; }
      if (!f.artillery) { sd.noArtillery = true; sd.artReadyTick = 1e12; }
      sd.op = Math.min(cfg.orders.cap, cfg.orders.start + (f.opBonus || 0));
      if (f.fortified) fortify(state, side);
    }
  }
  // Squads that start with nobody (a campaign platoon that lost a squad).
  for (const sq of state.squads) if (!sq.soldiers.some((id) => state.soldiers[id].alive)) sq.mode = 'dead';
  state.durationTicks = Math.round(cfg.battle.durationSec * cfg.tickRate);
  updateVision(state);
  updateVehicleVision(state);
  return state;
}

// Extra trenches dug by the defender (bought on the war map): sandbag walls
// in front of their lines and round the objective on their half.
function fortify(state, side) {
  const map = state.map, W = map.width, H = map.height;
  const ring = (cx, cy, r, th, facing) => {
    forCells(map, cx - r, cy - r, cx + r, cy + r, (i, x, y) => {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r || d < r - th) return;
      if (facing && (x - cx) * facing < r * 0.2) return;
      if (map.grid[i] === T.open || map.grid[i] === T.rubble || map.grid[i] === T.crater) map.grid[i] = T.sandbag;
    });
  };
  const dir = side === 0 ? 1 : -1;
  const lineX = side === 0 ? state.cfg.deploy.x + 120 : W - state.cfg.deploy.x - 120;
  for (const f of [0.2, 0.4, 0.6, 0.8]) ring(lineX, H * f, 34, 9, dir);
  const own = state.sites.filter((s) => s.kind === 'objective' && (side === 0 ? s.x < W / 2 : s.x > W / 2));
  for (const s of own) ring(s.x, s.y, s.r * 0.75, 9, 0);
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
  if (state.tick % cfg.combat.visionEveryTicks === 0) { updateVision(state); updateVehicleVision(state); }
  const thinkEvery = cfg.squad.thinkEveryTicks;
  const perSide = state.squads.length / 2;
  // Mirrored squads on both sides think on the same tick.
  for (const sq of state.squads) if ((state.tick + (sq.id % perSide)) % thinkEvery === 0) thinkSquad(state, sq);

  updateMedics(state);
  moveSoldiers(state, dt);
  updateVehicles(state, dt);
  updateFiring(state, dt);
  updateCharges(state);
  updateEmplacements(state, dt);
  updateStrikes(state);
  updateThrows(state);
  updateDives(state);
  updateSmokes(state);
  updateSuppression(state, dt);
  updateSites(state, dt);
  checkMorale(state);

  state.tick++;
  // Strength over time, for the end screen's chart.
  if (state.tick % Math.round(cfg.historyEverySec * cfg.tickRate) === 0) {
    const alive = [0, 0];
    for (const s of state.soldiers) if (s.alive && !s.fled) alive[s.side]++;
    state.history.push([state.tick, alive[0], alive[1], state.sides[0].score, state.sides[1].score]);
  }
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
        feed(state, `${label(pl)} has rallied`, pl.side, platoonPos(state, pl));
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
      feed(state, pl.rallied ? `${label(pl)} has broken again and is running` : `${label(pl)} has broken`, pl.side, platoonPos(state, pl));
      state.events.push({ type: 'broken', platoon: pl.id, side: pl.side });
    }
  }
}

// Where a platoon is (the middle of its active soldiers), for the feed.
function platoonPos(state, pl) {
  let x = 0, y = 0, n = 0;
  for (const id of pl.squads) for (const sid of state.squads[id].soldiers) {
    const s = state.soldiers[sid];
    if (!s.alive || s.fled) continue;
    x += s.x; y += s.y; n++;
  }
  return n ? { x: x / n, y: y / n } : null;
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
    revived: state.sides.map((s) => s.revived || 0),
    tanksLost: state.sides.map((s) => (s.tankLost ? 1 : 0)),
    lossBy: state.sides.map((s) => ({ ...s.lossBy })),
    // Per platoon: survivors in each squad (for the war map), and whether it broke.
    platoons: state.platoons.map((pl) => ({ side: pl.side, index: pl.index, ref: pl.ref, broken: pl.broken, survivors: pl.squads.map((id) => state.squads[id].soldiers.filter((sid) => state.soldiers[sid].alive).length) })),
    history: state.history.slice(),
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
    v: state.vehicles.map((v) => [+v.x.toFixed(4), +v.y.toFixed(4), +v.hp.toFixed(4)]),
    w: state.result,
  });
}
