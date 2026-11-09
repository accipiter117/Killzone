// The campaign AI: looks at the war map at the start of planning and gives
// the same campaign commands a player could. No randomness: the same map
// always gets the same plan. (Its battles are fought by the battle AI.)

import { reachable, attackable, strengthOf, sectorOwner, extrasFor } from './state.js';

export function planFor(state, side) {
  const cc = state.cc;
  const cmds = [];
  const res = { ...state.res[side] };
  const mine = state.platoons.filter((p) => p.side === side).sort((a, b) => strengthOf(b) - strengthOf(a) || (a.id < b.id ? -1 : 1));
  const per = cc.costs.refillPerSoldier.manpower;

  // Refill the weakest platoons in supply.
  for (const pl of [...mine].sort((a, b) => strengthOf(a) - strengthOf(b))) {
    if (pl.cut || strengthOf(pl) > 0.85) continue;
    const missing = pl.alive.reduce((a, n) => a + (5 - n), 0);
    if (res.manpower < per) break;
    cmds.push({ side, type: 'refill', params: { platoon: pl.id } });
    res.manpower -= Math.min(missing, Math.floor(res.manpower / per)) * per;
  }
  // Raise a new platoon when there is plenty to spare.
  const rc = cc.costs.recruit;
  if (mine.length < cc.maxPlatoons && Object.entries(rc).every(([k, v]) => res[k] >= v + (k === 'materiel' ? cc.costs.fortify.materiel : 0))) {
    cmds.push({ side, type: 'recruit', params: { template: mine.length, group: mine.length % 2 ? 'south' : 'north' } });
    for (const [k, v] of Object.entries(rc)) res[k] -= v;
  }

  // Sector values: enemy sites there are worth taking.
  const valueOf = (sector) => state.sites.filter((s) => s.sector === sector && s.owner !== side).reduce((a, s) => a + cc.siteValue[s.kind], 0);
  const enemyCells = (sector) => { let n = 0; for (let i = 0; i < state.sector.length; i++) if (state.sector[i] === sector && state.owner[i] !== side) n++; return n; };
  const defenders = (sector) => state.platoons.filter((p) => p.side !== side && p.sector === sector).reduce((a, p) => a + strengthOf(p), 0);
  const committed = new Map();
  const frontSectors = state.sectors.filter((s) => sectorOwner(state, s.id) === side && s.neighbours.some((nb) => enemyCells(nb) > 0 || sectorOwner(state, nb) !== side)).map((s) => s.id);

  // A garrison: where one of our sites faces enemy platoons next door, the
  // weakest fit platoon there stays to hold it.
  const staying = new Set();
  for (const site of state.sites.filter((x) => x.owner === side)) {
    const threat = state.sectors[site.sector].neighbours.some((nb) => state.platoons.some((p) => p.side !== side && p.sector === nb));
    if (!threat) continue;
    const here = mine.filter((p) => p.sector === site.sector).sort((a, b) => strengthOf(a) - strengthOf(b));
    if (here.length) staying.add(here[0].id);
  }

  for (const pl of mine) {
    if (staying.has(pl.id) || strengthOf(pl) < Math.max(cc.minStrength, 0.4)) continue; // holding, or too weak: wait for a refill
    const targets = attackable(state, pl);
    if (targets.length) {
      let best = null, bestScore = -Infinity;
      for (const t of targets) {
        const have = committed.get(t) || 0;
        if (have >= cc.maxPerSide) continue;
        // Enemy-held sectors (real gains) and their sites first; slivers of
        // our own contested sectors only if the enemy stands in them.
        const theirs = sectorOwner(state, t) !== side;
        const foes = defenders(t);
        if (!theirs && foes === 0) continue;
        const score = (theirs ? 6 : 1) + valueOf(t) * 2 - foes * 4 + have * 3 - t * 0.001;
        if (score > bestScore) { bestScore = score; best = t; }
      }
      // Only attack where the odds look fair: our strength there against theirs.
      if (best !== null && (committed.get(best) || 0) + strengthOf(pl) >= defenders(best) * 0.8) {
        committed.set(best, (committed.get(best) || 0) + strengthOf(pl));
        cmds.push({ side, type: 'attack', params: { platoon: pl.id, sector: best } });
        continue;
      }
    }
    // No good attack from here: move up to the front.
    const reach = reachable(state, pl);
    let go = null, gd = Infinity;
    for (const [s, d] of reach) if (frontSectors.includes(s) && d < gd) { gd = d; go = s; }
    if (go === null) for (const [s, d] of reach) if (d < gd) { gd = d; go = s; }
    if (go !== null && !frontSectors.includes(pl.sector)) cmds.push({ side, type: 'move', params: { platoon: pl.id, sector: go } });
  }

  // Dig in where valuable ground of ours faces enemy platoons.
  const threatened = frontSectors
    .map((s) => ({ s, v: state.sites.filter((x) => x.sector === s && x.owner === side).reduce((a, x) => a + cc.siteValue[x.kind], 0) + state.sectors[s].neighbours.filter((nb) => state.platoons.some((p) => p.side !== side && p.sector === nb)).length }))
    .filter((t) => t.v > 0 && state.platoons.some((p) => p.side === side && p.sector === t.s))
    .sort((a, b) => b.v - a.v || a.s - b.s);
  for (const t of threatened) {
    if (res.materiel < cc.costs.fortify.materiel) break;
    cmds.push({ side, type: 'fortify', params: { sector: t.s } });
    res.materiel -= cc.costs.fortify.materiel;
  }
  void extrasFor;
  cmds.push({ side, type: 'endPlanning', params: {} });
  return cmds;
}
