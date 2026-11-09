import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle } from '../src/sim/battle.js';
import { CONFIG } from '../src/config.js';
import { T, cellIndex, canStep } from '../src/sim/map.js';
import { losClear } from '../src/sim/combat.js';
import { blast } from '../src/sim/features.js';

const make = (type, seed = 3) => createBattle(seed, { config: { map: { type }, world: CONFIG.mapSizes[type] } });

for (const type of ['industrial', 'city']) {
  test(`${type}: mirrored ground, walls present, every site off the walls`, () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = make(type, seed);
      const m = s.map, n = m.grid.length;
      assert.equal(m.width, CONFIG.mapSizes[type].width);
      for (let i = 0; i < n; i++) {
        assert.equal(m.grid[i], m.grid[n - 1 - i], `ground mirrored at ${i}`);
        assert.equal(m.elev[i], m.elev[n - 1 - i], `height mirrored at ${i}`);
      }
      assert.ok(m.hasWalls && m.wallCells.length > 300, 'walls built');
      for (const site of s.sites) assert.notEqual(m.grid[cellIndex(m, site.x, site.y)], T.wall, `${site.id} not inside a wall`);
      assert.equal(s.sites.filter((x) => x.kind === 'objective').length, 3);
    }
  });
}

test('walls block movement and sight, and explosions knock them down', () => {
  const s = make('city', 2);
  const m = s.map;
  // Find a wall cell with open or floor ground either side, left to right.
  const i = m.wallCells.find((k) => m.grid[k - 1] !== T.wall && m.grid[k + 1] !== T.wall && m.grid[k - 1] !== undefined && m.elev[k - 1] === m.elev[k + 1]);
  assert.ok(i !== undefined);
  const x = (i % m.cols) * m.cell + 5, y = Math.floor(i / m.cols) * m.cell + 5;
  assert.equal(canStep(m, i - 1, i), false, 'cannot walk into a wall');
  assert.equal(losClear(s, x - 40, y, x + 40, y), false, 'cannot see through a wall');
  blast(s, x, y, 40, 10, 40, 0, 'artillery');
  assert.notEqual(m.grid[i], T.wall, 'the blast knocked it down');
  assert.ok(m.broken && m.broken[i]);
  assert.equal(canStep(m, i - 1, i), true, 'and now you can walk through');
});
