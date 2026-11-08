// Small shared helpers for the simulation. Pure functions only.

import { SIDE_NAMES } from '../config.js';
import { terrainAt, T_NAMES } from './map.js';

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ISA advances to the right (+x), the Helghast to the left.
export const sideDir = (side) => (side === 0 ? 1 : -1);
export const edgeX = (state, side) => (side === 0 ? 0 : state.map.width);

export const isActive = (s) => s.alive && !s.fled;

export function members(state, sq) {
  const out = [];
  for (const id of sq.soldiers) {
    const s = state.soldiers[id];
    if (isActive(s)) out.push(s);
  }
  return out;
}

export function centroid(list) {
  let x = 0, y = 0;
  for (const s of list) { x += s.x; y += s.y; }
  return { x: x / list.length, y: y / list.length };
}

export function platoonAlive(state, pl) {
  let n = 0;
  for (const sid of pl.squads) n += members(state, state.squads[sid]).length;
  return n;
}

export const platoonStrength = (state, pl) => platoonAlive(state, pl) / pl.size;

export function coverName(state, x, y) {
  return T_NAMES[terrainAt(state.map, x, y)];
}

export function coverAt(state, x, y) {
  return state.cfg.cover[coverName(state, x, y)];
}

export function siteLabel(site) {
  if (site.kind === 'objective') return site.id;
  return 'the ' + site.name;
}

// Nearest objective letter within maxD, for "near B" style status text.
export function nearObjective(state, p, maxD = 320) {
  let best = null, bd = maxD;
  for (const st of state.sites) {
    if (st.kind !== 'objective') continue;
    const d = dist(st, p);
    if (d < bd) { bd = d; best = st; }
  }
  return best;
}

// pos (optional) is where it happened, so the player can tap the message
// to look there.
export function feed(state, text, side = null, pos = null) {
  state.feed.push({ tick: state.tick, text, side, x: pos ? Math.round(pos.x) : null, y: pos ? Math.round(pos.y) : null });
  state.events.push({ type: 'feed', text, side });
}

export const sideName = (side) => SIDE_NAMES[side];
