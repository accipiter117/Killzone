// The one and only way to change a battle from outside: a command object
// {tick, side, type, params} passed to applyCommand. The player's taps and the
// AI's decisions both arrive here, so they follow exactly the same rules.

import { clamp } from './util.js';
import { resetPlans, thinkSquad } from './squads.js';
import { callArtillery, dropSmoke } from './features.js';
import { useAbility } from './abilities.js';
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
  const c = alive.length ? centroid(alive) : centroid(squads.flatMap((q) => members(state, q)).concat([{ x: 0, y: state.map.height / 2 }]));
  const W = state.map.width;
  dead.slice(0, cfg.reinforce.soldiers).forEach((s, k) => {
    const x = cfg.deploy.x - (k % 2) * 14;
    const y = Math.max(20, Math.min(state.map.height - 20, c.y + (k - 2) * 12));
    s.x = s.tx = pl.side === 0 ? x : W - x;
    s.y = s.ty = pl.side === 0 ? y : state.map.height - y;
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

export const COMMAND_TYPES = ['move', 'take', 'hold', 'fallback', 'stance', 'artillery', 'smoke', 'ability', 'reinforce'];

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
  const cost = cfg.orders.cost[type];
  if (cost === undefined) return fail('Unknown order');
  const sd = state.sides[side];
  if (!sd) return fail('Unknown side');
  if (sd.op + 1e-9 < cost) return fail('Not enough order points');

  let pl = null;
  if (['move', 'take', 'hold', 'fallback', 'stance', 'ability', 'reinforce'].includes(type)) {
    pl = state.platoons[p.platoon];
    if (!pl || pl.side !== side) return fail('Not your platoon');
    if (pl.broken) return fail(`${pl.name} has broken and will not take orders`);
  }
  const W = state.map.width, H = state.map.height;
  const point = () => (Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: clamp(Math.round(p.x), 0, W), y: clamp(Math.round(p.y), 0, H) } : null);

  switch (type) {
    case 'move': {
      const pt = point();
      if (!pt) return fail('Bad position');
      setOrder(state, pl, { type: 'move', ...pt });
      break;
    }
    case 'take': {
      const site = state.sites.find((s) => s.id === p.site);
      if (!site) return fail('Unknown objective');
      setOrder(state, pl, { type: 'take', siteId: site.id, x: site.x, y: site.y });
      break;
    }
    case 'hold':
    case 'fallback':
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
    default:
      return fail('Unknown order');
  }
  sd.op -= cost;
  return { ok: true };
}

function setOrder(state, pl, order) {
  pl.order = order;
  pl.orderTick = state.tick;
  resetPlans(state, pl);
  // Squads react straight away rather than at their next think.
  for (const id of pl.squads) thinkSquad(state, state.squads[id]);
}
