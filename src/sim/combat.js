// Vision, targeting, shooting, suppression and damage.

import { next } from './rng.js';
import { T } from './map.js';
import { terrainAt, heightAt, cellIndex } from './map.js';
import { coverAt, isActive, dist, feed, sideName } from './util.js';
import { explodeTank } from './features.js';
import { infantryVsTank, behindTank } from './vehicles.js';

// Is the line between two points blocked by smoke, or by raised ground
// higher than both ends (you cannot see through a hill)?
export function losClear(state, x1, y1, x2, y2) {
  for (const sm of state.smokes) {
    if (segHitsCircle(x1, y1, x2, y2, sm.x, sm.y, sm.r)) return false;
  }
  const map = state.map;
  // Walls block sight (the cells at either end do not count, so a soldier
  // at a window or a doorway can still see out).
  if (map.hasWalls) {
    const d = Math.hypot(x2 - x1, y2 - y1), steps = Math.floor(d / 8);
    for (let k = 2; k < steps - 1; k++) {
      const i = cellIndex(map, x1 + ((x2 - x1) * k) / steps, y1 + ((y2 - y1) * k) / steps);
      if (i >= 0 && map.grid[i] === T.wall) return false;
    }
  }
  if (map.hasHeight) {
    const top = Math.max(heightAt(map, x1, y1), heightAt(map, x2, y2));
    if (top < 2) {
      const d = Math.hypot(x2 - x1, y2 - y1), steps = Math.floor(d / 20);
      for (let k = 1; k < steps; k++) {
        const i = cellIndex(map, x1 + ((x2 - x1) * k) / steps, y1 + ((y2 - y1) * k) / steps);
        if (i >= 0 && map.elev[i] > top) return false;
      }
    }
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

// High ground adds range and sight; so does a ruined building.
const lift = (state, s) => 1 + state.cfg.height.rangePerLevel * heightAt(state.map, s.x, s.y);

export function weaponRange(state, s) {
  const r = state.cfg.roles[s.role].range * lift(state, s);
  return inBuilding(state, s) ? r * state.cfg.cover.building.rangeMult : r;
}

function sightOf(state, s) {
  const r = state.cfg.roles[s.role].sight * lift(state, s);
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
      if (e.markUntil > state.tick) { seen[e.id] = 1; continue; } // marked by recon
      // Infiltrators: hidden unless they have just fired or someone is close
      // (and fully hidden while they Vanish).
      const er = state.cfg.roles[e.role];
      const hiddenNow = er.hidden && (state.squads[e.squad].vanishUntil > state.tick || state.tick - e.lastShotTick > er.revealSec * state.cfg.tickRate);
      if (hiddenNow) {
        if (state.squads[e.squad].vanishUntil > state.tick) continue;
        for (const s of sol) {
          if (s.side === side && isActive(s) && (s.x - e.x) ** 2 + (s.y - e.y) ** 2 < er.revealDist * er.revealDist) { seen[e.id] = 1; break; }
        }
        continue;
      }
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

// The squad this soldier's platoon has been told to focus on, if any.
export function focusSquad(state, pl) {
  if (pl.focus < 0) return null;
  const sq = state.squads[pl.focus];
  if (state.tick >= pl.focusUntil || !sq.soldiers.some((id) => isActive(state.soldiers[id]))) { pl.focus = -1; return null; }
  return sq;
}

function pickTarget(state, s) {
  const range = weaponRange(state, s);
  const seen = state.sides[s.side].spotted;
  let best = -1, bd = range * range;
  // Focus fire: the nearest seen member of the focused squad, if one is in
  // range and in sight; otherwise the usual nearest enemy.
  const fq = focusSquad(state, state.platoons[state.squads[s.squad].platoon]);
  if (fq) {
    for (const id of fq.soldiers) {
      const e = state.soldiers[id];
      if (!isActive(e) || !seen[e.id]) continue;
      const d2 = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
      if (d2 < bd && losClear(state, s.x, s.y, e.x, e.y)) { bd = d2; best = e.id; }
    }
    if (best >= 0) return best;
  }
  for (const e of state.soldiers) {
    if (e.side === s.side || !isActive(e) || !seen[e.id]) continue;
    const d2 = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
    if (d2 < bd && losClear(state, s.x, s.y, e.x, e.y)) { bd = d2; best = e.id; }
  }
  return best;
}

// Cover for a soldier: none for jetpack troopers while they are in the air.
export function coverOf(state, t) {
  if (state.cfg.roles[t.role]?.flies && ['move', 'dive', 'charge', 'rout', 'evade'].includes(state.squads[t.squad].mode)) return state.cfg.cover.open;
  return coverAt(state, t.x, t.y);
}

// Where a shot comes from, as the target squad sees it: 0 front, 1 side, 2 rear.
export function aspectOf(state, shooter, target) {
  if (!shooter || !target.role) return 0;
  const sq = state.squads[target.squad];
  if (!sq || !sq.face) return 0;
  const dx = shooter.x - target.x, dy = shooter.y - target.y, L = Math.hypot(dx, dy) || 1;
  const ang = (Math.acos(Math.max(-1, Math.min(1, (dx * sq.face.x + dy * sq.face.y) / L))) * 180) / Math.PI;
  const f = state.cfg.combat.flank;
  return ang <= f.frontArc ? 0 : ang <= f.rearArc ? 1 : 2;
}

export function hitChance(state, accuracy, d, range, target, shooterPinned, shooter = null) {
  const c = state.cfg.combat;
  const cover = target.role ? coverOf(state, target) : coverAt(state, target.x, target.y);
  let p = accuracy * (1 - c.rangeFalloff * Math.min(1, d / range));
  // Cover faces the squad's threat: from the side it only half helps, from behind not at all.
  const aspect = aspectOf(state, shooter, target);
  p *= 1 - cover.hit * (aspect === 0 ? 1 : aspect === 1 ? c.flank.sideCover : 0);
  if (shooterPinned) p *= c.pinnedAccuracy;
  if (target.markUntil > state.tick) p *= state.cfg.abilities.mark.hitMult;
  if (shooter) {
    // Firing down from higher ground is easier; firing up at it is harder.
    const diff = heightAt(state.map, shooter.x, shooter.y) - heightAt(state.map, target.x, target.y);
    p *= Math.max(0.4, 1 + state.cfg.height.hitPerLevel * diff);
    // Rolling cover: sheltering close behind your own tank.
    if (target.role && state.vehicles.length && behindTank(state, target, shooter)) p *= 1 - state.cfg.tank.coverHit;
  }
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
    if (!t || !isActive(t) || s.retarget <= 0 || dist(s, t) > range || !state.sides[s.side].spotted[t.id] || (state.platoons[sq.platoon].focus >= 0 && t.squad !== state.platoons[sq.platoon].focus)) {
      s.target = pickTarget(state, s);
      s.retarget = cfg.combat.retargetSec;
      t = s.target >= 0 ? state.soldiers[s.target] : null;
    }
    const barrage = sq.barrageUntil > state.tick;
    let base = cfg.roles[s.role];
    // Heavies are the anti-armour weapon: they turn on a tank in range first.
    // Everyone else only shoots at it when there is no soldier to shoot.
    if ((s.role === 'heavy' || !t) && infantryVsTank(state, s, base, range, sq.pinned && !barrage)) {
      s.lastShotTick = state.tick;
      s.cd = base.fireInterval * (0.85 + 0.3 * next(state));
      sq.lastFiredTick = state.tick;
      continue;
    }
    // Heavies turn on an enemy MG nest that is firing; everyone else shoots
    // at one only when there is no soldier to shoot.
    if ((s.role === 'heavy' || !t) && fireAtNest(state, s, base, range, sq.pinned && !barrage)) {
      s.lastShotTick = state.tick;
      s.cd = base.fireInterval * (0.85 + 0.3 * next(state));
      sq.lastFiredTick = state.tick;
      continue;
    }
    if (!t) { s.cd = 0.2; continue; }
    // An infiltrator firing from hiding: the first shots hit much harder.
    if (base.hidden && state.tick - s.lastShotTick > base.revealSec * cfg.tickRate) base = { ...base, damage: base.damage * base.ambushMult };
    s.lastShotTick = state.tick;
    const b = cfg.abilities.barrage;
    const role = barrage ? { ...base, suppress: base.suppress * b.suppressMult } : base;
    const pinned = sq.pinned && !barrage;
    fireShot(state, s, t, role, range, pinned, 'fire');
    s.cd = (role.fireInterval / (barrage ? b.fireMult : 1)) * (pinned ? cfg.combat.pinnedFireSlow : 1) * (0.85 + 0.3 * next(state));
    sq.lastFiredTick = state.tick;
  }
}

// Fire at an enemy MG nest's crew: no kills, but it piles suppression on
// the nest (see updateEmplacements). Heavies only bother while it is firing.
function fireAtNest(state, s, w, range, pinned) {
  let best = null, bd = range;
  for (const site of state.sites) {
    if (site.kind !== 'mg' || site.owner === null || site.owner === s.side) continue;
    if (s.role === 'heavy' && !(state.tick - (site.lastShotTick ?? -9999) < 2 * state.cfg.tickRate)) continue;
    const d = dist(s, site);
    if (d < bd && losClear(state, s.x, s.y, site.x, site.y)) { bd = d; best = site; }
  }
  if (!best) return false;
  const m = state.cfg.features.mgSilence;
  best.supp = Math.min(100, (best.supp || 0) + w.suppress * m.perShot * (pinned ? state.cfg.combat.pinnedAccuracy : 1));
  const a = next(state) * Math.PI * 2;
  state.events.push({ type: 'shot', id: s.id, side: s.side, x1: s.x, y1: s.y, x2: best.x + Math.cos(a) * 10, y2: best.y + Math.sin(a) * 10, hit: false, src: 'fire' });
  return true;
}

// One shot from a soldier or an MG nest at a target soldier.
export function fireShot(state, from, t, w, range, shooterPinned, source) {
  const d = dist(from, t);
  const p = hitChance(state, w.accuracy, d, range, t, shooterPinned, from);
  const hit = next(state) < p;
  let ix = t.x, iy = t.y;
  const f = state.cfg.combat.flank;
  const aspect = aspectOf(state, from, t);
  const tsq = state.squads[t.squad];
  if (aspect && state.tick - tsq.flankedTick > f.feedEverySec * state.cfg.tickRate) {
    tsq.flankedTick = state.tick;
    const pl = state.platoons[tsq.platoon];
    feed(state, `${sideName(t.side)} ${state.cfg.roles[tsq.role].label} squad (${pl.name}) ${aspect === 2 ? 'hit from behind' : 'flanked'}!`, t.side, t);
    state.events.push({ type: 'flanked', side: t.side, squad: tsq.id, x: t.x, y: t.y, rear: aspect === 2 });
  }
  if (hit) {
    const dmg = (w.closeRange && d < w.closeRange ? w.damage * w.closeMult : w.damage) * state.cfg.combat.damageMult * (aspect === 2 ? f.rearDamage : aspect === 1 ? f.sideDamage : 1);
    damageSoldier(state, t, dmg, source === 'fire' ? from.role || 'rifle' : source);
  } else {
    // Stray rounds land near the target and might find a petrusite tank.
    const a = next(state) * Math.PI * 2, r = next(state) * state.cfg.combat.strayRadius;
    ix = t.x + Math.cos(a) * r; iy = t.y + Math.sin(a) * r;
    strayImpact(state, ix, iy);
  }
  const cover = coverOf(state, t);
  const coverSupp = aspect === 0 ? cover.supp : aspect === 1 ? 1 - (1 - cover.supp) * f.sideCover : 1;
  suppress(state, tsq, w.suppress * coverSupp * (hit ? state.cfg.suppression.hitMult : 1) * (aspect === 2 ? f.rearSupp : aspect === 1 ? f.sideSupp : 1), source, from);
  state.events.push({ type: 'shot', id: from.id === undefined ? -1 : from.id, side: from.side, x1: from.x, y1: from.y, x2: ix, y2: iy, hit, src: source });
}

export function strayImpact(state, x, y) {
  const r = state.cfg.features.tank.radius;
  for (const tank of state.tanks) {
    if (!tank.exploded && (tank.x - x) ** 2 + (tank.y - y) ** 2 < r * r) explodeTank(state, tank);
  }
}

export function suppress(state, sq, amount, source, from = null) {
  const cfg = state.cfg.suppression;
  if (from) sq.hitFrom = { x: from.x, y: from.y, tick: state.tick };
  sq.supp = Math.min(cfg.max, sq.supp + amount);
  sq.lastHitTick = state.tick;
  sq.tally[source] = (sq.tally[source] || 0) + amount;
}

export function damageSoldier(state, s, dmg, cause = 'rifle') {
  if (!isActive(s)) return;
  // Turn-based battles: the live fight is only a picture; losses come from
  // the turn rules alone (which set state.tb.applying while they apply them).
  if (state.tb && !state.tb.applying) { state.events.push({ type: 'hit', id: s.id, x: s.x, y: s.y, side: s.side }); return; }
  s.hp -= dmg;
  s.lastCause = cause;
  state.events.push({ type: 'hit', id: s.id, x: s.x, y: s.y, side: s.side });
  if (s.hp > 0) return;
  s.alive = false;
  s.hp = 0;
  // Bullets leave a soldier down (a medic can still get them up); blasts
  // and shells kill outright.
  const med = state.cfg.medic;
  s.downed = !state.tb && !med.killOutright.includes(cause);
  if (s.downed) { s.bleedUntil = state.tick + Math.round(med.bleedSec * state.cfg.tickRate); s.medicBy = -1; }
  state.sides[s.side].casualties++;
  const lb = state.sides[s.side].lossBy;
  lb[cause] = (lb[cause] || 0) + 1;
  const owner = state.squads[s.squad];
  owner.lossBy[cause] = (owner.lossBy[cause] || 0) + 1;
  state.events.push({ type: s.downed ? 'downed' : 'death', id: s.id, x: s.x, y: s.y, side: s.side });
  const sq = state.squads[s.squad];
  if (sq.soldiers.every((id) => !state.soldiers[id].alive)) {
    const pl = state.platoons[sq.platoon];
    // Say what did most of the damage, so a loss can be understood.
    let top = null;
    for (const k in sq.lossBy) if (!top || sq.lossBy[k] > sq.lossBy[top]) top = k;
    const by = top && state.cfg.causes[top] ? `, mostly by ${state.cfg.causes[top]}` : '';
    feed(state, `${sideName(s.side)} ${state.cfg.roles[sq.role].label} squad (${pl.name}) wiped out${by}`, s.side, s);
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
    const stance = state.cfg.stances[pl.stance];
    const pinAt = c.pinAt * stance.pinMult;
    if (state.tb) { sq.pinned = false; continue; } // turn-based: squads always carry out their moves
    if (!sq.pinned && sq.supp >= pinAt) sq.pinned = true;
    else if (sq.pinned && sq.supp < pinAt * (stance.unpinShare ?? c.unpinShare)) sq.pinned = false;
    for (const k in sq.tally) sq.tally[k] *= 0.995;
  }
}
