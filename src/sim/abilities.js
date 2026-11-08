// Squad abilities: one per role, free to use but on a cooldown. Used through
// the 'ability' command by the player and the AI alike. Targets are picked
// automatically (nearest sensible enemy) so they work with one tap on a phone.

import { T, cellIndex, forCells, heightAt } from './map.js';
import { members, centroid, dist, isActive, sideDir, feed } from './util.js';
import { blast } from './features.js';
import { blastVehicles } from './vehicles.js';
import { damageSoldier, suppress } from './combat.js';

export const ABILITY_OF = { rifle: 'grenade', heavy: 'barrage', assault: 'charge', engineer: 'sandbags', recon: 'mark', jump: 'dive', infiltrator: 'vanish' };

const fail = (reason) => ({ ok: false, reason });

function nearestSeenEnemy(state, side, p, maxD) {
  const seen = state.sides[side].spotted;
  let best = null, bd = maxD;
  for (const e of state.soldiers) {
    if (e.side === side || !isActive(e) || !seen[e.id]) continue;
    const d = dist(e, p);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// Engineers swap sandbags for a breaching charge when an enemy tank they can
// see is close enough to reach.
export function breachTarget(state, sq, c) {
  if (sq.role !== 'engineer') return null;
  const v = state.vehicles.find((o) => o.alive && o.side !== sq.side && o.spotted[sq.side]);
  return v && dist(v, c) <= state.cfg.breach.range ? v : null;
}

export const abilityKey = (state, sq) => {
  const key = ABILITY_OF[sq.role];
  if (key !== 'sandbags') return key;
  const list = members(state, sq);
  return list.length && breachTarget(state, sq, centroid(list)) ? 'breach' : key;
};

export function useAbility(state, sq) {
  const key = abilityKey(state, sq);
  const a = key === 'breach' ? state.cfg.breach : state.cfg.abilities[key];
  const list = members(state, sq);
  if (!list.length) return fail('That squad is gone');
  if (sq.mode === 'rout') return fail('That squad is routing');
  if (state.tick < sq.abilityReady) return fail(`${a.label} is not ready yet`);
  const c = centroid(list);
  const ticks = (sec) => Math.round(sec * state.cfg.tickRate);

  switch (key) {
    case 'grenade': {
      const t = nearestSeenEnemy(state, sq.side, c, a.range);
      if (!t) return fail('No enemy within throwing range');
      const thrower = list[0];
      state.throws.push({ side: sq.side, x: t.x, y: t.y, at: state.tick + ticks(a.fuseSec) });
      state.events.push({ type: 'throw', x1: thrower.x, y1: thrower.y, x2: t.x, y2: t.y, sec: a.fuseSec });
      break;
    }
    case 'barrage': {
      const t = nearestSeenEnemy(state, sq.side, c, state.cfg.roles.heavy.range * (1 + state.cfg.height.rangePerLevel * heightAt(state.map, c.x, c.y)));
      if (!t) return fail('No enemy in range to suppress');
      sq.barrageUntil = state.tick + ticks(a.durationSec);
      break;
    }
    case 'charge': {
      const t = nearestSeenEnemy(state, sq.side, c, a.range);
      if (!t) return fail('No enemy close enough to charge');
      sq.chargeUntil = state.tick + ticks(a.durationSec);
      sq.chargeTarget = t.id;
      sq.supp = 0;
      sq.pinned = false;
      break;
    }
    case 'sandbags': {
      // A crescent of sandbags in front of the squad, facing the nearest
      // enemy it can see (or straight ahead).
      const t = nearestSeenEnemy(state, sq.side, c, 600);
      let fx = sideDir(sq.side), fy = 0;
      if (t) { const d = dist(t, c) || 1; fx = (t.x - c.x) / d; fy = (t.y - c.y) / d; }
      const px = c.x + fx * a.offset, py = c.y + fy * a.offset;
      const cells = [];
      const map = state.map;
      forCells(map, px - a.radius, py - a.radius, px + a.radius, py + a.radius, (i, x, y) => {
        const r = Math.hypot(x - px, y - py);
        const ahead = (x - c.x) * fx + (y - c.y) * fy;
        if (r > a.radius || r < a.radius - a.thickness || ahead < a.offset * 0.4) return;
        if (map.grid[i] === T.trench || map.grid[i] === T.building || map.wire[i] > 0) return;
        map.grid[i] = T.sandbag;
        cells.push(i);
      });
      if (!cells.length) return fail('No room for sandbags here');
      state.events.push({ type: 'sandbags', cells });
      for (const s of list) { s.tx = s.x; s.ty = s.y; }
      sq.holdSpot = null;
      break;
    }
    case 'mark': {
      const sight = state.cfg.roles.recon.sight * (1 + state.cfg.height.rangePerLevel * heightAt(state.map, c.x, c.y));
      const t = nearestSeenEnemy(state, sq.side, c, sight);
      if (!t) return fail('No enemy in sight to mark');
      let n = 0;
      for (const e of state.soldiers) {
        if (e.side === sq.side || !isActive(e) || dist(e, t) > a.radius) continue;
        e.markUntil = state.tick + ticks(a.durationSec);
        n++;
      }
      state.events.push({ type: 'mark', x: t.x, y: t.y, r: a.radius });
      feed(state, `${sq.side === 0 ? 'ISA' : 'Helghast'} recon marked ${n} enemies`, sq.side);
      break;
    }
    case 'dive': {
      // Leap onto the nearest enemy group; the landing is resolved when the
      // flight ends (see updateDives).
      const t = nearestSeenEnemy(state, sq.side, c, a.range);
      if (!t) return fail('No enemy within jumping range');
      sq.diveUntil = state.tick + ticks(a.flightSec);
      sq.diveTarget = { x: t.x, y: t.y };
      sq.supp = 0;
      sq.pinned = false;
      state.events.push({ type: 'dive', side: sq.side, x: t.x, y: t.y });
      break;
    }
    case 'breach': {
      const v = breachTarget(state, sq, c);
      sq.breachVehicle = v.id;
      sq.breachUntil = state.tick + ticks(a.runSec);
      sq.supp = 0;
      sq.pinned = false;
      break;
    }
    case 'vanish': {
      sq.vanishUntil = state.tick + ticks(a.durationSec);
      for (const s of list) s.lastShotTick = -9999; // no longer given away by their last shots
      state.events.push({ type: 'vanish', side: sq.side, x: c.x, y: c.y });
      break;
    }
    default:
      return fail('Unknown ability');
  }
  sq.abilityReady = state.tick + ticks(a.cooldownSec);
  state.sides[sq.side].abilities++;
  sq.abilityUsed = key;
  return { ok: true };
}

// Would this squad's ability find something to do right now? (For the
// interface: buttons only light up when tapping them would work.)
export function abilityHasTarget(state, sq) {
  const key = abilityKey(state, sq);
  if (key === 'sandbags' || key === 'breach') return true;
  const list = members(state, sq);
  if (!list.length) return false;
  const c = centroid(list);
  const lift = 1 + state.cfg.height.rangePerLevel * heightAt(state.map, c.x, c.y);
  const reach = { grenade: state.cfg.abilities.grenade.range, charge: state.cfg.abilities.charge.range, barrage: state.cfg.roles.heavy.range * lift, mark: state.cfg.roles.recon.sight * lift, dive: state.cfg.abilities.dive.range, vanish: 400 }[key];
  return !!nearestSeenEnemy(state, sq.side, c, reach);
}

// Jetpack squads land at the end of a dive: a stomp that hurts and pins
// enemies close to the landing (not their own side).
export function updateDives(state) {
  const a = state.cfg.abilities.dive;
  for (const sq of state.squads) {
    if (!sq.diveTarget || state.tick < sq.diveUntil) continue;
    const { x, y } = sq.diveTarget;
    sq.diveTarget = null;
    state.events.push({ type: 'landing', side: sq.side, x, y });
    const hit = new Set();
    for (const s of state.soldiers) {
      if (s.side === sq.side || !isActive(s)) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d > a.radius * 1.6) continue;
      hit.add(s.squad);
      if (d <= a.radius) damageSoldier(state, s, a.damage * (1 - (0.5 * d) / a.radius), 'dive');
    }
    for (const id of [...hit].sort((p, q) => p - q)) suppress(state, state.squads[id], a.suppress, 'blast', { x, y });
    blastVehicles(state, x, y, a.radius, a.damage, undefined, sq.side);
  }
}

// Grenades in flight land after their fuse.
export function updateThrows(state) {
  if (!state.throws.length) return;
  const a = state.cfg.abilities.grenade;
  for (const g of state.throws) {
    if (state.tick < g.at) continue;
    state.events.push({ type: 'grenadeBlast', x: g.x, y: g.y });
    blast(state, g.x, g.y, a.radius, a.damage, a.radius * 1.6, a.suppress, 'blast', 1, 'grenade');
  }
  state.throws = state.throws.filter((g) => state.tick < g.at);
}

// Is the cell at this point a fresh sandbag wall? (for drawing)
export const isSandbag = (map, x, y) => map.grid[cellIndex(map, x, y)] === T.sandbag;
