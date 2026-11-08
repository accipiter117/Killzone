// Squad abilities: one per role, free to use but on a cooldown. Used through
// the 'ability' command by the player and the AI alike. Targets are picked
// automatically (nearest sensible enemy) so they work with one tap on a phone.

import { T, cellIndex, forCells, heightAt } from './map.js';
import { members, centroid, dist, isActive, sideDir, feed } from './util.js';
import { blast } from './features.js';

export const ABILITY_OF = { rifle: 'grenade', heavy: 'barrage', assault: 'charge', engineer: 'sandbags', recon: 'mark' };

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

export function useAbility(state, sq) {
  const key = ABILITY_OF[sq.role];
  const a = state.cfg.abilities[key];
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
  const key = ABILITY_OF[sq.role];
  if (key === 'sandbags') return true;
  const list = members(state, sq);
  if (!list.length) return false;
  const c = centroid(list);
  const lift = 1 + state.cfg.height.rangePerLevel * heightAt(state.map, c.x, c.y);
  const reach = { grenade: state.cfg.abilities.grenade.range, charge: state.cfg.abilities.charge.range, barrage: state.cfg.roles.heavy.range * lift, mark: state.cfg.roles.recon.sight * lift }[key];
  return !!nearestSeenEnemy(state, sq.side, c, reach);
}

// Grenades in flight land after their fuse.
export function updateThrows(state) {
  if (!state.throws.length) return;
  const a = state.cfg.abilities.grenade;
  for (const g of state.throws) {
    if (state.tick < g.at) continue;
    state.events.push({ type: 'grenadeBlast', x: g.x, y: g.y });
    blast(state, g.x, g.y, a.radius, a.damage, a.radius * 1.6, a.suppress, 'blast');
  }
  state.throws = state.throws.filter((g) => state.tick < g.at);
}

// Is the cell at this point a fresh sandbag wall? (for drawing)
export const isSandbag = (map, x, y) => map.grid[cellIndex(map, x, y)] === T.sandbag;
