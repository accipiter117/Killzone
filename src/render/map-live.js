// The parts of a map that move, drawn live: lift bridges (deck down, or its
// two leaves raised with water showing between them, swinging while they
// move), blast doors and barriers when open (closed ones are walls), and
// the slow drift of petrusite vent haze.

import { gateCentre } from '../sim/gates.js';

export function drawGates(g, state, now, px, opts) {
  const map = state.map;
  if (!map.gates || !map.gates.length) return;
  const c = map.cell;
  for (const gate of map.gates) {
    // Bounds of the gate's cells.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const i of gate.cells) {
      const x = (i % map.cols) * c, y = ((i / map.cols) | 0) * c;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + c); y1 = Math.max(y1, y + c);
    }
    // How far up (0 down / open, 1 raised / shut), easing while it moves.
    let up = gate.closed ? 1 : 0;
    if (gate.moving) {
      const total = state.cfg.gates.moveSec * state.cfg.tickRate;
      const k = Math.max(0, Math.min(1, 1 - (gate.moving.at - state.tick) / total));
      up = gate.moving.to ? k : 1 - k;
    }
    if (gate.kind === 'bridge') bridge(g, x0, y0, x1, y1, up, gate);
    else if (!gate.closed) {
      // Open: the door or barrier pushed back to its frame.
      const vert = y1 - y0 > x1 - x0;
      g.fillStyle = gate.kind === 'door' ? '#4a4f52' : '#9a3326';
      if (vert) { g.fillRect(x0 - 3, y0 - 4, x1 - x0 + 6, 4); g.fillRect(x0 - 3, y1, x1 - x0 + 6, 4); }
      else { g.fillRect(x0 - 4, y0 - 3, 4, y1 - y0 + 6); g.fillRect(x1, y0 - 3, 4, y1 - y0 + 6); }
      g.fillStyle = 'rgba(201,162,39,0.6)';
      if (vert) g.fillRect(x0, y0, x1 - x0, 2); else g.fillRect(x0, y0, 2, y1 - y0);
    }
    if (gate.moving && gate.blocked) {
      const p = gateCentre(map, gate);
      g.fillStyle = 'rgba(255,214,90,0.9)';
      g.font = `700 ${11 * px}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.fillText('clear the way', p.x, p.y - 20 * px);
    }
  }
}

// A lift bridge seen from above: steel deck with railings and road paint
// when down; raised, each leaf tilts up towards its hinge on the bank, so
// it shortens and darkens, and the gap in the middle shows the water.
function bridge(g, x0, y0, x1, y1, up, gate) {
  const across = x1 - x0 > y1 - y0; // the deck runs left to right
  const len = across ? x1 - x0 : y1 - y0;
  const half = len / 2;
  const leaf = half * (1 - up * 0.82);
  const shade = 0.15 + up * 0.35;
  const leafRect = (fromStart) => {
    if (across) return fromStart ? [x0, y0, leaf, y1 - y0] : [x1 - leaf, y0, leaf, y1 - y0];
    return fromStart ? [x0, y0, x1 - x0, leaf] : [x0, y1 - leaf, x1 - x0, leaf];
  };
  for (const s of [true, false]) {
    const [x, y, w, h] = leafRect(s);
    g.fillStyle = 'rgba(12,10,8,0.45)'; g.fillRect(x + 4 + up * 10, y + 5 + up * 6, w, h);
    g.fillStyle = '#585c5e'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    for (let k = 6; k < (across ? w : h); k += 8) { if (across) g.fillRect(x + k, y, 1.5, h); else g.fillRect(x, y + k, w, 1.5); }
    g.fillStyle = '#b8b2a0';
    if (across) { g.fillRect(x, y, w, 2); g.fillRect(x, y + h - 2, w, 2); } else { g.fillRect(x, y, 2, h); g.fillRect(x + w - 2, y, 2, h); }
    g.fillStyle = `rgba(10,9,7,${shade})`; g.fillRect(x, y, w, h);
    // Counterweight housing at the hinge.
    g.fillStyle = '#3b3e40';
    if (across) g.fillRect(s ? x0 - 14 : x1, y0 - 6, 14, y1 - y0 + 12); else g.fillRect(x0 - 6, s ? y0 - 14 : y1, x1 - x0 + 12, 14);
    g.fillStyle = '#c9a227';
    if (across) g.fillRect(s ? x0 - 14 : x1, y0 - 6, 14, 3); else g.fillRect(x0 - 6, s ? y0 - 14 : y1, 3, 14);
  }
  if (up < 0.05) {
    g.setLineDash([12, 12]); g.strokeStyle = 'rgba(214,196,120,0.55)'; g.lineWidth = 2;
    g.beginPath();
    if (across) { g.moveTo(x0, (y0 + y1) / 2); g.lineTo(x1, (y0 + y1) / 2); } else { g.moveTo((x0 + x1) / 2, y0); g.lineTo((x0 + x1) / 2, y1); }
    g.stroke(); g.setLineDash([]);
  }
}

// Vent haze: soft amber-grey puffs drifting over the haze patches.
export function drawHaze(g, state, now, vb) {
  const map = state.map;
  if (!map.hasHaze) return;
  for (const d of map.decals) {
    if (d.kind !== 'haze') continue;
    if (d.x + d.rx < vb.x0 || d.x - d.rx > vb.x1 || d.y + d.ry < vb.y0 || d.y - d.ry > vb.y1) continue;
    const n = Math.max(6, Math.round((d.rx * d.ry) / 900));
    for (let k = 0; k < n; k++) {
      const a = k * 2.399 + now * 0.05 * (k % 2 ? 1 : -1), rr = ((k * 53) % 100) / 100;
      const x = d.x + Math.cos(a) * d.rx * 0.75 * rr + Math.sin(now * 0.2 + k) * 10;
      const y = d.y + Math.sin(a) * d.ry * 0.75 * rr;
      const r = 26 + (k % 4) * 8;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(190,170,130,0.16)');
      gr.addColorStop(1, 'rgba(190,170,130,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
    }
  }
}
