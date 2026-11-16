// Flip a built map east to west, so each side starts on the other's ground
// (config map.flip). Used to test whether a map favours a side or a start.

export function flipMap(map) {
  const { cols, rows, width: W } = map;
  const fx = (x) => W - x;
  const idx = (i) => { const x = i % cols, y = (i / cols) | 0; return y * cols + (cols - 1 - x); };
  for (const k of ['grid', 'wire', 'elev', 'ramp', 'surf', 'wallKind', 'gateCell']) {
    const a = map[k];
    if (!a) continue;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols / 2; x++) { const i = y * cols + x, j = y * cols + cols - 1 - x; const t = a[i]; a[i] = a[j]; a[j] = t; }
  }
  const pts = (list) => list.map((p) => ({ ...p, x: fx(p.x) }));
  for (const p of map.props) { p.x = fx(p.x); p.ang = Math.PI - (p.ang || 0); if (p.cells) p.cells = p.cells.map(idx); }
  for (const d of map.decals) {
    if (d.pts) d.pts = pts(d.pts);
    if (d.x !== undefined) d.x = fx(d.x);
    if (d.x0 !== undefined) { const a = fx(d.x1), b = fx(d.x0); d.x0 = a; d.x1 = b; }
  }
  for (const s of map.sites) { s.x = fx(s.x); if (s.kind === 'depot' && s.owner !== null) s.owner = 1 - s.owner; }
  for (const s of map.sites) if (s.kind === 'depot') s.id = s.id === 'depot0' ? 'depot1' : 'depot0';
  map.trenches = map.trenches.map(pts);
  map.wires = map.wires.map((w) => ({ pts: pts(w.pts), gaps: w.pts[0].x === w.pts[w.pts.length - 1].x ? w.gaps : w.gaps.map(([a, b]) => [fx(b), fx(a)]) }));
  map.buildings = map.buildings.map((b) => ({ ...b, x: W - b.x - b.w }));
  map.craters = pts(map.craters);
  map.tanks = map.tanks.map((t) => ({ ...t, x: fx(t.x) }));
  for (const g of map.gates) g.cells = g.cells.map(idx).sort((a, b) => a - b);
  if (map.deploy) map.deploy = [1, 0].map((s) => ({ platoons: pts(map.deploy[s].platoons), tank: { x: fx(map.deploy[s].tank.x), y: map.deploy[s].tank.y } }));
  map.lanes = map.lanes.map((l) => ({ side: 1 - l.side, via: { x: fx(l.via.x), y: l.via.y }, to: l.to === 'A' ? 'C' : l.to === 'C' ? 'A' : l.to }));
  // Objectives keep their letters by side: A is the west one.
  const A = map.sites.find((s) => s.id === 'A'), C = map.sites.find((s) => s.id === 'C');
  if (A && C) { A.id = 'C'; C.id = 'A'; }
  map.flipped = true;
  return map;
}
