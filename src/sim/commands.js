// The one and only way to change a battle from outside: a command object
// {tick, side, type, params} passed to applyCommand. The player's taps and the
// AI's decisions both arrive here, so they follow exactly the same rules.

import { clamp, isActive } from './util.js';
import { T, cellIndex } from './map.js';
import { resetPlans, thinkSquad } from './squads.js';
import { callArtillery, dropSmoke } from './features.js';
import { useAbility } from './abilities.js';
import { mainGunTarget, shell } from './vehicles.js';
import { members, centroid, feed } from './util.js';

// Fresh soldiers fill the dead places in the platoon's weakest squad. They
// appear at their own side's deployment line and walk up to rejoin it.
function reinforce(state, pl) {
  const cfg = state.cfg;
  const sd = state.sides[pl.side];
  if (state.tick < sd.reinforceReadyTick) return fail(`Reinforcements are on their way back (${Math.ceil((sd.reinforceReadyTick - state.tick) / cfg.tickRate)}s)`);
  const squads = pl.squads.map((id) => state.squads[id]);
  const weakest = squads.reduce((a, b) => (members(state, b).length < members(state, a).length ? b : a));
  const dead = weakest.soldiers.map((id) => state.soldiers[id]).filter((s) => !s.alive || s.fled);
  if (!dead.length) return fail(`${pl.name} is at full strength`);
  const alive = members(state, weakest);
  const anyone = squads.flatMap((q) => members(state, q));
  const W = state.map.width, H = state.map.height;
  const home = { x: pl.side === 0 ? cfg.deploy.x : W - cfg.deploy.x, y: H / 2 };
  const c = alive.length ? centroid(alive) : anyone.length ? centroid(anyone) : home;
  // They arrive at the nearest objective or post this side holds, if one is
  // within reach of the squad, otherwise at their own lines; then they run.
  let at = { x: home.x, y: c.y };
  let bestD = cfg.reinforce.nearSiteReach;
  for (const site of state.sites) {
    if (site.owner !== pl.side) continue;
    const d = Math.hypot(site.x - c.x, site.y - c.y);
    if (d < bestD) { bestD = d; at = { x: site.x, y: site.y }; }
  }
  dead.slice(0, cfg.reinforce.soldiers).forEach((s, k) => {
    s.x = s.tx = Math.max(10, Math.min(W - 10, at.x + (k % 2) * 12 - 6));
    s.y = s.ty = Math.max(10, Math.min(H - 10, at.y + (k - 2) * 10));
    s.joining = true;
    s.hp = s.maxHp;
    s.alive = true;
    s.fled = false;
    s.target = -1;
    s.markUntil = 0;
  });
  if (weakest.mode === 'dead') weakest.mode = 'move';
  weakest.path = null;
  sd.reinforceReadyTick = state.tick + Math.round(cfg.reinforce.cooldownSec * cfg.tickRate);
  sd.reinforcements = (sd.reinforcements || 0) + 1;
  feed(state, `${pl.side === 0 ? '' : 'Helghast '}${pl.name}: reinforcements on their way`, pl.side);
  state.events.push({ type: 'reinforce', side: pl.side, platoon: pl.id });
  return { ok: true };
}

export const COMMAND_TYPES = ['move', 'take', 'hold', 'fallback', 'stance', 'artillery', 'smoke', 'ability', 'reinforce', 'vmove', 'vability', 'focus'];

const fail = (reason) => ({ ok: false, reason });

// Visual events from an order (a grenade thrown, sandbags built) are held
// over and handed out with the next tick's events, so the screen sees them.
export function applyCommand(state, cmd) {
  const tickEvents = state.events;
  state.cmdEvents = state.cmdEvents || [];
  state.events = state.cmdEvents;
  try {
    return applyInner(state, cmd);
  } finally {
    state.events = tickEvents;
  }
}

function applyInner(state, cmd) {
  if (state.result) return fail('The battle is over');
  const { side, type } = cmd;
  const p = cmd.params || {};
  const cfg = state.cfg;
  let cost = cfg.orders.cost[type];
  if (cost === undefined) return fail('Unknown order');
  const sd = state.sides[side];
  if (!sd) return fail('Unknown side');

  let pl = null;
  if (['move', 'take', 'hold', 'fallback', 'stance', 'ability', 'reinforce', 'focus'].includes(type)) {
    pl = state.platoons[p.platoon];
    if (!pl || pl.side !== side) return fail('Not your platoon');
    // A platoon regrouping after breaking can still be reinforced.
    const regrouping = pl.broken && !pl.rallied && type === 'reinforce';
    if (pl.broken && !regrouping) return fail(`${pl.name} has broken and will not take orders`);
  }
  // Changing your mind: a platoon's movement order can be replaced for free
  // within a few seconds of giving it (a misplaced tap is easy on a phone).
  const MOVES = ['move', 'take', 'hold', 'fallback'];
  let v = null;
  if (type === 'vmove' || type === 'vability') {
    v = state.vehicles.find((o) => o.side === side);
    if (!v || !v.alive) return fail('Your tank has been destroyed');
  }
  const amending = (MOVES.includes(type) && amendWindow(state, pl) > 0) || (type === 'vmove' && amendWindow(state, v) > 0);
  if (amending) cost = 0;
  if (sd.op + 1e-9 < cost) return fail('Not enough order points');
  const W = state.map.width, H = state.map.height;
  const point = () => (Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: clamp(Math.round(p.x), 0, W), y: clamp(Math.round(p.y), 0, H) } : null);

  switch (type) {
    case 'move': {
      const pt = point();
      if (!pt) return fail('Bad position');
      if (!amending) pl.paidTick = state.tick;
      setOrder(state, pl, { type: 'move', ...pt });
      break;
    }
    case 'take': {
      const site = state.sites.find((s) => s.id === p.site);
      if (!site) return fail('Unknown objective');
      if (!amending) pl.paidTick = state.tick;
      setOrder(state, pl, { type: 'take', siteId: site.id, x: site.x, y: site.y });
      break;
    }
    case 'hold':
    case 'fallback':
      if (!amending) pl.paidTick = state.tick;
      setOrder(state, pl, { type });
      break;
    case 'stance':
      if (!cfg.stances[p.stance]) return fail('Unknown stance');
      pl.stance = p.stance;
      break;
    case 'artillery': {
      const pt = point();
      if (!pt) return fail('Bad position');
      if (state.tick < sd.artReadyTick) return fail('Artillery is reloading');
      callArtillery(state, side, pt.x, pt.y);
      sd.artReadyTick = state.tick + Math.round(cfg.artillery.cooldownSec * cfg.tickRate);
      break;
    }
    case 'smoke': {
      const pt = point();
      if (!pt) return fail('Bad position');
      dropSmoke(state, side, pt.x, pt.y);
      break;
    }
    case 'reinforce': {
      const res = reinforce(state, pl);
      if (!res.ok) return res;
      break;
    }
    case 'ability': {
      // params.role picks which of the platoon's squads uses its ability.
      const sq = pl.squads.map((id) => state.squads[id]).find((q) => q.role === p.role);
      if (!sq) return fail('No such squad in that platoon');
      const res = useAbility(state, sq);
      if (!res.ok) return res;
      break;
    }
    case 'focus': {
      // Focus fire on one enemy squad this side can see.
      const t = state.squads[p.target];
      if (!t || t.side === side) return fail('Pick an enemy squad');
      const seen = state.sides[side].spotted;
      if (!t.soldiers.some((id) => isActive(state.soldiers[id]) && seen[id])) return fail('Your troops cannot see that squad');
      pl.focus = t.id;
      pl.focusUntil = state.tick + Math.round(cfg.focus.durationSec * cfg.tickRate);
      for (const id of pl.squads) for (const sid of state.squads[id].soldiers) state.soldiers[sid].retarget = 0;
      break;
    }
    case 'vmove': {
      const pt = point();
      if (!pt) return fail('Bad position');
      if (!amending) v.paidTick = state.tick;
      v.order = { type: 'move', ...tankSpot(state, pt, side) };
      v.path = null;
      break;
    }
    case 'vability': {
      // Overwatch: a heavy shell fired at once at the best target in range.
      const o = cfg.tank.overwatch;
      if (state.tick < v.abilityReady) return fail(`${o.label} is not ready yet`);
      const t = mainGunTarget(state, v);
      if (!t) return fail('No target in sight for the main gun');
      shell(state, v, t, { vsTank: o.vsTank, blastDamage: o.blastDamage, accuracy: 0.95 });
      v.abilityReady = state.tick + Math.round(o.cooldownSec * cfg.tickRate);
      v.gunReady = Math.max(v.gunReady, state.tick + Math.round(cfg.tank.mainGun.reloadSec * cfg.tickRate));
      sd.abilities++;
      break;
    }
    default:
      return fail('Unknown order');
  }
  sd.op -= cost;
  return { ok: true };
}

// A tank cannot park inside a ruin: move its goal to the nearest open spot
// with a little room round it (searched in rings, always in the same order).
function tankSpot(state, pt, side) {
  const map = state.map, B = T.building;
  const roomy = (x, y) => {
    for (const [dx, dy] of [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12]]) {
      const i = cellIndex(map, x + dx, y + dy);
      if (i < 0 || map.grid[i] === B) return false;
    }
    return true;
  };
  if (roomy(pt.x, pt.y)) return pt;
  for (let r = 10; r <= 200; r += 10) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + (side === 1 ? Math.PI : 0); // mirror image search for the Helghast
      const x = Math.round(pt.x + Math.cos(a) * r), y = Math.round(pt.y + Math.sin(a) * r);
      if (roomy(x, y)) return { x, y };
    }
  }
  return pt;
}

// Ticks left in which this platoon's last paid order can be changed free.
export function amendWindow(state, pl) {
  if (!pl || pl.paidTick === undefined || pl.paidTick < 0) return 0;
  return Math.max(0, pl.paidTick + Math.round(state.cfg.orders.amendSec * state.cfg.tickRate) - state.tick);
}

function setOrder(state, pl, order) {
  pl.order = order;
  pl.orderTick = state.tick;
  resetPlans(state, pl);
  // Squads react straight away rather than at their next think.
  for (const id of pl.squads) thinkSquad(state, state.squads[id]);
}
