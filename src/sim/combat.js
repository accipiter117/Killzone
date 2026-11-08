// Vision, targeting, shooting, suppression and damage.

import { next } from './rng.js';
import { T } from './map.js';
import { terrainAt } from './map.js';
import { coverAt, isActive, dist, feed, sideName } from './util.js';
import { explodeTank } from './features.js';

// Does any smoke cloud block the line between two points?
export function losClear(state, x1, y1, x2, y2) {
  for (const sm of state.smokes) {
    if (segHitsCircle(x1, y1, x2, y2, sm.x, sm.y, sm.r)) return false;
  }
  return true;
}

function segHitsCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / len2));
  const px = x1 + t * dx - cx, py = y1 + t * dy - cy;
  return px * px + py * py < r * r;
}

const inBuilding = (state, s) => terrainAt(state.map, s.x, s.y) === T.building;

export function weaponRange(state, s) {
  const r = state.cfg.roles[s.role].range;
  return inBuilding(state, s) ? r * state.cfg.cover.building.rangeMult : r;
}

function sightOf(state, s) {
  const r = state.cfg.roles[s.role].sight;
  return inBuilding(state, s) ? r * state.cfg.cover.building.rangeMult : r;
}

// Which enemy soldiers each side can currently see. Recon squads have long
// sight, so they reveal targets for everyone else on their side.
export function updateVision(state) {
  const sol = state.soldiers;
  for (const side of [0, 1]) {
    const seen = state.sides[side].spotted;
    seen.fill(0);
    for (const e of sol) {
      if (e.side === side || !isActive(e)) continue;
      for (const s of sol) {
        if (s.side !== side || !isActive(s)) continue;
        const sight = sightOf(state, s);
        const dx = e.x - s.x, dy = e.y - s.y;
        if (dx * dx + dy * dy > sight * sight) continue;
        if (!losClear(state, s.x, s.y, e.x, e.y)) continue;
        seen[e.id] = 1;
        break;
      }
    }
  }
}

function pickTarget(state, s) {
  const range = weaponRange(state, s);
  const seen = state.sides[s.side].spotted;
  let best = -1, bd = range * range;
  for (const e of state.soldiers) {
    if (e.side === s.side || !isActive(e) || !seen[e.id]) continue;
    const d2 = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
    if (d2 < bd && losClear(state, s.x, s.y, e.x, e.y)) { bd = d2; best = e.id; }
  }
  return best;
}

export function hitChance(state, accuracy, d, range, target, shooterPinned) {
  const c = state.cfg.combat;
  const cover = coverAt(state, target.x, target.y);
  let p = accuracy * (1 - c.rangeFalloff * Math.min(1, d / range));
  p *= 1 - cover.hit;
  if (shooterPinned) p *= c.pinnedAccuracy;
  return p;
}

export function updateFiring(state, dt) {
  const cfg = state.cfg;
  const sol = state.soldiers;
  const n = sol.length;
  // Alternate the order each tick so neither side always shoots first.
  for (let i = 0; i < n; i++) {
    const s = sol[state.tick % 2 ? n - 1 - i : i];
    if (!isActive(s)) continue;
    const sq = state.squads[s.squad];
    if (sq.mode === 'rout') continue;
    s.cd -= dt;
    if (s.cd > 0) continue;
    s.retarget -= dt;
    let t = s.target >= 0 ? state.soldiers[s.target] : null;
    const range = weaponRange(state, s);
    if (!t || !isActive(t) || s.retarget <= 0 || dist(s, t) > range || !state.sides[s.side].spotted[t.id]) {
      s.target = pickTarget(state, s);
      s.retarget = cfg.combat.retargetSec;
      t = s.target >= 0 ? state.soldiers[s.target] : null;
    }
    if (!t) { s.cd = 0.2; continue; }
    const role = cfg.roles[s.role];
    fireShot(state, s, t, role, range, sq.pinned, 'fire');
    s.cd = role.fireInterval * (sq.pinned ? cfg.combat.pinnedFireSlow : 1) * (0.85 + 0.3 * next(state));
    sq.lastFiredTick = state.tick;
  }
}

// One shot from a soldier or an MG nest at a target soldier.
export function fireShot(state, from, t, w, range, shooterPinned, source) {
  const d = dist(from, t);
  const p = hitChance(state, w.accuracy, d, range, t, shooterPinned);
  const hit = next(state) < p;
  let ix = t.x, iy = t.y;
  if (hit) {
    const dmg = w.closeRange && d < w.closeRange ? w.damage * w.closeMult : w.damage;
    damageSoldier(state, t, dmg);
  } else {
    // Stray rounds land near the target and might find a petrusite tank.
    const a = next(state) * Math.PI * 2, r = next(state) * state.cfg.combat.strayRadius;
    ix = t.x + Math.cos(a) * r; iy = t.y + Math.sin(a) * r;
    strayImpact(state, ix, iy);
  }
  const cover = coverAt(state, t.x, t.y);
  suppress(state, state.squads[t.squad], w.suppress * cover.supp * (hit ? state.cfg.suppression.hitMult : 1), source);
  state.events.push({ type: 'shot', side: from.side, x1: from.x, y1: from.y, x2: ix, y2: iy, hit, src: source });
}

export function strayImpact(state, x, y) {
  const r = state.cfg.features.tank.radius;
  for (const tank of state.tanks) {
    if (!tank.exploded && (tank.x - x) ** 2 + (tank.y - y) ** 2 < r * r) explodeTank(state, tank);
  }
}

export function suppress(state, sq, amount, source) {
  const cfg = state.cfg.suppression;
  sq.supp = Math.min(cfg.max, sq.supp + amount);
  sq.lastHitTick = state.tick;
  sq.tally[source] = (sq.tally[source] || 0) + amount;
}

export function damageSoldier(state, s, dmg) {
  if (!isActive(s)) return;
  s.hp -= dmg;
  state.events.push({ type: 'hit', x: s.x, y: s.y, side: s.side });
  if (s.hp > 0) return;
  s.alive = false;
  s.hp = 0;
  state.sides[s.side].casualties++;
  state.events.push({ type: 'death', x: s.x, y: s.y, side: s.side });
  const sq = state.squads[s.squad];
  if (sq.soldiers.every((id) => !state.soldiers[id].alive)) {
    const pl = state.platoons[sq.platoon];
    feed(state, `${sideName(s.side)} ${state.cfg.roles[sq.role].label} squad (${pl.name}) wiped out`, s.side);
  }
}

// Suppression wears off, quickly once the shooting stops. Pinned has a
// threshold with hysteresis so squads do not flicker in and out of it.
export function updateSuppression(state, dt) {
  const c = state.cfg.suppression;
  const quietTicks = c.quietSec * state.cfg.tickRate;
  for (const sq of state.squads) {
    const quiet = state.tick - sq.lastHitTick > quietTicks;
    sq.supp = Math.max(0, sq.supp - (quiet ? c.quietDecay : c.decay) * dt);
    const pl = state.platoons[sq.platoon];
    const pinAt = c.pinAt * state.cfg.stances[pl.stance].pinMult;
    if (!sq.pinned && sq.supp >= pinAt) sq.pinned = true;
    else if (sq.pinned && sq.supp < pinAt * c.unpinShare) sq.pinned = false;
    for (const k in sq.tally) sq.tally[k] *= 0.995;
  }
}
