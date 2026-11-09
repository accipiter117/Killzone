// The war map: one invented stretch of planet, generated from a seed. A fine
// grid of cells (who holds the ground, cell by cell) is grouped into
// sectors (where platoons stand and battles are fought), sectors into named
// regions. Like the battle maps, the ISA (west) half is generated and the
// Helghast (east) half is its mirror image turned through 180 degrees, so
// both sides start with identical ground, sites and distances.
//
// Pure: no DOM, no Math.random. Uses the campaign's own seeded RNG.

import { range } from '../sim/rng.js';

// Deterministic per cell noise, for wobbly borders.
function noise(x, y, s) {
  let h = Math.imul((x * 73856093) ^ (y * 19349663) ^ s, 0x27d4eb2d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function generateWorld(st, cc, seedInt) {
  const { cols, rows, sectorCols, sectorRows } = cc.grid;
  const n = cols * rows, half = cols / 2;
  const mirror = (i) => n - 1 - i;
  const xy = (i) => [i % cols, Math.floor(i / cols)];
  const perSide = sectorCols * sectorRows;

  // Sector seeds on the ISA half: a jittered grid.
  const seeds = [];
  for (let c = 0; c < sectorCols; c++) {
    for (let r = 0; r < sectorRows; r++) {
      seeds.push({
        x: ((c + 0.5) / sectorCols) * half + range(st, -2.2, 2.2),
        y: ((r + 0.5) / sectorRows) * rows + range(st, -3, 3),
      });
    }
  }
  // Each ISA half cell joins its nearest seed, measured through a little
  // noise so the borders wander; the east half mirrors it.
  const sector = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const [x, y] = xy(i);
    if (x >= half) continue;
    const wx = x + (noise(x >> 1, y >> 1, seedInt) - 0.5) * 3.5, wy = y + (noise(y >> 1, x >> 1, seedInt ^ 99) - 0.5) * 3.5;
    let best = 0, bd = Infinity;
    seeds.forEach((s, k) => { const d = (wx - s.x) ** 2 + (wy - s.y) ** 2; if (d < bd) { bd = d; best = k; } });
    sector[i] = best;
  }
  for (let i = 0; i < n; i++) if (sector[i] < 0) sector[i] = sector[mirror(i)] + perSide;

  // Sector records: cells, centre cell, neighbours, region, terrain kit.
  const sectors = [];
  for (let k = 0; k < perSide * 2; k++) {
    const side = k < perSide ? 0 : 1, local = k % perSide;
    const col = Math.floor(local / sectorRows), row = local % sectorRows;
    sectors.push({ id: k, half: side, col, row, region: side === 0 ? cc.regions.isa[col] : cc.regions.hgh[col], kit: 'trenches', centre: -1, neighbours: [], cells: 0 });
  }
  const sum = sectors.map(() => [0, 0, 0]);
  for (let i = 0; i < n; i++) { const [x, y] = xy(i); const s = sum[sector[i]]; s[0] += x; s[1] += y; s[2]++; }
  for (const s of sectors) {
    const [sx, sy, c] = sum[s.id];
    s.cells = c;
    const mx = sx / c, my = sy / c;
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (sector[i] !== s.id) continue;
      const [x, y] = xy(i);
      const d = (x - mx) ** 2 + (y - my) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    s.centre = best;
  }
  // Keep centres exact mirrors (the search above can tie differently).
  for (let k = 0; k < perSide; k++) sectors[k + perSide].centre = mirror(sectors[k].centre);
  const nb = sectors.map(() => new Set());
  for (let i = 0; i < n; i++) {
    const [x, y] = xy(i);
    for (const j of [x + 1 < cols ? i + 1 : -1, y + 1 < rows ? i + cols : -1]) {
      if (j >= 0 && sector[j] !== sector[i]) { nb[sector[i]].add(sector[j]); nb[sector[j]].add(sector[i]); }
    }
  }
  sectors.forEach((s) => { s.neighbours = [...nb[s.id]].sort((a, b) => a - b); });

  // Sites (ISA half from the config, mirrored), and the terrain kit each
  // sector's battles are fought on.
  const sites = [];
  const kitOf = { capital: 'city', city: 'city', factory: 'industrial', tankworks: 'industrial', power: 'industrial' };
  for (let k = 0; k < perSide; k++) {
    const roll = range(st, 0, 1);
    sectors[k].kit = roll < 0.5 ? 'trenches' : roll < 0.75 ? 'industrial' : 'city';
  }
  for (const def of cc.sites) {
    const local = def.at[0] * sectorRows + def.at[1];
    if (kitOf[def.kind]) sectors[local].kit = kitOf[def.kind];
  }
  for (let k = 0; k < perSide; k++) sectors[k + perSide].kit = sectors[k].kit;
  for (const side of [0, 1]) {
    cc.sites.forEach((def, idx) => {
      const local = def.at[0] * sectorRows + def.at[1];
      const sec = sectors[local + side * perSide];
      sites.push({ id: sites.length, kind: def.kind, home: side, sector: sec.id, cell: sec.centre, defence: def.defence, maxDefence: def.defence, pair: idx, name: siteName(def.kind, side, idx) });
    });
  }

  const owner = new Array(n);
  for (let i = 0; i < n; i++) owner[i] = xy(i)[0] < half ? 0 : 1;
  return { cols, rows, sector, owner, sectors, sites };
}

// Invented place names, one per site and side.
const NAMES = [
  ['Fort Corvane', 'Kessra Hold'], ['Arden', 'Vosk'], ['Halvard Works', 'Brennic Foundry'], ['Tamsin Yard', 'Grael Yard'],
  ['Elden Station', 'Morvek Plant'], ['Relay Nine', 'Spire Relay'], ['Highfield', 'Ashfall Strip'], ['Calder Mill', 'Drosk Mill'], ['Port Sefton', 'Ulmar'],
];
const siteName = (kind, side, idx) => NAMES[idx % NAMES.length][side];
