// Ground art shared by both terrain painters (flat and tilted): the surfaces
// a map builder lays down as decals (roads, rails, the river and its fords,
// mud and ash, concrete hardstanding, scorch marks) and, on top of the
// raised ground, the decks of platforms, catwalks and overpasses. Painted
// once onto the terrain canvas. Light comes from the upper left.
//
// lift(x, y) raises a point for the tilted look (0 in the flat one).

const C = {
  bank: '#3f3a2c', bankWet: '#2f2b21',
  deep: ['#1d2a2a', '#22302e', '#283632'], deepGlint: 'rgba(210,190,140,0.10)', sludge: 'rgba(160,96,40,0.10)',
  ford: '#3c4a44', fordStone: ['#6a6656', '#5a574a', '#77735f'],
  asphalt: '#3d3c38', asphaltEdge: '#2e2d2a', asphaltPatch: '#454440', line: 'rgba(214,196,120,0.55)', lineWhite: 'rgba(225,222,210,0.45)',
  dirt: '#5e5440', dirtRut: 'rgba(30,26,18,0.35)',
  concrete: '#6b6a63', concreteJoint: 'rgba(30,30,28,0.35)', concreteStain: 'rgba(40,36,28,0.18)',
  ballast: '#57534a', sleeper: '#3b3127', rail: '#9a958a', railShade: '#4a4740',
  mud: '#3a3326', mudSheen: 'rgba(200,190,150,0.10)', ash: 'rgba(150,146,134,0.10)',
  scorch: 'rgba(16,13,10,0.45)',
  grate: '#4d5052', grateLine: 'rgba(20,22,24,0.45)', grateEdge: '#2a2c2e', rail2: '#b8b2a0', hazard: '#c9a227',
  deckConcrete: '#7a7870',
};

const strokePath = (g, pts, lift) => {
  g.beginPath();
  pts.forEach((p, k) => (k ? g.lineTo(p.x, p.y - lift(p.x, p.y)) : g.moveTo(p.x, p.y - lift(p.x, p.y))));
};

// Along a polyline: call fn(x, y, angle) every `step` units.
function along(pts, step, fn) {
  let carry = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], d = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    for (let t = carry; t < d; t += step) fn(a.x + ((b.x - a.x) * t) / d, a.y + ((b.y - a.y) * t) / d, ang);
    carry = (carry - d) % step;
    if (carry < 0) carry += step;
  }
}

export function paintGround(g, map, r, lift, layer) {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const d of map.decals) {
    if ((d.layer || 'under') !== layer) continue;
    const L = (x, y) => (d.layer === 'top' ? lift(x, y) : 0);
    switch (d.kind) {
      case 'river': river(g, d, r, L); break;
      case 'ford': ford(g, d, r, L); break;
      case 'road': road(g, d, r, L); break;
      case 'rail': rail(g, d, L); break;
      case 'mud': blob(g, d, C.mud, r, L, true); break;
      case 'ash': blob(g, d, C.ash, r, L, false); break;
      case 'scorch': scorch(g, d, r, L); break;
      case 'pad': pad(g, d, r, L); break;
      case 'deck': deck(g, d, r, lift); break;
      case 'hazard': hazard(g, d, L); break;
      default:
    }
  }
}

function river(g, d, r, L) {
  const w = d.w * 2;
  strokePath(g, d.pts, L); g.strokeStyle = C.bank; g.lineWidth = w + 34; g.stroke();
  strokePath(g, d.pts, L); g.strokeStyle = C.bankWet; g.lineWidth = w + 14; g.stroke();
  strokePath(g, d.pts, L); g.strokeStyle = C.deep[0]; g.lineWidth = w; g.stroke();
  strokePath(g, d.pts, L); g.strokeStyle = C.deep[1]; g.lineWidth = w * 0.7; g.stroke();
  strokePath(g, d.pts, L); g.strokeStyle = C.deep[2]; g.lineWidth = w * 0.35; g.stroke();
  // Petrusite sludge streaks and glints, drifting downstream.
  along(d.pts, 26, (x, y, a) => {
    const off = r.range(-d.w * 0.8, d.w * 0.8);
    const px = x - Math.sin(a) * off, py = y + Math.cos(a) * off;
    g.strokeStyle = r() < 0.3 ? C.sludge : C.deepGlint;
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * r.range(8, 22), py + Math.sin(a) * r.range(8, 22)); g.stroke();
  });
}

function ford(g, d, r, L) {
  strokePath(g, d.pts, L); g.strokeStyle = C.ford; g.lineWidth = d.w * 2; g.stroke();
  along(d.pts, 9, (x, y, a) => {
    for (let k = 0; k < 2; k++) {
      const off = r.range(-d.w * 0.9, d.w * 0.9), px = x - Math.sin(a) * off, py = y + Math.cos(a) * off;
      g.fillStyle = 'rgba(15,14,10,0.35)'; g.beginPath(); g.ellipse(px + 1, py + 1.5, 3.5, 2.6, a, 0, 6.3); g.fill();
      g.fillStyle = r.pick(C.fordStone); g.beginPath(); g.ellipse(px, py, r.range(2.5, 4.5), r.range(2, 3.4), a, 0, 6.3); g.fill();
    }
  });
}

function road(g, d, r, L) {
  const w = d.w * 2;
  const style = d.style || 'asphalt';
  strokePath(g, d.pts, L); g.strokeStyle = 'rgba(20,18,14,0.35)'; g.lineWidth = w + 8; g.stroke();
  if (style === 'dirt') {
    strokePath(g, d.pts, L); g.strokeStyle = C.dirt; g.lineWidth = w; g.stroke();
    for (const o of [-0.45, 0.45]) {
      g.strokeStyle = C.dirtRut; g.lineWidth = 4;
      g.beginPath();
      d.pts.forEach((p, k) => {
        const q = d.pts[Math.min(k + 1, d.pts.length - 1)], p0 = d.pts[Math.max(k - 1, 0)], a = Math.atan2(q.y - p0.y, q.x - p0.x);
        const x = p.x - Math.sin(a) * o * d.w, y = p.y + Math.cos(a) * o * d.w - L(p.x, p.y);
        if (k) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.stroke();
    }
    return;
  }
  strokePath(g, d.pts, L); g.strokeStyle = style === 'concrete' ? '#5a5953' : C.asphaltEdge; g.lineWidth = w + 2; g.stroke();
  strokePath(g, d.pts, L); g.strokeStyle = style === 'concrete' ? C.concrete : C.asphalt; g.lineWidth = w - 2; g.stroke();
  // Patches, cracks and potholes: a road that has seen a war.
  along(d.pts, 34, (x, y, a) => {
    const off = r.range(-d.w * 0.7, d.w * 0.7), px = x - Math.sin(a) * off, py = y + Math.cos(a) * off;
    if (r() < 0.35) { g.fillStyle = C.asphaltPatch; g.save(); g.translate(px, py); g.rotate(a); g.fillRect(-r.range(6, 14), -r.range(4, 9), r.range(12, 26), r.range(8, 16)); g.restore(); }
    if (r() < 0.4) {
      g.strokeStyle = 'rgba(15,14,12,0.5)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(px, py);
      let cx = px, cy = py;
      for (let k = 0; k < 4; k++) { cx += r.range(-7, 7); cy += r.range(-7, 7); g.lineTo(cx, cy); }
      g.stroke();
    }
    if (r() < 0.12) { g.fillStyle = '#26251f'; g.beginPath(); g.ellipse(px, py, r.range(4, 8), r.range(3, 6), a, 0, 6.3); g.fill(); }
  });
  if (d.lines !== false && style === 'asphalt') {
    // Faded edge lines and a dashed centre line.
    for (const o of [-1, 1]) {
      g.strokeStyle = C.lineWhite; g.lineWidth = 1.5; g.setLineDash([26, 8]);
      g.beginPath();
      d.pts.forEach((p, k) => {
        const q = d.pts[Math.min(k + 1, d.pts.length - 1)], p0 = d.pts[Math.max(k - 1, 0)], a = Math.atan2(q.y - p0.y, q.x - p0.x);
        const x = p.x - Math.sin(a) * o * (d.w - 5), y = p.y + Math.cos(a) * o * (d.w - 5) - L(p.x, p.y);
        if (k) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.stroke();
    }
    g.setLineDash([14, 16]);
    strokePath(g, d.pts, L); g.strokeStyle = C.line; g.lineWidth = 2; g.stroke();
    g.setLineDash([]);
  }
}

function rail(g, d, L) {
  strokePath(g, d.pts, L); g.strokeStyle = 'rgba(20,18,14,0.3)'; g.lineWidth = 30; g.stroke();
  strokePath(g, d.pts, L); g.strokeStyle = C.ballast; g.lineWidth = 26; g.stroke();
  along(d.pts, 7, (x, y, a) => {
    g.save(); g.translate(x, y - L(x, y)); g.rotate(a);
    g.fillStyle = C.sleeper; g.fillRect(-2, -12, 4, 24);
    g.restore();
  });
  for (const o of [-6, 6]) {
    g.beginPath();
    d.pts.forEach((p, k) => {
      const q = d.pts[Math.min(k + 1, d.pts.length - 1)], p0 = d.pts[Math.max(k - 1, 0)], a = Math.atan2(q.y - p0.y, q.x - p0.x);
      const x = p.x - Math.sin(a) * o, y = p.y + Math.cos(a) * o - L(p.x, p.y);
      if (k) g.lineTo(x, y); else g.moveTo(x, y);
    });
    g.strokeStyle = C.railShade; g.lineWidth = 3; g.stroke();
    g.strokeStyle = C.rail; g.lineWidth = 1.4; g.stroke();
  }
}

function blob(g, d, col, r, L, sheen) {
  const y = d.y - L(d.x, d.y);
  for (let k = 0; k < 7; k++) {
    g.fillStyle = col;
    g.globalAlpha = k ? 0.55 : 1;
    g.beginPath(); g.ellipse(d.x + r.range(-d.rx, d.rx) * 0.5, y + r.range(-d.ry, d.ry) * 0.5, d.rx * r.range(0.4, 0.8), d.ry * r.range(0.4, 0.8), r() * 3, 0, 6.3); g.fill();
  }
  g.globalAlpha = 1;
  if (sheen) {
    g.strokeStyle = C.mudSheen; g.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) { const x = d.x + r.range(-d.rx, d.rx) * 0.6, yy = y + r.range(-d.ry, d.ry) * 0.6; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + r.range(6, 16), yy + r.range(-2, 2)); g.stroke(); }
  }
}

function scorch(g, d, r, L) {
  const y = d.y - L(d.x, d.y);
  const gr = g.createRadialGradient(d.x, y, 0, d.x, y, d.r);
  gr.addColorStop(0, 'rgba(14,11,8,0.6)');
  gr.addColorStop(1, 'rgba(14,11,8,0)');
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(d.x, y, d.r, d.r * 0.85, r() * 3, 0, 6.3); g.fill();
}

function pad(g, d, r, L) {
  const y0 = d.y0 - L(d.x0, d.y0), y1 = d.y1 - L(d.x0, d.y0);
  g.fillStyle = 'rgba(20,18,14,0.3)'; g.fillRect(d.x0 + 3, y0 + 3, d.x1 - d.x0, y1 - y0);
  g.fillStyle = d.style === 'dark' ? '#4f4e49' : C.concrete; g.fillRect(d.x0, y0, d.x1 - d.x0, y1 - y0);
  g.strokeStyle = C.concreteJoint; g.lineWidth = 1;
  const s = d.joint || 40;
  for (let x = d.x0 + s; x < d.x1; x += s) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
  for (let y = y0 + s; y < y1; y += s) { g.beginPath(); g.moveTo(d.x0, y); g.lineTo(d.x1, y); g.stroke(); }
  for (let k = 0; k < (d.x1 - d.x0) * (d.y1 - d.y0) / 4000; k++) {
    g.fillStyle = C.concreteStain;
    g.beginPath(); g.ellipse(r.range(d.x0, d.x1), r.range(y0, y1), r.range(6, 22), r.range(4, 14), r() * 3, 0, 6.3); g.fill();
  }
}

// A raised deck over the plateau painting: steel grating (catwalks,
// gantries) or concrete (an overpass, a loading dock), with railings on the
// long edges and hazard paint at the stairs.
function deck(g, d, r, lift) {
  const up = lift((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2);
  const y0 = d.y0 - up, y1 = d.y1 - up, w = d.x1 - d.x0, h = y1 - y0;
  g.fillStyle = 'rgba(14,13,10,0.4)'; g.fillRect(d.x0 + 5, y0 + 6, w, h);
  if (d.style === 'grate') {
    g.fillStyle = C.grateEdge; g.fillRect(d.x0 - 1.5, y0 - 1.5, w + 3, h + 3);
    g.fillStyle = C.grate; g.fillRect(d.x0, y0, w, h);
    g.strokeStyle = C.grateLine; g.lineWidth = 1;
    const vert = h > w;
    for (let k = 4; k < (vert ? w : h); k += 4) { g.beginPath(); if (vert) { g.moveTo(d.x0 + k, y0); g.lineTo(d.x0 + k, y1); } else { g.moveTo(d.x0, y0 + k); g.lineTo(d.x1, y0 + k); } g.stroke(); }
    for (let k = 20; k < (vert ? h : w); k += 20) { g.fillStyle = C.grateEdge; if (vert) g.fillRect(d.x0, y0 + k, w, 2); else g.fillRect(d.x0 + k, y0, 2, h); }
  } else {
    g.fillStyle = '#4c4b46'; g.fillRect(d.x0 - 1.5, y0 - 1.5, w + 3, h + 3);
    g.fillStyle = C.deckConcrete; g.fillRect(d.x0, y0, w, h);
    g.strokeStyle = C.concreteJoint; g.lineWidth = 1;
    for (let k = 40; k < Math.max(w, h); k += 40) { g.beginPath(); if (h > w) { g.moveTo(d.x0, y0 + k); g.lineTo(d.x1, y0 + k); } else { g.moveTo(d.x0 + k, y0); g.lineTo(d.x0 + k, y1); } g.stroke(); }
    if (d.road) { g.setLineDash([14, 16]); g.strokeStyle = C.line; g.lineWidth = 2; g.beginPath(); if (h > w) { g.moveTo((d.x0 + d.x1) / 2, y0); g.lineTo((d.x0 + d.x1) / 2, y1); } else { g.moveTo(d.x0, (y0 + y1) / 2); g.lineTo(d.x1, (y0 + y1) / 2); } g.stroke(); g.setLineDash([]); }
  }
  // Railings on the long sides (gaps where the stairs are left to the map).
  if (d.rails !== false) {
    g.fillStyle = C.rail2;
    if (h > w) { g.fillRect(d.x0, y0, 1.5, h); g.fillRect(d.x1 - 1.5, y0, 1.5, h); }
    else { g.fillRect(d.x0, y0, w, 1.5); g.fillRect(d.x0, y1 - 1.5, w, 1.5); }
    g.fillStyle = 'rgba(20,18,14,0.6)';
    for (let k = 0; k < Math.max(w, h); k += 12) { if (h > w) { g.fillRect(d.x0, y0 + k, 3, 2); g.fillRect(d.x1 - 3, y0 + k, 3, 2); } else { g.fillRect(d.x0 + k, y0, 2, 3); g.fillRect(d.x0 + k, y1 - 3, 2, 3); } }
  }
}

function hazard(g, d, L) {
  const y0 = d.y0 - L(d.x0, d.y0), y1 = d.y1 - L(d.x0, d.y0);
  g.save();
  g.beginPath(); g.rect(d.x0, y0, d.x1 - d.x0, y1 - y0); g.clip();
  g.fillStyle = '#1d1b17'; g.fillRect(d.x0, y0, d.x1 - d.x0, y1 - y0);
  g.strokeStyle = C.hazard; g.lineWidth = 4;
  for (let k = -60; k < d.x1 - d.x0 + 60; k += 10) { g.beginPath(); g.moveTo(d.x0 + k, y1); g.lineTo(d.x0 + k + (y1 - y0), y0); g.stroke(); }
  g.restore();
}
