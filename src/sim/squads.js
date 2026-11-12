// Squad behaviour. The player orders platoons; each squad works out how to
// carry the order out according to its role and the platoon's stance.

import { T, findCover, wireAt, forCells, cellIndex, canStep, rampAt, heightAt } from './map.js';
import { nextStep, straightClear, findPath } from './path.js';
import {
  members, centroid, clamp, dist, sideDir, edgeX, siteLabel, nearObjective, isActive, coverName, coverAt, feed,
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
    sq.bestD = Infinity;
    sq.bestTick = state.tick;
    sq.pushUntil = 0;
    sq.path = null;
    sq.order = null; // a new platoon order brings every squad back to the shared goal
  }
}

// Reset one squad's plans when it is given an order of its own.
export function resetSquadPlan(state, sq) {
  sq.bound = null; sq.pauseUntil = 0; sq.holdSpot = null; sq.flankDone = false;
  sq.waitSince = -1; sq.bestD = Infinity; sq.bestTick = state.tick; sq.pushUntil = 0; sq.path = null;
}

// A squad follows its platoon's shared goal unless it has been given an
// order of its own (cleared whenever the platoon gets a new order).
export const orderOf = (pl, sq) => sq.order || pl.order;

function goalOf(state, o) {
  if (o.type === 'take') return state.sites.find((s) => s.id === o.siteId);
  return { x: o.x, y: o.y };
}

function slotFor(state, pl, sq, goal) {
  const dir = sideDir(sq.side);
  // A squad on its own order goes exactly where it was sent.
  if (sq.order) return sq.order.type === 'take' ? { x: goal.x, y: goal.y } : { x: clamp(goal.x, 15, state.map.width - 15), y: clamp(goal.y, 15, state.map.height - 15) };
  const k = (pl.squads.indexOf(sq.id) - 1) * dir; // -1, 0, 1 (mirrored for the Helghast)
  const W = state.map.width, H = state.map.height;
  if (orderOf(pl, sq).type === 'take') {
    const r = goal.r;
    return { x: clamp(goal.x - dir * r * 0.15 * Math.abs(k), 15, W - 15), y: clamp(goal.y + k * r * 0.5, 15, H - 15) };
  }
  return { x: clamp(goal.x, 15, W - 15), y: clamp(goal.y + k * state.cfg.squad.slotSpacing, 15, H - 15) };
}

// Which way the squad faces (its cover's front): towards the nearest enemy
// it can see, turning a little each think so a flanker gets a few seconds'
// head start. Pinned squads cannot turn at all.
function turnToThreat(state, sq, c) {
  if (sq.pinned) return;
  const e = nearestVisibleEnemy(state, sq.side, c);
  const want = e ? { x: e.e.x - c.x, y: e.e.y - c.y } : { x: sideDir(sq.side), y: 0 };
  const L = Math.hypot(want.x, want.y) || 1;
  const k = state.cfg.combat.flank.turnRate;
  const fx = sq.face.x * (1 - k) + (want.x / L) * k, fy = sq.face.y * (1 - k) + (want.y / L) * k;
  const F = Math.hypot(fx, fy) || 1;
  sq.face = { x: fx / F, y: fy / F };
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
    // Places by rank among the living, so a squad that has lost men still
    // has a point man and a lone survivor goes where the squad is going.
    const [ox, oy] = WEDGE[list.indexOf(s) % WEDGE.length];
    let x = clamp(dest.x + ox * ca - oy * sa, 5, W - 5);
    let y = clamp(dest.y + ox * sa + oy * ca, 5, H - 5);
    if (snapCover && coverName(state, x, y) === 'open') {
      // Nearby cover, preferring cover on higher ground.
      const cv = findCover(state.map, x, y, 22, (cx, cy) => -Math.hypot(cx - x, cy - y) + state.cfg.squad.highCoverBonus * heightAt(state.map, cx, cy), s.side === 1);
      if (cv) { x = cv.x; y = cv.y; }
    }
    // On broken ground a soldier's own spot can be across a cliff from
    // them: then they follow the squad's point, or find their own way.
    // Never aim a soldier at the inside of a wall: use the nearest open spot.
    if (state.map.hasWalls && state.map.grid[cellIndex(state.map, x, y)] === T.wall) {
      const free = nearestFree(state.map, x, y, s);
      x = free.x; y = free.y;
    }
    if ((state.map.hasHeight || state.map.hasWalls) && !state.cfg.roles[s.role].flies && !straightClear(state.map, s, { x, y }, true)) {
      if (straightClear(state.map, s, dest, true)) { x = dest.x; y = dest.y; }
      else {
        const p = soldierRoute(state, s, sq, dest);
        // Start from the route's first step (always reachable), then look
        // as far along it as can be walked in a straight line.
        let pt = p && p[0] ? p[0] : { x: s.x, y: s.y };
        for (let k = Math.min(p ? p.length - 1 : 0, 30); k > 0; k--) {
          if (straightClear(state.map, s, p[k], true)) { pt = p[k]; break; }
        }
        x = pt.x; y = pt.y;
      }
    }
    s.tx = x; s.ty = y;
  }
}

// A soldier's own route round walls and cliffs, kept for a few seconds and
// reused while the destination stays put (finding a route through a walled
// site is costly, and squads re-form several times a second).
function soldierRoute(state, s, sq, dest) {
  const r = s.route;
  if (r && Math.hypot(r.tx - dest.x, r.ty - dest.y) < 30 && state.tick - r.tick < 90) {
    while (r.pts.length > 1 && Math.hypot(r.pts[0].x - s.x, r.pts[0].y - s.y) < 12) r.pts.shift();
    return r.pts;
  }
  let p = findPath(state.map, s, dest, { maxNodes: 12000, mirror: s.side === 1 });
  // No way to the squad's destination from here: rejoin the squad.
  if (!p || !p.length) p = findPath(state.map, s, { x: sq.cx, y: sq.cy }, { maxNodes: 12000, mirror: s.side === 1 });
  s.route = p && p.length ? { tx: dest.x, ty: dest.y, tick: state.tick, pts: p } : null;
  return p;
}

// The nearest cell that is not wall, searching outwards in rings (towards
// the soldier first, so they do not cross the wall to reach it).
function nearestFree(map, x, y, from) {
  for (let r = 10; r <= 60; r += 10) {
    let best = null, bd = Infinity;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      const i = cellIndex(map, px, py);
      if (i < 0 || map.grid[i] === T.wall) continue;
      const d = Math.hypot(px - from.x, py - from.y);
      if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
    if (best) return best;
  }
  return { x: from.x, y: from.y };
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
  // The squad's position. Usually the middle of its soldiers, but if it has
  // been split (say round a hill) the middle can be somewhere nobody is
  // standing, so then use the soldier nearest the middle instead.
  // A medic off treating someone does not drag the squad's position with
  // them (that would pull the whole squad towards the enemy's fire).
  const core = list.some((s) => !s.healing) ? list.filter((s) => !s.healing) : list;
  let c = centroid(core);
  if (!core.some((s) => dist(s, c) < 45)) {
    let best = core[0];
    for (const s of core) if (dist(s, c) < dist(best, c)) best = s;
    c = { x: best.x, y: best.y };
  }
  // Stalled and pushing on: lead from the soldier furthest along, so a
  // straggler caught behind a wall or on a heap cannot hold the squad's
  // position (and so its route) back. The others find their own way after.
  if (sq.pushUntil > state.tick && sq.lastGoal) {
    let lead = list[0];
    for (const s of list) if (dist(s, sq.lastGoal) < dist(lead, sq.lastGoal)) lead = s;
    c = { x: lead.x, y: lead.y };
  }
  sq.cx = c.x; sq.cy = c.y;
  turnToThreat(state, sq, c);
  const dir = sideDir(sq.side);
  const H = state.map.height;

  if (pl.broken) {
    sq.mode = 'rout';
    // First time: fall back to the rally line and regroup. Second time: run.
    const edge = pl.rallied ? 1 : cfg.battle.rallyLine;
    const dest = { x: sq.side === 0 ? edge : state.map.width - edge, y: c.y };
    if (pl.rallyAt >= 0) {
      sq.status = `Regrouping (${Math.max(0, Math.ceil((pl.rallyAt - state.tick) / cfg.tickRate))}s)`;
      stopAll(list);
    } else {
      sq.status = pl.rallied ? 'Running' : 'Routing';
      formUp(state, sq, list, nextStep(state, sq, c, dest), false);
    }
    return;
  }
  const order = orderOf(pl, sq);
  // Abilities in progress come first.
  if (sq.diveTarget && sq.diveUntil > state.tick) {
    sq.mode = 'dive';
    sq.status = 'Diving in!';
    sq.pinned = false;
    formUp(state, sq, list, sq.diveTarget, false);
    return;
  }
  if (sq.chargeUntil > state.tick) {
    let t = state.soldiers[sq.chargeTarget];
    if (!t || !isActive(t)) {
      t = nearestVisibleEnemy(state, sq.side, c)?.e;
      if (t && dist(t, c) > 150) t = null;
      sq.chargeTarget = t ? t.id : -1;
    }
    if (t) {
      sq.mode = 'charge';
      sq.status = 'Charging!';
      sq.pinned = false;
      formUp(state, sq, list, { x: t.x, y: t.y }, false);
      return;
    }
    sq.chargeUntil = 0;
  }
  if (sq.breachUntil > state.tick) {
    // Engineers sprinting in to plant a breaching charge on the enemy tank.
    const v = state.vehicles[sq.breachVehicle];
    if (v && v.alive) {
      const b = cfg.breach;
      const near = list.find((s) => dist(s, v) <= b.plantDist + v.radius);
      if (near) {
        state.charges.push({ vehicle: v.id, side: sq.side, x: v.x, y: v.y, at: state.tick + Math.round(b.fuseSec * cfg.tickRate) });
        state.events.push({ type: 'charge', side: sq.side, x: v.x, y: v.y, sec: b.fuseSec });
        sq.breachUntil = 0;
      } else {
        sq.mode = 'breach';
        sq.status = 'Breaching the tank!';
        sq.pinned = false;
        formUp(state, sq, list, { x: v.x, y: v.y }, false);
        return;
      }
    } else sq.breachUntil = 0;
  }
  if (sq.barrageUntil > state.tick) {
    sq.mode = 'barrage';
    sq.status = 'Barrage!';
    stopAll(list);
    return;
  }
  if (sq.pinned) {
    if (order.type === 'fallback') {
      sq.mode = 'crawl';
      sq.status = 'Pinned, crawling back';
      formUp(state, sq, list, { x: edgeX(state, sq.side) + dir * 110, y: c.y }, false);
    } else {
      const crawl = pinnedCrawl(state, sq, c, order);
      if (crawl) {
        sq.mode = 'crawl';
        sq.status = crawl.status;
        formUp(state, sq, list, crawl.to, false);
      } else {
        sq.mode = 'pinned';
        sq.status = pinnedText(state, sq, c);
        stopAll(list);
      }
    }
    return;
  }
  // Engineers patching up their own tank (the Repair ability).
  if (sq.repairUntil > state.tick) {
    const v = state.vehicles[sq.repairVehicle];
    const r = cfg.repair;
    if (v && v.alive && v.hp < v.maxHp) {
      if (list.some((s) => dist(s, v) <= r.reach + v.radius)) {
        if (!sq.repairDoneTick) sq.repairDoneTick = state.tick + Math.round(r.workSec * cfg.tickRate);
        if (state.tick >= sq.repairDoneTick) {
          v.hp = Math.min(v.maxHp, v.hp + v.maxHp * r.heal);
          sq.repairUntil = 0;
          sq.repairDoneTick = 0;
          state.events.push({ type: 'repaired', side: sq.side, x: v.x, y: v.y });
          feed(state, `${sq.side === 0 ? '' : 'Helghast '}${pl.name}: engineers patched up the tank`, sq.side, v);
        } else {
          sq.mode = 'repair';
          sq.status = `Repairing the tank (${Math.ceil((sq.repairDoneTick - state.tick) / cfg.tickRate)}s)`;
          formUp(state, sq, list, { x: v.x - dir * (v.radius + 14), y: v.y }, true);
          return;
        }
      } else {
        sq.repairDoneTick = 0;
        sq.mode = 'move';
        sq.status = 'Running to repair the tank';
        formUp(state, sq, list, nextStep(state, sq, c, { x: v.x, y: v.y }), false);
        return;
      }
    } else sq.repairUntil = 0;
  }
  const firing = state.tick - sq.lastFiredTick < cfg.tickRate * 1.5;

  // Any squad that can still move gets out from under a marked barrage.
  const art = cfg.artillery;
  for (const st of state.strikes) {
    const d = dist(c, st);
    if (d > art.radius + 25) continue;
    const ux = d > 1 ? (c.x - st.x) / d : -dir, uy = d > 1 ? (c.y - st.y) / d : 0;
    sq.mode = 'evade';
    sq.status = 'Clearing the barrage area';
    formUp(state, sq, list, { x: clamp(st.x + ux * (art.radius + 60), 20, state.map.width - 20), y: clamp(st.y + uy * (art.radius + 60), 20, H - 20) }, false);
    sq.bound = null;
    return;
  }

  if (order.type === 'idle') {
    sq.mode = 'idle';
    sq.status = firing ? 'Returning fire' : 'Awaiting orders';
    return;
  }
  if (order.type === 'hold') {
    if (!sq.holdSpot) sq.holdSpot = findCover(state.map, c.x, c.y, 90, (x, y) => -Math.hypot(x - c.x, y - c.y) + 2.5 * state.cfg.squad.highCoverBonus * heightAt(state.map, x, y), sq.side === 1) || c;
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
    formUp(state, sq, list, there ? dest : nextStep(state, sq, c, dest), there);
    return;
  }
  advance(state, sq, pl, list, c, firing, order);
}

// A pinned squad is not frozen for good: one at the edge of the post it is
// taking crawls in so the capture keeps going, and one pinned out in the
// open crawls to the nearest cover (a little back rather than forward).
function pinnedCrawl(state, sq, c, order) {
  const sc = state.cfg.squad;
  const st = state.cfg.stances[state.platoons[sq.platoon].stance];
  if (order.type === 'take') {
    const site = goalOf(state, order);
    if (site && site.owner !== sq.side) {
      const d = dist(c, site);
      if (d > site.r * 0.6 && d < site.r + sc.crawlOnReach * st.crawlOn) {
        const k = (site.r * 0.45) / d;
        return { to: { x: site.x + (c.x - site.x) * k, y: site.y + (c.y - site.y) * k }, status: `Pinned, crawling onto ${siteLabel(site)}` };
      }
    }
  }
  if (coverAt(state, c.x, c.y).hit > 0) return null;
  const dir = sideDir(sq.side);
  // Cautious squads prefer cover behind them, aggressive ones cover ahead.
  const cv = findCover(state.map, c.x, c.y, sc.crawlCoverReach, (x, y) => -Math.hypot(x - c.x, y - c.y) - dir * (x - c.x) * st.crawlBack, sq.side === 1);
  if (!cv || dist(cv, c) < 14) return null;
  return { to: cv, status: 'Pinned, crawling to cover' };
}

// Where a squad should go to help a pinned squad of its own platoon: within
// its own range of whoever is pinning it (the last place the fire came
// from). Null when no platoon mate is pinned, or the shooter is unknown.
function supportSpot(state, sq, pl, c, list) {
  const cfg = state.cfg;
  let mate = null;
  for (const id of pl.squads) {
    const q = state.squads[id];
    if (q !== sq && q.pinned && q.mode !== 'dead' && q.mode !== 'rout') { mate = q; break; }
  }
  if (!mate || !mate.hitFrom || state.tick - mate.hitFrom.tick > 3 * cfg.tickRate) return null;
  const threat = mate.hitFrom;
  const range = weaponRange(state, list[0]) * cfg.stances[pl.stance].support;
  const d = dist(c, threat);
  // Fast close-range squads go round the side of whoever is pinning their
  // mates (outside its facing) rather than straight at it.
  if (['assault', 'jump', 'infiltrator'].includes(sq.role)) {
    const foe = enemySquadNear(state, sq.side, threat);
    if (foe && foe.face) {
      const sign = sq.side === 0 ? 1 : -1; // mirror-image flanks for the two sides
      const ang = Math.atan2(foe.face.y, foe.face.x) + sign * (Math.PI * 0.6);
      const r = Math.min(range, 160);
      const spot = { x: clamp(foe.cx + Math.cos(ang) * r, 20, state.map.width - 20), y: clamp(foe.cy + Math.sin(ang) * r, 20, state.map.height - 20) };
      if (dist(c, spot) < 40) return { mate, to: c, inRange: true };
      const cv = findCover(state.map, spot.x, spot.y, 50, (x, y) => -Math.hypot(x - spot.x, y - spot.y), sq.side === 1);
      return { mate, to: cv || spot, inRange: false, flank: true };
    }
  }
  if (d <= range) return { mate, to: c, inRange: true };
  const spot = { x: threat.x + ((c.x - threat.x) / d) * range, y: threat.y + ((c.y - threat.y) / d) * range };
  const cv = findCover(state.map, spot.x, spot.y, 50, (x, y) => -Math.hypot(x - spot.x, y - spot.y), sq.side === 1);
  return { mate, to: cv || spot, inRange: false };
}

// The enemy squad nearest a point (by its centre).
function enemySquadNear(state, side, p) {
  let best = null, bd = 140;
  for (const q of state.squads) {
    if (q.side === side || q.mode === 'dead' || q.mode === 'rout') continue;
    const d = Math.hypot(q.cx - p.x, q.cy - p.y);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

function advance(state, sq, pl, list, c, firing, order) {
  const cfg = state.cfg;
  const sc = cfg.squad;
  const st = cfg.stances[pl.stance];
  const dir = sideDir(sq.side);
  const goalSite = goalOf(state, order);
  const label = order.type === 'take' ? siteLabel(goalSite) : null;
  let goal = slotFor(state, pl, sq, goalSite);
  // A platoon mate pinned down: move up to fire at whoever is pinning it,
  // rather than hanging back or waiting for it.
  const help = sq.order ? null : supportSpot(state, sq, pl, c, list);
  if (help) {
    const who = `the ${cfg.roles[help.mate.role].label} squad`;
    sq.lastGoal = help.to;
    if (help.inRange) {
      sq.mode = 'support';
      sq.status = `Covering ${who}`;
      const cv = findCover(state.map, c.x, c.y, 40, (x, y) => -Math.hypot(x - c.x, y - c.y), sq.side === 1);
      formUp(state, sq, list, cv || c, true);
    } else {
      sq.mode = 'move';
      sq.status = help.flank ? `Flanking to help ${who}` : `Moving up to help ${who}`;
      formUp(state, sq, list, nextStep(state, sq, c, help.to), false);
    }
    return;
  }
  if (sq.role === 'recon' && !sq.order) {
    // Recon hangs back behind the platoon's goal and spots for everyone.
    const back = goal.x - dir * sc.reconBackoff;
    goal = { x: sq.side === 0 ? Math.max(back, 140) : Math.min(back, state.map.width - 140), y: goal.y };
    const cv = findCover(state.map, goal.x, goal.y, 70, (x, y) => -Math.hypot(x - goal.x, y - goal.y), sq.side === 1);
    if (cv) goal = cv;
  }
  const d = dist(c, goal);
  sq.lastGoal = goal;
  // Arrived when close; also when nearly there but blocked from getting
  // closer for a while (say the last few yards are up a cliff), rather than
  // pressing against the edge for the rest of the battle.
  const blockedNear = d < sc.nearEnough && state.tick - sq.bestTick > sc.stallSec * cfg.tickRate;
  const arrived = d < sc.arriveDist * 1.6 || blockedNear;
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
  const tick = state.tick;

  // Stall check: if a squad that should be advancing has made no headway for
  // a while (stuck on wire, waiting, or hugging cover under fire), it pushes
  // straight on for a few seconds. This is the safety net that stops units
  // getting parked behind cover for the rest of the battle.
  if (d < sq.bestD - 10) { sq.bestD = d; sq.bestTick = tick; }
  if (tick >= sq.pushUntil && tick - sq.bestTick > sc.stallSec * cfg.tickRate) {
    sq.pushUntil = tick + Math.round(sc.pushSec * cfg.tickRate);
    sq.bestTick = tick;
    sq.bestD = d;
  }
  const pushing = tick < sq.pushUntil;

  // Assault squads swing wide and come in from the side: their route goes
  // through a flanking waypoint first.
  let target = goal;
  let flanking = false;
  if (sq.role === 'assault' && !sq.flankDone && d > 260) {
    const k = pl.squads.indexOf(sq.id) - 1;
    // Dead centre (objective B) breaks the tie by side, so both armies swing
    // round mirror image flanks.
    const midY = state.map.height / 2;
    const sign = k !== 0 ? Math.sign(k) * dir : goal.y < midY ? 1 : goal.y > midY ? -1 : dir;
    const wp = { x: goal.x - dir * 120, y: clamp(goal.y + sign * sc.flankOffset, 30, state.map.height - 30) };
    if (dist(c, wp) < 45) sq.flankDone = true;
    else { target = wp; flanking = true; }
  }

  // Engineers deal with wire on their way; they do not detour round it.
  if (sq.role === 'engineer' && !pushing) {
    const w = wireOnLine(state, c, nextStep(state, sq, c, target));
    if (w) {
      if (dist(c, w) > 34) {
        sq.mode = 'move';
        sq.status = 'Moving to cut wire';
        formUp(state, sq, list, { x: w.x - dir * 18, y: w.y }, false);
      } else {
        sq.mode = 'cut';
        sq.status = 'Cutting wire';
        sq.bestTick = tick; // cutting is progress, not a stall
        stopAll(list);
        const amount = (role.cutRate * sc.thinkEveryTicks / cfg.tickRate) * (list.length / cfg.soldiersPerSquad);
        cutWire(state, w.x + dir * 6, w.y, role.cutRadius, amount);
      }
      return;
    }
  }

  // Route round cliffs (up and down ramps only) and through gaps in the
  // wire where there is one nearby. If the route still crosses wire, wait a
  // little for the platoon's engineers unless the stance is aggressive.
  const next = nextStep(state, sq, c, target);
  let crossing = false;
  const w = sq.role !== 'engineer' && !cfg.roles[sq.role].flies && !pushing ? wireOnLine(state, c, next, 80) : null;
  if (w) {
    crossing = dist(c, w) < 40;
    const hasEngineers = pl.squads.some((id) => state.squads[id].role === 'engineer' && members(state, state.squads[id]).length);
    if (sq.waitSince < 0) sq.waitSince = tick;
    const waited = (tick - sq.waitSince) / cfg.tickRate;
    if (hasEngineers && pl.stance !== 'aggressive' && waited < 12 && dist(c, w) < 60) {
      sq.mode = 'wait';
      sq.status = 'Waiting for wire to be cut';
      stopAll(list);
      return;
    }
  } else sq.waitSince = -1;

  if (pushing) {
    sq.mode = 'move';
    sq.status = crossing ? 'Pushing through the wire' : `Pushing on ${towards}`;
    formUp(state, sq, list, next, false);
    return;
  }

  // Under fire, cautious squads drop into cover before carrying on.
  if (sq.supp > st.coverAt) {
    const cv = findCover(state.map, c.x, c.y, 60, (x, y) => -Math.hypot(x - c.x, y - c.y), sq.side === 1);
    if (cv) {
      sq.mode = 'cover';
      sq.status = 'Taking cover';
      formUp(state, sq, list, cv, true);
      return;
    }
  }

  // Keep the platoon together: a squad that has got well ahead of the
  // slowest squad in its platoon waits in cover for it to catch up.
  // Squads on orders of their own neither wait nor are waited for.
  if (sq.role !== 'recon' && !sq.order && d > 140) {
    let slowest = Infinity;
    for (const id of pl.squads) {
      const o = state.squads[id];
      if (o === sq || o.order || o.role === 'recon' || o.mode === 'dead' || o.mode === 'arrived' || o.mode === 'rout') continue;
      slowest = Math.min(slowest, dir * o.cx);
    }
    if (slowest < Infinity && dir * c.x - slowest > sc.platoonLead) {
      sq.mode = 'wait';
      sq.status = 'Waiting for the platoon';
      const cv = findCover(state.map, c.x, c.y, 40, (x, y) => -Math.hypot(x - c.x, y - c.y), sq.side === 1);
      if (cv) formUp(state, sq, list, cv, true); else stopAll(list);
      return;
    }
  }

  if (sq.role === 'heavy' && threat && threat.d < weaponRange(state, list[0]) * 0.9 && d > 80) {
    // Heavies stop at range and pour fire in, ideally from cover. The stall
    // check moves them up a bound now and then so they keep pace.
    sq.mode = 'suppress';
    sq.status = 'Suppressing';
    const cv = findCover(state.map, c.x, c.y, 50, (x, y) => -Math.hypot(x - c.x, y - c.y), sq.side === 1);
    if (cv) formUp(state, sq, list, cv, true); else stopAll(list);
    return;
  }

  if (flanking) {
    sq.mode = 'move';
    sq.status = crossing ? 'Crossing wire' : label ? `Flanking toward ${label}` : 'Flanking';
    formUp(state, sq, list, next, false);
    return;
  }

  if (sq.role === 'rifle' && threat && !crossing) {
    // Rifles bound from cover to cover while the enemy is in sight.
    if (sq.bound && dist(c, sq.bound) > sc.arriveDist) {
      sq.mode = 'move';
      sq.status = 'Bounding forward';
      formUp(state, sq, list, sq.bound, false);
      return;
    }
    if (sq.bound) {
      if (!sq.pauseUntil) sq.pauseUntil = tick + Math.round(st.pause * cfg.tickRate);
      if (tick < sq.pauseUntil) {
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
    }, sq.side === 1);
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

// Medics and the downed, every tick (after the squads have set everyone's
// spot, before anyone moves). The downed bleed out after medic.bleedSec.
// Each squad's medic goes to the nearest downed soldier of its platoon in
// reach (one medic per casualty), works on them for reviveSec, and gets
// them back up on part of their health; they then run to rejoin.
export function updateMedics(state) {
  const m = state.cfg.medic;
  const rate = state.cfg.tickRate;
  for (const s of state.soldiers) {
    if (s.downed && state.tick >= s.bleedUntil) {
      s.downed = false;
      state.events.push({ type: 'bledOut', id: s.id, side: s.side });
    }
  }
  for (const s of state.soldiers) {
    if (!s.medic) continue;
    s.healing = false;
    if (!isActive(s)) { s.healTarget = -1; continue; }
    const sq = state.squads[s.squad];
    if (sq.mode === 'rout') { s.healTarget = -1; continue; }
    let t = s.healTarget >= 0 ? state.soldiers[s.healTarget] : null;
    if (t && (!t.downed || t.fled)) { t = null; s.healTarget = -1; }
    // Medics go out only while their own squad is not under heavy fire.
    if (!t && (state.tick + s.id) % 10 === 0 && sq.supp < m.maxSupp) {
      const pl = state.platoons[sq.platoon];
      let bd = m.reach;
      for (const id of pl.squads) {
        for (const oid of state.squads[id].soldiers) {
          const o = state.soldiers[oid];
          if (!o.downed || o.fled) continue;
          const other = o.medicBy >= 0 && o.medicBy !== s.id ? state.soldiers[o.medicBy] : null;
          if (other && isActive(other) && other.healTarget === o.id) continue; // someone is on it
          const d = dist(s, o);
          if (d < bd || (d === bd && t && o.id < t.id)) { bd = d; t = o; }
        }
      }
      if (t) { s.healTarget = t.id; t.medicBy = s.id; s.healDone = 0; }
    }
    if (!t) continue;
    s.healing = true;
    if (dist(s, t) > 9) {
      s.tx = t.x; s.ty = t.y;
      s.healDone = 0;
      continue;
    }
    s.tx = s.x; s.ty = s.y;
    s.cd = Math.max(s.cd, 0.2); // hands full: not shooting
    if (!s.healDone) s.healDone = state.tick + Math.round(m.reviveSec * rate);
    if (state.tick < s.healDone) continue;
    // Back on their feet.
    t.downed = false;
    t.alive = true;
    t.hp = t.maxHp * m.reviveHp;
    t.joining = true;
    t.medicBy = -1;
    t.target = -1;
    s.healTarget = -1;
    s.healDone = 0;
    const sd = state.sides[t.side];
    sd.casualties--;
    sd.revived = (sd.revived || 0) + 1;
    const cause = t.lastCause;
    if (sd.lossBy[cause]) sd.lossBy[cause]--;
    const tsq = state.squads[t.squad];
    if (tsq.lossBy[cause]) tsq.lossBy[cause]--;
    if (tsq.mode === 'dead') tsq.mode = 'move';
    state.events.push({ type: 'revived', id: t.id, x: t.x, y: t.y, side: t.side });
  }
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
    if (sq.pinned && !s.healing && sq.mode !== 'rout' && sq.mode !== 'crawl' && sq.mode !== 'charge' && sq.mode !== 'dive' && sq.mode !== 'breach') continue;
    const dx = s.tx - s.x, dy = s.ty - s.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) continue;
    let speed = cfg.roles[s.role].speed * cfg.stances[pl.stance].speedMult;
    const flies = cfg.roles[s.role].flies;
    if (sq.mode === 'move') {
      // Squad cohesion: soldiers out in front ease off, stragglers hurry.
      const ahead = ((s.x - sq.cx) * dx + (s.y - sq.cy) * dy) / d;
      if (ahead > cfg.squad.paceAhead) speed *= 0.55;
      else if (ahead < -cfg.squad.paceBehind) speed *= 1.25;
    }
    if (!flies) {
      speed *= cfg.cover[coverName(state, s.x, s.y)].speed;
      if (wireAt(state.map, s.x, s.y) > 0) speed *= cfg.wire.speedMult;
    }
    if (sq.mode === 'rout') speed *= cfg.squad.routSpeedMult;
    if (sq.mode === 'crawl' || (s.healing && sq.pinned)) speed *= 0.5; // pinned medics crawl too
    if (sq.mode === 'charge') speed *= cfg.abilities.charge.speedMult;
    if (sq.mode === 'dive') speed *= 3;
    if (sq.mode === 'breach') speed *= cfg.breach.speedMult;
    // Fresh reinforcements run until they have caught up with their squad.
    if (s.joining) {
      if (Math.hypot(s.x - sq.cx, s.y - sq.cy) < 45) s.joining = false;
      else speed *= cfg.reinforce.joinSpeedMult;
    }
    if (!flies && rampAt(state.map, s.x, s.y)) speed *= cfg.height.rampSpeed;
    const step = Math.min(d, speed * dt);
    // Cliffs: only ramps lead up or down (jetpacks fly over). Slide along
    // the edge if blocked.
    const from = cellIndex(state.map, s.x, s.y);
    const nx = s.x + (dx / d) * step, ny = s.y + (dy / d) * step;
    if (flies || canStep(state.map, from, cellIndex(state.map, nx, ny))) { s.x = nx; s.y = ny; }
    else if (canStep(state.map, from, cellIndex(state.map, nx, s.y))) s.x = nx;
    else if (canStep(state.map, from, cellIndex(state.map, s.x, ny))) s.y = ny;
    if (sq.mode === 'rout' && pl.rallied && (s.x < 35 || s.x > W - 35)) {
      s.fled = true;
      state.sides[s.side].fled++;
    }
  }
}

// One line that sums up a platoon for its card.
export function platoonHeadline(state, pl) {
  if (pl.broken) return state.squads[pl.squads[0]].status.startsWith('Regrouping') ? state.squads[pl.squads[0]].status : pl.rallied ? 'Running' : 'Routing';
  const sqs = pl.squads.map((id) => state.squads[id]).filter((sq) => sq.mode !== 'dead');
  if (!sqs.length) return 'Wiped out';
  const pinned = sqs.find((sq) => sq.pinned);
  if (pinned) return pinned.status;
  const order = ['repair', 'cut', 'wait', 'suppress', 'support', 'cover', 'move', 'arrived', 'hold', 'fallback', 'idle'];
  sqs.sort((a, b) => order.indexOf(a.mode) - order.indexOf(b.mode));
  const lead = sqs.find((sq) => sq.role !== 'recon') || sqs[0];
  return lead.status;
}
