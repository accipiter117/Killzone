// The AI commander. Every few seconds it looks at the battle and issues the
// same commands a player could, paying the same order points. It reads the
// state but never changes it directly, and uses no randomness, so the same
// battle always gets the same decisions.

import { canWorkGate, gateCentre } from './gates.js';
import { isExplored } from './battle.js';
import { callinBlocked } from './callins.js';
import { members, centroid, dist, platoonStrength, platoonAlive, isActive } from './util.js';
import { abilityHasTarget, abilityKey } from './abilities.js';
import { mainGunTarget } from './vehicles.js';
import { heightAt } from './map.js';

const PROFILES = {
  standard: { stanceStrong: 'aggressive', stanceWeak: 'balanced', reserve: 1 },
  aggressive: { stanceStrong: 'aggressive', stanceWeak: 'aggressive', reserve: 0 },
  cautious: { stanceStrong: 'cautious', stanceWeak: 'cautious', reserve: 2 },
};

// The nearest cell to (x, y) that troops can reach (water, walls and
// walled-in ground are skipped), searching outwards in square rings.
function reachableNear(map, x, y) {
  const c = map.cell, cx = Math.floor(x / c), cy = Math.floor(y / c);
  if (!map.reach) return { x: Math.round(x), y: Math.round(y) };
  for (let r = 0; r < 60; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const i = cx + dx, j = cy + dy;
      if (i < 0 || j < 0 || i >= map.cols || j >= map.rows) continue;
      const k = j * map.cols + i;
      if (map.reach[k] && map.grid[k] === 0) return { x: i * c + c / 2, y: j * c + c / 2 };
    }
  }
  return null;
}

// Unexplored ground worth scouting: the middles of coarse regions of the
// map that this side has seen less than half of.
function scoutPoints(state, side) {
  const e = state.explored, nx = 8, ny = 6, out = [];
  const W = state.map.width, H = state.map.height;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let seen = 0, all = 0;
    for (let y = Math.floor((j * e.rows) / ny); y < Math.floor(((j + 1) * e.rows) / ny); y += 2) for (let x = Math.floor((i * e.cols) / nx); x < Math.floor(((i + 1) * e.cols) / nx); x += 2) { all++; seen += e.grid[side][y * e.cols + x]; }
    if (seen >= all * 0.5) continue;
    const p = reachableNear(state.map, ((i + 0.5) * W) / nx, ((j + 0.5) * H) / ny);
    if (p) out.push({ id: `scout${i}.${j}`, kind: 'scout', x: p.x, y: p.y, r: 150, owner: null });
  }
  return out;
}

export function createAI(side, profile = 'standard') {
  const memory = { smokeTick: {}, fallbackTick: {}, focusTick: {} };
  return {
    side,
    profile,
    due(state) {
      const every = Math.round(state.cfg.ai.thinkSec * state.cfg.tickRate);
      return state.tick % every === 0;
    },
    think(state) {
      return decide(state, side, PROFILES[profile] || PROFILES.standard, memory);
    },
  };
}

function platoonCentre(state, pl) {
  const all = [];
  for (const id of pl.squads) all.push(...members(state, state.squads[id]));
  return all.length ? centroid(all) : null;
}

function avgSupp(state, pl) {
  const sqs = pl.squads.map((id) => state.squads[id]).filter((sq) => sq.mode !== 'dead');
  return sqs.length ? sqs.reduce((a, sq) => a + sq.supp, 0) / sqs.length : 0;
}

function decide(state, side, prof, memory) {
  const cfg = state.cfg;
  const ai = cfg.ai;
  const cost = cfg.orders.cost;
  const sd = state.sides[side];
  const foe = 1 - side;
  let op = sd.op;
  let orders = 0;
  const cmds = [];
  const can = (c) => op + 1e-9 >= c && orders < 2;
  const spend = (cmd, c) => { cmds.push({ side, ...cmd }); op -= c; if (c > 0) orders++; };

  const mine = state.platoons.filter((pl) => pl.side === side && !pl.broken && platoonStrength(state, pl) > 0);
  const seenFoes = state.soldiers.filter((e) => e.side === foe && isActive(e) && sd.spotted[e.id]);
  const centres = new Map(mine.map((pl) => [pl.id, platoonCentre(state, pl)]));

  // How fit a platoon really is: its soldiers' health, not just their
  // number (soldiers a medic has got back up are on part of their health).
  const fitness = (pl) => {
    let hp = 0;
    for (const id of pl.squads) for (const m of members(state, state.squads[id])) hp += m.hp / m.maxHp;
    return hp / pl.size;
  };
  // Stance: push while strong, ease off once a platoon has been bloodied.
  for (const pl of mine) {
    const want = fitness(pl) > 0.6 ? prof.stanceStrong : prof.stanceWeak;
    if (pl.stance !== want) spend({ type: 'stance', params: { platoon: pl.id, stance: want } }, cost.stance);
  }

  // Lie low on objectives already held: hold fire for an ambush while no
  // enemy is in sight nearby (it springs by itself when one comes close).
  for (const pl of mine) {
    if (pl.holdFire || pl.order.type !== 'take') continue;
    const site = state.sites.find((x) => x.id === pl.order.siteId);
    if (!site || site.owner !== side) continue;
    const c = centres.get(pl.id);
    if (!c || Math.hypot(c.x - site.x, c.y - site.y) > 120) continue;
    if (seenFoes.some((e) => Math.hypot(e.x - c.x, e.y - c.y) < 450)) continue;
    spend({ type: 'holdfire', params: { platoon: pl.id, on: true } }, cost.holdfire || 0);
  }

  // Pull back platoons that are both weak and taking a beating.
  for (const pl of mine) {
    if (pl.order.type === 'fallback') continue;
    if (fitness(pl) < ai.fallbackStrength && avgSupp(state, pl) > ai.fallbackSupp && can(cost.fallback)) {
      spend({ type: 'fallback', params: { platoon: pl.id } }, cost.fallback);
      memory.fallbackTick[pl.id] = state.tick;
    }
  }

  // Artillery on the densest visible cluster that is clear of our own troops.
  if (state.tick >= sd.artReadyTick && op >= cost.artillery + prof.reserve && seenFoes.length) {
    let best = null, bestN = 0;
    for (const e of seenFoes) {
      const n = seenFoes.filter((o) => dist(o, e) < 90).length;
      if (n <= bestN) continue;
      const friendly = state.soldiers.some((s) => s.side === side && isActive(s) && dist(s, e) < ai.artillerySafeDist);
      if (!friendly) { best = e; bestN = n; }
    }
    if (best && bestN >= ai.artilleryMinCluster) {
      cmds.push({ side, type: 'artillery', params: { x: Math.round(best.x), y: Math.round(best.y) } });
      op -= cost.artillery;
    }
  }

  // Aircraft from a depot we hold. The gunship rakes the densest group of
  // enemies we can see, clear of our own troops; the dropship tops up a
  // platoon that has lost at least a squad's worth, landing beside it.
  const gun = cfg.callins.gunship, drop = cfg.callins.dropship;
  if (op >= gun.cost + prof.reserve && seenFoes.length && !callinBlocked(state, side, 'gunship')) {
    let best = null, bestN = 0;
    for (const e of seenFoes) {
      const n = seenFoes.filter((o) => dist(o, e) < cfg.aircraft.gunship.runLength / 2).length;
      if (n <= bestN) continue;
      if (!state.soldiers.some((s) => s.side === side && isActive(s) && dist(s, e) < ai.artillerySafeDist)) { best = e; bestN = n; }
    }
    if (best && bestN >= ai.gunshipMinCluster) {
      cmds.push({ side, type: 'callin', params: { what: 'gunship', x: Math.round(best.x), y: Math.round(best.y) } });
      op -= gun.cost;
    }
  }
  if (op >= drop.cost + prof.reserve && !callinBlocked(state, side, 'dropship')) {
    const weak = mine.filter((p) => !p.broken && platoonAlive(state, p) <= p.size - cfg.aircraft.dropship.soldiers).sort((a, b) => platoonAlive(state, a) - platoonAlive(state, b) || a.id - b.id)[0];
    const c = weak && centres.get(weak.id);
    if (c) {
      cmds.push({ side, type: 'callin', params: { what: 'dropship', x: Math.round(c.x), y: Math.round(c.y) } });
      op -= drop.cost;
    }
  }

  // Reinforce the weakest platoon still in the fight when there are points
  // to spare.
  if (op >= cost.reinforce + prof.reserve) {
    let weakest = null;
    for (const pl of mine) if (state.tick >= (pl.reinforceReadyTick || 0) && platoonStrength(state, pl) < ai.reinforceBelow && (!weakest || platoonStrength(state, pl) < platoonStrength(state, weakest))) weakest = pl;
    if (weakest) {
      cmds.push({ side, type: 'reinforce', params: { platoon: weakest.id } });
      op -= cost.reinforce;
    }
  }

  // Send each platoon to the site worth most to it, nearer sites preferred.
  const [myScore, theirScore] = [sd.score, state.sides[foe].score];
  const ownedObjectives = state.sites.filter((s) => s.kind === 'objective' && s.owner === side).length;
  const ahead = myScore > theirScore && ownedObjectives >= 2;
  // Read where the enemy is massing: seen enemies near each site, and how
  // many of our soldiers this pass has already committed to it. The
  // strongest platoons choose first.
  // On a skirmish map the AI only knows the sites it has explored (or holds),
  // like the player; while the enemy HQ is still unknown it also weighs
  // scouting the nearest unexplored ground.
  const known = state.sites.filter((st) => st.owner === side || isExplored(state, side, st.x, st.y));
  const targets = [...known];
  if (state.explored && !known.some((st) => st.kind === 'hq' && st.home !== side)) targets.push(...scoutPoints(state, side));
  const near = new Map(targets.map((st) => [st.id, seenFoes.filter((e) => dist(e, st) < ai.threatRadius).length]));
  const committed = new Map(targets.map((st) => [st.id, 0]));
  const free = mine.filter((pl) => {
    if (pl.order.type === 'fallback') return state.tick - (memory.fallbackTick[pl.id] || 0) > 25 * cfg.tickRate;
    return true;
  }).sort((a, b) => platoonAlive(state, b) - platoonAlive(state, a) || a.id - b.id);
  // A reserve: while not ahead, the weakest platoon waits at our home
  // objective until the enemy threatens something of ours, so a push can be
  // answered instead of everyone being committed at once.
  const homeObj = state.sites.find((s) => s.kind === 'hq' && s.home === side) || state.sites.filter((s) => s.kind === 'objective').sort((a, b) => (side === 0 ? a.x - b.x : b.x - a.x))[0];
  const threatened = state.sites.some((s) => s.owner === side && near.get(s.id) > 0) || (homeObj && homeObj.owner !== side && homeObj.owner !== null);
  const reserve = !ahead && !threatened && free.length >= 3 && homeObj ? free[free.length - 1] : null;
  if (reserve) {
    if (!(reserve.order.type === 'take' && reserve.order.siteId === homeObj.id) && can(cost.take)) spend({ type: 'take', params: { platoon: reserve.id, site: homeObj.id } }, cost.take);
    // The reserve guards the home objective, so nobody else needs to.
    committed.set(homeObj.id, committed.get(homeObj.id) + platoonAlive(state, reserve));
  }
  // Skirmish: enemy seen close to our HQ. Losing it loses the battle, so
  // the nearest platoons drop what they are doing and go back to hold it,
  // enough of them to outnumber what we can see coming.
  const myHq = homeObj && homeObj.kind === 'hq' ? homeObj : null;
  const defenders = new Set();
  if (myHq) {
    const raiders = seenFoes.filter((e) => dist(e, myHq) < ai.hqDefendRadius).length;
    if (raiders >= ai.hqDefendMin) {
      let guard = 0;
      const byNear = free.filter((pl) => centres.get(pl.id)).sort((a, b) => dist(centres.get(a.id), myHq) - dist(centres.get(b.id), myHq) || a.id - b.id);
      for (const pl of byNear) {
        if (guard >= raiders * 1.3) break;
        defenders.add(pl);
        guard += platoonAlive(state, pl);
        if (!(pl.order.type === 'take' && pl.order.siteId === myHq.id) && can(cost.take)) spend({ type: 'take', params: { platoon: pl.id, site: myHq.id } }, cost.take);
      }
      committed.set(myHq.id, committed.get(myHq.id) + guard);
    }
  }
  const lane = (state.map.lanes || []).find((l) => l.side === side);
  for (const pl of free) {
    if (pl === reserve || defenders.has(pl)) continue;
    const c = centres.get(pl.id);
    if (!c) continue;
    const alive = platoonAlive(state, pl);
    const current = pl.order.type === 'take' ? pl.order.siteId : null;
    let best = null, bestScore = -Infinity;
    for (const site of targets) {
      let v = (ai.siteValue[site.kind] || 1) * (1 + ai.highGroundValue * heightAt(state.map, site.x, site.y)); // hills are worth more
      const threat = near.get(site.id);
      if (site.owner === foe) v *= 1.3;
      else if (site.owner === side) v *= threat > 0 || ahead ? 0.9 : 0.15;
      v += ai.threatValue * threat; // a site the enemy is massing on must be answered
      if (site.id === current) v *= 1.5;
      // The longer the enemy HQ stays hidden, the more scouting matters.
      if (site.kind === 'scout') v *= 1 + state.tick / (cfg.tickRate * ai.scoutGrowSec);
      const have = committed.get(site.id);
      // How many soldiers a site needs: enough to beat what we can see there,
      // plus a garrison that is bigger for objectives and for high ground
      // (the hill at B needs about two platoons).
      const h = heightAt(state.map, site.x, site.y);
      const garrison = site.kind === 'objective' ? ai.garrison + ai.garrisonPerLevel * h : 5;
      if (have >= threat * 1.2 + garrison) v *= 0.3; // already enough of us going there
      if (have + alive < threat * 0.6) v *= 0.4; // don't feed a lone platoon into a bigger force
      const score = v / (dist(c, site) + 400);
      if (score > bestScore) { bestScore = score; best = site; }
    }
    if (!best) continue;
    committed.set(best.id, committed.get(best.id) + alive);
    const there = dist(c, best) < best.r;
    if (best.id === current || (pl.order.type === 'hold' && there)) {
      // Already on it. If we are winning and sitting on an objective we own, dig in.
      if (ahead && there && best.owner === side && best.kind === 'objective' && pl.order.type !== 'hold' && can(cost.hold)) {
        spend({ type: 'hold', params: { platoon: pl.id } }, cost.hold);
      }
      continue;
    }
    // Going for the enemy's home objective from our own half: take the
    // covered route round the flank first, then turn in.
    const onOwnHalf = side === 0 ? c.x < state.map.width / 2 : c.x > state.map.width / 2;
    memory.lane = memory.lane || {};
    if (lane && best.id === lane.to && onOwnHalf && !memory.lane[pl.id]) {
      if (dist(c, lane.via) > 150) {
        if (!(pl.order.type === 'move' && Math.hypot(pl.order.x - lane.via.x, pl.order.y - lane.via.y) < 10) && can(cost.move)) spend({ type: 'move', params: { platoon: pl.id, x: Math.round(lane.via.x), y: Math.round(lane.via.y) } }, cost.move);
        continue;
      }
    }
    if (lane && dist(c, lane.via) <= 150) memory.lane[pl.id] = true;
    if (best.kind === 'scout') {
      // Scouting: a move order into the unexplored ground.
      if (!(pl.order.type === 'move' && Math.hypot(pl.order.x - best.x, pl.order.y - best.y) < 60) && can(cost.move)) spend({ type: 'move', params: { platoon: pl.id, x: best.x, y: best.y } }, cost.move);
      continue;
    }
    if (can(cost.take)) spend({ type: 'take', params: { platoon: pl.id, site: best.id } }, cost.take);
  }

  // Focus fire on an enemy heavy squad close to a platoon: heavies pin
  // everyone, so they are the squads most worth silencing first.
  for (const pl of mine) {
    if (pl.focus >= 0 || state.tick - (memory.focusTick[pl.id] ?? -1e9) < ai.focusEverySec * cfg.tickRate) continue;
    if (!can(cost.focus) || op < cost.focus + prof.reserve) continue;
    const c = centres.get(pl.id);
    if (!c) continue;
    let best = null, bd = ai.focusRange;
    for (const e of seenFoes) {
      if (e.role !== 'heavy') continue;
      const d = dist(e, c);
      if (d < bd || (d === bd && best && e.squad < best.squad)) { bd = d; best = e; }
    }
    if (!best) continue;
    spend({ type: 'focus', params: { platoon: pl.id, target: best.squad } }, cost.focus);
    memory.focusTick[pl.id] = state.tick;
  }

  // Abilities are free, so use any that has something to do, as a sharp
  // player would. Two exceptions: no charging with a badly weakened platoon,
  // and sandbags only once the enemy is close.
  for (const pl of mine) {
    for (const id of pl.squads) {
      const sq = state.squads[id];
      const list = members(state, sq);
      if (!list.length || sq.mode === 'rout' || state.tick < sq.abilityReady) continue;
      if (sq.role === 'assault' && platoonStrength(state, pl) < 0.4) continue;
      // Infiltrators only vanish once they have given themselves away.
      if (sq.role === 'infiltrator' && !list.some((x) => state.tick - x.lastShotTick < cfg.roles.infiltrator.revealSec * cfg.tickRate)) continue;
      if (sq.role === 'engineer' && abilityKey(state, sq) === 'sandbags') {
        const c = centroid(list);
        if (!seenFoes.some((e) => dist(e, c) < 400)) continue;
      } else if (!abilityHasTarget(state, sq)) continue;
      cmds.push({ side, type: 'ability', params: { platoon: pl.id, role: sq.role } });
    }
  }

  // The tank: fire Overwatch whenever it has a worthwhile target, back off
  // to repair distance when badly hurt, otherwise roll in just behind the
  // strongest platoon so the infantry lead and the tank covers them.
  const tank = state.vehicles.find((v) => v.side === side && v.alive);
  if (tank) {
    if (state.tick >= tank.abilityReady) {
      const t = mainGunTarget(state, tank);
      if (t && (t.tank || t.n >= 3)) cmds.push({ side, type: 'vability', params: {} });
    }
    const W = state.map.width;
    const back = side === 0 ? -1 : 1;
    let goal = null;
    if (tank.hp < tank.maxHp * ai.tankRetreatHp) {
      goal = { x: side === 0 ? ai.tankRetreatX : W - ai.tankRetreatX, y: tank.y };
      // Badly hurt and still seen by the enemy: pop smoke to cover the retreat.
      if (state.tick >= tank.smokeReady && tank.spotted[1 - side]) cmds.push({ side, type: 'vability', params: { kind: 'smoke' } });
    }
    else {
      const lead = mine.filter((pl) => pl.order.type === 'take' || pl.order.type === 'move' || pl.order.type === 'hold')
        .sort((a, b) => platoonAlive(state, b) - platoonAlive(state, a) || a.id - b.id)[0];
      const c = lead && centres.get(lead.id);
      const to = lead && (lead.order.type === 'take' || lead.order.type === 'move') ? { x: lead.order.x, y: lead.order.y } : c;
      if (to && c) goal = { x: Math.round(to.x + back * ai.tankBehind), y: Math.round(to.y) };
    }
    const cur = tank.order.type === 'move' ? tank.order : tank;
    if (goal && dist(goal, cur) > ai.tankReorderDist && op >= cost.vmove + prof.reserve && orders < 3) {
      spend({ type: 'vmove', params: goal }, cost.vmove);
    }
  }

  // Skirmish: bring up a reserve platoon as soon as the ground held allows.
  if (!callinBlocked(state, side, 'platoon') && op >= cfg.callins.platoon.cost) {
    cmds.push({ side, type: 'callin', params: { what: 'platoon' } });
    op -= cfg.callins.platoon.cost;
  }
  // A new tank from the depot when ours is gone and points allow.
  if (!callinBlocked(state, side, 'tank') && op >= cfg.callins.tank.cost + prof.reserve) {
    cmds.push({ side, type: 'callin', params: { what: 'tank' } });
    op -= cfg.callins.tank.cost;
  }

  // Gates we hold the lever for: shut them in the enemy's face when they come
  // close and outnumber us there; open them again once the way is quiet.
  for (const gate of state.map.gates || []) {
    if (gate.moving || canWorkGate(state, side, gate) || op < cost.gate + prof.reserve) continue;
    const c = gateCentre(state.map, gate);
    const foes = seenFoes.filter((e) => dist(e, c) < 280).length;
    const ours = state.soldiers.filter((o) => o.side === side && isActive(o) && dist(o, c) < 220).length;
    const want = foes >= 3 && foes > ours;
    if (want !== gate.closed && (want || foes === 0) && state.tick - (memory.gateTick?.[gate.id] ?? -1e9) > 20 * cfg.tickRate) {
      cmds.push({ side, type: 'gate', params: { gate: gate.id } });
      op -= cost.gate;
      memory.gateTick = memory.gateTick || {};
      memory.gateTick[gate.id] = state.tick;
    }
  }

  // Smoke to cover a platoon that is pinned down on its way in.
  for (const pl of mine) {
    if (pl.order.type !== 'take' || !seenFoes.length) continue;
    const pinned = pl.squads.filter((id) => state.squads[id].pinned).length;
    if (pinned < 2 || state.tick - (memory.smokeTick[pl.id] ?? -1e9) < 25 * cfg.tickRate) continue;
    if (op < cost.smoke + prof.reserve) continue;
    const c = centres.get(pl.id);
    let near = seenFoes[0];
    for (const e of seenFoes) if (dist(e, c) < dist(near, c)) near = e;
    const x = c.x + (near.x - c.x) * 0.4, y = c.y + (near.y - c.y) * 0.4;
    cmds.push({ side, type: 'smoke', params: { x: Math.round(x), y: Math.round(y) } });
    op -= cost.smoke;
    memory.smokeTick[pl.id] = state.tick;
  }
  return cmds;
}
