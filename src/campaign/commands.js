// The one and only way to change a campaign: a command object
// {side, type, params} passed to applyCampaignCommand. The player's taps and
// the campaign AI's moves arrive here alike. Same seed + same command log =
// same war.
//
// A turn: the ISA move each army once (march, take, attack or dig in) and
// spend supply, then end the turn; the Helghast do the same; then both
// sides are paid, cut-off armies wither and the next turn starts. An attack
// on a held province starts its battle at once: nothing else happens until
// its battleResult arrives (fought on the battle screen or auto-resolved).

import { SIDE_NAMES } from '../config.js';
import {
  armyAt, armyById, capitalOf, connected, incomeOf, addArmy, addPlatoon, soldiers, held, pushIn, setObjective,
} from './state.js';
import { makeBattle, resolveBattle } from './battles.js';

const fail = (reason) => ({ ok: false, reason });
const ok = () => ({ ok: true });

export const CAMPAIGN_COMMANDS = ['march', 'attack', 'dig', 'refill', 'recruit', 'endTurn', 'battleResult'];

const report = (state, line) => state.reports[state.reports.length - 1].push(line);
const label = (army) => `${SIDE_NAMES[army.side]} ${army.num} Army`;

export function applyCampaignCommand(state, cmd) {
  if (state.phase === 'over') return fail('The war is over');
  const { side, type } = cmd;
  const p = cmd.params || {};
  if (!CAMPAIGN_COMMANDS.includes(type)) return fail('Unknown order');
  if (side !== 0 && side !== 1) return fail('Unknown side');
  if (type === 'battleResult') return battleResult(state, p);
  if (state.phase === 'battle') return fail('A battle is being fought');
  if (state.active !== side) return fail("It is not your turn");
  const cc = state.cc;
  const army = p.army ? armyById(state, p.army) : null;
  if (p.army && (!army || army.side !== side)) return fail('Not your army');

  switch (type) {
    case 'march': {
      if (army.moved) return fail('That army has already moved this turn');
      const to = state.provinces[p.to];
      if (!to || !state.provinces[army.at].neighbours.includes(to.id)) return fail('March to a neighbouring province');
      if (to.owner !== side) return fail('That province is held by the enemy: attack it instead');
      if (armyAt(state, to.id)) return fail('One of your armies is already there');
      army.at = to.id;
      army.moved = true;
      army.dug = false;
      return ok();
    }
    case 'attack': {
      if (army.moved) return fail('That army has already moved this turn');
      const to = state.provinces[p.to];
      if (!to || !state.provinces[army.at].neighbours.includes(to.id)) return fail('Attack a neighbouring province');
      if (to.owner === side) return fail('That province is already yours');
      if (state.turn <= (cc.ceasefire || 0)) return fail('Ceasefire: no attacks until the next turn. March up and dig in.');
      army.moved = true;
      army.dug = false;
      const there = armyAt(state, to.id);
      if (!there) {
        // Nobody holds it: the army walks in.
        to.owner = side;
        army.at = to.id;
        report(state, `${label(army)} took ${to.name} unopposed.`);
        checkCapital(state);
        return ok();
      }
      state.battle = makeBattle(state, army, to.id);
      state.phase = 'battle';
      return ok();
    }
    case 'dig': {
      if (army.moved) return fail('That army has already moved this turn');
      if (army.dug) return fail('Already dug in');
      if (state.supply[side] < cc.costs.dig) return fail(`Digging in costs ${cc.costs.dig} supply`);
      state.supply[side] -= cc.costs.dig;
      army.dug = true;
      army.moved = true;
      return ok();
    }
    case 'refill': {
      if (!connected(state, side).has(army.at)) return fail('Cut off from your capital: no supply can reach it');
      const missing = army.platoons.reduce((s, pl) => s + pl.alive.reduce((a, n) => a + (5 - n), 0), 0);
      if (!missing) return fail('Already at full strength');
      const n = Math.min(missing, Math.floor(state.supply[side] / cc.costs.refillPerSoldier));
      if (!n) return fail('Not enough supply');
      state.supply[side] -= n * cc.costs.refillPerSoldier;
      // Fill the emptiest squads first.
      for (let k = 0; k < n; k++) {
        let best = null;
        for (const pl of army.platoons) pl.alive.forEach((v, i) => { if (v < 5 && (!best || v < best.pl.alive[best.i])) best = { pl, i }; });
        best.pl.alive[best.i]++;
      }
      return ok();
    }
    case 'recruit': {
      const cap = capitalOf(state, side);
      if (cap.owner !== side) return fail('Your capital has fallen');
      if (state.supply[side] < cc.costs.recruit) return fail(`A new platoon costs ${cc.costs.recruit} supply`);
      // A platoon for an army anywhere supply can reach.
      if (army) {
        if (army.platoons.length >= cc.maxPlatoons) return fail(`An army holds at most ${cc.maxPlatoons} platoons`);
        if (!connected(state, side).has(army.at)) return fail('Cut off from your capital: no recruits can reach it');
        state.supply[side] -= cc.costs.recruit;
        addPlatoon(state, army);
        return ok();
      }
      const here = armyAt(state, cap.id);
      if (here && here.side === side && here.platoons.length < cc.maxPlatoons) {
        state.supply[side] -= cc.costs.recruit;
        addPlatoon(state, here);
        return ok();
      }
      // A new army: at the capital, or (with a full army there) in the
      // nearest free province of ours joined to it.
      if (state.armies.filter((a) => a.side === side).length >= cc.maxArmies) return fail(`At most ${cc.maxArmies} armies`);
      let at = here ? -1 : cap.id;
      if (at < 0) {
        const con = connected(state, side), dist = distances(state, cap.id);
        const free = state.provinces.filter((p) => con.has(p.id) && !armyAt(state, p.id)).sort((x, y) => dist.get(x.id) - dist.get(y.id) || (side === 0 ? x.id - y.id : y.id - x.id));
        if (!free.length) return fail('No free province near your capital for a new army');
        at = free[0].id;
      }
      state.supply[side] -= cc.costs.recruit;
      const a = addArmy(state, side, at);
      a.moved = true; // fresh troops form up this turn
      return ok();
    }
    case 'endTurn': {
      if (side === state.first) { state.active = 1 - side; return ok(); }
      upkeep(state);
      return ok();
    }
    default:
      return fail('Unknown order');
  }
}

// A battle's outcome: the played battle (with its command log) or the
// auto-resolved one. params.result can carry a result already worked out
// (the battle screen or a Web Worker); otherwise it is run here.
function battleResult(state, p) {
  if (state.phase !== 'battle' || !state.battle) return fail('No battle is being fought');
  const rec = state.battle;
  if (p.battle !== rec.id) return fail('Unknown battle');
  const r = p.result || resolveBattle(rec, p.log || null);
  rec.result = { winner: r.winner, margin: r.margin, reason: r.reason, durationSec: r.durationSec, scores: r.scores, casualties: r.casualties, platoons: r.platoons };
  rec.log = r.log || p.log || [];
  const att = armyById(state, rec.attackerArmy), def = armyById(state, rec.defenderArmy);
  const prov = state.provinces[rec.province];
  // Survivors go back to their platoons (in-battle reinforcements were
  // local help and do not stay); platoons with nobody left are gone.
  const lost = [0, 0];
  for (const pr of r.platoons || []) {
    for (const army of [att, def]) {
      const pl = army && army.platoons.find((x) => x.id === pr.ref);
      if (!pl) continue;
      const before = pl.alive.reduce((a, n) => a + n, 0);
      pl.alive = pl.alive.map((n, k) => Math.min(n, pr.survivors[k] ?? n));
      lost[army.side] += before - pl.alive.reduce((a, n) => a + n, 0);
      pl.battles++;
      if (r.winner === army.side) pl.wins++;
    }
  }
  for (const army of [att, def]) if (army) army.platoons = army.platoons.filter((pl) => pl.alive.some((n) => n > 0));
  const won = r.winner === rec.attacker;
  rec.lost = lost;
  if (won) {
    prov.owner = rec.attacker;
    if (def && def.platoons.length) retreat(state, def);
    else if (def) report(state, `${label(def)} was destroyed at ${prov.name}.`);
    if (att && att.platoons.length) att.at = prov.id;
    report(state, `${label(att)} took ${prov.name} (${r.margin} win).`);
  } else {
    report(state, `${def ? label(def) : 'The defenders'} held ${prov.name}${r.winner === null ? ' (stalemate)' : ''}.`);
  }
  rec.won = won;
  state.armies = state.armies.filter((a) => a.platoons.length);
  state.history.push(rec);
  state.battle = null;
  state.phase = 'turn';
  checkCapital(state);
  return ok();
}

// A beaten army falls back to a neighbouring province of its own with
// nobody in it, nearest its capital; with nowhere to go, it is lost.
function retreat(state, army) {
  const cap = capitalOf(state, army.side);
  const dist = distances(state, cap.id);
  const options = state.provinces[army.at].neighbours
    .filter((n) => state.provinces[n].owner === army.side && !armyAt(state, n))
    .sort((a, b) => (dist.get(a) ?? 99) - (dist.get(b) ?? 99) || (army.side === 0 ? a - b : b - a));
  if (options.length) {
    army.at = options[0];
    army.dug = false;
    report(state, `${label(army)} fell back to ${state.provinces[options[0]].name}.`);
  } else {
    army.platoons = [];
    report(state, `${label(army)} was surrounded and lost.`);
  }
}

export function distances(state, from) {
  const d = new Map([[from, 0]]);
  const q = [from];
  while (q.length) {
    const s = q.shift();
    for (const n of state.provinces[s].neighbours) if (!d.has(n)) { d.set(n, d.get(s) + 1); q.push(n); }
  }
  return d;
}

function checkCapital(state) {
  for (const side of [0, 1]) {
    const cap = capitalOf(state, 1 - side);
    if (cap.owner === side) return endWar(state, side, `${SIDE_NAMES[side]} took ${cap.name}, the enemy capital`);
  }
}

// End of a full turn: pay both sides, wither cut-off armies, check the
// objective, and start the next turn (or end the war).
function upkeep(state) {
  const cc = state.cc;
  for (const side of [0, 1]) {
    const inc = incomeOf(state, side);
    state.supply[side] += inc;
    const con = connected(state, side);
    for (const army of state.armies.filter((a) => a.side === side && !con.has(a.at))) {
      for (let k = 0; k < cc.attrition; k++) {
        const pl = army.platoons.find((x) => x.alive.some((n) => n > 0));
        if (!pl) break;
        const i = pl.alive.indexOf(Math.max(...pl.alive));
        pl.alive[i]--;
      }
      army.platoons = army.platoons.filter((pl) => pl.alive.some((n) => n > 0));
      report(state, `${label(army)} is cut off from supply and losing men.`);
    }
  }
  state.armies = state.armies.filter((a) => a.platoons.length);
  // The objective: met, or out of time.
  const o = state.objective;
  if (o) {
    const side = state.playerSide;
    if (o.targets.every((id) => state.provinces[id].owner === side)) {
      state.supply[side] += o.reward;
      report(state, `Objective met: +${o.reward} supply.`);
      state.objective = null;
    } else if (state.turn >= o.by) {
      report(state, 'Objective missed.');
      state.objective = null;
    }
  }
  for (const a of state.armies) a.moved = false;
  state.turn++;
  state.active = state.first;
  // A side down to its last few provinces gives up.
  for (const side of [0, 1]) {
    if (held(state, side) <= (cc.surrenderAt || 0)) return endWar(state, 1 - side, `${SIDE_NAMES[side]} surrendered with only ${held(state, side)} province${held(state, side) === 1 ? '' : 's'} left`);
  }
  if (state.turn > state.finalTurn) {
    const h = [held(state, 0), held(state, 1)];
    const w = h[0] !== h[1] ? (h[0] > h[1] ? 0 : 1) : incomeOf(state, 0) >= incomeOf(state, 1) ? 0 : 1;
    return endWar(state, w, `${SIDE_NAMES[w]} held the most provinces when the war ended (${h[w]} to ${h[1 - w]})`);
  }
  // The Helghast push: extra supply the turn it comes.
  if (pushIn(state) === 0 && cc.pushSupply) state.supply[1 - state.playerSide] += cc.pushSupply;
  state.reports.push([]);
  if (!state.objective && (state.turn - 1) % cc.objective.every === 0) setObjective(state);
}

function endWar(state, winner, reason) {
  state.winner = winner;
  state.winReason = reason;
  state.phase = 'over';
  report(state, `${reason}. The war is over.`);
}

export { soldiers };
