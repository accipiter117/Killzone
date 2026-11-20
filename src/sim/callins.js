// Call-ins: support brought onto the field from a vehicle depot the side
// holds (its own, or one taken from the enemy). For now a tank, at most one
// out at a time; aircraft and other support will be added to config
// callins and handled here. Same rules for the player and the AI.

import { feed, sideName } from './util.js';
import { tankSpot } from './commands.js';
import { launchAircraft, dropshipPlatoon } from './aircraft.js';

// The depot a side would use: its own first, then any other it holds.
export function depotFor(state, side) {
  const held = state.sites.filter((s) => s.kind === 'depot' && s.owner === side);
  return held.find((s) => s.id === `depot${side}`) || held[0] || null;
}

// Skirmish reserves: how many supply points a side holds, and the next
// platoon still waiting off the field.
export const supplyHeld = (state, side) => state.sites.filter((s) => s.kind === 'supply' && s.owner === side).length;
export const nextReserve = (state, side) => state.platoons.find((p) => p.side === side && p.reserve) || null;
const hqOf = (state, side) => state.sites.find((s) => s.kind === 'hq' && s.home === side) || null;

export function callinBlocked(state, side, what) {
  const c = state.cfg.callins[what];
  if (!c) return 'Nothing like that to call in';
  if (state.tick === 0) return 'Call-ins arrive once the battle has started';
  if (what === 'platoon') {
    const hq = hqOf(state, side);
    if (!hq) return 'Reserves only come up in a skirmish';
    if (hq.owner !== side) return 'Retake your HQ first';
    if (!nextReserve(state, side)) return 'Every platoon is already in the field';
    const called = state.platoons.filter((p) => p.side === side && p.calledIn).length;
    const need = c.needSupply[Math.min(called, c.needSupply.length - 1)];
    if (supplyHeld(state, side) < need) return `Hold ${need} supply points to bring up the next platoon`;
    return null;
  }
  if (!depotFor(state, side)) return 'Hold a vehicle depot first';
  if (what === 'gunship' || what === 'dropship') {
    const ready = state.sides[side].airReady?.[what] || 0;
    if (state.tick < ready) return `The ${c.label.toLowerCase()} is refuelling (${Math.ceil((ready - state.tick) / state.cfg.tickRate)}s)`;
    if (state.aircraft.some((a) => a.side === side && a.kind === what)) return `Your ${c.label.toLowerCase()} is still out`;
    if (what === 'dropship' && !dropshipPlatoon(state, side, 0, 0)) return 'Every platoon is at full strength';
    return null;
  }
  if (what === 'tank') {
    if (state.sides[side].noTank) return 'No tank works to send one (war map)';
    const out = state.vehicles.filter((v) => v.side === side && v.alive && !v.absent).length;
    if (out >= c.max) return 'Your tank is still in the fight';
  }
  return null;
}

export function callIn(state, side, what, at = null) {
  if (what === 'platoon') return callInPlatoon(state, side);
  if (what === 'gunship' || what === 'dropship') {
    const sd = state.sides[side];
    sd.airReady = sd.airReady || {};
    sd.airReady[what] = state.tick + Math.round(state.cfg.callins[what].cooldownSec * state.cfg.tickRate);
    sd.callins = (sd.callins || 0) + 1;
    launchAircraft(state, side, what, depotFor(state, side), at);
    return;
  }
  const depot = depotFor(state, side);
  if (what === 'tank') {
    const v = state.vehicles.find((o) => o.side === side);
    const t = state.cfg.tank;
    // The old tank's burnt hull stays where it died.
    if (!v.absent && !v.alive) state.map.props.push({ kind: 'tankwreck', x: v.x, y: v.y, w: 64, h: 40, ang: v.facing > 0 ? 0 : Math.PI, side: side === 0 ? 'isa' : 'hgh', col: '#3d3a31', turret: 0.9 });
    // It rolls out onto open ground beside the depot: some depots are
    // garages (ruined buildings tanks cannot drive through), and a tank set
    // down inside one could never leave it.
    const at = tankSpot(state, { x: depot.x, y: depot.y }, side, true);
    Object.assign(v, {
      x: at.x, y: at.y, hp: t.hp, maxHp: t.hp, alive: true, absent: false,
      order: { type: 'idle' }, pending: null, path: null, pathTo: null, hullDown: false,
      gunReady: state.tick + Math.round(2 * state.cfg.tickRate), abilityReady: state.tick, smokeReady: state.tick, mgCd: 0,
      status: 'Awaiting orders', spotted: [0, 0], facing: side === 0 ? 1 : -1,
    });
    v.spotted[side] = 1;
    state.sides[side].callins = (state.sides[side].callins || 0) + 1;
    feed(state, `${sideName(side)} tank rolls out of the ${depot.name}`, side, depot);
    state.events.push({ type: 'callin', what, side, x: depot.x, y: depot.y });
  }
}

// A reserve platoon marches out of the HQ: its soldiers, every place filled,
// appear round the HQ and wait for orders.
function callInPlatoon(state, side) {
  const pl = nextReserve(state, side), hq = hqOf(state, side);
  const W = state.map.width, H = state.map.height;
  pl.reserve = false;
  pl.calledIn = true;
  pl.order = { type: 'idle' };
  pl.orderTick = state.tick;
  pl.squads.forEach((id, k) => {
    const sq = state.squads[id];
    sq.mode = 'idle';
    sq.status = 'Awaiting orders';
    sq.path = null;
    sq.soldiers.forEach((sid, n) => {
      const s = state.soldiers[sid];
      const x = Math.max(10, Math.min(W - 10, hq.x + (k - 1) * 46 + (n % 2) * 12 - 6));
      const y = Math.max(10, Math.min(H - 10, hq.y + 50 + (n - 2) * 10));
      Object.assign(s, { x, y, tx: x, ty: y, hp: s.maxHp, alive: true, fled: false, downed: false, target: -1, markUntil: 0 });
    });
  });
  state.sides[side].callins = (state.sides[side].callins || 0) + 1;
  feed(state, `${sideName(side)} ${pl.name} marches out of the HQ`, side, hq);
  state.events.push({ type: 'callin', what: 'platoon', side, x: hq.x, y: hq.y, platoon: pl.id });
}
