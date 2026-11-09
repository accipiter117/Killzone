// The one and only way to change a campaign: a command object
// {side, type, params} passed to applyCampaignCommand. The player's taps and
// the AI's plans arrive here alike, so pass-and-play and online can slot in
// later. Same seed + same command log = same campaign.
//
// Round loop: plan (both sides give orders, then end planning) -> battles
// (each one played or auto-resolved, reported with battleResult) ->
// aftermath and upkeep -> next round (or the end of the night, or the war).

import { next } from '../sim/rng.js';
import { SIDE_NAMES } from '../config.js';
import {
  addPlatoon, refreshSupply, incomeFor, reachable, attackable, strengthOf, sectorOwner, capitalOf, siteValue, cellsOf, SIDES,
} from './state.js';
import { makeBattles, resolveBattle } from './battles.js';

const fail = (reason) => ({ ok: false, reason });
const ok = () => ({ ok: true });

export const CAMPAIGN_COMMANDS = ['move', 'attack', 'hold', 'refill', 'fortify', 'recruit', 'key', 'endPlanning', 'battleResult'];

const afford = (res, cost, times = 1) => Object.entries(cost).every(([k, v]) => res[k] >= v * times);
const pay = (res, cost, times = 1) => { for (const [k, v] of Object.entries(cost)) res[k] -= v * times; };

export function applyCampaignCommand(state, cmd) {
  if (state.phase === 'over') return fail('The war is over');
  const { side, type } = cmd;
  const p = cmd.params || {};
  if (!CAMPAIGN_COMMANDS.includes(type)) return fail('Unknown order');
  if (side !== 0 && side !== 1) return fail('Unknown side');
  const cc = state.cc;
  const res = state.res[side];
  const plat = () => {
    const pl = state.platoons.find((x) => x.id === p.platoon);
    return pl && pl.side === side ? pl : null;
  };
  if (type === 'battleResult') return battleResult(state, cmd);
  if (state.phase !== 'plan') return fail('Orders are only given while planning');
  if (state.ended[side] && type !== 'endPlanning') return fail('You have already ended planning');

  switch (type) {
    case 'move': {
      const pl = plat();
      if (!pl) return fail('Not your platoon');
      if (!reachable(state, pl).has(p.sector)) return fail('Too far, or not through your own ground');
      pl.sector = p.sector;
      pl.order = { type: 'move', sector: p.sector };
      refreshSupply(state);
      return ok();
    }
    case 'attack': {
      const pl = plat();
      if (!pl) return fail('Not your platoon');
      if (strengthOf(pl) < cc.minStrength) return fail(`${pl.sergeant}'s platoon is too weak to attack`);
      if (pl.order && pl.order.type === 'move') return fail('That platoon has already moved this round');
      if (!attackable(state, pl).includes(p.sector)) return fail('Attack an enemy sector next to the platoon');
      pl.order = { type: 'attack', sector: p.sector };
      return ok();
    }
    case 'hold': {
      const pl = plat();
      if (!pl) return fail('Not your platoon');
      if (pl.order && pl.order.type === 'move') return fail('That platoon has already moved this round');
      pl.order = null;
      return ok();
    }
    case 'refill': {
      const pl = plat();
      if (!pl) return fail('Not your platoon');
      if (pl.cut) return fail('Cut off from supply: it cannot be refilled');
      const missing = pl.alive.reduce((a, n) => a + (5 - n), 0);
      if (!missing) return fail('Already at full strength');
      const per = cc.costs.refillPerSoldier;
      let n = missing;
      while (n > 0 && !afford(res, per, n)) n--;
      if (!n) return fail('Not enough manpower');
      pay(res, per, n);
      // Fill the emptiest squads first.
      for (let k = 0; k < n; k++) {
        let low = 0;
        pl.alive.forEach((v, i) => { if (v < pl.alive[low]) low = i; });
        pl.alive[low]++;
      }
      return ok();
    }
    case 'fortify': {
      const id = p.sector;
      if (!state.sectors[id] || sectorOwner(state, id) !== side) return fail('Dig in on your own ground');
      if (state.fort[`${id}:${side}`]) return fail('Already dug in this round');
      if (!afford(res, cc.costs.fortify)) return fail('Not enough materiel');
      pay(res, cc.costs.fortify);
      state.fort[`${id}:${side}`] = true;
      return ok();
    }
    case 'recruit': {
      if (state.platoons.filter((x) => x.side === side).length >= cc.maxPlatoons) return fail('No more platoons can be raised');
      if (!afford(res, cc.costs.recruit)) return fail('Not enough manpower, materiel or power');
      const cap = capitalOf(state, side);
      if (cap.owner !== side) return fail('Your capital has fallen');
      pay(res, cc.costs.recruit);
      const template = ((p.template ?? 0) % cc.templates.length + cc.templates.length) % cc.templates.length;
      const pl = addPlatoon(state, side, p.group === 'south' ? 'south' : 'north', cap.sector, template);
      pl.order = { type: 'move', sector: cap.sector }; // fresh troops do not attack on their first round
      refreshSupply(state);
      return ok();
    }
    case 'key': {
      if (side !== state.playerSide) return fail('Only the player picks a key battle');
      state.key = p.sector ?? null;
      return ok();
    }
    case 'endPlanning': {
      state.ended[side] = true;
      if (state.ended[0] && state.ended[1]) startBattles(state);
      return ok();
    }
    default:
      return fail('Unknown order');
  }
}

function startBattles(state) {
  state.battles = makeBattles(state);
  state.phase = 'battles';
  if (state.battles.every((b) => b.result)) finishRound(state);
}

// A battle's outcome: the result of the played battle (with its command log)
// or of the auto-resolved one. params.result can carry a result already
// worked out (the battle screen or a Web Worker); otherwise it is run here.
function battleResult(state, cmd) {
  if (state.phase !== 'battles') return fail('No battles are being fought');
  const p = cmd.params || {};
  const rec = state.battles.find((b) => b.id === p.battle);
  if (!rec) return fail('Unknown battle');
  if (rec.result) return fail('That battle is already decided');
  const r = p.result || resolveBattle(rec, p.log || null);
  rec.result = { winner: r.winner, margin: r.margin, reason: r.reason, durationSec: r.durationSec, scores: r.scores, casualties: r.casualties, platoons: r.platoons };
  rec.log = r.log || p.log || [];
  if (state.battles.every((b) => b.result)) finishRound(state);
  return ok();
}

// ---- Aftermath and upkeep -----------------------------------------------------
function finishRound(state) {
  const cc = state.cc;
  const lines = state.dispatches[state.dispatches.length - 1];
  const name = (side) => SIDE_NAMES[side];
  for (const rec of state.battles) {
    const r = rec.result;
    rec.changes = [];
    // Survivors go back to their platoons (in-battle reinforcements were
    // local help and do not stay).
    for (const pr of r.platoons || []) {
      const pl = state.platoons.find((x) => x.id === pr.ref);
      if (!pl) continue;
      pl.alive = pl.alive.map((n, k) => Math.min(n, pr.survivors[k] ?? n));
      pl.broken = pr.broken;
      pl.battles++;
      if (r.winner === pl.side) pl.wins++;
    }
    if (r.winner === null || r.winner === undefined) {
      rec.changes.push('No ground changed hands');
      lines.push(`Stalemate in the ${rec.sectorName}.`);
      continue;
    }
    const w = r.winner, l = 1 - w;
    let focus = rec.sector;
    if (w !== rec.attacker || rec.meeting) {
      // The defenders (or the side that won a meeting) push back into the
      // sector the losers came from.
      const from = rec.forces[l].platoons.map((x) => state.platoons.find((pl) => pl.id === x.ref)).filter(Boolean);
      if (w !== rec.attacker && from.length) focus = from[0].sector;
    }
    const n = r.walkover ? cc.push.walkover : w === rec.attacker || rec.meeting ? cc.push[r.margin] : cc.push.defenderNarrow * (r.margin === 'crushing' ? 3 : r.margin === 'clear' ? 2 : 1);
    const before = state.sites.map((s) => state.owner[s.cell]);
    // Sites still defended at the start of the battle hold this time,
    // though their defences wear down; at zero they can fall.
    const guarded = new Set(state.sites.filter((x) => x.defence > 0).map((x) => x.cell));
    const worn = wearDown(state, focus, l);
    const flipped = push(state, w, focus, n, r.margin === 'crushing' && w === rec.attacker ? cc.push.breakthrough : 0, guarded);
    for (const s of worn) rec.changes.push(`${s.name} defences down to ${s.defence}`);
    state.sites.forEach((s, i) => {
      if (before[i] !== state.owner[s.cell]) {
        rec.changes.push(`${name(w)} captured ${s.name}`);
        lines.push(`${name(w)} forces captured ${s.name} (${s.kind === 'tankworks' ? 'tank works' : s.kind === 'power' ? 'power plant' : s.kind}).`);
      }
    });
    rec.changes.unshift(`${name(w)} won (${r.walkover ? 'unopposed' : r.margin}): ${flipped} cells of ground`);
    if (!r.walkover) lines.push(`${name(w)} ${r.margin === 'crushing' ? 'broke through' : 'won'} in the ${rec.sectorName}${r.margin === 'crushing' ? '' : ` (${r.margin})`}.`);
    else lines.push(`${name(w)} advanced unopposed in the ${rec.sectorName}.`);
  }
  // Attackers who took a sector move in to hold it.
  for (const rec of state.battles) {
    const w = rec.result.winner;
    if (w !== rec.attacker || sectorOwner(state, rec.sector) !== w) continue;
    for (const f of rec.forces[w].platoons) {
      const pl = state.platoons.find((x) => x.id === f.ref);
      if (pl && !pl.broken) pl.sector = rec.sector;
    }
    if (rec.walkover) {
      for (const pl of state.platoons) if (pl.side === w && pl.order && pl.order.type === 'attack' && pl.order.sector === rec.sector) pl.sector = rec.sector;
    }
  }
  // Losers whose sector is now enemy ground, and broken platoons, fall back.
  refreshSupply(state);
  for (const pl of [...state.platoons]) {
    if (pl.broken || sectorOwner(state, pl.sector) !== pl.side) retreat(state, pl, lines);
  }
  // Wiped out platoons are gone.
  for (const pl of [...state.platoons]) {
    if (pl.alive.every((x) => x === 0)) {
      state.platoons.splice(state.platoons.indexOf(pl), 1);
      if (!pl.lost) lines.push(`${SIDE_NAMES[pl.side]}: ${pl.sergeant}'s platoon was wiped out.`);
    }
  }
  state.history.push(...state.battles);
  // Victory: an enemy capital taken.
  for (const side of [0, 1]) {
    const cap = capitalOf(state, 1 - side);
    if (state.owner[cap.cell] === side) return endWar(state, side, `${SIDE_NAMES[side]} took the enemy capital`);
  }
  upkeep(state);
}

// Each battle lost at a city or factory (or capital) wears its defences down
// by one; it only changes hands at zero.
function wearDown(state, sectorId, loser) {
  const out = [];
  for (const s of state.sites) {
    if (s.sector === sectorId && state.owner[s.cell] === loser && s.defence > 0) { s.defence--; out.push(s); }
  }
  return out;
}

// The winner takes up to n of the loser's cells in the focus sector,
// nearest their own ground first; with a breakthrough, more beyond it.
export function push(state, winner, sectorId, n, extra = 0, guarded = null) {
  const loser = 1 - winner;
  const protectedCells = guarded || new Set(state.sites.filter((s) => s.defence > 0).map((s) => s.cell));
  const allow = (i) => state.owner[i] === loser && !protectedCells.has(i);
  let flipped = grow(state, winner, (i) => allow(i) && state.sector[i] === sectorId, n);
  if (extra) {
    const near = new Set(state.sectors[sectorId].neighbours);
    flipped += grow(state, winner, (i) => allow(i) && near.has(state.sector[i]), extra);
  }
  return flipped;
}

function grow(state, side, ok, n) {
  const { cols, rows, owner } = state;
  const N = owner.length;
  let done = 0;
  while (done < n) {
    // The frontier: allowed cells touching the winner's ground. Taken in
    // index order (mirror order for the Helghast) so both sides advance
    // the same way.
    const front = [];
    for (let k = 0; k < N; k++) {
      const i = side === 0 ? k : N - 1 - k;
      if (!ok(i)) continue;
      const x = i % cols, y = (i / cols) | 0;
      if ((x > 0 && owner[i - 1] === side) || (x < cols - 1 && owner[i + 1] === side) || (y > 0 && owner[i - cols] === side) || (y < rows - 1 && owner[i + cols] === side)) front.push(i);
    }
    if (!front.length) break;
    for (const i of front) {
      if (done >= n) break;
      owner[i] = side;
      done++;
    }
  }
  return done;
}

// Fall back one sector towards the capital; with nowhere to go, the platoon
// is lost.
function retreat(state, pl, lines) {
  const capSector = capitalOf(state, pl.side).sector;
  const dist = sectorDistances(state, capSector);
  const options = state.sectors[pl.sector].neighbours.filter((s) => sectorOwner(state, s) === pl.side).sort((a, b) => (dist.get(a) ?? 99) - (dist.get(b) ?? 99) || a - b);
  if (sectorOwner(state, pl.sector) === pl.side && pl.broken && options.length) {
    pl.sector = options[0];
    lines.push(`${SIDE_NAMES[pl.side]}: ${pl.sergeant}'s platoon broke and fell back.`);
  } else if (sectorOwner(state, pl.sector) !== pl.side) {
    if (options.length) pl.sector = options[0];
    else {
      pl.alive = pl.alive.map(() => 0);
      pl.lost = true;
      lines.push(`${SIDE_NAMES[pl.side]}: ${pl.sergeant}'s platoon was surrounded and lost.`);
    }
  }
}

function sectorDistances(state, from) {
  const d = new Map([[from, 0]]);
  const q = [from];
  while (q.length) {
    const s = q.shift();
    for (const nb of state.sectors[s].neighbours) if (!d.has(nb)) { d.set(nb, d.get(s) + 1); q.push(nb); }
  }
  return d;
}

function upkeep(state) {
  const cc = state.cc;
  refreshSupply(state);
  for (const side of [0, 1]) {
    const inc = incomeFor(state, side);
    for (const k in inc) state.res[side][k] += inc[k];
  }
  // Artillery used this round costs power (one per battle it was available in).
  for (const rec of state.battles) {
    for (const side of [0, 1]) if (rec.forces[side].artillery && !rec.result.walkover) state.res[side].power = Math.max(0, state.res[side].power - cc.costs.artilleryPerBattle.power);
  }
  // Cut off platoons wither.
  for (const pl of state.platoons) {
    if (!pl.cut) continue;
    for (let k = 0; k < cc.attrition; k++) {
      const live = pl.alive.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
      if (live.length) pl.alive[live[Math.floor(next(state) * live.length)]]--;
    }
  }
  for (const pl of [...state.platoons]) if (pl.alive.every((x) => x === 0)) state.platoons.splice(state.platoons.indexOf(pl), 1);
  for (const pl of state.platoons) { pl.order = null; pl.broken = false; }
  state.fort = {};
  state.key = null;
  state.ended = [false, false];
  state.lastBattles = state.battles;
  state.battles = [];
  state.round++;
  if (state.round > cc.roundsPerNight) {
    state.round = 1;
    state.night++;
    if (state.night > state.finalNight) {
      // The war ends: most total site value wins (then most ground).
      const v = [siteValue(state, 0), siteValue(state, 1)];
      const ground = [0, 0];
      for (const o of state.owner) ground[o]++;
      const w = v[0] !== v[1] ? (v[0] > v[1] ? 0 : 1) : ground[0] >= ground[1] ? 0 : 1;
      return endWar(state, w, `${SIDE_NAMES[w]} held the most valuable ground at the final night (${v[w]} to ${v[1 - w]})`);
    }
    state.dispatches.push([]);
  }
  state.phase = 'plan';
}

function endWar(state, winner, reason) {
  state.winner = winner;
  state.winReason = reason;
  state.phase = 'over';
  state.dispatches[state.dispatches.length - 1].push(`${reason}. The war is over.`);
}

export { SIDES, cellsOf };
