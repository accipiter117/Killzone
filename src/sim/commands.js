// The one and only way to change a battle from outside: a command object
// {tick, side, type, params} passed to applyCommand. The player's taps and the
// AI's decisions both arrive here, so they follow exactly the same rules.

import { clamp } from './util.js';
import { resetPlans, thinkSquad } from './squads.js';
import { callArtillery, dropSmoke } from './features.js';

export const COMMAND_TYPES = ['move', 'take', 'hold', 'fallback', 'stance', 'artillery', 'smoke'];

const fail = (reason) => ({ ok: false, reason });

export function applyCommand(state, cmd) {
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
  if (['move', 'take', 'hold', 'fallback', 'stance'].includes(type)) {
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
