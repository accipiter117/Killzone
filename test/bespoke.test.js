// The bespoke Helghan maps' ground rules: deep water, the lift bridge and
// blast doors worked from their lever posts, vent haze hiding troops, roads
// speeding them, and tanks called in from a vehicle depot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, step } from '../src/sim/battle.js';
import { applyCommand } from '../src/sim/commands.js';
import { CONFIG } from '../src/config.js';
import { S, T, cellIndex, canStep, surfAt } from '../src/sim/map.js';
import { losClear } from '../src/sim/combat.js';
import { damageVehicle } from '../src/sim/vehicles.js';

const make = (type, seed = 3) => createBattle(seed, { config: { map: { type }, world: CONFIG.mapSizes[type] } });
const cmd = (s, type, params = {}, side = 0) => applyCommand(s, { tick: s.tick, side, type, params });
const sec = (s, n) => { for (let i = 0; i < Math.round(n * s.cfg.tickRate); i++) step(s); };

test('deep water cannot be walked into; a ford can', () => {
  const s = make('trenches');
  const m = s.map;
  const deep = cellIndex(m, 1650, 400), bank = cellIndex(m, 1560, 400), ford = cellIndex(m, 1660, 230);
  assert.equal(m.surf[deep], S.deep);
  assert.equal(canStep(m, bank, deep), false);
  assert.equal(m.surf[ford], S.ford);
  assert.equal(canStep(m, cellIndex(m, 1650, 230), ford), true);
});

test('the lift bridge rises for whoever holds the bridgehouse, and not on anyone', () => {
  const s = make('trenches');
  const gate = s.map.gates.find((g) => g.id === 'bridge');
  const lever = s.sites.find((x) => x.id === gate.lever);
  assert.equal(cmd(s, 'gate', { gate: 'bridge' }).ok, false, 'needs the lever');
  lever.owner = 0;

  s.tick = 1;
  assert.ok(cmd(s, 'gate', { gate: 'bridge' }).ok);
  const mid = gate.cells[Math.floor(gate.cells.length / 2)];
  assert.equal(s.map.surf[mid], S.deck, 'still down while it moves');
  sec(s, CONFIG.gates.moveSec + 0.5);
  assert.ok(gate.closed);
  assert.equal(s.map.surf[mid], S.deep, 'raised: water where the deck was');
  // Lower it, park the tank on it, and try to raise it again: it waits.
  assert.ok(cmd(s, 'gate', { gate: 'bridge' }).ok);
  sec(s, CONFIG.gates.moveSec + 0.5);
  assert.equal(gate.closed, false);
  const v = s.vehicles[0];
  v.x = (mid % s.map.cols) * s.map.cell + 5; v.y = ((mid / s.map.cols) | 0) * s.map.cell + 5; v.order = { type: 'idle' };
  assert.ok(cmd(s, 'gate', { gate: 'bridge' }).ok);
  sec(s, CONFIG.gates.moveSec + 2);
  assert.equal(gate.closed, false, 'never rises under a tank');
});

test('closed blast doors are a wall nobody can see or shoot through, or blast down', () => {
  const s = make('industrial');
  const gate = s.map.gates.find((g) => g.kind === 'door');
  assert.ok(!gate.closed, 'the refinery hall starts open (the Helghast way out towards B)');
  const i = gate.cells[Math.floor(gate.cells.length / 2)];
  const x = (i % s.map.cols) * s.map.cell + 5, y = ((i / s.map.cols) | 0) * s.map.cell + 5;
  assert.notEqual(s.map.grid[i], T.wall);
  // Whoever holds the control room can shut them.
  s.sites.find((o) => o.id === gate.lever).owner = 0;
  s.tick = 1;
  assert.ok(cmd(s, 'gate', { gate: gate.id }, 0).ok);
  sec(s, CONFIG.gates.moveSec + 0.5);
  assert.equal(s.map.grid[i], T.wall, 'shut');
  assert.equal(losClear(s, x - 60, y, x + 60, y), false);
});

test('vent haze hides troops in it and a thick bank of it blocks sight', () => {
  const s = make('industrial');
  const m = s.map;
  // The haze at the cooling yard: find a long run of it.
  let hx = 0, hy = 0;
  for (let i = 0; i < m.surf.length; i++) if (m.surf[i] === S.haze && m.surf[i + 12] === S.haze && m.surf[i - 12] === S.haze) { hx = (i % m.cols) * m.cell; hy = ((i / m.cols) | 0) * m.cell; break; }
  assert.ok(hx > 0, 'there is haze');
  assert.equal(surfAt(m, hx, hy), S.haze);
  assert.equal(losClear(s, hx - 130, hy, hx + 130, hy), false, 'a long look through haze is blocked');
});

test('roads are quicker than open ground, for troops and tanks', () => {
  assert.ok(CONFIG.surface.road.speed > 1 && CONFIG.surface.road.tank > CONFIG.surface.road.speed);
  assert.ok(CONFIG.surface.mud.tank < CONFIG.surface.mud.speed, 'mud bogs tanks down worst');
});

test('a tank is called in from a held depot once the old one is lost, one at a time', () => {
  const s = make('city');
  sec(s, 1);
  s.sides[0].op = 10;
  assert.equal(cmd(s, 'callin', { what: 'tank' }).ok, false, 'still have a tank');
  const v = s.vehicles[0];
  damageVehicle(s, v, 1e6, 'shell');
  assert.equal(v.alive, false);
  const depot = s.sites.find((x) => x.id === 'depot0');
  depot.owner = null;
  assert.equal(cmd(s, 'callin', { what: 'tank' }).ok, false, 'needs a depot');
  depot.owner = 0;
  const op = s.sides[0].op;
  assert.ok(cmd(s, 'callin', { what: 'tank' }).ok);
  assert.ok(v.alive && v.hp === v.maxHp);
  assert.ok(Math.hypot(v.x - depot.x, v.y - depot.y) < 1, 'rolls out of the depot');
  assert.equal(s.sides[0].op, op - CONFIG.callins.tank.cost);
  assert.ok(s.map.props.some((p) => p.kind === 'tankwreck' && p.col === '#3d3a31'), 'the old hull stays as a wreck');
  assert.equal(cmd(s, 'callin', { what: 'tank' }).ok, false, 'one at a time');
});
