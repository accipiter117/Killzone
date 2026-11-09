// The two built-up maps: an industrial site and a ruined city. Like the
// trenches map, each is built on the ISA (left) half and mirrored, turned
// through 180 degrees, so both sides fight over identical ground.
//
// Both use walls: solid cells you cannot walk or see through (containers,
// pipes, factory and house walls). Shells, grenades and tank fire knock them
// down to rubble, opening new routes. Doors are gaps left in the walls.

import { range, int } from './rng.js';
import { T, forCells, cellIndex, paintCircle, finishMap, siteAt, hash } from './map.js';

function blankMap(W, H, cell) {
  const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
  return {
    width: W, height: H, cell, cols, rows,
    grid: new Array(cols * rows).fill(T.open),
    wire: new Array(cols * rows).fill(0),
    elev: new Array(cols * rows).fill(0),
    ramp: new Array(cols * rows).fill(0),
    hills: [], trenches: [], wires: [], buildings: [], craters: [], sites: [], tanks: [],
  };
}

// Drawing tools for the left half. Everything is mirrored at the end.
function tools(map, g, seedInt) {
  const W = map.width, H = map.height;
  const left = (x) => x < W / 2;
  const rect = (x0, y0, x1, y1, fn) => forCells(map, x0, y0, x1 - 0.01, y1 - 0.01, (i, x, y) => { if (left(x)) fn(i, x, y); });
  const t = {
    fill: (x0, y0, x1, y1, code) => rect(x0, y0, x1, y1, (i) => { map.grid[i] = code; }),
    // A solid block (a container, a stack of crates, a pipe run).
    block: (x0, y0, x1, y1) => rect(x0, y0, x1, y1, (i) => { map.grid[i] = T.wall; }),
    // A building: walls one cell thick round an enterable floor, with doors.
    // doors: [side, centre (0 to 1 along the side), width].
    house: (x0, y0, x1, y1, doors, floor = T.building) => {
      const c = map.cell;
      rect(x0, y0, x1, y1, (i, x, y) => {
        const edge = x < x0 + c || x > x1 - c || y < y0 + c || y > y1 - c;
        map.grid[i] = edge ? T.wall : floor;
      });
      for (const [side, at, w] of doors) {
        const horiz = side === 'n' || side === 's';
        const cx = horiz ? x0 + (x1 - x0) * at : side === 'w' ? x0 + c / 2 : x1 - c / 2;
        const cy = horiz ? (side === 'n' ? y0 + c / 2 : y1 - c / 2) : y0 + (y1 - y0) * at;
        rect(cx - (horiz ? w / 2 : c), cy - (horiz ? c : w / 2), cx + (horiz ? w / 2 : c), cy + (horiz ? c : w / 2), (i) => { map.grid[i] = floor === T.building ? T.building : T.open; });
      }
      map.buildings.push({ x: x0 + c, y: y0 + c, w: x1 - x0 - 2 * c, h: y1 - y0 - 2 * c, walls: false });
    },
    raise: (x0, y0, x1, y1, level) => rect(x0, y0, x1, y1, (i) => { map.elev[i] = Math.max(map.elev[i], level); }),
    // Stairs or a slope: a patch where you can walk between heights.
    ramp: (x, y, r) => forCells(map, x - r, y - r, x + r, y + r, (i, cx, cy) => { if (left(cx) && (cx - x) ** 2 + (cy - y) ** 2 <= r * r) map.ramp[i] = 1; }),
    crater: (x, y, r) => { map.craters.push({ x, y, r }); paintCircle(map, x, y, r, T.crater); },
    // Loose debris: rubble on open cells, as cover.
    debris: (x0, y0, x1, y1, share) => rect(x0, y0, x1, y1, (i, x, y) => { if (map.grid[i] === T.open && hash(x, y, seedInt) < share) map.grid[i] = T.rubble; }),
    rng: g,
  };
  return t;
}

// Mirror the left half onto the right, and the lists of drawn things.
function mirrorHalf(map) {
  const W = map.width, H = map.height, n = map.grid.length;
  for (let i = 0; i < n; i++) {
    const x = (i % map.cols) * map.cell + map.cell / 2;
    if (x >= W / 2) continue;
    const j = n - 1 - i;
    map.grid[j] = map.grid[i]; map.wire[j] = map.wire[i]; map.elev[j] = map.elev[i]; map.ramp[j] = map.ramp[i];
  }
  map.buildings = map.buildings.flatMap((b) => [b, { ...b, x: W - b.x - b.w, y: H - b.y - b.h }]);
  map.craters = map.craters.flatMap((c) => [c, { x: W - c.x, y: H - c.y, r: c.r }]);
}

// Sites: A in the ISA half, B in the middle, C mirrored; features on the
// centre line and mirrored MG nests. Each site's ground is cleared of walls.
function placeSites(map, A, mg, commsY, cfg) {
  const W = map.width, H = map.height, m = cfg.map;
  const mir = (p) => ({ x: W - p.x, y: H - p.y });
  map.sites.push(siteAt('A', 'objective', A, m.objectiveRadius), siteAt('B', 'objective', { x: W / 2, y: H / 2 }, m.objectiveRadius), siteAt('C', 'objective', mir(A), m.objectiveRadius));
  map.sites.push(siteAt('comms', 'comms', { x: W / 2, y: commsY }, m.featureRadius), siteAt('arc', 'arc', { x: W / 2, y: H - commsY }, m.featureRadius));
  map.sites.push(siteAt('mg1', 'mg', mg, m.featureRadius), siteAt('mg2', 'mg', mir(mg), m.featureRadius));
  for (const s of map.sites) forCells(map, s.x - 20, s.y - 20, s.x + 20, s.y + 20, (i) => { if (map.grid[i] === T.wall) map.grid[i] = T.rubble; });
}

function addTanks(map, list) {
  const W = map.width, H = map.height;
  map.tanks = list.flatMap((t) => [t, { x: W - t.x, y: H - t.y }]).map((t, i) => ({ id: i, x: t.x, y: t.y, exploded: false }));
}

// ---- Industrial site --------------------------------------------------------
// Container lanes, factory halls, pipe runs and raised gantries; a control
// platform with a tower at B; fuel tanks that blow up when hit.
export function industrialMap(seedInt, cfg) {
  const { width: W, height: H, cell } = cfg.world;
  const map = blankMap(W, H, cell);
  const g = { rng: (seedInt ^ 0x51ed270b) >>> 0 };
  const t = tools(map, g, seedInt);
  const B = { x: W / 2, y: H / 2 };

  // Home yard: a fence with gaps, crates to shelter behind.
  for (let y = 0; y < H; y += 10) {
    const gap = [0.2, 0.5, 0.8].some((f) => Math.abs(y - H * f) < 45);
    if (!gap) forCells(map, 330, y, 345, y + 9, (i) => { map.wire[i] = 1; });
  }
  for (let k = 0; k < 6; k++) { const x = range(g, 370, 460), y = range(g, 60, H - 60); t.block(x, y, x + 30, y + 20); }

  // Factory hall round A, with doors on three sides.
  const A = { x: Math.round(range(g, 700, 790) / 10) * 10, y: Math.round(range(g, 300, 380) / 10) * 10 };
  t.house(A.x - 130, A.y - 90, A.x + 130, A.y + 90, [['w', 0.5, 50], ['e', 0.35, 50], ['s', 0.5, 60], ['n', 0.7, 40]]);
  // Machinery inside: a couple of blocks to fight round.
  t.block(A.x - 70, A.y - 40, A.x - 40, A.y + 10);
  t.block(A.x + 40, A.y + 10, A.x + 80, A.y + 30);

  // Container lanes: two rows of containers with gaps (the chokepoints).
  const lane = (y) => {
    let x = 470;
    while (x < W / 2 - 160) {
      const len = int(g, 1, 3) * 70;
      t.block(x, y, Math.min(x + len, W / 2 - 160), y + 26);
      x += len + range(g, 45, 90);
    }
  };
  lane(Math.round(H * 0.38 / 10) * 10 + 60);
  lane(Math.round(H * 0.66 / 10) * 10);
  // Stacks of containers out on the flank.
  for (let k = 0; k < 5; k++) { const x = range(g, 520, 1000), y = range(g, 70, 200); t.block(x, y, x + 26, y + 70); }

  // A pipe run with a break in it.
  const py = Math.round(range(g, 1180, 1260) / 10) * 10;
  t.block(470, py, 700, py + 20);
  t.block(760, py, 1000, py + 20);

  // Gantry: a raised walkway over the south yard, stairs at both ends and the middle.
  const gy = Math.round(range(g, 1330, 1380) / 10) * 10;
  t.raise(480, gy, 1040, gy + 50, 1);
  for (const x of [480, 760, 1040]) t.ramp(x, gy + 25, 32);

  // The control platform at B: a raised deck with a tower on top.
  t.raise(B.x - 200, B.y - 150, B.x, B.y + 150, 1);
  t.raise(B.x - 70, B.y - 55, B.x, B.y + 55, 2);
  t.ramp(B.x - 200, B.y, 36);
  for (const y of [B.y - 90, B.y + 90]) t.ramp(B.x - 200, y, 30);
  t.ramp(B.x - 120, B.y - 150, 34);
  t.ramp(B.x - 120, B.y + 150, 34);
  t.ramp(B.x - 70, B.y + 20, 26);
  t.ramp(B.x - 70, B.y - 30, 22);
  // Cover on the deck: crates.
  t.block(B.x - 160, B.y - 100, B.x - 135, B.y - 70);
  t.block(B.x - 150, B.y + 70, B.x - 120, B.y + 95);

  // An MG post on a raised loading dock overlooking the lanes.
  const mg = { x: Math.round(range(g, 900, 980) / 10) * 10, y: Math.round(range(g, 820, 900) / 10) * 10 };
  t.raise(mg.x - 60, mg.y - 40, mg.x + 60, mg.y + 40, 1);
  t.ramp(mg.x - 60, mg.y, 30);
  t.ramp(mg.x, mg.y + 40, 30);
  t.ramp(mg.x, mg.y - 40, 30);
  t.ramp(mg.x + 60, mg.y, 30);

  for (let k = 0; k < 6; k++) t.crater(range(g, 500, W / 2 - 60), range(g, 40, H - 40), range(g, 12, 22));
  t.debris(350, 0, W / 2, H, 0.06);
  // Cover beside walls: debris and spill piled against them.
  hugWalls(map, seedInt);

  mirrorHalf(map);
  placeSites(map, A, mg, Math.round(range(g, 140, 200)), cfg);
  // Fuel tanks: in the lanes and by the hall, where stray fire finds them.
  addTanks(map, [{ x: range(g, 560, 700), y: H * 0.52 }, { x: A.x + 170, y: A.y + range(g, -40, 40) }, { x: range(g, 820, 960), y: range(g, 1000, 1120) }]);
  return finishMap(map, cfg);
}

// ---- Ruined city ------------------------------------------------------------
// A street grid of blocks: houses you enter by their doors, gutted ruins,
// rubble mounds and parks, either side of a wide avenue that runs to a
// raised plaza and monument at B.
export function cityMap(seedInt, cfg) {
  const { width: W, height: H, cell } = cfg.world;
  const map = blankMap(W, H, cell);
  const g = { rng: (seedInt ^ 0x2545f491) >>> 0 };
  const t = tools(map, g, seedInt);
  const B = { x: W / 2, y: H / 2 };
  const snap = (v) => Math.round(v / 10) * 10;

  // Columns and rows of blocks on the ISA half; the avenue runs across the
  // middle and a boulevard down the centre line.
  const cols = [[330, 500], [570, 740], [810, 960]];
  const avenue = [snap(H / 2 - 150), snap(H / 2 + 150)];
  const rows = [[90, snap(avenue[0] * 0.48)], [snap(avenue[0] * 0.48) + 70, avenue[0]], [avenue[1], snap(avenue[1] + (H - avenue[1]) * 0.5) - 35], [snap(avenue[1] + (H - avenue[1]) * 0.5) + 35, H - 90]];
  // Objective A: the big hall in the second column, upper middle row.
  const A = { x: snap((cols[1][0] + cols[1][1]) / 2), y: snap((rows[1][0] + rows[1][1]) / 2) };
  for (const [ci, [x0, x1]] of cols.entries()) {
    for (const [ri, [y0, y1]] of rows.entries()) {
      const isA = ci === 1 && ri === 1;
      const kind = isA ? 'hall' : ['house', 'house', 'ruin', 'ruin', 'park', 'mound'][int(g, 0, 5)];
      const doorW = 40;
      if (kind === 'hall') {
        t.house(x0, y0, x1, y1, [['w', 0.5, 50], ['e', 0.5, 50], ['n', 0.5, 40], ['s', 0.5, 50]]);
        t.block(A.x - 15, A.y - 15, A.x + 15, A.y + 15); // a fallen column in the middle
      } else if (kind === 'house') {
        // A house split in two rooms, each with a door to the street.
        const mid = snap((x0 + x1) / 2);
        t.house(x0, y0, mid + 10, y1, [['w', range(g, 0.3, 0.7), doorW], ['s', 0.5, doorW]]);
        t.house(mid, y0, x1, y1, [['e', range(g, 0.3, 0.7), doorW], ['n', 0.5, doorW]]);
      } else if (kind === 'ruin') {
        // Walls with whole sections fallen in, the floor heaped with rubble.
        t.house(x0, y0, x1, y1, [['w', 0.5, doorW], ['e', 0.5, doorW]], T.rubble);
        for (let k = 0; k < 4; k++) {
          const x = range(g, x0, x1 - 40), y = range(g, y0, y1 - 40);
          t.fill(x, y, x + range(g, 30, 60), y + range(g, 30, 60), T.rubble);
        }
      } else if (kind === 'park') {
        for (let k = 0; k < 3; k++) t.crater(range(g, x0 + 30, x1 - 30), range(g, y0 + 30, y1 - 30), range(g, 14, 26));
        t.debris(x0, y0, x1, y1, 0.12);
      } else {
        // A rubble mound: a heap you can climb for a better view.
        t.raise(x0 + 20, y0 + 20, x1 - 20, y1 - 20, 1);
        t.fill(x0 + 20, y0 + 20, x1 - 20, y1 - 20, T.rubble);
        // Easy to climb from every side: it is a heap, not a cliff.
        for (const [x, y] of [[x0 + 20, (y0 + y1) / 2], [x1 - 20, (y0 + y1) / 2], [(x0 + x1) / 2, y0 + 20], [(x0 + x1) / 2, y1 - 20]]) t.ramp(x, y, 36);
      }
    }
  }
  // Wrecked vehicles and barricades on the avenue: cover and blocks.
  for (let k = 0; k < 4; k++) {
    const x = range(g, 380, 900), y = range(g, avenue[0] + 30, avenue[1] - 50);
    t.block(x, y, x + 50, y + 22);
  }
  // Barricades across the side streets, leaving a way through.
  for (const [x0, x1] of cols) {
    const y = rows[0][1] + 20;
    t.block(x0 + 10, y, x0 + (x1 - x0) * 0.4, y + 14);
  }

  // B: a raised plaza with a monument plinth on top.
  t.raise(B.x - 170, B.y - 120, B.x, B.y + 120, 1);
  t.raise(B.x - 60, B.y - 45, B.x, B.y + 45, 2);
  t.ramp(B.x - 170, B.y, 36);
  for (const y of [B.y - 70, B.y + 70]) t.ramp(B.x - 170, y, 30);
  t.ramp(B.x - 90, B.y - 120, 34);
  t.ramp(B.x - 90, B.y + 120, 34);
  t.ramp(B.x - 60, B.y + 15, 26);
  t.ramp(B.x - 60, B.y - 25, 22);
  t.debris(B.x - 170, B.y - 120, B.x, B.y + 120, 0.08);

  // An MG nest in the street facing the avenue.
  const mg = { x: snap((cols[2][0] + cols[1][1]) / 2), y: avenue[1] + 25 };
  t.debris(300, 0, W / 2, H, 0.05);
  hugWalls(map, seedInt);

  mirrorHalf(map);
  placeSites(map, A, mg, snap(range(g, 130, 170)), cfg);
  addTanks(map, [{ x: range(g, 520, 760), y: avenue[0] + 40 }, { x: range(g, 980, 1040), y: range(g, 300, 450) }]);
  return finishMap(map, cfg);
}

// Open cells right next to a wall get some cover (debris, spill and the
// wall's own shelter), so hugging a wall is worth something.
function hugWalls(map, seedInt) {
  const { cols, rows } = map;
  const near = [];
  for (let i = 0; i < map.grid.length; i++) {
    if (map.grid[i] !== T.open) continue;
    const x = i % cols, y = (i / cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (map.grid[ny * cols + nx] === T.wall) { near.push(i); break; }
    }
  }
  for (const i of near) if (hash(i % cols, (i / cols) | 0, seedInt) < 0.7) map.grid[i] = T.rubble;
}

export const MAP_TYPES = ['trenches', 'industrial', 'city'];
export const mapLabel = { trenches: 'Trenches', industrial: 'Industrial site', city: 'Ruined city' };
export { cellIndex };
