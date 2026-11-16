// Digging in: a squad that holds its ground starts to fortify it. After
// standing still for a few seconds (or straight away under a Dig in order,
// and faster) it digs foxholes where each soldier stands, then throws up a
// crescent of sandbags towards its front, then joins the holes into a
// trench. The earthworks are real ground (craters, sandbags, trench) and stay
// on the map for whoever holds the spot later. Pinned squads stop digging;
// moving off starts the count again elsewhere (the earthworks stay).

import { T, S, cellIndex, forCells } from './map.js';
import { members, centroid } from './util.js';

const STILL_MODES = new Set(['idle', 'hold', 'arrived']);
export const DIG_LEVELS = ['', 'foxholes', 'sandbags', 'trench'];

// Ground that can be dug or built on (never walls, ruins, trenches or wire).
const diggable = (map, i) => i >= 0 && map.wire[i] === 0 && (!map.surf || map.surf[i] === S.ground || map.surf[i] === S.mud || map.surf[i] === S.haze) && (map.grid[i] === T.open || map.grid[i] === T.rubble || map.grid[i] === T.crater);

export function updateDigging(state, dt) {
  if (state.tb) return;
  const cfg = state.cfg.dig;
  for (const sq of state.squads) {
    if (sq.mode === 'dead') continue;
    const list = members(state, sq);
    if (!list.length) continue;
    const c = centroid(list);
    const d = sq.dig || (sq.dig = { x: c.x, y: c.y, still: 0, work: 0, level: 0 });
    // Moved off: start again from here (what was built stays on the map).
    if (Math.hypot(c.x - d.x, c.y - d.y) > cfg.moveReset || !STILL_MODES.has(sq.mode)) {
      d.x = c.x; d.y = c.y; d.still = 0; d.work = 0; d.level = 0; sq.digging = false;
      continue;
    }
    const ordered = sq.mode === 'hold';
    d.still += dt;
    sq.digging = !sq.pinned && d.level < cfg.levels.length && (ordered || d.still >= cfg.waitSec);
    if (sq.digging) {
      d.work += dt * (ordered ? cfg.orderSpeed : 1);
      while (d.level < cfg.levels.length && d.work >= cfg.levels[d.level]) {
        d.level++;
        build(state, sq, list, d.level);
      }
    }
    // The squad's label says how far it has got (the squad's own thinking
    // rewrites its status every few ticks; this adds to it once).
    const note = sq.digging ? `digging ${DIG_LEVELS[d.level + 1]}` : d.level ? `in ${DIG_LEVELS[d.level]}` : '';
    if (note && !sq.status.includes(note)) sq.status = `${sq.status.split(', digging')[0].split(', in ')[0]}, ${note}`;
  }
}

function mark(state, cells, kind) {
  const map = state.map;
  if (!map.dug) map.dug = new Uint8Array(map.grid.length);
  const done = [];
  for (const i of cells) {
    if (!diggable(map, i) && !(kind === 'trench' && map.dug[i] === 1)) continue;
    map.grid[i] = kind === 'trench' ? T.trench : T.crater;
    map.dug[i] = kind === 'trench' ? 2 : 1;
    done.push(i);
  }
  if (done.length) state.events.push({ type: 'dug', kind, cells: done });
}

function build(state, sq, list, level) {
  const cfg = state.cfg.dig, map = state.map;
  if (level === 1) {
    // A foxhole under each soldier.
    mark(state, [...new Set(list.map((s) => cellIndex(map, s.x, s.y)))].sort((a, b) => a - b), 'foxhole');
  } else if (level === 2) {
    // Sandbags in a crescent ahead of the squad, the way it is facing.
    const c = centroid(list), fx = sq.face.x, fy = sq.face.y, a = cfg.sandbags;
    const px = c.x + fx * a.offset, py = c.y + fy * a.offset;
    const cells = [];
    forCells(map, px - a.radius, py - a.radius, px + a.radius, py + a.radius, (i, x, y) => {
      const r = Math.hypot(x - px, y - py), ahead = (x - c.x) * fx + (y - c.y) * fy;
      if (r > a.radius || r < a.radius - a.thickness || ahead < a.offset * 0.4) return;
      if (diggable(map, i)) { map.grid[i] = T.sandbag; cells.push(i); }
    });
    if (cells.length) state.events.push({ type: 'sandbags', cells });
  } else {
    // A trench joining the foxholes: soldiers ordered across the squad's
    // front, a channel dug along the line between neighbours.
    const fx = sq.face.x, fy = sq.face.y;
    const pts = list.map((s) => ({ x: s.x, y: s.y, k: -s.x * fy + s.y * fx })).sort((a, b) => a.k - b.k);
    const w = cfg.trenchHalf, cells = new Set();
    const along = (a, b) => {
      forCells(map, Math.min(a.x, b.x) - w, Math.min(a.y, b.y) - w, Math.max(a.x, b.x) + w, Math.max(a.y, b.y) + w, (i, x, y) => {
        const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
        if (Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)) <= w) cells.add(i);
      });
    };
    for (let k = 0; k < pts.length; k++) along(pts[k], pts[Math.min(k + 1, pts.length - 1)]);
    mark(state, [...cells].sort((a, b) => a - b), 'trench');
  }
}
