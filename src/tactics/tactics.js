// Turn-based battles. The battlefield, platoons, tanks and visuals are the
// real-time battle's (src/sim): soldiers keep moving and firing on screen
// the whole time, but in this mode the live fight does no harm (see
// state.tb in sim/combat.js). Instead the two sides take turns on a grid of
// tiles; each platoon and tank gets two actions (move, fire, overwatch,
// grenade), hit chances are shown and rolled, and these rules alone decide
// who is lost. Pure: no DOM, no Math.random (rolls use the battle's own RNG).

import { TACTICS } from '../config.js';
import { next } from '../sim/rng.js';
import { losClear, damageSoldier } from '../sim/combat.js';
import { damageVehicle } from '../sim/vehicles.js';
import { applyCommand } from '../sim/commands.js';
import { finish } from '../sim/battle.js';
import { straightClear } from '../sim/path.js';
import { heightAt, terrainAt, T } from '../sim/map.js';
import { coverName, isActive, feed, sideName } from '../sim/util.js';

const key = (x, y) => `${x},${y}`;

export function createTactics(state, opts = {}) {
  const c = { ...TACTICS, ...(opts.config || {}) };
  const cols = Math.ceil(state.map.width / c.tile), rows = Math.ceil(state.map.height / c.tile);
  const tb = { c, cols, rows, turn: 1, active: 0, units: [], points: [0, 0], log: [], applying: false, over: false, firstSide: 0 };
  state.tb = tb;
  const taken = new Set();
  const place = (x, y) => {
    let tx = clampTile(Math.floor(x / c.tile), cols), ty = clampTile(Math.floor(y / c.tile), rows);
    // Two units never share a tile: step aside to the nearest free one.
    for (let r = 0; taken.has(key(tx, ty)) && r < 6; r++) {
      const opts2 = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => [tx + dx * (r + 1), ty + dy * (r + 1)]).filter(([a, b]) => a >= 0 && b >= 0 && a < cols && b < rows && !taken.has(key(a, b)));
      if (opts2.length) { [tx, ty] = opts2[0]; break; }
    }
    taken.add(key(tx, ty));
    return [tx, ty];
  };
  for (const pl of state.platoons) {
    const alive = members(state, pl);
    if (!alive.length) continue;
    const cx = alive.reduce((a, s) => a + s.x, 0) / alive.length, cy = alive.reduce((a, s) => a + s.y, 0) / alive.length;
    const [tx, ty] = place(cx, cy);
    tb.units.push({ id: `p${pl.id}`, kind: 'platoon', side: pl.side, pl: pl.id, name: pl.name, tx, ty, ap: c.ap, ow: false, pinned: false, out: false, grenadeReady: 1 });
  }
  for (const v of state.vehicles || []) {
    if (v.absent || !v.alive) continue;
    const [tx, ty] = place(v.x, v.y);
    tb.units.push({ id: `v${v.id}`, kind: 'tank', side: v.side, v: v.id, name: 'Tank', tx, ty, ap: c.ap, ow: false, pinned: false, out: false });
  }
  // Everyone walks onto the centre of their tile.
  for (const u of tb.units) order(state, u);
  return tb;
}

const clampTile = (v, n) => Math.max(0, Math.min(n - 1, v));
export const tileCentre = (tb, tx, ty) => ({ x: (tx + 0.5) * tb.c.tile, y: (ty + 0.5) * tb.c.tile });
export const unitAt = (tb, tx, ty) => tb.units.find((u) => !u.out && u.tx === tx && u.ty === ty) || null;
export const unitById = (tb, id) => tb.units.find((u) => u.id === id) || null;
export const liveUnits = (tb, side) => tb.units.filter((u) => !u.out && (side === undefined || u.side === side));

function members(state, pl) {
  const out = [];
  for (const id of pl.squads) for (const sid of state.squads[id].soldiers) { const s = state.soldiers[sid]; if (isActive(s)) out.push(s); }
  return out;
}

// A unit's strength (0 to 1): soldiers left, or armour.
export function strength(state, u) {
  if (u.kind === 'tank') { const v = state.vehicles[u.v]; return v.alive ? v.hp / v.maxHp : 0; }
  const pl = state.platoons[u.pl];
  return members(state, pl).length / pl.size;
}
export const soldiersLeft = (state, u) => (u.kind === 'tank' ? 0 : members(state, state.platoons[u.pl]).length);
const hasHeavy = (state, u) => u.kind === 'platoon' && state.platoons[u.pl].squads.some((id) => state.squads[id].role === 'heavy' && state.squads[id].soldiers.some((sid) => isActive(state.soldiers[sid])));
const hasRifles = (state, u) => u.kind === 'platoon' && state.platoons[u.pl].squads.some((id) => state.squads[id].role === 'rifle' && state.squads[id].soldiers.some((sid) => isActive(state.soldiers[sid])));

// ---- The ground ----------------------------------------------------------------
// The best cover a squad could find on a tile: full (trenches, walls,
// ruins, sandbags), half (craters, rubble) or none, by sampling it.
export function coverOf(state, tx, ty) {
  const tb = state.tb, t = tb.c.tile;
  let best = 0, name = 'open';
  for (const fx of [0.25, 0.5, 0.75]) for (const fy of [0.25, 0.5, 0.75]) {
    const n = coverName(state, (tx + fx) * t, (ty + fy) * t);
    const hit = state.cfg.cover[n]?.hit || 0;
    if (hit > best) { best = hit; name = n; }
  }
  return { level: best >= 0.5 ? 2 : best >= 0.3 ? 1 : 0, name };
}

const blockedFor = (state, u, tx, ty) => {
  const c = tileCentre(state.tb, tx, ty);
  const g = terrainAt(state.map, c.x, c.y);
  if (g === T.wall) return true;
  return u.kind === 'tank' && g === T.building;
};

// Tiles a unit can reach this turn: Map "x,y" -> actions it costs (1 or 2).
// Neighbouring tiles connect when a squad could walk straight between their
// centres (cliffs and walls block; wire and ruins cost an extra step).
export function reachable(state, u) {
  const tb = state.tb;
  const out = new Map();
  if (u.out || u.ap <= 0) return out;
  const per = u.kind === 'tank' ? tb.c.tankMove : tb.c.move;
  const budget = per * Math.min(u.ap, u.pinned ? 1 : u.ap);
  const best = new Map([[key(u.tx, u.ty), 0]]);
  const q = [[u.tx, u.ty, 0]];
  while (q.length) {
    q.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
    const [x, y, d] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= tb.cols || ny >= tb.rows) continue;
      if (blockedFor(state, u, nx, ny)) continue;
      const a = tileCentre(tb, x, y), b = tileCentre(tb, nx, ny);
      if (!straightClear(state.map, a, b, true)) continue;
      const g = terrainAt(state.map, b.x, b.y);
      const step = 1 + (state.map.wire[Math.floor(b.y / state.map.cell) * state.map.cols + Math.floor(b.x / state.map.cell)] > 0 && u.kind !== 'tank' ? 1 : 0) + (g === T.building ? 1 : 0);
      const nd = d + step;
      if (nd > budget) continue;
      const k = key(nx, ny);
      if (best.has(k) && best.get(k) <= nd) continue;
      best.set(k, nd);
      q.push([nx, ny, nd]);
    }
  }
  for (const [k, d] of best) {
    const [x, y] = k.split(',').map(Number);
    if (d === 0 || unitAt(tb, x, y)) continue;
    out.set(k, d <= per ? 1 : 2);
  }
  return out;
}

// ---- Seeing and shooting -----------------------------------------------------------
const tileDist = (a, b) => Math.hypot(a.tx - b.tx, a.ty - b.ty);
const sees = (state, a, b) => {
  const tb = state.tb;
  const p = tileCentre(tb, a.tx, a.ty), q = tileCentre(tb, b.tx, b.ty);
  return losClear(state, p.x, p.y, q.x, q.y);
};

// Can this side see the unit (any of its units close enough with a clear line)?
export function visibleTo(state, side, u) {
  return liveUnits(state.tb, side).some((o) => tileDist(o, u) <= state.tb.c.sight && sees(state, o, u));
}

// The odds of a shot, with every reason shown. Null: no shot (out of
// range or no clear line).
export function shotOdds(state, a, t, { overwatch = false } = {}) {
  const c = state.tb.c;
  const d = tileDist(a, t);
  const tank = a.kind === 'tank';
  if (d > (tank ? c.tankRange : c.range) + 0.01 || !sees(state, a, t)) return null;
  const lines = [];
  let chance = tank ? c.tankBase : c.base;
  lines.push(`${tank ? 'Tank gun' : 'Platoon fire'}: ${chance}%`);
  const far = Math.round(Math.max(0, d - 2) * c.falloff);
  if (far) { chance -= far; lines.push(`Range: -${far}%`); }
  const cov = coverOf(state, t.tx, t.ty);
  if (cov.level && t.kind !== 'tank') {
    // Cover faces the enemy's side of the field; a shot from the side gets round it.
    const flank = Math.abs(t.ty - a.ty) > Math.abs(t.tx - a.tx);
    if (flank) lines.push(`Flanked: their ${cov.name} gives no cover`);
    else { const off = cov.level === 2 ? c.cover.full : c.cover.half; chance -= off; lines.push(`${cov.level === 2 ? 'Full' : 'Half'} cover (${cov.name}): -${off}%`); }
  }
  const ha = heightAt(state.map, ...Object.values(tileCentre(state.tb, a.tx, a.ty))), ht = heightAt(state.map, ...Object.values(tileCentre(state.tb, t.tx, t.ty)));
  if (ha > ht) { chance += c.height; lines.push(`Higher ground: +${c.height}%`); }
  if (a.pinned) { chance -= c.pinned; lines.push(`Pinned: -${c.pinned}%`); }
  if (overwatch) { chance -= c.overwatch; lines.push(`Overwatch snap shot: -${c.overwatch}%`); }
  return { chance: Math.max(5, Math.min(95, Math.round(chance))), lines };
}

// What a hit does.
export function hitEffect(state, a, t) {
  const c = state.tb.c;
  if (t.kind === 'tank') {
    const n = a.kind === 'tank' ? c.vsTank.tank : hasHeavy(state, a) ? c.vsTank.heavy : c.vsTank.platoon;
    return { armour: n, text: `${n}/${c.vsTank.of} of its armour` };
  }
  const n = a.kind === 'tank' ? c.kills.tank : c.kills.base + Math.round(c.kills.perStrength * strength(state, a)) + (hasHeavy(state, a) ? c.kills.heavy : 0);
  return { kills: n, text: `${n} soldiers` };
}

function say(state, side, text, at = null) {
  state.tb.log.push(text);
  feed(state, text, side, at);
}

// Losses, applied for real (the live fight cannot cause any).
function applyKills(state, a, t, n, cause) {
  const tb = state.tb;
  const pl = state.platoons[t.pl];
  const from = tileCentre(tb, a.tx, a.ty);
  const list = members(state, pl).sort((p, q) => Math.hypot(p.x - from.x, p.y - from.y) - Math.hypot(q.x - from.x, q.y - from.y) || p.id - q.id);
  tb.applying = true;
  for (const s of list.slice(0, n)) damageSoldier(state, s, 99999, cause);
  tb.applying = false;
  checkBroken(state, t);
}

function applyArmour(state, t, twelfths) {
  const tb = state.tb;
  const v = state.vehicles[t.v];
  tb.applying = true;
  damageVehicle(state, v, (v.maxHp * twelfths) / tb.c.vsTank.of, 'tankgun');
  tb.applying = false;
  if (!v.alive) { t.out = true; t.ap = 0; }
}

function checkBroken(state, u) {
  if (u.kind !== 'platoon' || u.out) return;
  if (strength(state, u) < state.tb.c.breakAt) {
    u.out = true; u.ap = 0; u.ow = false;
    const pl = state.platoons[u.pl];
    pl.broken = true; pl.rallied = true; pl.rallyAt = -1; // the survivors run for their own edge
    say(state, u.side, `${sideName(u.side)} ${u.name} has broken and is running`, tileCentre(state.tb, u.tx, u.ty));
  }
}

// ---- Orders (both the player and the AI) -----------------------------------------
const fail = (reason) => ({ ok: false, reason });

function order(state, u) {
  const c = tileCentre(state.tb, u.tx, u.ty);
  const side = u.side, tick = state.tick;
  if (u.kind === 'tank') applyCommand(state, { tick, side, type: 'vmove', params: { x: c.x, y: c.y } });
  else applyCommand(state, { tick, side, type: 'move', params: { platoon: u.pl, x: c.x, y: c.y } });
}

function ready(state, u) {
  if (state.tb.over) return fail('The battle is over');
  if (!u || u.out) return fail('That unit is out of the fight');
  if (u.side !== state.tb.active) return fail('Not your turn');
  if (u.ap <= 0) return fail('No actions left this turn');
  return null;
}

export function moveUnit(state, id, tx, ty) {
  const tb = state.tb;
  const u = unitById(tb, id);
  const bad = ready(state, u);
  if (bad) return bad;
  const cost = reachable(state, u).get(key(tx, ty));
  if (!cost) return fail('Out of reach');
  u.tx = tx; u.ty = ty;
  u.ap -= cost;
  u.ow = false;
  order(state, u);
  const lines = [];
  // The other side hears about moves it can see.
  if (visibleTo(state, 1 - u.side, u)) {
    const cov = coverOf(state, tx, ty);
    say(state, u.side, `${u.side === 0 ? '' : 'Helghast '}${u.name} ${cost === 2 ? 'dashes' : 'moves'}${cov.level ? ` into ${cov.name}` : ' into the open'}`, tileCentre(tb, tx, ty));
  }
  // Enemy overwatch fires at anyone moving into its sights.
  for (const o of liveUnits(tb, 1 - u.side)) {
    if (!o.ow || u.out) continue;
    const odds = shotOdds(state, o, u, { overwatch: true });
    if (!odds || odds.chance < 20) continue; // not worth giving the position away
    o.ow = false;
    lines.push(resolve(state, o, u, odds, true).line);
  }
  return { ok: true, lines };
}

function resolve(state, a, t, odds, overwatch = false) {
  const roll = Math.floor(next(state) * 100);
  const where = tileCentre(state.tb, t.tx, t.ty);
  const who = `${a.side === 0 ? '' : 'Helghast '}${a.name}`, whom = `${t.side === 0 ? '' : 'Helghast '}${t.name}`;
  let line;
  if (roll < odds.chance) {
    const fx = hitEffect(state, a, t);
    if (t.kind === 'tank') applyArmour(state, t, fx.armour);
    else applyKills(state, a, t, fx.kills, a.kind === 'tank' ? 'tankgun' : 'rifle');
    line = `${overwatch ? 'Overwatch! ' : ''}${who} hit ${whom} (${odds.chance}%): ${fx.text}${t.out ? ', out of the fight' : ''}`;
  } else {
    t.pinned = true;
    line = `${overwatch ? 'Overwatch! ' : ''}${who} missed ${whom} (${odds.chance}%): pinned down`;
  }
  say(state, a.side, line, where);
  return { hit: roll < odds.chance, roll, line };
}

export function fireUnit(state, id, targetId) {
  const tb = state.tb;
  const a = unitById(tb, id), t = unitById(tb, targetId);
  const bad = ready(state, a);
  if (bad) return bad;
  if (!t || t.out || t.side === a.side) return fail('Pick an enemy unit');
  const odds = shotOdds(state, a, t);
  if (!odds) return fail('No clear shot from here');
  const r = resolve(state, a, t, odds);
  a.ap = 0; // firing ends the unit's turn
  a.ow = false;
  return { ok: true, ...r };
}

export function grenadeUnit(state, id, targetId) {
  const tb = state.tb;
  const a = unitById(tb, id), t = unitById(tb, targetId);
  const bad = ready(state, a);
  if (bad) return bad;
  if (!hasRifles(state, a)) return fail('Only a platoon with riflemen can throw grenades');
  if (tb.turn < a.grenadeReady) return fail(`Grenades ready on turn ${a.grenadeReady}`);
  if (!t || t.out || t.side === a.side || t.kind === 'tank') return fail('Throw at an enemy platoon');
  if (tileDist(a, t) > tb.c.grenade.range + 0.01) return fail(`Grenades reach ${tb.c.grenade.range} tiles`);
  // The live fight shows the throw and the blast.
  const at = tileCentre(tb, t.tx, t.ty);
  state.throws.push({ side: a.side, x: at.x, y: at.y, at: state.tick + Math.round(state.cfg.abilities.grenade.fuseSec * state.cfg.tickRate) });
  const from = tileCentre(tb, a.tx, a.ty);
  state.events.push({ type: 'throw', id: -1, x1: from.x, y1: from.y, x2: at.x, y2: at.y, sec: state.cfg.abilities.grenade.fuseSec });
  applyKills(state, a, t, tb.c.grenade.kills, 'grenade');
  t.pinned = true;
  a.ap -= 1;
  a.grenadeReady = tb.turn + tb.c.grenade.cooldown;
  const line = `${a.side === 0 ? '' : 'Helghast '}${a.name} threw grenades at ${t.side === 0 ? '' : 'Helghast '}${t.name}: ${tb.c.grenade.kills} soldiers, pinned${t.out ? ', out of the fight' : ''}`;
  say(state, a.side, line, at);
  return { ok: true, line };
}

export function overwatchUnit(state, id) {
  const u = unitById(state.tb, id);
  const bad = ready(state, u);
  if (bad) return bad;
  u.ow = true;
  u.ap = 0;
  return { ok: true };
}

// ---- Turns, objectives and the end -------------------------------------------------
// Objectives belong to whichever side alone has a unit on or next to them.
function updateObjectives(state) {
  const tb = state.tb;
  for (const site of state.sites) {
    const sx = Math.floor(site.x / tb.c.tile), sy = Math.floor(site.y / tb.c.tile);
    const near = liveUnits(tb).filter((u) => Math.abs(u.tx - sx) <= 1 && Math.abs(u.ty - sy) <= 1);
    const sides = new Set(near.map((u) => u.side));
    if (sides.size === 1) {
      const side = [...sides][0];
      if (site.owner !== side) {
        site.owner = side;
        state.sides[side].captures++;
        state.events.push({ type: 'capture', site: site.id, side });
        if (site.kind === 'objective') say(state, side, `${sideName(side)} took objective ${site.id}`, site);
      }
    }
    site.contested = sides.size > 1;
    site.cap = 0; site.capSide = null;
  }
}

export function endTurn(state) {
  const tb = state.tb;
  if (tb.over) return fail('The battle is over');
  updateObjectives(state);
  const ending = tb.active;
  tb.active = 1 - tb.active;
  if (tb.active === tb.firstSide) {
    // A full round: score the objectives, then the next turn.
    for (const site of state.sites) if (site.kind === 'objective' && site.owner !== null) tb.points[site.owner] += tb.c.objectivePoints;
    state.sides[0].score = tb.points[0];
    state.sides[1].score = tb.points[1];
    tb.turn++;
  }
  // The side starting its turn: actions back (one if pinned), overwatch over.
  for (const u of liveUnits(tb, tb.active)) { u.ap = u.pinned ? 1 : tb.c.ap; u.pinned = false; u.ow = false; }
  void ending;
  checkEnd(state);
  return { ok: true };
}

function checkEnd(state) {
  const tb = state.tb;
  const left = [liveUnits(tb, 0).length, liveUnits(tb, 1).length];
  if (!left[0] || !left[1]) { tb.over = true; finish(state, !left[0] && !left[1] ? null : left[0] ? 0 : 1, 'broken'); return; }
  if (tb.turn > tb.c.turns) {
    tb.over = true;
    const [a, b] = tb.points;
    finish(state, a === b ? null : a > b ? 0 : 1, 'time');
  }
}

// ---- The AI: the same orders, one unit at a time --------------------------------------
// Plays one unit's whole turn; returns the lines it produced, or null when
// the side has no unit left to act.
export function aiStep(state, side) {
  const tb = state.tb;
  if (tb.over || tb.active !== side) return null;
  const units = liveUnits(tb, side).filter((u) => u.ap > 0);
  if (side === 1) units.reverse(); // mirror order for the Helghast
  const u = units[0];
  if (!u) return null;
  const c = tb.c;
  const lines = [];
  const bestShot = () => {
    let best = null;
    for (const e of liveUnits(tb, 1 - side)) {
      if (!visibleTo(state, side, e)) continue;
      const o = shotOdds(state, u, e);
      if (!o) continue;
      const value = o.chance * (e.kind === 'tank' ? 0.8 : 1) * (1.3 - strength(state, e) * 0.3);
      if (!best || value > best.value) best = { e, o, value };
    }
    return best;
  };
  let guard = 0;
  while (u.ap > 0 && !u.out && guard++ < 4) {
    const shot = bestShot();
    if (shot && shot.o.chance >= c.ai.fireAt) { lines.push(fireUnit(state, u.id, shot.e.id).line); break; }
    const moved = u.ap < c.ap;
    if (!moved) {
      const dest = aiTile(state, u);
      if (dest) {
        const r = moveUnit(state, u.id, dest[0], dest[1]);
        if (r.ok) { lines.push(...r.lines); continue; }
      }
    }
    const after = bestShot();
    if (after && after.o.chance >= c.ai.fireAfterMove) { lines.push(fireUnit(state, u.id, after.e.id).line); break; }
    overwatchUnit(state, u.id);
    break;
  }
  if (u.ap > 0) u.ap = 0;
  return lines.filter(Boolean);
}

// Where the AI moves a unit (one action): towards the objective it most
// wants, preferring cover and a shot, never next to more enemies than friends.
function aiTile(state, u) {
  const tb = state.tb;
  const reach = [...reachable(state, u)].filter(([, cost]) => cost === 1).map(([k]) => k.split(',').map(Number));
  if (u.side === 1) reach.reverse();
  const objs = state.sites.filter((s) => s.kind === 'objective').map((s) => ({ x: Math.floor(s.x / tb.c.tile), y: Math.floor(s.y / tb.c.tile), mine: s.owner === u.side }));
  const want = objs.filter((o) => !o.mine);
  const targets = want.length ? want : objs;
  const goal = targets.reduce((b, o) => (!b || Math.hypot(o.x - u.tx, o.y - u.ty) < Math.hypot(b.x - u.tx, b.y - u.ty) ? o : b), null);
  let best = null, bs = -Infinity;
  for (const [x, y] of reach) {
    const d = goal ? Math.hypot(x - goal.x, y - goal.y) : 0;
    const cov = u.kind === 'tank' ? 0 : coverOf(state, x, y).level;
    const ghost = { ...u, tx: x, ty: y };
    const shot = liveUnits(tb, 1 - u.side).some((e) => visibleTo(state, u.side, e) && shotOdds(state, ghost, e));
    const score = -d * 1.2 + cov * 1.5 + (shot ? 1 : 0);
    if (score > bs) { bs = score; best = [x, y]; }
  }
  const nowD = goal ? Math.hypot(u.tx - goal.x, u.ty - goal.y) : 0;
  const nowScore = -nowD * 1.2 + (u.kind === 'tank' ? 0 : coverOf(state, u.tx, u.ty).level * 1.5);
  return best && bs > nowScore ? best : null;
}

// One whole side's turn by the AI (tests and AI against AI).
export function aiTurn(state, side) {
  let guard = 0;
  while (!state.tb.over && guard++ < 20 && aiStep(state, side)) { /* each unit in turn */ }
  if (!state.tb.over) endTurn(state);
}
