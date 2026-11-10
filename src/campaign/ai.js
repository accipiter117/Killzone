// The campaign AI: looks at the board and gives the same commands a player
// could, one at a time (an attack starts a battle that must be settled
// before the next order). No randomness: the same board always gets the
// same orders. Its battles are fought by the battle AI.

import {
  armyAt, capitalOf, connected, oddsOf, ordersFor, soldiers, fullStrength, pushIn,
} from './state.js';
import { distances } from './commands.js';

// The next command for this side, or endTurn when it has nothing left to do.
export function nextCommand(state, side) {
  const cc = state.cc;
  const end = { side, type: 'endTurn', params: {} };
  if (state.phase !== 'turn' || state.active !== side) return null;
  const mine = state.armies.filter((a) => a.side === side).sort((a, b) => soldiers(b) - soldiers(a) || (a.id < b.id ? -1 : 1));
  const supply = state.supply[side];
  const cap = capitalOf(state, side);
  const con = connected(state, side);

  // Spend supply: a platoon for the army at the front that needs one most,
  // else a new army; then refill the most worn army.
  const atCap = cap.owner === side ? armyAt(state, cap.id) : null;
  if (cap.owner === side && supply >= cc.costs.recruit) {
    const enemyNear = (a) => state.provinces[a.at].neighbours.some((n) => state.provinces[n].owner !== side);
    const short = mine.filter((a) => a.platoons.length < cc.maxPlatoons && con.has(a.at))
      .sort((a, b) => (enemyNear(b) ? 1 : 0) - (enemyNear(a) ? 1 : 0) || a.platoons.length - b.platoons.length || (a.id < b.id ? -1 : 1));
    if (short.length) return { side, type: 'recruit', params: { army: short[0].id } };
    const roomForArmy = mine.length < cc.maxArmies && (!atCap || state.provinces.some((p) => con.has(p.id) && !armyAt(state, p.id)));
    if (roomForArmy) return { side, type: 'recruit', params: {} };
  }
  const worn = mine.filter((a) => con.has(a.at) && soldiers(a) < fullStrength(a)).sort((a, b) => soldiers(a) / fullStrength(a) - soldiers(b) / fullStrength(b) || (a.id < b.id ? -1 : 1));
  if (worn.length && supply >= Math.min(5, fullStrength(worn[0]) - soldiers(worn[0])) * cc.costs.refillPerSoldier) {
    return { side, type: 'refill', params: { army: worn[0].id } };
  }

  // Guard the capital: while an enemy army is within two provinces of it,
  // one army stays there (raised on the spot if need be, else called back).
  const capDist = distances(state, cap.id);
  const capThreat = cap.owner === side && state.armies.some((a) => a.side !== side && (capDist.get(a.at) ?? 99) <= 2);
  const guard = atCap && atCap.side === side ? atCap : null;
  if (capThreat && !guard) {
    const back = mine.filter((a) => !a.moved).map((a) => ({ a, o: ordersFor(state, a).find((o) => o.kind === 'march' && (capDist.get(o.to) ?? 99) < (capDist.get(a.at) ?? 99)) }))
      .filter((x) => x.o).sort((x, y) => (capDist.get(x.a.at) ?? 99) - (capDist.get(y.a.at) ?? 99) || (x.a.id < y.a.id ? -1 : 1));
    if (back.length) return { side, type: 'march', params: { army: back[0].a.id, to: back[0].o.to } };
  }

  // Each army that has not moved: take, attack, dig in, or move up.
  const push = side !== state.playerSide && pushIn(state) === 0;
  const need = push ? cc.aiPushOdds : cc.aiAttackOdds;
  const enemyGround = state.provinces.filter((p) => p.owner !== side).map((p) => p.id);
  const toFront = multiDistances(state, enemyGround);
  for (const army of mine) {
    if (army.moved) continue;
    const orders = ordersFor(state, army);
    // Value: supply, sites, the enemy capital above all.
    const value = (id) => {
      const p = state.provinces[id];
      return p.supply + (p.site === 'capital' ? 20 : 0) + (p.home === side ? 2 : 0);
    };
    const here = state.provinces[army.at];
    const threatened = here.neighbours.some((n) => { const e = armyAt(state, n); return e && e.side !== side; });
    // The capital's guard stays put while the enemy is near.
    const holdCapital = army === guard && capThreat;
    if (holdCapital) {
      if (!army.dug && threatened && supply >= cc.costs.dig) return { side, type: 'dig', params: { army: army.id } };
      continue;
    }
    // Empty ground and good fights weighed together: what it is worth times
    // the chance of taking it (a likely win at their capital beats any
    // empty field).
    const gains = orders.filter((o) => o.kind === 'take' || (o.kind === 'fight' && o.odds >= need))
      .map((o) => ({ ...o, score: value(o.to) * (o.kind === 'take' ? 1 : o.odds) }))
      .sort((a, b) => b.score - a.score || tie(side, a.to, b.to));
    if (gains.length) return { side, type: 'attack', params: { army: army.id, to: gains[0].to } };
    if (threatened) {
      if (!army.dug && supply >= cc.costs.dig) return { side, type: 'dig', params: { army: army.id } };
      continue; // hold the line
    }
    // Move up towards the front, through our own ground.
    const marches = orders.filter((o) => o.kind === 'march' && (toFront.get(o.to) ?? 99) < (toFront.get(army.at) ?? 99))
      .sort((a, b) => (toFront.get(a.to) ?? 99) - (toFront.get(b.to) ?? 99) || value(b.to) - value(a.to) || tie(side, a.to, b.to));
    if (marches.length) return { side, type: 'march', params: { army: army.id, to: marches[0].to } };
  }
  return end;
}

// Ties broken in mirror order for the two sides, so mirrored boards play
// out the same way for either.
const tie = (side, a, b) => (side === 0 ? a - b : b - a);

function multiDistances(state, from) {
  const d = new Map(from.map((id) => [id, 0]));
  const q = [...from];
  while (q.length) {
    const s = q.shift();
    for (const n of state.provinces[s].neighbours) if (!d.has(n)) { d.set(n, d.get(s) + 1); q.push(n); }
  }
  return d;
}

export { distances };
