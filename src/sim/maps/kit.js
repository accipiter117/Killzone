// The kit for building bespoke maps: each call lays down both the rules
// (cover, walls, surfaces, height) and what the painters and renderer draw
// (decals, props, trenches). Maps are drawn by hand in world units; the
// seed only varies small details (craters, debris).

import { range } from '../rng.js';
import { T, S, WK, blankMap, forCells, cellIndex, paintCircle, siteAt, hash, distToSeg } from '../map.js';
import { makeGate } from '../gates.js';

export function kit(W, H, cell, kindName, seedInt, salt) {
  const map = blankMap(W, H, cell);
  map.kind = kindName;
  map.kindedWalls = true;
  map.bespoke = true;
  const g = { rng: (seedInt ^ salt) >>> 0 };
  const rand = (a, b) => range(g, a, b);

  // Cells within half-width hw of a polyline.
  const alongLine = (pts, hw, fn) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      forCells(map, Math.min(a.x, b.x) - hw, Math.min(a.y, b.y) - hw, Math.max(a.x, b.x) + hw, Math.max(a.y, b.y) + hw, (i, x, y) => {
        if (distToSeg(x, y, a, b) <= hw) fn(i, x, y);
      });
    }
  };
  const P = (arr) => arr.map(([x, y]) => ({ x, y }));
  // Cells inside a rectangle of size w x h centred on (x, y), turned by ang.
  const inRect = (x, y, w, h, ang, fn) => {
    const R = Math.hypot(w, h) / 2 + cell, ca = Math.cos(-ang), sa = Math.sin(-ang);
    forCells(map, x - R, y - R, x + R, y + R, (i, cx, cy) => {
      const dx = cx - x, dy = cy - y, lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
      if (Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2) fn(i, cx, cy);
    });
  };

  const t = {
    map, g, rand, P,
    // ---- Surfaces --------------------------------------------------------
    road(pts, hw, style = 'asphalt', opts = {}) {
      pts = P(pts);
      map.decals.push({ kind: 'road', pts, w: hw, style, ...opts });
      alongLine(pts, hw, (i) => { if (map.surf[i] !== S.deep && map.surf[i] !== S.deck) map.surf[i] = S.road; });
    },
    rail(pts) { map.decals.push({ kind: 'rail', pts: P(pts) }); },
    // A fixed bridge: a deck you can cross, drawn over the water.
    bridge(pts, hw) {
      pts = P(pts);
      map.decals.push({ kind: 'road', pts, w: hw, style: 'concrete', lines: false, cap: 'butt' });
      alongLine(pts, hw, (i) => { map.surf[i] = S.deck; });
    },
    river(pts, hw) {
      pts = P(pts);
      map.decals.push({ kind: 'river', pts, w: hw });
      alongLine(pts, hw, (i) => { map.surf[i] = S.deep; if (map.grid[i] !== T.wall) map.grid[i] = T.open; });
      // Wet banks drag (but are not water).
      alongLine(pts, hw + 16, (i) => { if (map.surf[i] === S.ground) map.surf[i] = S.mud; });
    },
    ford(pts, hw) {
      pts = P(pts);
      map.decals.push({ kind: 'ford', pts, w: hw });
      alongLine(pts, hw, (i) => { map.surf[i] = S.ford; });
    },
    mud(x, y, rx, ry) {
      map.decals.push({ kind: 'mud', x, y, rx, ry });
      forCells(map, x - rx, y - ry, x + rx, y + ry, (i, cx, cy) => { if (((cx - x) / rx) ** 2 + ((cy - y) / ry) ** 2 <= 0.8 && map.surf[i] === S.ground) map.surf[i] = S.mud; });
    },
    ash(x, y, rx, ry) { map.decals.push({ kind: 'ash', x, y, rx, ry }); },
    haze(x, y, rx, ry) {
      map.decals.push({ kind: 'haze', x, y, rx, ry, layer: 'live' });
      forCells(map, x - rx, y - ry, x + rx, y + ry, (i, cx, cy) => { if (((cx - x) / rx) ** 2 + ((cy - y) / ry) ** 2 <= 1 && (map.surf[i] === S.ground || map.surf[i] === S.mud)) map.surf[i] = S.haze; });
    },
    scorch(x, y, r) { map.decals.push({ kind: 'scorch', x, y, r }); },
    pad(x0, y0, x1, y1, style, joint) { map.decals.push({ kind: 'pad', x0, y0, x1, y1, style, joint }); },
    hazard(x0, y0, x1, y1) { map.decals.push({ kind: 'hazard', x0, y0, x1, y1 }); },
    // ---- Cover and walls ---------------------------------------------------
    crater(x, y, r) { map.craters.push({ x, y, r }); paintCircle(map, x, y, r, T.crater); },
    craters(n, x0, y0, x1, y1, r0 = 12, r1 = 26) {
      for (let k = 0; k < n; k++) {
        const x = rand(x0, x1), y = rand(y0, y1);
        const i = cellIndex(map, x, y);
        if (i < 0 || map.surf[i] !== S.ground || map.grid[i] !== T.open) continue;
        t.crater(x, y, rand(r0, r1));
      }
    },
    debris(x0, y0, x1, y1, share) {
      forCells(map, x0, y0, x1, y1, (i, x, y) => { if (map.grid[i] === T.open && map.surf[i] !== S.deep && hash(x, y, seedInt) < share) map.grid[i] = T.rubble; });
    },
    fill(x0, y0, x1, y1, code) { forCells(map, x0, y0, x1 - 0.01, y1 - 0.01, (i) => { map.grid[i] = code; }); },
    wall(x0, y0, x1, y1, kind = WK.concrete) { forCells(map, x0, y0, x1 - 0.01, y1 - 0.01, (i) => { map.grid[i] = T.wall; map.wallKind[i] = kind; }); },
    // A building: walls one cell thick round a floor you can fight inside,
    // with doors ([side, 0..1 along it, width]).
    building(x0, y0, x1, y1, doors, kind = WK.concrete, floor = T.building) {
      forCells(map, x0, y0, x1 - 0.01, y1 - 0.01, (i, x, y) => {
        const edge = x < x0 + cell || x > x1 - cell || y < y0 + cell || y > y1 - cell;
        map.grid[i] = edge ? T.wall : floor;
        if (edge) map.wallKind[i] = kind;
      });
      for (const [side, at, w] of doors) {
        const horiz = side === 'n' || side === 's';
        const cx = horiz ? x0 + (x1 - x0) * at : side === 'w' ? x0 + cell / 2 : x1 - cell / 2;
        const cy = horiz ? (side === 'n' ? y0 + cell / 2 : y1 - cell / 2) : y0 + (y1 - y0) * at;
        forCells(map, cx - (horiz ? w / 2 : cell), cy - (horiz ? cell : w / 2), cx + (horiz ? w / 2 : cell) - 0.01, cy + (horiz ? cell : w / 2) - 0.01, (i) => { map.grid[i] = floor; });
      }
      map.buildings.push({ x: x0 + cell, y: y0 + cell, w: x1 - x0 - 2 * cell, h: y1 - y0 - 2 * cell, walls: false });
    },
    // Knock holes in walls (a ruin): share of wall cells turned to rubble.
    ruin(x0, y0, x1, y1, share) {
      forCells(map, x0, y0, x1, y1, (i, x, y) => { if (map.grid[i] === T.wall && hash(x * 3, y * 7, seedInt) < share) map.grid[i] = T.rubble; });
    },
    // A set piece. solid: blocks like a wall (and can be shot apart); low:
    // cover you can stand behind and climb over; neither: decoration.
    prop(kind, x, y, w, h, ang = 0, opts = {}) {
      const p = { kind, x, y, w, h, ang, ...opts };
      if (opts.solid) {
        p.cells = [];
        inRect(x, y, w * (opts.shrink ?? 0.9), h * (opts.shrink ?? 0.9), ang, (i) => {
          if (map.surf[i] === S.deep && !opts.inWater) return;
          map.grid[i] = T.wall; map.wallKind[i] = WK.prop; p.cells.push(i);
        });
      } else if (opts.low) {
        inRect(x, y, w, h, ang, (i) => { if (map.grid[i] === T.open || map.grid[i] === T.rubble) map.grid[i] = T.sandbag; });
      }
      map.props.push(p);
      return p;
    },
    // ---- Height --------------------------------------------------------------
    raise(x0, y0, x1, y1, level, deckStyle, deckOpts = {}) {
      forCells(map, x0, y0, x1 - 0.01, y1 - 0.01, (i) => { map.elev[i] = Math.max(map.elev[i], level); });
      if (deckStyle) map.decals.push({ kind: 'deck', x0, y0, x1, y1, style: deckStyle, layer: 'top', ...deckOpts });
    },
    // A natural rise: an ellipse of raised ground.
    hill(x, y, rx, ry, level) {
      forCells(map, x - rx, y - ry, x + rx, y + ry, (i, cx, cy) => { if (((cx - x) / rx) ** 2 + ((cy - y) / ry) ** 2 <= 1) map.elev[i] = Math.max(map.elev[i], level); });
    },
    // A band of raised ground between two edges running north to south (a
    // bluff, an embankment): west and east are polylines [[x, y], ...].
    band(west, east, level) {
      const at = (pts, y) => {
        for (let k = 0; k < pts.length - 1; k++) {
          const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
          if (y >= ay && y <= by) return ax + ((bx - ax) * (y - ay)) / (by - ay || 1);
        }
        return y < pts[0][1] ? pts[0][0] : pts[pts.length - 1][0];
      };
      forCells(map, 0, 0, W, H, (i, x, y) => { if (x >= at(west, y) && x <= at(east, y)) map.elev[i] = Math.max(map.elev[i], level); });
    },
    lower(x0, y0, x1, y1) { forCells(map, x0, y0, x1 - 0.01, y1 - 0.01, (i) => { map.elev[i] = 0; map.ramp[i] = 0; }); },
    ramp(x, y, r) { forCells(map, x - r, y - r, x + r, y + r, (i, cx, cy) => { if ((cx - x) ** 2 + (cy - y) ** 2 <= r * r) map.ramp[i] = 1; }); },
    stairs(x0, y0, x1, y1) {
      forCells(map, x0, y0, x1 - 0.01, y1 - 0.01, (i) => { map.ramp[i] = 1; });
      map.decals.push({ kind: 'hazard', x0, y0: y0, x1, y1: y0 + 3, layer: 'top' });
    },
    // ---- Fieldworks ------------------------------------------------------------
    trench(pts, hw = 13) {
      pts = P(pts);
      map.trenches.push(pts);
      alongLine(pts, hw, (i) => { map.grid[i] = T.trench; map.surf[i] = S.ground; });
    },
    wire(pts, gaps = []) {
      pts = P(pts);
      map.wires.push({ pts, gaps });
      alongLine(pts, 10, (i, x, y) => {
        if (gaps.some(([a, b]) => (pts[0].x === pts[pts.length - 1].x ? y : x) >= a && (pts[0].x === pts[pts.length - 1].x ? y : x) <= b)) return;
        if (map.grid[i] !== T.trench && map.grid[i] !== T.wall) map.wire[i] = 1;
      });
    },
    sandbags(x, y, r, facing) {
      // A sandbag crescent facing an angle (radians).
      const fx = Math.cos(facing), fy = Math.sin(facing);
      forCells(map, x - r, y - r, x + r, y + r, (i, cx, cy) => {
        const d = Math.hypot(cx - x, cy - y);
        if (d > r || d < r - 9) return;
        if ((cx - x) * fx + (cy - y) * fy < r * 0.25) return;
        if (map.grid[i] === T.open || map.grid[i] === T.rubble || map.grid[i] === T.crater) map.grid[i] = T.sandbag;
      });
    },
    // ---- Sites, gates, deployment ---------------------------------------------------
    site(id, kind, x, y, r, name, owner = null) {
      const s = siteAt(id, kind, { x, y }, r, name);
      s.owner = owner;
      map.sites.push(s);
      // Nobody fights for a site inside a wall.
      forCells(map, x - 20, y - 20, x + 20, y + 20, (i) => { if (map.grid[i] === T.wall && map.wallKind[i] !== WK.prop) map.grid[i] = T.rubble; });
      return s;
    },
    gate(spec) {
      const cells = [];
      inRect(spec.x, spec.y, spec.w, spec.h, spec.ang || 0, (i) => cells.push(i));
      return makeGate(map, { ...spec, cells });
    },
    petrol(list) { map.tanks = list.map(([x, y], i) => ({ id: i, x, y, exploded: false })); },
    deploy(side, platoons, tank) { (map.deploy || (map.deploy = [null, null]))[side] = { platoons: platoons.map(([x, y]) => ({ x, y })), tank: { x: tank[0], y: tank[1] } }; },
    lane(side, via, to) { map.lanes.push({ side, via: { x: via[0], y: via[1] }, to }); },
  };
  return t;
}
