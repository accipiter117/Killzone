// Campaign state: creating a war, and the rules everything else reads (who
// holds what, supply lines, income, what a side brings to a battle, odds).
// Pure and JSON-serialisable: no DOM, no Math.random, no timers.

import { CAMPAIGN } from '../config.js';
import { seedFrom } from '../sim/rng.js';
import { mergeConfig } from '../sim/battle.js';
import { generateBoard } from './world.js';

export const SIDES = ['isa', 'hgh'];
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function createCampaign(seed, options = {}) {
  const cc = mergeConfig(CAMPAIGN, options.config);
  const st = { rng: seedFrom(seed) };
  const board = generateBoard(st, cc);
  const state = {
    version: cc.version, seed, cc, rng: st.rng,
    turn: 1, finalTurn: options.turns || cc.turns, phase: 'turn',
    first: options.firstSide ?? 0, active: options.firstSide ?? 0, // who moves first each turn (the player, in the game)
    playerSide: options.playerSide ?? 0,
    width: board.width, height: board.height, rows: board.rows, cols: board.cols, provinces: board.provinces,
    armies: [], nextArmy: [1, 1], nextPlatoon: 1, sergeantNext: [0, 0],
    supply: [cc.start.supply, cc.start.supply],
    battle: null, // the battle being fought right now (an attack waits for its result)
    history: [], // every battle fought, for replays
    reports: [[]], // per turn: what happened, for the turn report
    objective: null, winner: null, winReason: null, battleCount: 0,
  };
  for (const side of [0, 1]) {
    cc.armies.forEach((a) => {
      const army = addArmy(state, side, localProvince(state, side, a.at[0], a.at[1]));
      for (let k = 1; k < a.platoons; k++) addPlatoon(state, army);
    });
  }
  setObjective(state);
  return state;
}

// A province by (row, col) counted on a side's own half: row 0 is that
// side's front row, columns run left to right as that side sees them.
export function localProvince(state, side, lr, lc) {
  const { rows, cols } = state;
  const r = side === 0 ? rows / 2 + lr : rows / 2 - 1 - lr;
  const c = side === 0 ? lc : cols - 1 - lc;
  return r * cols + c;
}

export function addArmy(state, side, at) {
  const army = { id: `${SIDES[side]}-a${state.nextArmy[side]}`, num: NUMERALS[(state.nextArmy[side] - 1) % NUMERALS.length], side, at, platoons: [], moved: false, dug: false };
  state.nextArmy[side]++;
  state.armies.push(army);
  addPlatoon(state, army);
  return army;
}

export function addPlatoon(state, army) {
  const cc = state.cc;
  const side = army.side;
  const names = cc.sergeants[SIDES[side]];
  const template = army.platoons.length % cc.templates.length;
  const roles = cc.templates[template];
  const pl = { id: `${SIDES[side]}-${state.nextPlatoon++}`, template, roles: roles.slice(), alive: roles.map(() => 5), sergeant: names[state.sergeantNext[side]++ % names.length], battles: 0, wins: 0 };
  army.platoons.push(pl);
  return pl;
}

// ---- Reading the board ----------------------------------------------------------
export const armyAt = (state, id) => state.armies.find((a) => a.at === id) || null;
export const armyById = (state, id) => state.armies.find((a) => a.id === id) || null;
export const capitalOf = (state, side) => state.provinces.find((p) => p.site === 'capital' && p.home === side);
export const soldiers = (army) => army.platoons.reduce((s, pl) => s + pl.alive.reduce((a, n) => a + n, 0), 0);
export const fullStrength = (army) => army.platoons.length * 15;
export const strengthOf = (army) => (army.platoons.length ? soldiers(army) / fullStrength(army) : 0);
export const held = (state, side) => state.provinces.filter((p) => p.owner === side).length;

// Provinces a side can trace back to its capital through its own ground.
export function connected(state, side) {
  const out = new Set();
  const cap = capitalOf(state, side);
  if (!cap || cap.owner !== side) return out;
  const q = [cap.id];
  out.add(cap.id);
  while (q.length) {
    const p = state.provinces[q.shift()];
    for (const n of p.neighbours) if (!out.has(n) && state.provinces[n].owner === side) { out.add(n); q.push(n); }
  }
  return out;
}

export function incomeOf(state, side) {
  const con = connected(state, side);
  let n = 0;
  for (const id of con) n += state.provinces[id].supply;
  return n;
}

// What a side brings to a battle from the sites it holds (and can supply).
export function extrasFor(state, side) {
  const con = connected(state, side);
  const has = (site) => state.provinces.some((p) => p.site === site && p.owner === side && con.has(p.id));
  return { tank: has('tankworks'), artillery: has('power'), opBonus: has('comms') ? 1 : 0, airfield: has('airfield') };
}

// How strong an army counts when defending a province: home ground and
// digging in both help, and so does a capital's defences.
export function defenceOf(state, army, prov) {
  const cc = state.cc;
  let d = soldiers(army);
  if (prov.home === army.side) d *= 1 + cc.homeBonus;
  if (army.dug) d *= 1.2;
  if (prov.site === 'capital') d *= 1.25;
  return d;
}

// The odds (0 to 1) of an army taking a province. Empty: certain.
export function oddsOf(state, army, provId) {
  const prov = state.provinces[provId];
  const def = armyAt(state, provId);
  if (!def || def.side === army.side) return 1;
  const a = soldiers(army) * (extrasFor(state, army.side).tank ? 1.1 : 1);
  const d = defenceOf(state, def, prov) * (extrasFor(state, def.side).tank ? 1.1 : 1);
  return a / (a + d || 1);
}

// Where an army can go this turn: march (own ground, nobody of ours there),
// take (enemy ground nobody holds) or fight (enemy ground with an army).
export function ordersFor(state, army) {
  if (army.moved || state.phase !== 'turn' || state.active !== army.side) return [];
  const out = [];
  for (const n of state.provinces[army.at].neighbours) {
    const p = state.provinces[n];
    const there = armyAt(state, n);
    if (p.owner === army.side) { if (!there) out.push({ to: n, kind: 'march' }); }
    else if (!there) out.push({ to: n, kind: 'take' });
    else if (there.side !== army.side) out.push({ to: n, kind: 'fight', odds: oddsOf(state, army, n) });
  }
  return out;
}

// Turns until the next Helghast push (0 = this turn).
export const pushIn = (state) => (state.cc.pushEvery - (state.turn % state.cc.pushEvery)) % state.cc.pushEvery;

// Every few turns the player gets an objective: the enemy provinces next to
// the front worth most, to be taken in time for a supply reward.
export function setObjective(state) {
  const o = state.cc.objective;
  const side = state.playerSide;
  if (!o.reward || side === null || side === undefined) { state.objective = null; return; }
  const front = state.provinces.filter((p) => p.owner !== side && p.neighbours.some((n) => state.provinces[n].owner === side));
  front.sort((a, b) => b.supply - a.supply || (side === 0 ? b.id - a.id : a.id - b.id));
  const targets = front.slice(0, o.count).map((p) => p.id);
  state.objective = targets.length ? { targets, by: state.turn + o.every - 1, reward: o.reward } : null;
}
