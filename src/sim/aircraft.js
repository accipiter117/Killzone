// Aircraft called in from a vehicle depot the side holds (see callins.js).
// They fly in straight lines over everything (walls, cliffs, water), so a
// call-in is a quick reach across the map rather than a unit to steer.
//
// Gunship: flies from the depot through the point it was sent to and rakes
// a strip of ground either side of that point with cannon fire, hurting and
// pinning the enemy it finds there, then flies on and away.
// Dropship: flies to the point, settles, and puts fresh soldiers down into
// the side's most depleted platoon (filling its weakest squad's empty
// places), then flies home.
//
// All randomness is the sim's (state.rng), so replays stay exact.

import { next } from './rng.js';
import { isActive, members, feed, sideName } from './util.js';
import { damageSoldier, suppress } from './combat.js';
import { damageVehicle } from './vehicles.js';

const DEG = Math.PI / 180;

// The platoon a dropship would reinforce: most empty places first, then the
// one nearest the landing point. Reserve platoons (still off the field) and
// platoons that have run off for good are left out.
export function dropshipPlatoon(state, side, x, y) {
  let best = null, bestMissing = 0, bestD = Infinity;
  for (const pl of state.platoons) {
    if (pl.side !== side || pl.reserve || (pl.broken && pl.rallied)) continue;
    let missing = 0, cx = 0, cy = 0, n = 0;
    for (const id of pl.squads) {
      const sq = state.squads[id];
      for (const sid of sq.soldiers) {
        const s = state.soldiers[sid];
        if (!s.alive || s.fled) missing++;
        else { cx += s.x; cy += s.y; n++; }
      }
    }
    if (!missing) continue;
    const d = n ? Math.hypot(cx / n - x, cy / n - y) : 0;
    if (missing > bestMissing || (missing === bestMissing && d < bestD)) { best = pl; bestMissing = missing; bestD = d; }
  }
  return best;
}

export function launchAircraft(state, side, kind, from, to) {
  const a = state.cfg.aircraft[kind];
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const craft = {
    id: (state.aircraftSeq = (state.aircraftSeq || 0) + 1), kind, side,
    x: from.x, y: from.y, alt: 0, heading: ang, home: { x: from.x, y: from.y }, to: { x: to.x, y: to.y },
    phase: 'out', until: 0, shotCd: 0, done: false,
  };
  if (kind === 'dropship') craft.platoon = dropshipPlatoon(state, side, to.x, to.y)?.id ?? -1;
  state.aircraft.push(craft);
  state.events.push({ type: 'aircraft', kind, side, x: from.x, y: from.y });
  feed(state, `${sideName(side)} ${a.label.toLowerCase()} inbound`, side, to);
  return craft;
}

function fly(c, tx, ty, speed, dt) {
  const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
  if (d < 1e-6) return true;
  c.heading = Math.atan2(dy, dx);
  const step = Math.min(d, speed * dt);
  c.x += (dx / d) * step; c.y += (dy / d) * step;
  return step >= d;
}

export function updateAircraft(state, dt) {
  if (!state.aircraft.length) return;
  const cfgA = state.cfg.aircraft;
  const W = state.map.width, H = state.map.height;
  for (const c of state.aircraft) {
    const a = cfgA[c.kind];
    if (c.kind === 'gunship') {
      c.alt = Math.min(1, c.alt + dt / a.climbSec);
      // Straight on through the target and out the far side.
      // It slows down over the strip to give its gunners time.
      const ux = Math.cos(c.heading), uy = Math.sin(c.heading);
      const along0 = (c.x - c.to.x) * ux + (c.y - c.to.y) * uy;
      const strafing = along0 >= -a.runLength / 2 - a.reach && along0 <= a.runLength / 2;
      const v = strafing ? a.strafeSpeed : a.speed;
      c.x += ux * v * dt; c.y += uy * v * dt;
      const along = (c.x - c.to.x) * ux + (c.y - c.to.y) * uy;
      c.firing = strafing && along <= a.runLength / 2 - a.leadDist;
      if (strafing) strafe(state, c, a, dt, along);
      if (along > a.runLength / 2 + a.exitDist || c.x < -200 || c.y < -200 || c.x > W + 200 || c.y > H + 200) c.done = true;
      continue;
    }
    // Dropship: out, settle, unload, lift and go home.
    if (c.phase === 'out') {
      c.alt = Math.min(1, c.alt + dt / a.climbSec);
      if (fly(c, c.to.x, c.to.y, a.speed, dt)) { c.phase = 'land'; c.until = state.tick + Math.round(a.landSec * state.cfg.tickRate); }
    } else if (c.phase === 'land') {
      c.alt = Math.max(a.landedAlt, c.alt - dt / a.landSec);
      if (state.tick >= c.until) { unload(state, c, a); c.phase = 'hold'; c.until = state.tick + Math.round(a.holdSec * state.cfg.tickRate); }
    } else if (c.phase === 'hold') {
      if (state.tick >= c.until) c.phase = 'home';
    } else {
      c.alt = Math.min(1, c.alt + dt / a.climbSec);
      if (fly(c, c.home.x, c.home.y, a.speed, dt)) c.done = true;
    }
  }
  state.aircraft = state.aircraft.filter((c) => !c.done);
}

// Cannon fire into the part of the strip just ahead of the gunship (from
// leadDist to reach in front of it, width either side of its track, and
// never past the strip's far end).
function strafe(state, c, a, dt, along) {
  c.shotCd -= dt;
  const ux = Math.cos(c.heading), uy = Math.sin(c.heading);
  const end = a.runLength / 2 - along; // how far ahead the strip still runs
  const far = Math.min(a.reach, end);
  while (c.shotCd <= 0) {
    c.shotCd += 1 / a.shotsPerSec;
    if (far < a.leadDist) continue;
    const ahead = (s) => {
      const f = (s.x - c.x) * ux + (s.y - c.y) * uy, side = Math.abs((s.x - c.x) * uy - (s.y - c.y) * ux);
      return f >= a.leadDist && f <= far && side <= a.width;
    };
    // Every enemy in that zone is a candidate; one is picked at random, or
    // the shot lands in the dirt.
    const near = state.soldiers.filter((s) => s.side !== c.side && isActive(s) && ahead(s));
    const f = a.leadDist + next(state) * (far - a.leadDist), spread = (next(state) - 0.5) * 2 * a.width;
    const gx = c.x + ux * f, gy = c.y + uy * f;
    let hx = gx - uy * spread, hy = gy + ux * spread;
    if (near.length) {
      const t = near[Math.floor(next(state) * near.length)];
      if (next(state) < a.hitChance) {
        damageSoldier(state, t, a.damage, 'gunship');
        hx = t.x; hy = t.y;
      }
      suppress(state, state.squads[t.squad], a.suppress, 'gunship', { x: c.x, y: c.y });
    }
    for (const v of state.vehicles) {
      if (v.side !== c.side && v.alive && !v.absent && ahead(v) && next(state) < a.hitChance) damageVehicle(state, v, a.tankDamage, 'gunship', { x: c.x, y: c.y });
    }
    state.events.push({ type: 'strafe', side: c.side, x1: c.x, y1: c.y, x2: hx, y2: hy });
  }
}

// Fresh soldiers out of the dropship into the chosen platoon's weakest
// squads (as many as fit, up to the dropship's load), round the landing
// point. They run to catch up with their squads.
function unload(state, c, a) {
  const pl = c.platoon >= 0 ? state.platoons[c.platoon] : dropshipPlatoon(state, c.side, c.x, c.y);
  if (!pl) { feed(state, `${sideName(c.side)} dropship lands, but every platoon is at full strength`, c.side, c); return; }
  const W = state.map.width, H = state.map.height;
  let load = a.soldiers, k = 0;
  const squads = pl.squads.map((id) => state.squads[id]).sort((p, q) => members(state, p).length - members(state, q).length || p.id - q.id);
  for (const sq of squads) {
    for (const sid of sq.soldiers) {
      if (load <= 0) break;
      const s = state.soldiers[sid];
      if (s.alive && !s.fled) continue;
      const ang = (k * 72 + 20) * DEG, r = 16 + (k % 2) * 10;
      s.x = s.tx = Math.max(10, Math.min(W - 10, c.x + Math.cos(ang) * r));
      s.y = s.ty = Math.max(10, Math.min(H - 10, c.y + Math.sin(ang) * r));
      Object.assign(s, { alive: true, fled: false, downed: false, hp: s.maxHp, target: -1, markUntil: 0, joining: true, route: null });
      load--; k++;
      if (sq.mode === 'dead') { sq.mode = 'move'; sq.path = null; }
    }
  }
  state.sides[c.side].reinforcements = (state.sides[c.side].reinforcements || 0) + 1;
  feed(state, `${sideName(c.side)} dropship lands ${k} fresh soldiers for ${pl.name}`, c.side, c);
  state.events.push({ type: 'landed', side: c.side, x: c.x, y: c.y, n: k });
}
