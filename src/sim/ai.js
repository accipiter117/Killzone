// The AI commander. Every few seconds it looks at the battle and issues the
// same commands a player could, paying the same order points. It reads the
// state but never changes it directly, and uses no randomness, so the same
// battle always gets the same decisions.

import { members, centroid, dist, platoonStrength, platoonAlive, isActive } from './util.js';
import { abilityHasTarget } from './abilities.js';
import { heightAt } from './map.js';

const PROFILES = {
  standard: { stanceStrong: 'aggressive', stanceWeak: 'balanced', reserve: 1 },
  aggressive: { stanceStrong: 'aggressive', stanceWeak: 'aggressive', reserve: 0 },
  cautious: { stanceStrong: 'cautious', stanceWeak: 'cautious', reserve: 2 },
};

export function createAI(side, profile = 'standard') {
  const memory = { smokeTick: {}, fallbackTick: {} };
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

  // Stance: push while strong, ease off once a platoon has been bloodied.
  for (const pl of mine) {
    const want = platoonStrength(state, pl) > 0.6 ? prof.stanceStrong : prof.stanceWeak;
    if (pl.stance !== want) spend({ type: 'stance', params: { platoon: pl.id, stance: want } }, cost.stance);
  }

  // Pull back platoons that are both weak and taking a beating.
  for (const pl of mine) {
    if (pl.order.type === 'fallback') continue;
    if (platoonStrength(state, pl) < ai.fallbackStrength && avgSupp(state, pl) > ai.fallbackSupp && can(cost.fallback)) {
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

  // Reinforce the weakest platoon still in the fight when there are points
  // to spare.
  if (state.tick >= sd.reinforceReadyTick && op >= cost.reinforce + prof.reserve) {
    let weakest = null;
    for (const pl of mine) if (platoonStrength(state, pl) < ai.reinforceBelow && (!weakest || platoonStrength(state, pl) < platoonStrength(state, weakest))) weakest = pl;
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
  const near = new Map(state.sites.map((st) => [st.id, seenFoes.filter((e) => dist(e, st) < ai.threatRadius).length]));
  const committed = new Map(state.sites.map((st) => [st.id, 0]));
  const free = mine.filter((pl) => {
    if (pl.order.type === 'fallback') return state.tick - (memory.fallbackTick[pl.id] || 0) > 25 * cfg.tickRate;
    return true;
  }).sort((a, b) => platoonAlive(state, b) - platoonAlive(state, a) || a.id - b.id);
  for (const pl of free) {
    const c = centres.get(pl.id);
    if (!c) continue;
    const alive = platoonAlive(state, pl);
    const current = pl.order.type === 'take' ? pl.order.siteId : null;
    let best = null, bestScore = -Infinity;
    for (const site of state.sites) {
      let v = (ai.siteValue[site.kind] || 1) * (1 + ai.highGroundValue * heightAt(state.map, site.x, site.y)); // hills are worth more
      const threat = near.get(site.id);
      if (site.owner === foe) v *= 1.3;
      else if (site.owner === side) v *= threat > 0 || ahead ? 0.9 : 0.15;
      v += ai.threatValue * threat; // a site the enemy is massing on must be answered
      if (site.id === current) v *= 1.5;
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
    if (can(cost.take)) spend({ type: 'take', params: { platoon: pl.id, site: best.id } }, cost.take);
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
      if (sq.role === 'engineer') {
        const c = centroid(list);
        if (!seenFoes.some((e) => dist(e, c) < 400)) continue;
      } else if (!abilityHasTarget(state, sq)) continue;
      cmds.push({ side, type: 'ability', params: { platoon: pl.id, role: sq.role } });
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
