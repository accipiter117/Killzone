// Objectives and capturable features, petrusite tanks, artillery and smoke.

import { next } from './rng.js';
import { T, terrainAt, paintCircle, forCells } from './map.js';
import { isActive, dist, feed, sideName, siteLabel, nearObjective, coverAt } from './util.js';
import { fireShot, damageSoldier, suppress, losClear } from './combat.js';
import { blastVehicles, damageVehicle } from './vehicles.js';

const describe = (site) => (site.kind === 'objective' ? `objective ${site.id}` : `the ${site.name}`);

// Capture bars: fill while only one side's non-routing soldiers are inside,
// stall while contested, drain slowly when empty. Full bar = ownership flips.
export function updateSites(state, dt) {
  const cap = state.cfg.capture;
  for (const site of state.sites) {
    const counts = [0, 0];
    const r2 = site.r * site.r;
    for (const s of state.soldiers) {
      if (!isActive(s) || state.squads[s.squad].mode === 'rout') continue;
      if ((s.x - site.x) ** 2 + (s.y - site.y) ** 2 <= r2) counts[s.side]++;
    }
    site.counts = counts;
    site.contested = counts[0] > 0 && counts[1] > 0;
    const secs = site.kind === 'objective' ? cap.objectiveSec : cap.featureSec;
    if (site.contested) continue;
    const present = counts[0] > 0 ? 0 : counts[1] > 0 ? 1 : null;
    if (present === null || present === site.owner) {
      // Empty, or the owner is home: any enemy progress drains away.
      const rate = present === null ? 1 / cap.decaySec : 3 / secs;
      site.cap = Math.max(0, site.cap - rate * dt);
      if (site.cap === 0) site.capSide = null;
      continue;
    }
    if (site.capSide !== null && site.capSide !== present) {
      site.cap -= dt / secs; // undo the other side's partial capture first
      if (site.cap <= 0) { site.cap = 0; site.capSide = present; }
      continue;
    }
    site.capSide = present;
    site.cap += dt / secs;
    if (site.cap >= 1) {
      site.owner = present;
      state.sides[present].captures++;
      site.cap = 0;
      site.capSide = null;
      feed(state, `${sideName(present)} took ${describe(site)}`, present, site);
      state.events.push({ type: 'capture', site: site.id, side: present });
    }
  }
}

// MG nests and the arc tower work for whoever owns them.
export function updateEmplacements(state, dt) {
  const f = state.cfg.features;
  for (const site of state.sites) {
    if (site.owner === null || (site.kind !== 'mg' && site.kind !== 'arc')) continue;
    if (site.kind === 'mg') {
      // Suppression on the nest wears off; too much and it falls silent
      // until it has eased well back down.
      const m = f.mgSilence;
      site.supp = Math.max(0, (site.supp || 0) - m.decay * dt);
      if (!site.silenced && site.supp >= m.silencedAt) {
        site.silenced = true;
        feed(state, `${sideName(site.owner)} MG nest${nearObjective(state, site) ? ` near ${nearObjective(state, site).id}` : ''} silenced`, 1 - site.owner, site);
        state.events.push({ type: 'silenced', side: site.owner, x: site.x, y: site.y });
      } else if (site.silenced && site.supp < m.silencedAt * m.recoverShare) site.silenced = false;
      if (site.silenced) continue;
    }
    site.fireCd -= dt;
    if (site.fireCd > 0) continue;
    const w = f[site.kind];
    const targets = nearestEnemies(state, site, site.owner, w.range, site.kind === 'arc' ? w.targets : 1);
    if (!targets.length && !(site.kind === 'arc' && state.vehicles.some((o) => o.alive && o.side !== site.owner && dist(o, site) <= w.range && o.spotted[site.owner]))) { site.fireCd = 0.3; continue; }
    if (site.kind === 'mg') {
      fireShot(state, { x: site.x, y: site.y, side: site.owner }, targets[0], w, w.range, false, 'mg');
      site.lastShotTick = state.tick;
      site.fireCd = w.fireInterval * (1 + (f.mgSilence.fireMult * (site.supp || 0)) / 100);
    } else {
      for (const t of targets) {
        damageSoldier(state, t, w.damage, 'arc');
        suppress(state, state.squads[t.squad], w.suppress * coverAt(state, t.x, t.y).supp, 'arc', site);
        state.events.push({ type: 'zap', x1: site.x, y1: site.y - 30, x2: t.x, y2: t.y, side: site.owner });
      }
      // The arc also jumps to an enemy tank close enough.
      const v = state.vehicles.find((o) => o.alive && o.side !== site.owner && dist(o, site) <= w.range && o.spotted[site.owner]);
      if (v) {
        damageVehicle(state, v, w.damage * state.cfg.tank.damageFrom.arc, 'arc');
        state.events.push({ type: 'zap', x1: site.x, y1: site.y - 30, x2: v.x, y2: v.y - 16, side: site.owner });
      }
      site.fireCd = w.intervalSec;
    }
  }
}

function nearestEnemies(state, p, side, range, n) {
  const list = [];
  for (const e of state.soldiers) {
    if (e.side === side || !isActive(e)) continue;
    const d = dist(e, p);
    if (d <= range && losClear(state, p.x, p.y, e.x, e.y)) list.push({ e, d });
  }
  list.sort((a, b) => a.d - b.d || a.e.id - b.e.id);
  return list.slice(0, n).map((o) => o.e);
}

// Damage everyone in a radius (friend and foe), with falloff from the centre.
export function blast(state, x, y, radius, damage, suppRadius, suppAmount, source, buildingMult = 1, cause = source) {
  blastVehicles(state, x, y, radius, damage);
  breakWalls(state, x, y, radius * state.cfg.walls.breakShare);
  const hitSquads = new Set();
  for (const s of state.soldiers) {
    if (!isActive(s)) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= suppRadius) hitSquads.add(s.squad);
    if (d > radius) continue;
    const mult = terrainAt(state.map, s.x, s.y) === T.building ? buildingMult : 1;
    damageSoldier(state, s, damage * (1 - (0.7 * d) / radius) * mult, cause);
  }
  for (const id of [...hitSquads].sort((a, b) => a - b)) {
    const sq = state.squads[id];
    const lead = state.soldiers[sq.soldiers[0]];
    suppress(state, sq, suppAmount * coverAt(state, lead.x, lead.y).supp, source, { x, y });
  }
  // Blasts on or beside an MG nest rattle its crew.
  for (const site of state.sites) {
    if (site.kind === 'mg' && site.owner !== null && Math.hypot(site.x - x, site.y - y) <= radius + site.r) site.supp = Math.min(100, (site.supp || 0) + state.cfg.features.mgSilence.blast);
  }
}

// Explosions knock walls down to rubble, opening new routes and sight lines.
export function breakWalls(state, x, y, r) {
  const map = state.map;
  if (!map.hasWalls || r <= 0) return;
  const cells = [];
  forCells(map, x - r, y - r, x + r, y + r, (i, cx, cy) => {
    if (map.grid[i] === T.wall && (cx - x) ** 2 + (cy - y) ** 2 <= r * r) { map.grid[i] = T.rubble; cells.push(i); }
  });
  if (!cells.length) return;
  if (!map.broken) map.broken = new Uint8Array(map.grid.length);
  for (const i of cells) map.broken[i] = 1;
  state.events.push({ type: 'wallBroken', cells, x, y });
  // Routes planned round the old wall may now go straight through.
  for (const sq of state.squads) sq.path = null;
  for (const v of state.vehicles) v.path = null;
}

export function addCrater(state, x, y, r) {
  state.map.craters.push({ x, y, r });
  paintCircle(state.map, x, y, r, T.crater);
  state.events.push({ type: 'crater', x, y, r });
}

export function explodeTank(state, tank) {
  if (tank.exploded) return;
  tank.exploded = true;
  const t = state.cfg.features.tank;
  state.events.push({ type: 'tankBlast', x: tank.x, y: tank.y });
  const near = nearObjective(state, tank);
  feed(state, `A petrusite tank exploded${near ? ' near ' + near.id : ''}`, null, tank);
  addCrater(state, tank.x, tank.y, 26);
  blast(state, tank.x, tank.y, t.blastRadius, t.damage, t.blastRadius * 1.3, t.suppress, 'blast', 1, 'petrusite');
  for (const other of state.tanks) {
    if (!other.exploded && dist(other, tank) < t.blastRadius) explodeTank(state, other);
  }
}

export function callArtillery(state, side, x, y) {
  const a = state.cfg.artillery;
  const start = state.tick + Math.round(a.warningSec * state.cfg.tickRate);
  state.strikes.push({ side, x, y, start, shellsLeft: a.shells, nextTick: start });
  state.events.push({ type: 'strike', side, x, y });
  const near = nearObjective(state, { x, y }, 400);
  feed(state, `${sideName(side)} artillery incoming${near ? ' near ' + near.id : ''}`, side, { x, y });
}

export function updateStrikes(state) {
  const a = state.cfg.artillery;
  const gap = Math.max(1, Math.round((a.spreadSec * state.cfg.tickRate) / a.shells));
  for (const st of state.strikes) {
    if (state.tick < st.nextTick || st.shellsLeft <= 0) continue;
    const ang = next(state) * Math.PI * 2, rr = Math.sqrt(next(state)) * a.radius;
    const x = st.x + Math.cos(ang) * rr, y = st.y + Math.sin(ang) * rr;
    state.events.push({ type: 'shell', x, y });
    blast(state, x, y, a.blastRadius, a.damage, a.suppressRadius, a.suppress, 'artillery', state.cfg.cover.building.artilleryMult);
    addCrater(state, x, y, a.craterRadius[0] + next(state) * (a.craterRadius[1] - a.craterRadius[0]));
    const tr = state.cfg.features.tank.radius;
    for (const tank of state.tanks) {
      if (!tank.exploded && dist(tank, { x, y }) < a.blastRadius + tr) explodeTank(state, tank);
    }
    st.shellsLeft--;
    st.nextTick = state.tick + gap;
  }
  state.strikes = state.strikes.filter((s) => s.shellsLeft > 0);
}

export function dropSmoke(state, side, x, y) {
  const s = state.cfg.smoke;
  state.smokes.push({ side, x, y, r: s.radius, end: state.tick + Math.round(s.durationSec * state.cfg.tickRate) });
  state.events.push({ type: 'smoke', x, y, r: s.radius });
}

export function updateSmokes(state) {
  if (state.smokes.some((s) => s.end <= state.tick)) state.smokes = state.smokes.filter((s) => s.end > state.tick);
}

export { siteLabel };
