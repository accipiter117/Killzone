// Gates: parts of a map that can be shut or opened from a lever post. A lift
// bridge raised over a river (its deck turns to deep water), blast doors on
// a refinery hall, a checkpoint barrier across a street (both become solid
// wall). The side holding the lever post can work it with an order; it takes
// a few seconds, and a gate waits to close until nobody is standing in it.
// Picture and rules both read map.gates; nothing here is random.

import { T, S, cellIndex } from './map.js';
import { isActive, feed, sideName } from './util.js';

// Set a gate's cells to match gate.closed (also used when the map is built).
export function applyGate(map, gate) {
  for (let k = 0; k < gate.cells.length; k++) {
    const i = gate.cells[k];
    if (gate.kind === 'bridge') map.surf[i] = gate.closed ? S.deep : S.deck;
    else {
      map.grid[i] = gate.closed ? T.wall : gate.base[k];
      map.wallKind[i] = gate.kind === 'door' ? 5 : 6;
    }
  }
}

// Called by the map builders: a gate over these cells, worked from a lever site.
export function makeGate(map, { id, kind, name, cells, lever, closed = false }) {
  const gate = { id, kind, name, cells: [...new Set(cells)].sort((a, b) => a - b), lever, closed, moving: null };
  gate.base = gate.cells.map((i) => (map.grid[i] === T.wall ? T.open : map.grid[i]));
  if (!map.gateCell) map.gateCell = new Uint8Array(map.grid.length);
  for (const i of gate.cells) map.gateCell[i] = 1;
  map.gates.push(gate);
  applyGate(map, gate);
  return gate;
}

export const gateVerb = (g, closing) => (g.kind === 'bridge' ? (closing ? 'raising' : 'lowering') : closing ? 'closing' : 'opening');

export function canWorkGate(state, side, gate) {
  const lever = state.sites.find((s) => s.id === gate.lever);
  if (!lever || lever.owner !== side) return `Take the ${lever ? lever.name : 'lever'} first`;
  if (gate.moving) return `The ${gate.name} is already ${gateVerb(gate, gate.moving.to)}`;
  return null;
}

export function workGate(state, side, gate) {
  const to = !gate.closed;
  gate.moving = { to, at: state.tick + Math.round(state.cfg.gates.moveSec * state.cfg.tickRate), side };
  feed(state, `${sideName(side)} ${gateVerb(gate, to)} the ${gate.name}`, side, centreOf(state.map, gate));
}

const centreOf = (map, gate) => {
  let x = 0, y = 0;
  for (const i of gate.cells) { x += (i % map.cols) * map.cell; y += ((i / map.cols) | 0) * map.cell; }
  return { x: x / gate.cells.length + map.cell / 2, y: y / gate.cells.length + map.cell / 2 };
};
export { centreOf as gateCentre };

function occupied(state, gate) {
  const map = state.map, set = new Set(gate.cells);
  for (const s of state.soldiers) if (isActive(s) && set.has(cellIndex(map, s.x, s.y))) return true;
  for (const v of state.vehicles) {
    if (!v.alive || v.absent) continue;
    for (const [dx, dy] of [[0, 0], [-v.radius, 0], [v.radius, 0], [0, -v.radius * 0.6], [0, v.radius * 0.6]]) if (set.has(cellIndex(map, v.x + dx, v.y + dy))) return true;
  }
  return false;
}

export function updateGates(state) {
  const map = state.map;
  if (!map.gates || !map.gates.length) return;
  for (const gate of map.gates) {
    if (!gate.moving || state.tick < gate.moving.at) continue;
    // Shutting on top of someone: wait for them to get out of the way.
    if (gate.moving.to && occupied(state, gate)) { gate.moving.at = state.tick + 10; gate.blocked = true; continue; }
    gate.closed = gate.moving.to;
    gate.moving = null;
    gate.blocked = false;
    applyGate(map, gate);
    if (gate.kind !== 'bridge') {
      map.wallCells = [];
      for (let i = 0; i < map.grid.length; i++) if (map.grid[i] === T.wall) map.wallCells.push(i);
      map.hasWalls = map.wallCells.length > 0;
    }
    state.events.push({ type: 'gate', id: gate.id, closed: gate.closed });
    // Routes that used (or went round) the gate are out of date.
    for (const sq of state.squads) sq.path = null;
    for (const v of state.vehicles) v.path = null;
  }
}
