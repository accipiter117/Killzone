// Tanks: one per side. They drive where ordered (round cliffs, never into
// ruins), fire a slow main gun and an automatic machine gun, crush wire,
// shelter infantry close behind them, and leave a wreck that is cover.

import { next } from './rng.js';
import { T, cellIndex, canStep, forCells } from './map.js';
import { findPath, straightClear } from './path.js';
import { isActive, dist, feed, sideName, nearObjective } from './util.js';
import { fireShot, damageSoldier, suppress, losClear } from './combat.js';
import { breakWalls } from './features.js';

export function createVehicles(state) {
  const t = state.cfg.tank;
  const W = state.map.width, H = state.map.height;
  state.vehicles = [0, 1].map((side) => ({
    id: side, side, kind: 'tank',
    x: side === 0 ? t.deployX : W - t.deployX, y: H / 2,
    hp: t.hp, maxHp: t.hp, alive: true, radius: t.radius,
    order: { type: 'idle' }, paidTick: -1, path: null, pathTo: null, pathTick: 0,
    facing: side === 0 ? 1 : -1, gunReady: Math.round(2 * state.cfg.tickRate), mgCd: 0, lastFireTick: -9999,
    abilityReady: 0, moved: 0, status: 'Awaiting orders', spotted: [0, 0],
  }));
}

const enemyTank = (state, side) => state.vehicles.find((v) => v.side !== side && v.alive);

// Vehicles cannot enter ruined buildings, and use ramps like everyone else.
function vehicleStep(map, a, b) {
  return canStep(map, a, b) && (b < 0 || map.grid[b] !== T.building);
}

function clearForTank(map, a, b) {
  if (!straightClear(map, a, b, true)) return false;
  const d = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.ceil(d / 5);
  for (let k = 1; k <= steps; k++) {
    const i = cellIndex(map, a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps);
    if (i >= 0 && map.grid[i] === T.building) return false;
  }
  return true;
}

function nextWaypoint(state, v, to) {
  if (clearForTank(state.map, v, to)) { v.path = null; return to; }
  const stale = !v.path || !v.pathTo || Math.hypot(v.pathTo.x - to.x, v.pathTo.y - to.y) > 40 || state.tick - v.pathTick > 150;
  if (stale) {
    v.path = findPath(state.map, v, to, { maxNodes: 20000, mirror: v.side === 1, vehicle: true });
    v.pathTo = { x: to.x, y: to.y };
    v.pathTick = state.tick;
  }
  const path = v.path;
  if (!path || !path.length) return to;
  while (path.length > 1 && Math.hypot(path[0].x - v.x, path[0].y - v.y) < 9) path.shift();
  for (let k = Math.min(path.length - 1, 30); k > 0; k -= 2) if (clearForTank(state.map, v, path[k])) return path[k];
  return path[0];
}

function driveToward(state, v, here, t, maxStep) {
  const dx = t.x - v.x, dy = t.y - v.y, d = Math.hypot(dx, dy);
  if (d < 0.5) return false;
  const step = Math.min(d, maxStep);
  const nx = v.x + (dx / d) * step, ny = v.y + (dy / d) * step;
  const map = state.map;
  if (vehicleStep(map, here, cellIndex(map, nx, ny))) { v.x = nx; v.y = ny; }
  else if (Math.abs(dx) > 0.5 && vehicleStep(map, here, cellIndex(map, nx, v.y))) v.x = nx;
  else if (Math.abs(dy) > 0.5 && vehicleStep(map, here, cellIndex(map, v.x, ny))) v.y = ny;
  else return false;
  v.moved = step;
  if (Math.abs(dx) > 1) v.facing = dx > 0 ? 1 : -1;
  return true;
}

function goalOf(state, v) {
  const o = v.order;
  if (o.type === 'move') return { x: o.x, y: o.y };
  return null;
}

export function updateVehicles(state, dt) {
  const cfg = state.cfg.tank;
  // Alternate which tank acts first each tick, so neither side shoots first.
  const order = state.tick % 2 ? [state.vehicles[1], state.vehicles[0]] : state.vehicles;
  for (const v of order) {
    if (!v.alive) continue;
    v.moved = 0;
    // Drive.
    const goal = goalOf(state, v);
    if (goal && Math.hypot(goal.x - v.x, goal.y - v.y) > 12) {
      const wp = nextWaypoint(state, v, goal);
      let speed = cfg.speed;
      const here = cellIndex(state.map, v.x, v.y);
      if (here >= 0 && state.map.ramp[here]) speed *= cfg.rampSpeed;
      // Head for the smoothed waypoint; if a cliff edge or ruin is in the
      // way, fall back to the next cell of the route, then to the middle of
      // the current cell, so a tank can never wedge itself for good.
      const c = state.map.cell;
      const centre = { x: (here % state.map.cols) * c + c / 2, y: ((here / state.map.cols) | 0) * c + c / 2 };
      const tries = [wp];
      if (v.path && v.path.length) tries.push(v.path[0]);
      tries.push(centre);
      for (const t of tries) {
        if (driveToward(state, v, here, t, speed * dt)) break;
      }
      if (!v.moved) v.path = null;
      crushWire(state, v);
      v.status = 'Advancing';
    } else if (v.order.type === 'move') v.status = 'In position';
    // Fight.
    fireMainGun(state, v, dt);
    fireMachineGun(state, v, dt);
  }
}

// Tracks roll flat any wire under them, leaving a lane infantry can use.
// Squads drop their cached routes so they notice the new gap straight away.
function crushWire(state, v) {
  const r = state.cfg.tank.crushRadius;
  const map = state.map;
  let crushed = false;
  forCells(map, v.x - r, v.y - r, v.x + r, v.y + r, (i, x, y) => {
    if (map.wire[i] > 0 && (x - v.x) ** 2 + (y - v.y) ** 2 <= r * r) {
      map.wire[i] = 0;
      if (!map.crushed) map.crushed = new Uint8Array(map.wire.length);
      map.crushed[i] = 1;
      crushed = true;
      state.events.push({ type: 'wireCut', i });
    }
  });
  if (crushed) for (const sq of state.squads) { sq.path = null; sq.waitSince = -1; }
}

// The best main gun target: the enemy tank if it can be seen and reached,
// otherwise the densest group of seen enemy infantry in range.
export function mainGunTarget(state, v, range = state.cfg.tank.mainGun.range) {
  const foe = enemyTank(state, v.side);
  if (foe && foe.spotted[v.side] && dist(foe, v) <= range && losClear(state, v.x, v.y, foe.x, foe.y)) return { tank: foe, x: foe.x, y: foe.y };
  const seen = state.sides[v.side].spotted;
  let best = null, bestN = 0;
  for (const e of state.soldiers) {
    if (e.side === v.side || !isActive(e) || !seen[e.id] || dist(e, v) > range) continue;
    let n = 0;
    for (const o of state.soldiers) if (o.side === e.side && isActive(o) && Math.abs(o.x - e.x) < 40 && Math.abs(o.y - e.y) < 40) n++;
    if (n > bestN && losClear(state, v.x, v.y, e.x, e.y)) { bestN = n; best = e; }
  }
  return best ? { x: best.x, y: best.y, n: bestN } : null;
}

function fireMainGun(state, v, dt) {
  if (state.tick < v.gunReady) return;
  const g = state.cfg.tank.mainGun;
  const t = mainGunTarget(state, v);
  if (!t) { v.gunReady = state.tick + 6; return; }
  shell(state, v, t, { vsTank: g.vsTank, blastDamage: g.blastDamage, accuracy: g.accuracy });
  v.gunReady = state.tick + Math.round((t.tank ? g.reloadSec : g.reloadVsInfantrySec) * state.cfg.tickRate);
}

// One main gun shell: against a tank it hits or misses; against infantry
// it bursts where it lands (a little scatter) and hurts everyone close.
export function shell(state, v, t, { vsTank, blastDamage, accuracy }) {
  const g = state.cfg.tank.mainGun;
  v.facing = t.x >= v.x ? 1 : -1;
  v.lastFireTick = state.tick;
  let x = t.x, y = t.y;
  if (t.tank) {
    if (next(state) < accuracy) damageVehicle(state, t.tank, vsTank, 'shell');
    else { const a = next(state) * Math.PI * 2; x += Math.cos(a) * 30; y += Math.sin(a) * 30; }
  } else {
    const a = next(state) * Math.PI * 2, r = next(state) * 14;
    x += Math.cos(a) * r; y += Math.sin(a) * r;
    for (const s of state.soldiers) {
      if (!isActive(s) || s.side === v.side) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d <= g.blastRadius) damageSoldier(state, s, blastDamage * (1 - (0.6 * d) / g.blastRadius), 'tankgun');
    }
    const hit = new Set();
    for (const s of state.soldiers) if (isActive(s) && s.side !== v.side && Math.hypot(s.x - x, s.y - y) < g.blastRadius * 1.8) hit.add(s.squad);
    for (const id of [...hit].sort((a, b) => a - b)) suppress(state, state.squads[id], g.suppress, 'blast', v);
  }
  breakWalls(state, x, y, state.cfg.walls.tankShell);
  state.events.push({ type: 'tankShot', side: v.side, x1: v.x + v.facing * 40, y1: v.y - 22, x2: x, y2: y });
}

function fireMachineGun(state, v, dt) {
  v.mgCd -= dt;
  if (v.mgCd > 0) return;
  const m = state.cfg.tank.mg;
  const seen = state.sides[v.side].spotted;
  let best = null, bd = m.range;
  for (const e of state.soldiers) {
    if (e.side === v.side || !isActive(e) || !seen[e.id]) continue;
    const d = dist(e, v);
    if (d < bd && losClear(state, v.x, v.y, e.x, e.y)) { bd = d; best = e; }
  }
  if (!best) { v.mgCd = 0.3; return; }
  fireShot(state, { x: v.x + v.facing * 20, y: v.y - 16, side: v.side }, best, m, m.range, false, 'tankmg');
  v.mgCd = m.fireInterval;
}

export function damageVehicle(state, v, amount, source) {
  if (!v.alive) return;
  v.hp -= amount;
  state.events.push({ type: 'vehicleHit', id: v.id, x: v.x, y: v.y });
  if (v.hp > 0) return;
  v.hp = 0;
  v.alive = false;
  state.sides[v.side].tankLost = true;
  // The wreck stays on the field as cover.
  const r = state.cfg.tank.wreckRadius;
  forCells(state.map, v.x - r, v.y - r * 0.6, v.x + r, v.y + r * 0.6, (i) => {
    if (state.map.grid[i] !== T.trench) state.map.grid[i] = T.rubble;
  });
  state.events.push({ type: 'vehicleDestroyed', id: v.id, side: v.side, x: v.x, y: v.y });
  const near = nearObjective(state, v, 400);
  feed(state, `${sideName(v.side)} tank destroyed${near ? ' near ' + near.id : ''}`, v.side, v);
}

// Blasts (artillery, grenades, petrusite, dives) hurt tanks caught in them.
export function blastVehicles(state, x, y, radius, damage, mult = state.cfg.tank.damageFrom.blast, exceptSide = -1) {
  for (const v of state.vehicles) {
    if (!v.alive || v.side === exceptSide) continue;
    const d = Math.hypot(v.x - x, v.y - y);
    if (d <= radius + v.radius) damageVehicle(state, v, damage * mult * (1 - (0.5 * Math.max(0, d - v.radius)) / radius), 'blast');
  }
}

// Infantry fire at a tank when there is no infantry target for them.
export function infantryVsTank(state, s, role, range, pinned) {
  const v = enemyTank(state, s.side);
  if (!v || !v.spotted[s.side] || dist(s, v) > range + v.radius || !losClear(state, s.x, s.y, v.x, v.y)) return false;
  const f = state.cfg.tank.damageFrom;
  const p = role.accuracy * (1 - state.cfg.combat.rangeFalloff * Math.min(1, dist(s, v) / range)) * (pinned ? state.cfg.combat.pinnedAccuracy : 1) * 1.5;
  const hit = next(state) < p;
  if (hit) damageVehicle(state, v, role.damage * (f[s.role] ?? f.other), 'fire');
  state.events.push({ type: 'shot', id: s.id, side: s.side, x1: s.x, y1: s.y, x2: v.x, y2: v.y - 14, hit });
  return true;
}

// Rolling cover: is this soldier sheltering behind their own tank from a
// shot fired from `from`?
export function behindTank(state, t, from) {
  const c = state.cfg.tank;
  for (const v of state.vehicles) {
    if (!v.alive || v.side !== t.side) continue;
    if (Math.hypot(t.x - v.x, t.y - v.y) > c.coverRadius) continue;
    // The tank must lie between the shooter and the soldier.
    const dx = from.x - t.x, dy = from.y - t.y, len = Math.hypot(dx, dy) || 1;
    const along = ((v.x - t.x) * dx + (v.y - t.y) * dy) / len;
    if (along <= 0 || along > len) continue;
    const across = Math.abs((v.x - t.x) * dy - (v.y - t.y) * dx) / len;
    if (across < v.radius) return true;
  }
  return false;
}

// Breaching charges planted by engineers, going off after their fuse.
export function updateCharges(state) {
  if (!state.charges.length) return;
  const b = state.cfg.breach;
  for (const ch of state.charges) {
    if (state.tick < ch.at) continue;
    const v = state.vehicles[ch.vehicle];
    state.events.push({ type: 'grenadeBlast', x: v.x, y: v.y });
    if (v.alive) damageVehicle(state, v, b.damage, 'charge'); // the charge sticks to the hull
  }
  state.charges = state.charges.filter((ch) => state.tick < ch.at);
}

export const vehicleVisible = (state, v, side) => v.side === side || v.spotted[side];

// Vision of and from tanks, run with the infantry vision update.
export function updateVehicleVision(state) {
  const t = state.cfg.tank;
  for (const v of state.vehicles) {
    v.spotted = [0, 0];
    v.spotted[v.side] = 1;
    if (!v.alive) { v.spotted = [1, 1]; continue; } // wrecks are just scenery
    const foe = 1 - v.side;
    for (const s of state.soldiers) {
      if (s.side !== foe || !isActive(s)) continue;
      const sight = state.cfg.roles[s.role].sight * 1.3; // a tank is hard to miss
      if ((s.x - v.x) ** 2 + (s.y - v.y) ** 2 < sight * sight && losClear(state, s.x, s.y, v.x, v.y)) { v.spotted[foe] = 1; break; }
    }
    const ft = state.vehicles.find((o) => o.side === foe && o.alive);
    if (!v.spotted[foe] && ft && dist(ft, v) < t.sight) v.spotted[foe] = 1;
  }
  // Tanks spot infantry for their own side.
  for (const v of state.vehicles) {
    if (!v.alive) continue;
    const seen = state.sides[v.side].spotted;
    for (const e of state.soldiers) {
      if (e.side === v.side || !isActive(e) || seen[e.id]) continue;
      const r = state.cfg.roles[e.role];
      if (r.hidden && state.tick - e.lastShotTick > r.revealSec * state.cfg.tickRate) continue;
      if ((e.x - v.x) ** 2 + (e.y - v.y) ** 2 < t.sight * t.sight && losClear(state, v.x, v.y, e.x, e.y)) seen[e.id] = 1;
    }
  }
}
