// Checks every bespoke map: can each side reach every site and the other
// side's deployment, do sites and deployments sit on walkable ground, and did
// the map have to be flattened. Usage: node tools/map-check.mjs [seed]
import { CONFIG } from '../src/config.js';
import { generateMap, cellIndex, canStep, T, S } from '../src/sim/map.js';

const seed = Number(process.argv[2] || 7);
const merge = (a, b) => { const o = { ...a }; for (const k in b) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(a[k] || {}, b[k]) : b[k]; return o; };
function reach(map, from) {
  const seen = new Uint8Array(map.grid.length), q = [cellIndex(map, from.x, from.y)];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop(), x = i % map.cols, y = (i / map.cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.cols || ny >= map.rows) continue;
      const j = ny * map.cols + nx;
      if (!seen[j] && canStep(map, i, j)) { seen[j] = 1; q.push(j); }
    }
  }
  return seen;
}
let bad = 0;
for (const type of ['trenches', 'industrial', 'city']) {
  const cfg = merge(CONFIG, { map: { type }, world: CONFIG.mapSizes[type] });
  const map = generateMap(seed, cfg);
  const out = [];
  if (map.flattened) out.push('FLATTENED (not connected)');
  for (const side of [0, 1]) {
    const seen = reach(map, map.deploy[side].platoons[1]);
    for (const s of map.sites) if (!seen[cellIndex(map, s.x, s.y)]) out.push(`side ${side} cannot reach ${s.id}`);
    for (const p of [...map.deploy[1 - side].platoons, map.deploy[side].tank]) if (!seen[cellIndex(map, p.x, p.y)]) out.push(`side ${side} cannot reach ${p.x},${p.y}`);
  }
  for (const s of map.sites) { const i = cellIndex(map, s.x, s.y); if (map.grid[i] === T.wall || map.surf[i] === S.deep) out.push(`site ${s.id} on a wall/water`); }
  const n = (v) => map.surf.filter((x) => x === v).length;
  console.log(`${type}: ${map.width}x${map.height} props ${map.props.length} gates ${map.gates.length} walls ${map.wallCells.length} road ${n(S.road)} deep ${n(S.deep)} ford ${n(S.ford)} haze ${n(S.haze)} high ${map.elev.filter((e) => e > 0).length}`);
  for (const o of out) console.log('  !', o);
  bad += out.length;
}
process.exit(bad ? 1 : 0);
