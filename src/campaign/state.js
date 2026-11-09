// Campaign state: creating a campaign, and the rules everything else reads
// (who holds what, supply, income, what a side brings to a battle).
// Pure and JSON-serialisable: no DOM, no Math.random, no timers.

import { CAMPAIGN } from '../config.js';
import { seedFrom } from '../sim/rng.js';
import { mergeConfig } from '../sim/battle.js';
import { generateWorld } from './world.js';

export const SIDES = ['isa', 'hgh'];

export function createCampaign(seed, options = {}) {
  const cc = mergeConfig(CAMPAIGN, options.config);
  const seedInt = seedFrom(seed);
  const st = { rng: seedInt };
  const world = generateWorld(st, cc, seedInt);
  const state = {
    version: cc.version, seed, cc, rng: st.rng,
    night: 1, round: 1, phase: 'plan', finalNight: options.nights || cc.nights,
    playerSide: options.playerSide ?? 0,
    cols: world.cols, rows: world.rows, owner: world.owner, sector: world.sector,
    sectors: world.sectors, sites: world.sites,
    platoons: [], nextPlatoon: 1, sergeantNext: [0, 0],
    res: [{ ...cc.start }, { ...cc.start }],
    fort: {}, key: null, ended: [false, false],
    battles: [], // this round's battles
    history: [], // every battle fought, for replays
    dispatches: [], // per night: the lines of the newsreel
    events: [], winner: null, winReason: null,
  };
  // Two army groups a side, three platoons each, along the front.
  const perSide = cc.grid.sectorCols * cc.grid.sectorRows;
  const at = (c, r) => c * cc.grid.sectorRows + r;
  const starts = { north: [at(3, 0), at(3, 0), at(2, 1)], south: [at(3, 2), at(3, 2), at(3, 1)] };
  for (const side of [0, 1]) {
    for (const group of ['north', 'south']) {
      // The Helghast half is turned round, so their north is the mirror of
      // the ISA south.
      const locals = side === 0 ? starts[group] : starts[group === 'north' ? 'south' : 'north'];
      locals.forEach((local, k) => addPlatoon(state, side, group, local + side * perSide, k));
    }
  }
  refreshSupply(state);
  state.dispatches.push([]);
  return state;
}

export function addPlatoon(state, side, group, sector, template) {
  const cc = state.cc;
  const names = cc.sergeants[SIDES[side]];
  const sergeant = names[state.sergeantNext[side]++ % names.length];
  const roles = cc.templates[template % cc.templates.length];
  const pl = {
    id: `${SIDES[side]}-${state.nextPlatoon++}`, side, group, sector, template, roles: roles.slice(),
    alive: roles.map(() => 5), sergeant, broken: false, order: null, cut: false, battles: 0, wins: 0,
  };
  state.platoons.push(pl);
  return pl;
}

// ---- Ground, sites and supply -------------------------------------------------
export const siteOwner = (state, site) => state.owner[site.cell];
export const sectorOwner = (state, id) => state.owner[state.sectors[id].centre];
export const capitalOf = (state, side) => state.sites.find((s) => s.kind === 'capital' && s.home === side);

export function cellsOf(state, sectorId) {
  const out = [];
  for (let i = 0; i < state.sector.length; i++) if (state.sector[i] === sectorId) out.push(i);
  return out;
}

// Cells each side can trace back to its capital through its own ground.
export function connectedCells(state, side) {
  const { cols, rows, owner } = state;
  const seen = new Uint8Array(owner.length);
  const cap = capitalOf(state, side);
  if (!cap || owner[cap.cell] !== side) return seen;
  const q = [cap.cell];
  seen[cap.cell] = 1;
  while (q.length) {
    const i = q.pop();
    const x = i % cols, y = (i / cols) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1, y > 0 ? i - cols : -1, y < rows - 1 ? i + cols : -1]) {
      if (j >= 0 && !seen[j] && owner[j] === side) { seen[j] = 1; q.push(j); }
    }
  }
  return seen;
}

// Recalculate who is in supply and which sites are connected.
export function refreshSupply(state) {
  const conn = [connectedCells(state, 0), connectedCells(state, 1)];
  for (const site of state.sites) {
    const side = siteOwner(state, site);
    site.owner = side;
    site.connected = !!conn[side][site.cell];
  }
  const supplied = [new Set(), new Set()];
  for (let i = 0; i < state.owner.length; i++) if (conn[state.owner[i]][i]) supplied[state.owner[i]].add(state.sector[i]);
  for (const pl of state.platoons) pl.cut = !supplied[pl.side].has(pl.sector);
  return supplied;
}

const held = (state, side, kind) => state.sites.some((s) => s.kind === kind && s.owner === side && s.connected);

// What a side brings to a battle from the sites it holds.
export function extrasFor(state, side) {
  const cc = state.cc;
  return {
    tank: held(state, side, 'tankworks'),
    artillery: held(state, side, 'power') && state.res[side].power >= cc.costs.artilleryPerBattle.power,
    opBonus: held(state, side, 'comms') ? 1 : 0,
    airfield: held(state, side, 'airfield'),
  };
}

// Income for a round: every connected site, plus a bonus per whole region.
export function incomeFor(state, side) {
  const cc = state.cc;
  const out = { manpower: 0, materiel: 0, power: 0 };
  const add = (o) => { for (const k in o) out[k] += o[k]; };
  for (const s of state.sites) if (s.owner === side && s.connected && cc.income[s.kind]) add(cc.income[s.kind]);
  for (const region of new Set(state.sites.map((s) => regionOf(state, s)))) {
    const inRegion = state.sites.filter((s) => regionOf(state, s) === region);
    if (inRegion.every((s) => s.owner === side && s.connected)) add(cc.regionBonus);
  }
  return out;
}

export const regionOf = (state, site) => state.sectors[site.sector].region;

export const strengthOf = (pl) => pl.alive.reduce((a, n) => a + n, 0) / (pl.roles.length * 5);

export function siteValue(state, side) {
  return state.sites.filter((s) => s.owner === side).reduce((a, s) => a + state.cc.siteValue[s.kind], 0);
}

// Sectors a platoon can reach this round through its own side's sectors.
export function reachable(state, pl) {
  const out = new Map([[pl.sector, 0]]);
  const q = [pl.sector];
  while (q.length) {
    const s = q.shift();
    const d = out.get(s);
    if (d >= state.cc.moveRange) continue;
    for (const nb of state.sectors[s].neighbours) {
      if (out.has(nb) || sectorOwner(state, nb) !== pl.side) continue;
      out.set(nb, d + 1);
      q.push(nb);
    }
  }
  out.delete(pl.sector);
  return out;
}

// Sectors a platoon can attack: its own (if the enemy holds some of it) or a
// neighbour where the enemy holds ground.
export function attackable(state, pl) {
  const enemyIn = (id) => {
    for (let i = 0; i < state.sector.length; i++) if (state.sector[i] === id && state.owner[i] !== pl.side) return true;
    return false;
  };
  return [pl.sector, ...state.sectors[pl.sector].neighbours].filter(enemyIn);
}
