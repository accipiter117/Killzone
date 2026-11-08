// Squad behaviour. The player orders platoons; each squad works out how to
// carry the order out according to its role and the platoon's stance.

import { findCover, wireAt, forCells } from './map.js';
import {
  members, centroid, clamp, dist, sideDir, edgeX, siteLabel, nearObjective, isActive, coverName,
} from './util.js';
import { weaponRange } from './combat.js';

// Loose wedge, pointing forward (+x before rotation).
const WEDGE = [[0, 0], [-13, -17], [-13, 17], [-26, -32], [-26, 32]];

export function resetPlans(state, pl) {
  for (const id of pl.squads) {
    const sq = state.squads[id];
    sq.bound = null;
    sq.pauseUntil = 0;
    sq.holdSpot = null;
    sq.flankDone = false;
    sq.waitSince = -1;
  }
}

function goalOf(state, pl) {
  const o = pl.order;
  if (o.type === 'take') return state.sites.find((s) => s.id === o.siteId);
  return { x: o.x, y: o.y };
}

function slotFor(state, pl, sq, goal) {
  const dir = sideDir(sq.side);
  const k = (pl.squads.indexOf(sq.id) - 1) * dir; // -1, 0, 1 (mirrored for the Helghast)
  const W = state.map.width, H = state.map.height;
  if (pl.order.type === 'take') {
    const r = goal.r;
    return { x: clamp(goal.x - dir * r * 0.15 * Math.abs(k), 15, W - 15), y: clamp(goal.y + k * r * 0.5, 15, H - 15) };
  }
  return { x: clamp(goal.x, 15, W - 15), y: clamp(goal.y + k * state.cfg.squad.slotSpacing, 15, H - 15) };
}

function nearestVisibleEnemy(state, side, p) {
  const seen = state.sides[side].spotted;
  let best = null, bd = Infinity;
  for (const e of state.soldiers) {
    if (e.side === side || !isActive(e) || !seen[e.id]) continue;
    const d = dist(e, p);
    if (d < bd) { bd = d; best = e; }
  }
  return best ? { e: best, d: bd } : null;
}

// Point the five soldiers at a destination in a wedge facing their direction
// of travel. When settling, each soldier hunts for cover close to its spot.
function formUp(state, sq, list, dest, snapCover) {
  const c = centroid(list);
  let ang = Math.atan2(dest.y - c.y, dest.x - c.x);
  if (Math.hypot(dest.y - c.y, dest.x - c.x) < 5) ang = sq.side === 0 ? 0 : Math.PI;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const W = state.map.width, H = state.map.height;
  for (const s of list) {
    const [ox, oy] = WEDGE[sq.soldiers.indexOf(s.id) % WEDGE.length];
    let x = clamp(dest.x + ox * ca - oy * sa, 5, W - 5);
    let y = clamp(dest.y + ox * sa + oy * ca, 5, H - 5);
    if (snapCover && coverName(state, x, y) === 'open') {
      const cv = findCover(state.map, x, y, 22, (cx, cy) => -Math.hypot(cx - x, cy - y));
      if (cv) { x = cv.x; y = cv.y; }
    }
    s.tx = x; s.ty = y;
  }
}

const stopAll = (list) => list.forEach((s) => { s.tx = s.x; s.ty = s.y; });

// First wire cell on the straight line from a to b (within maxD), or null.
export function wireOnLine(state, a, b, maxD = 260) {
  const d = Math.min(dist(a, b), maxD);
  if (d < 1) return null;
  const ux = (b.x - a.x) / dist(a, b), uy = (b.y - a.y) / dist(a, b);
  for (let t = 0; t <= d; t += 8) {
    const x = a.x + ux * t, y = a.y + uy * t;
    if (wireAt(state.map, x, y) > 0) return { x, y };
  }
  return null;
}

// Nearest passable point in a wire belt (a natural gap or one an engineer
// has cut) close to where the squad would hit the wire.
function findGap(state, w, maxDy = 200) {
  for (let dy = 0; dy <= maxDy; dy += 10) {
    for (const sgn of dy === 0 ? [1] : [1, -1]) {
      const y = w.y + dy * sgn;
      if (y < 10 || y > state.map.height - 10) continue;
      let clear = true;
      for (let dx = -24; dx <= 24 && clear; dx += 8) if (wireAt(state.map, w.x + dx, y) > 0) clear = false;
      if (clear) return { x: w.x, y };
    }
  }
  return null;
}

export function cutWire(state, x, y, r, amount) {
  let cut = false;
  forCells(state.map, x - r, y - r, x + r, y + r, (i, cx, cy) => {
    if (state.map.wire[i] <= 0 || (cx - x) ** 2 + (cy - y) ** 2 > r * r) return;
    state.map.wire[i] = Math.max(0, state.map.wire[i] - amount);
    cut = true;
    if (state.map.wire[i] === 0) state.events.push({ type: 'wireCut', i });
  });
  return cut;
}

function pinnedText(state, sq, c) {
  let src = 'fire', best = 0;
  for (const k in sq.tally) if (sq.tally[k] > best) { best = sq.tally[k]; src = k; }
  const what = { mg: 'Pinned by MG nest', arc: 'Pinned by arc tower', artillery: 'Pinned by artillery', blast: 'Pinned by the blast' }[src] || 'Pinned under fire';
  const near = nearObjective(state, c);
  return near ? `${what} near ${near.id}` : what;
}

// Called a few times a second for every squad.
export function thinkSquad(state, sq) {
  const cfg = state.cfg;
  const list = members(state, sq);
  if (!list.length) { sq.mode = 'dead'; sq.status = 'Wiped out'; return; }
  const pl = state.platoons[sq.platoon];
  const c = centroid(list);
  sq.cx = c.x; sq.cy = c.y;
  const dir = sideDir(sq.side);
  const H = state.map.height;

  if (pl.broken) {
    sq.mode = 'rout';
    sq.status = 'Routing';
    formUp(state, sq, list, { x: edgeX(state, sq.side), y: c.y }, false);
    return;
  }
  const order = pl.order;
  if (sq.pinned) {
    if (order.type === 'fallback') {
      sq.mode = 'crawl';
      sq.status = 'Pinned, crawling back';
      formUp(state, sq, list, { x: edgeX(state, sq.side) + dir * 110, y: c.y }, false);
    } else {
      sq.mode = 'pinned';
      sq.status = pinnedText(state, sq, c);
      stopAll(list);
    }
    return;
  }
  const firing = state.tick - sq.lastFiredTick < cfg.tickRate * 1.5;

  if (order.type === 'idle') {
    sq.mode = 'idle';
    sq.status = firing ? 'Returning fire' : 'Awaiting orders';
    return;
  }
  if (order.type === 'hold') {
    if (!sq.holdSpot) sq.holdSpot = findCover(state.map, c.x, c.y, 90, (x, y) => -Math.hypot(x - c.x, y - c.y)) || c;
    const there = dist(c, sq.holdSpot) < cfg.squad.arriveDist * 1.5;
    sq.mode = 'hold';
    sq.status = there ? (firing ? 'Dug in, firing' : 'Dug in') : 'Moving to cover';
    formUp(state, sq, list, sq.holdSpot, there);
    return;
  }
  if (order.type === 'fallback') {
    const dest = { x: edgeX(state, sq.side) + dir * 110, y: clamp(c.y, 40, H - 40) };
    const there = dist(c, dest) < 60;
    sq.mode = 'fallback';
    sq.status = there ? 'Regrouping' : 'Falling back';
    formUp(state, sq, list, dest, there);
    return;
  }
  advance(state, sq, pl, list, c, firing);
}

function advance(state, sq, pl, list, c, firing) {
  const cfg = state.cfg;
  const sc = cfg.squad;
  const st = cfg.stances[pl.stance];
  const dir = sideDir(sq.side);
  const goalSite = goalOf(state, pl);
  const label = pl.order.type === 'take' ? siteLabel(goalSite) : null;
  let goal = slotFor(state, pl, sq, goalSite);
  if (sq.role === 'recon') {
    // Recon hangs back behind the platoon's goal and spots for everyone.
    const back = goal.x - dir * sc.reconBackoff;
    goal = { x: sq.side === 0 ? Math.max(back, 140) : Math.min(back, state.map.width - 140), y: goal.y };
    const cv = findCover(state.map, goal.x, goal.y, 70, (x, y) => -Math.hypot(x - goal.x, y - goal.y));
    if (cv) goal = cv;
  }
  const d = dist(c, goal);
  const arrived = d < sc.arriveDist * 1.6;
  const threat = nearestVisibleEnemy(state, sq.side, c);
  const role = cfg.roles[sq.role];

  if (arrived) {
    sq.mode = 'arrived';
    formUp(state, sq, list, goal, true);
    if (sq.role === 'recon') sq.status = `Spotting for ${pl.name}`;
    else if (firing && sq.role === 'heavy') sq.status = 'Suppressing';
    else if (label) {
      const site = goalSite;
      sq.status = site.owner === sq.side ? `Holding ${label}` : site.contested ? `Contesting ${label}` : `Capturing ${label}`;
    } else sq.status = firing ? 'In position, firing' : 'In position';
    return;
  }

  const towards = label ? `to ${label}` : 'up';
  // Engineers deal with wire on their way; they do not detour round it.
  if (sq.role === 'engineer') {
    const w = wireOnLine(state, c, goal);
    if (w) {
      if (dist(c, w) > 34) {
        sq.mode = 'move';
        sq.status = 'Moving to cut wire';
        formUp(state, sq, list, { x: w.x - dir * 18, y: w.y }, false);
      } else {
        sq.mode = 'cut';
        sq.status = 'Cutting wire';
        stopAll(list);
        const amount = (role.cutRate * sc.thinkEveryTicks / cfg.tickRate) * (list.length / cfg.soldiersPerSquad);
        cutWire(state, w.x + dir * 6, w.y, role.cutRadius, amount);
      }
      return;
    }
  }

  // Under fire, cautious squads drop into cover before carrying on.
  if (sq.supp > st.coverAt) {
    const cv = findCover(state.map, c.x, c.y, 60, (x, y) => -Math.hypot(x - c.x, y - c.y));
    if (cv) {
      sq.mode = 'cover';
      sq.status = 'Taking cover';
      formUp(state, sq, list, cv, true);
      return;
    }
  }

  // Wire in the way: head for the nearest gap, or wait for the engineers.
  let next = goal;
  let crossing = false;
  const w = sq.role !== 'engineer' ? wireOnLine(state, c, goal, 160) : null;
  if (w) {
    const gap = findGap(state, w);
    if (gap && Math.abs(gap.y - w.y) > 4) next = { x: gap.x - dir * 10, y: gap.y };
    else if (!gap) {
      const hasEngineers = pl.squads.some((id) => state.squads[id].role === 'engineer' && members(state, state.squads[id]).length);
      if (sq.waitSince < 0) sq.waitSince = state.tick;
      const waited = (state.tick - sq.waitSince) / cfg.tickRate;
      if (hasEngineers && pl.stance !== 'aggressive' && waited < 12 && dist(c, w) < 60) {
        sq.mode = 'wait';
        sq.status = 'Waiting for wire to be cut';
        stopAll(list);
        return;
      }
      crossing = dist(c, w) < 40;
    }
  } else sq.waitSince = -1;

  if (sq.role === 'heavy' && threat && threat.d < weaponRange(state, list[0]) * 0.9 && d > 80) {
    // Heavies stop at range and pour fire in, ideally from cover.
    sq.mode = 'suppress';
    sq.status = 'Suppressing';
    const cv = findCover(state.map, c.x, c.y, 50, (x, y) => -Math.hypot(x - c.x, y - c.y));
    if (cv) formUp(state, sq, list, cv, true); else stopAll(list);
    return;
  }

  if (sq.role === 'assault' && !sq.flankDone && d > 260) {
    // Assault squads swing wide and come in from the side.
    const k = pl.squads.indexOf(sq.id) - 1;
    const sign = k !== 0 ? Math.sign(k) * dir : goal.y < state.map.height / 2 ? 1 : -1;
    const wp = { x: goal.x - dir * 120, y: clamp(goal.y + sign * sc.flankOffset, 30, state.map.height - 30) };
    if (dist(c, wp) < 45) sq.flankDone = true;
    else {
      sq.mode = 'move';
      sq.status = label ? `Flanking toward ${label}` : 'Flanking';
      formUp(state, sq, list, next === goal ? wp : next, false);
      return;
    }
  }

  if (sq.role === 'rifle' && threat) {
    // Rifles bound from cover to cover while the enemy is in sight.
    if (sq.bound && dist(c, sq.bound) > sc.arriveDist) {
      sq.mode = 'move';
      sq.status = 'Bounding forward';
      formUp(state, sq, list, sq.bound, false);
      return;
    }
    if (sq.bound) {
      if (!sq.pauseUntil) sq.pauseUntil = state.tick + Math.round(st.pause * cfg.tickRate);
      if (state.tick < sq.pauseUntil) {
        sq.mode = 'cover';
        sq.status = firing ? 'In cover, returning fire' : 'In cover';
        formUp(state, sq, list, sq.bound, true);
        return;
      }
    }
    const ux = (next.x - c.x) / dist(c, next), uy = (next.y - c.y) / dist(c, next);
    const reach = Math.min(dist(c, next), (sc.boundMin + sc.boundMax) / 2);
    const probe = { x: c.x + ux * reach, y: c.y + uy * reach };
    const cv = findCover(state.map, probe.x, probe.y, 55, (x, y) => {
      const prog = (x - c.x) * ux + (y - c.y) * uy;
      if (prog < sc.boundMin * 0.6) return -Infinity;
      return prog - Math.abs((x - c.x) * uy - (y - c.y) * ux) * 0.6;
    });
    sq.bound = cv && dist(cv, next) < dist(c, next) ? cv : probe;
    sq.pauseUntil = 0;
    sq.mode = 'move';
    sq.status = 'Bounding forward';
    formUp(state, sq, list, sq.bound, false);
    return;
  }

  sq.mode = 'move';
  if (crossing) sq.status = 'Crossing wire';
  else if (sq.role === 'recon') sq.status = 'Moving to overwatch';
  else sq.status = sq.role === 'assault' && sq.flankDone && label ? `Assaulting ${label}` : `Advancing ${towards}`;
  formUp(state, sq, list, next, false);
}

// Every tick: walk soldiers toward their spot. Pinned squads stay put
// (except when ordered back, when they crawl), wire slows everyone.
export function moveSoldiers(state, dt) {
  const cfg = state.cfg;
  const W = state.map.width;
  for (const s of state.soldiers) {
    if (!isActive(s)) continue;
    const sq = state.squads[s.squad];
    const pl = state.platoons[sq.platoon];
    if (sq.pinned && sq.mode !== 'rout' && sq.mode !== 'crawl') continue;
    const dx = s.tx - s.x, dy = s.ty - s.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) continue;
    let speed = cfg.roles[s.role].speed * cfg.stances[pl.stance].speedMult;
    speed *= cfg.cover[coverName(state, s.x, s.y)].speed;
    if (wireAt(state.map, s.x, s.y) > 0) speed *= cfg.wire.speedMult;
    if (sq.mode === 'rout') speed *= cfg.squad.routSpeedMult;
    if (sq.mode === 'crawl') speed *= 0.5;
    const step = Math.min(d, speed * dt);
    s.x += (dx / d) * step;
    s.y += (dy / d) * step;
    if (sq.mode === 'rout' && (s.x < 35 || s.x > W - 35)) {
      s.fled = true;
      state.sides[s.side].fled++;
    }
  }
}

// One line that sums up a platoon for its card.
export function platoonHeadline(state, pl) {
  if (pl.broken) return 'Routing';
  const sqs = pl.squads.map((id) => state.squads[id]).filter((sq) => sq.mode !== 'dead');
  if (!sqs.length) return 'Wiped out';
  const pinned = sqs.find((sq) => sq.pinned);
  if (pinned) return pinned.status;
  const order = ['cut', 'wait', 'suppress', 'cover', 'move', 'arrived', 'hold', 'fallback', 'idle'];
  sqs.sort((a, b) => order.indexOf(a.mode) - order.indexOf(b.mode));
  const lead = sqs.find((sq) => sq.role !== 'recon') || sqs[0];
  return lead.status;
}
