// Call-ins: support brought onto the field from a vehicle depot the side
// holds (its own, or one taken from the enemy). For now a tank, at most one
// out at a time; aircraft and other support will be added to config
// callins and handled here. Same rules for the player and the AI.

import { feed, sideName } from './util.js';

// The depot a side would use: its own first, then any other it holds.
export function depotFor(state, side) {
  const held = state.sites.filter((s) => s.kind === 'depot' && s.owner === side);
  return held.find((s) => s.id === `depot${side}`) || held[0] || null;
}

export function callinBlocked(state, side, what) {
  const c = state.cfg.callins[what];
  if (!c) return 'Nothing like that to call in';
  if (state.tick === 0) return 'Call-ins arrive once the battle has started';
  if (!depotFor(state, side)) return 'Hold a vehicle depot first';
  if (what === 'tank') {
    if (state.sides[side].noTank) return 'No tank works to send one (war map)';
    const out = state.vehicles.filter((v) => v.side === side && v.alive && !v.absent).length;
    if (out >= c.max) return 'Your tank is still in the fight';
  }
  return null;
}

export function callIn(state, side, what) {
  const depot = depotFor(state, side);
  if (what === 'tank') {
    const v = state.vehicles.find((o) => o.side === side);
    const t = state.cfg.tank;
    // The old tank's burnt hull stays where it died.
    if (!v.absent && !v.alive) state.map.props.push({ kind: 'tankwreck', x: v.x, y: v.y, w: 64, h: 40, ang: v.facing > 0 ? 0 : Math.PI, side: side === 0 ? 'isa' : 'hgh', col: '#3d3a31', turret: 0.9 });
    Object.assign(v, {
      x: depot.x, y: depot.y, hp: t.hp, maxHp: t.hp, alive: true, absent: false,
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
