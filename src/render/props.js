// Set pieces on the battlefield, drawn in code from above: wrecked tanks and
// APCs, a crashed dropship, freight cars and tank wagons, containers, crate
// stacks, pipe racks, concrete pillboxes, tank traps and jersey barriers,
// pylons, smoke stacks, a cooling tower, street lamps, Helghast banners and
// a statue. The map builder lists them in map.props; the solid ones stand on
// wall cells (they block movement and sight and can be shot to pieces), the
// low ones on cover cells. Drawn live so a prop that has been mostly blown
// apart shows as burnt wreckage instead. Light from the upper left.

import { T } from '../sim/map.js';

const SHADOW = 'rgba(14,12,9,0.42)';
const HI = 'rgba(255,248,226,0.22)';

// How much of a solid prop is still standing (1 for low props).
function intact(map, p) {
  if (!p.cells || !p.cells.length) return 1;
  let n = 0;
  for (const i of p.cells) if (map.grid[i] === T.wall) n++;
  return n / p.cells.length;
}

export function drawProps(g, state, vb, lift, now) {
  const map = state.map;
  if (!map.props || !map.props.length) return;
  for (const p of map.props) {
    const R = Math.max(p.w, p.h);
    if (p.x + R < vb.x0 || p.x - R > vb.x1 || p.y + R < vb.y0 - 60 || p.y - R > vb.y1 + 60) continue;
    const left = intact(map, p);
    g.save();
    g.translate(p.x, p.y - lift(p.x, p.y));
    if (left < 0.45) { g.rotate(p.ang || 0); remains(g, p); g.restore(); continue; }
    // Shadow first (not rotated, so it always falls down and to the right).
    if (!p.flat) { g.fillStyle = SHADOW; g.save(); g.translate(4, 5); g.rotate(p.ang || 0); shape(g, p); g.restore(); }
    g.rotate(p.ang || 0);
    (ART[p.kind] || box)(g, p, now);
    g.restore();
  }
}

// The outline used for the shadow.
function shape(g, p) {
  const w = p.w, h = p.h;
  if (p.kind === 'cooling' || p.kind === 'stack' || p.kind === 'silo') { g.beginPath(); g.arc(0, 0, w / 2, 0, 6.3); g.fill(); return; }
  if (p.kind === 'lamp' || p.kind === 'banner' || p.kind === 'pylon' || p.kind === 'hedgehog' || p.kind === 'deadtree' || p.kind === 'crane' || p.kind === 'cooling' || (p.kind === 'pipes' && !p.cells)) return;
  g.fillRect(-w / 2, -h / 2, w, h);
}

function rr(g, x, y, w, h, r, fill) { g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); }

function remains(g, p) {
  // Burnt, flattened debris where a prop used to be.
  g.fillStyle = 'rgba(16,13,10,0.5)';
  g.beginPath(); g.ellipse(0, 0, p.w * 0.55, p.h * 0.55, 0, 0, 6.3); g.fill();
  const bits = Math.max(4, Math.round((p.w * p.h) / 220));
  for (let k = 0; k < bits; k++) {
    const a = k * 2.399, d = ((k * 37) % 100) / 100;
    const x = Math.cos(a) * d * p.w * 0.42, y = Math.sin(a) * d * p.h * 0.42;
    g.fillStyle = k % 3 ? '#3a3631' : '#5a5246';
    g.fillRect(x - 3, y - 2, 4 + (k % 4) * 2, 3 + (k % 3));
  }
}

function box(g, p) { rr(g, -p.w / 2, -p.h / 2, p.w, p.h, 2, '#6d685c'); }

const ART = {
  // A knocked-out tank: tracks either side, a scorched hull, the turret
  // knocked round and its gun drooping.
  tankwreck(g, p) {
    const w = p.w, h = p.h;
    rr(g, -w / 2, -h / 2, w, h * 0.24, 3, '#2a2824');
    rr(g, -w / 2, h / 2 - h * 0.24, w, h * 0.24, 3, '#2a2824');
    g.fillStyle = '#3c3a33';
    for (let x = -w / 2 + 3; x < w / 2 - 3; x += 6) { g.fillRect(x, -h / 2 + 1, 3, h * 0.24 - 2); g.fillRect(x, h / 2 - h * 0.24 + 1, 3, h * 0.24 - 2); }
    rr(g, -w / 2 + 4, -h / 2 + h * 0.18, w - 8, h * 0.64, 4, p.col || '#57513f');
    g.fillStyle = 'rgba(14,12,9,0.45)'; g.beginPath(); g.ellipse(w * 0.08, 0, w * 0.3, h * 0.28, 0.4, 0, 6.3); g.fill();
    g.save(); g.translate(-w * 0.04, 0); g.rotate(p.turret ?? 0.7);
    rr(g, -w * 0.18, -h * 0.22, w * 0.36, h * 0.44, 6, '#4a4537');
    g.fillStyle = '#2e2b24'; g.fillRect(w * 0.16, -2, w * 0.42, 4);
    g.fillStyle = HI; g.fillRect(-w * 0.16, -h * 0.2, w * 0.3, 2);
    g.restore();
    g.fillStyle = HI; g.fillRect(-w / 2 + 5, -h / 2 + h * 0.18, w - 10, 1.5);
  },
  // A wrecked eight-wheeled APC.
  apc(g, p) {
    const w = p.w, h = p.h;
    g.fillStyle = '#1f1d1a';
    for (let k = 0; k < 4; k++) { const x = -w * 0.38 + k * w * 0.25; g.fillRect(x - 5, -h / 2 - 2, 10, 5); g.fillRect(x - 5, h / 2 - 3, 10, 5); }
    rr(g, -w / 2, -h / 2 + 2, w, h - 4, 5, p.col || '#5d5a48');
    g.fillStyle = '#4a473a'; g.beginPath(); g.moveTo(w / 2, -h / 2 + 2); g.lineTo(w / 2 + 8, -h * 0.2); g.lineTo(w / 2 + 8, h * 0.2); g.lineTo(w / 2, h / 2 - 2); g.fill();
    g.fillStyle = '#2f2c25'; g.fillRect(-w * 0.15, -h * 0.25, w * 0.2, h * 0.5);
    g.fillStyle = 'rgba(14,12,9,0.4)'; g.beginPath(); g.ellipse(-w * 0.2, h * 0.1, w * 0.22, h * 0.25, 0, 0, 6.3); g.fill();
    g.fillStyle = HI; g.fillRect(-w / 2 + 3, -h / 2 + 3, w - 6, 1.5);
  },
  // A burnt-out truck: cab, then the bare ribs of its cargo bed.
  truck(g, p) {
    const w = p.w, h = p.h;
    rr(g, w * 0.22, -h / 2, w * 0.28, h, 4, '#4f4a3e');
    g.fillStyle = '#252320'; g.fillRect(w * 0.4, -h / 2 + 3, w * 0.06, h - 6);
    rr(g, -w / 2, -h / 2 + 1, w * 0.7, h - 2, 2, '#3a362e');
    g.strokeStyle = '#6b6252'; g.lineWidth = 2;
    for (let x = -w / 2 + 6; x < w * 0.2; x += 9) { g.beginPath(); g.moveTo(x, -h / 2 + 2); g.lineTo(x, h / 2 - 2); g.stroke(); }
    g.fillStyle = HI; g.fillRect(w * 0.22, -h / 2, w * 0.28, 1.5);
  },
  // A crashed ISA dropship: long hull, one wing torn off, engines scorched.
  dropship(g, p) {
    const w = p.w, h = p.h;
    g.fillStyle = 'rgba(14,12,9,0.5)'; g.beginPath(); g.ellipse(-w * 0.1, 0, w * 0.55, h * 0.45, 0, 0, 6.3); g.fill();
    // Wing (the one still attached) and the stub of the other.
    g.fillStyle = '#5c6066'; g.beginPath(); g.moveTo(-w * 0.1, -h * 0.12); g.lineTo(-w * 0.32, -h * 0.5); g.lineTo(-w * 0.02, -h * 0.5); g.lineTo(w * 0.12, -h * 0.12); g.fill();
    g.fillStyle = '#4b4e53'; g.beginPath(); g.moveTo(-w * 0.1, h * 0.12); g.lineTo(-w * 0.16, h * 0.3); g.lineTo(w * 0.02, h * 0.3); g.lineTo(w * 0.08, h * 0.12); g.fill();
    // Hull.
    g.fillStyle = '#6f747a'; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w * 0.32, -h * 0.17); g.lineTo(-w / 2, -h * 0.14); g.lineTo(-w / 2, h * 0.14); g.lineTo(w * 0.32, h * 0.17); g.closePath(); g.fill();
    g.fillStyle = '#2b3036'; g.beginPath(); g.moveTo(w / 2 - 4, 0); g.lineTo(w * 0.36, -h * 0.1); g.lineTo(w * 0.3, 0); g.lineTo(w * 0.36, h * 0.1); g.fill();
    g.fillStyle = HI; g.fillRect(-w / 2, -h * 0.14, w * 0.8, 2);
    // Engine pods, burnt.
    for (const s of [-1, 1]) { rr(g, -w * 0.46, s * h * 0.2 - 6, w * 0.22, 12, 5, '#3b3d40'); g.fillStyle = '#16130f'; g.beginPath(); g.arc(-w * 0.46, s * h * 0.2, 5, 0, 6.3); g.fill(); }
    g.fillStyle = '#2f5d8a'; g.fillRect(-w * 0.05, -h * 0.13, w * 0.06, h * 0.26); // ISA blue band
    g.fillStyle = 'rgba(14,12,9,0.45)'; g.beginPath(); g.ellipse(w * 0.1, h * 0.04, w * 0.14, h * 0.1, 0.3, 0, 6.3); g.fill();
  },
  // A freight car: boxcar with roof ribs and a sliding door.
  traincar(g, p) {
    const w = p.w, h = p.h;
    rr(g, -w / 2, -h / 2, w, h, 2, p.col || '#6a3b2a');
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = -w / 2 + 8; x < w / 2; x += 10) g.fillRect(x, -h / 2 + 1, 2, h - 2);
    g.fillStyle = HI; g.fillRect(-w / 2, -h / 2, w, 1.5);
    g.fillStyle = 'rgba(14,12,9,0.3)'; g.fillRect(-w / 2, h / 2 - 3, w, 3);
    g.fillStyle = '#2a2622'; g.fillRect(-w / 2 - 4, -3, 4, 6); g.fillRect(w / 2, -3, 4, 6);
  },
  // A rail tank wagon: a long cylinder on its frame, a hazard band.
  tanker(g, p) {
    const w = p.w, h = p.h;
    g.fillStyle = '#2a2622'; g.fillRect(-w / 2, -h * 0.35, w, h * 0.7);
    const gr = g.createLinearGradient(0, -h / 2, 0, h / 2);
    gr.addColorStop(0, '#8b8d88'); gr.addColorStop(0.35, '#6c6e6a'); gr.addColorStop(1, '#3e403d');
    g.fillStyle = gr; g.beginPath(); g.roundRect(-w / 2 + 4, -h / 2, w - 8, h, h / 2); g.fill();
    g.fillStyle = '#c9a227'; g.fillRect(-6, -h / 2 + 1, 12, h - 2);
    g.fillStyle = '#1d1b17'; g.beginPath(); g.arc(0, 0, 3, 0, 6.3); g.fill();
  },
  // A shipping container, ribbed, with corner castings.
  container(g, p) {
    const w = p.w, h = p.h;
    rr(g, -w / 2, -h / 2, w, h, 1, p.col || '#7a4a2c');
    g.fillStyle = 'rgba(0,0,0,0.16)';
    for (let x = -w / 2 + 5; x < w / 2 - 2; x += 5) g.fillRect(x, -h / 2 + 2, 1.5, h - 4);
    g.fillStyle = HI; g.fillRect(-w / 2, -h / 2, w, 1.5); g.fillRect(-w / 2, -h / 2, 1.5, h);
    g.fillStyle = '#2b2824';
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.fillRect(x * (w / 2 - 2) - 2, y * (h / 2 - 2) - 2, 4, 4);
  },
  // A stack of crates (low cover).
  crates(g, p) {
    const w = p.w, h = p.h, n = Math.max(1, Math.round(w / 14)), m = Math.max(1, Math.round(h / 14));
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const x = -w / 2 + (i * w) / n, y = -h / 2 + (j * h) / m, cw = w / n - 1.5, ch = h / m - 1.5;
      rr(g, x, y, cw, ch, 1, (i + j) % 2 ? '#7b6644' : '#6c5a3c');
      g.strokeStyle = 'rgba(30,24,14,0.6)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x + 1, y + 1); g.lineTo(x + cw - 1, y + ch - 1); g.moveTo(x + cw - 1, y + 1); g.lineTo(x + 1, y + ch - 1); g.stroke();
      g.fillStyle = HI; g.fillRect(x, y, cw, 1);
    }
  },
  // A pipe rack: parallel pipes with flanges on cross beams.
  pipes(g, p) {
    const w = p.w, h = p.h, n = p.n || 3;
    g.fillStyle = '#2d2b27';
    for (let x = -w / 2 + 10; x < w / 2; x += 40) g.fillRect(x, -h / 2, 5, h);
    for (let k = 0; k < n; k++) {
      const y = -h / 2 + ((k + 0.5) * h) / n, d = (h / n) * 0.8;
      const gr = g.createLinearGradient(0, y - d / 2, 0, y + d / 2);
      const base = p.col || ['#7b7d78', '#8a6a3c', '#6d7a7f'][k % 3];
      gr.addColorStop(0, '#d7d3c5'); gr.addColorStop(0.25, base); gr.addColorStop(1, '#2e2d2a');
      g.fillStyle = gr; g.fillRect(-w / 2, y - d / 2, w, d);
      g.fillStyle = 'rgba(20,18,14,0.5)';
      for (let x = -w / 2 + 30; x < w / 2; x += 60) g.fillRect(x, y - d / 2 - 1, 3, d + 2);
    }
  },
  // A concrete pillbox with a dark firing slit facing +x.
  pillbox(g, p) {
    const w = p.w, h = p.h;
    rr(g, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.3, '#77746a');
    rr(g, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, Math.min(w, h) * 0.25, '#868276');
    g.fillStyle = '#16140f'; g.fillRect(w / 2 - 5, -h * 0.28, 5, h * 0.56);
    g.fillStyle = 'rgba(0,0,0,0.15)';
    for (let k = 0; k < 4; k++) g.fillRect(-w / 2 + 6 + k * 7, -h / 2 + 6, 3, 3);
    g.fillStyle = HI; g.fillRect(-w / 2 + 4, -h / 2 + 4, w - 8, 1.5);
  },
  // Czech hedgehog tank traps: three crossed girders.
  hedgehog(g, p) {
    g.strokeStyle = '#2e2b26'; g.lineWidth = 4;
    for (const a of [0, 1.05, 2.1]) { g.beginPath(); g.moveTo(Math.cos(a) * p.w / 2 + 2, Math.sin(a) * p.w / 2 + 3); g.lineTo(-Math.cos(a) * p.w / 2 + 2, -Math.sin(a) * p.w / 2 + 3); g.stroke(); }
    g.strokeStyle = '#6f685a'; g.lineWidth = 3;
    for (const a of [0, 1.05, 2.1]) { g.beginPath(); g.moveTo(Math.cos(a) * p.w / 2, Math.sin(a) * p.w / 2); g.lineTo(-Math.cos(a) * p.w / 2, -Math.sin(a) * p.w / 2); g.stroke(); }
  },
  // A run of concrete jersey barriers.
  jersey(g, p) {
    const w = p.w, h = p.h, n = Math.max(1, Math.round(w / 22));
    for (let k = 0; k < n; k++) {
      const x = -w / 2 + (k * w) / n;
      rr(g, x + 0.5, -h / 2, w / n - 1.5, h, 2, '#8a877d');
      g.fillStyle = '#a7a397'; g.fillRect(x + 2, -h * 0.15, w / n - 4.5, h * 0.3);
      g.fillStyle = k % 2 ? '#a53a2b' : '#c9c3b0'; g.fillRect(x + 3, -h / 2 + 1, w / n - 6, 2);
    }
  },
  // A power pylon from above: square base, cross bracing, arms.
  pylon(g, p) {
    const s = p.w / 2;
    g.strokeStyle = SHADOW; g.lineWidth = 3; g.beginPath(); g.moveTo(8, 10); g.lineTo(60, 70); g.stroke();
    g.strokeStyle = '#3a3833'; g.lineWidth = 2;
    g.strokeRect(-s, -s, s * 2, s * 2);
    g.beginPath(); g.moveTo(-s, -s); g.lineTo(s, s); g.moveTo(s, -s); g.lineTo(-s, s); g.stroke();
    g.fillStyle = '#4a4740'; g.fillRect(-s * 2.4, -2, s * 4.8, 4);
    g.fillStyle = '#9fb3b8'; for (const x of [-s * 2.2, s * 2.2]) { g.beginPath(); g.arc(x, 0, 2.5, 0, 6.3); g.fill(); }
  },
  // A smoke stack or silo from above: a ring, dark mouth, soot.
  stack(g, p) {
    const r = p.w / 2;
    const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
    gr.addColorStop(0, '#8b867a'); gr.addColorStop(1, '#4e4b44');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 6.3); g.fill();
    g.fillStyle = '#100e0b'; g.beginPath(); g.arc(0, 0, r * 0.62, 0, 6.3); g.fill();
    g.strokeStyle = '#a53a2b'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r * 0.82, 0, 6.3); g.stroke();
  },
  silo(g, p) {
    const r = p.w / 2;
    const gr = g.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
    gr.addColorStop(0, '#a4a196'); gr.addColorStop(1, '#55534c');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 6.3); g.fill();
    g.strokeStyle = 'rgba(20,18,14,0.35)'; g.lineWidth = 1;
    for (let k = 1; k < 4; k++) { g.beginPath(); g.arc(0, 0, (r * k) / 4, 0, 6.3); g.stroke(); }
    g.fillStyle = '#c9a227'; g.fillRect(-2, -r, 4, r * 0.4);
  },
  // A ruined cooling tower: a huge broken ring.
  cooling(g, p) {
    const r = p.w / 2;
    g.lineWidth = r * 0.16;
    g.strokeStyle = '#6e6a60'; g.beginPath(); g.arc(0, 0, r * 0.92, -0.4, 4.6); g.stroke();
    g.strokeStyle = '#8d897d'; g.lineWidth = r * 0.06; g.beginPath(); g.arc(0, 0, r * 0.97, -0.4, 4.6); g.stroke();
    g.fillStyle = 'rgba(14,12,9,0.35)'; g.beginPath(); g.arc(0, 0, r * 0.82, 0, 6.3); g.fill();
    g.fillStyle = '#5c584e';
    for (let k = 0; k < 12; k++) { const a = -0.4 + (k / 12) * 0.9 - 0.9, d = r * (0.6 + (k % 3) * 0.12); g.fillRect(Math.cos(a) * d - 4, Math.sin(a) * d - 3, 8 + (k % 3) * 3, 6); }
  },
  // A street lamp: a post with an arm and a dead light.
  lamp(g, p) {
    g.fillStyle = SHADOW; g.fillRect(3, 3, 22, 2);
    g.fillStyle = '#2e2c28'; g.beginPath(); g.arc(0, 0, 2.5, 0, 6.3); g.fill();
    g.fillRect(0, -1, 16, 2);
    g.fillStyle = '#c99a4e'; g.fillRect(14, -2.5, 6, 5);
  },
  // A Helghast banner on a pole: black field, red triad mark.
  banner(g, p, now) {
    g.fillStyle = '#2b2924'; g.beginPath(); g.arc(0, 0, 2.2, 0, 6.3); g.fill();
    const sway = Math.sin(now * 1.7 + p.x * 0.01) * 1.5;
    g.fillStyle = '#4a0f12'; g.beginPath(); g.moveTo(2, -1); g.lineTo(20, -2 + sway); g.lineTo(20, 9 + sway); g.lineTo(2, 8); g.fill();
    g.fillStyle = '#d72a2a'; g.beginPath(); g.moveTo(8, 1 + sway * 0.4); g.lineTo(16, 1 + sway * 0.7); g.lineTo(12, 7 + sway * 0.55); g.fill();
  },
  // The statue on the plaza: a plinth, a cloaked figure from above.
  statue(g, p) {
    const w = p.w;
    rr(g, -w / 2, -w / 2, w, w, 3, '#5b5850');
    rr(g, -w / 2 + 5, -w / 2 + 5, w - 10, w - 10, 3, '#76726a');
    g.fillStyle = '#2a2825'; g.beginPath(); g.ellipse(0, 2, w * 0.26, w * 0.2, 0, 0, 6.3); g.fill();
    g.fillStyle = '#3a3733'; g.beginPath(); g.arc(0, -2, w * 0.1, 0, 6.3); g.fill();
    g.fillStyle = '#d72a2a'; g.beginPath(); g.moveTo(-4, w * 0.3); g.lineTo(4, w * 0.3); g.lineTo(0, w * 0.38); g.fill();
    g.fillStyle = HI; g.fillRect(-w / 2 + 5, -w / 2 + 5, w - 10, 1.5);
  },
  // A dead, burnt tree.
  deadtree(g, p) {
    g.strokeStyle = SHADOW; g.lineWidth = 2;
    g.beginPath(); for (let k = 0; k < 5; k++) { const a = k * 1.3; g.moveTo(3, 4); g.lineTo(3 + Math.cos(a) * p.w * 0.5, 4 + Math.sin(a) * p.w * 0.5); } g.stroke();
    g.strokeStyle = '#2a241c'; g.lineWidth = 2;
    g.beginPath(); for (let k = 0; k < 5; k++) { const a = k * 1.3; g.moveTo(0, 0); g.lineTo(Math.cos(a) * p.w * 0.5, Math.sin(a) * p.w * 0.5); } g.stroke();
    g.fillStyle = '#1f1a14'; g.beginPath(); g.arc(0, 0, 3, 0, 6.3); g.fill();
  },
  // A gantry crane over the yard: two rails of girder and a cab.
  crane(g, p) {
    const w = p.w, h = p.h;
    g.fillStyle = '#b08a2a'; g.fillRect(-w / 2, -h / 2, w, 5); g.fillRect(-w / 2, h / 2 - 5, w, 5);
    g.strokeStyle = 'rgba(30,24,14,0.6)'; g.lineWidth = 1;
    for (let x = -w / 2; x < w / 2; x += 8) { g.beginPath(); g.moveTo(x, -h / 2); g.lineTo(x + 4, -h / 2 + 5); g.moveTo(x, h / 2 - 5); g.lineTo(x + 4, h / 2); g.stroke(); }
    rr(g, (p.cab || 0) - 10, -h / 2, 20, h, 2, '#5d5a52');
    g.fillStyle = '#2c3a40'; g.fillRect((p.cab || 0) - 6, -6, 12, 12);
  },
  // A bus burnt to its frame.
  bus(g, p) {
    const w = p.w, h = p.h;
    rr(g, -w / 2, -h / 2, w, h, 4, '#4c4537');
    g.fillStyle = '#211e19'; g.fillRect(-w / 2 + 4, -h / 2 + 3, w - 8, h - 6);
    g.fillStyle = '#5e5747';
    for (let x = -w / 2 + 10; x < w / 2 - 6; x += 12) g.fillRect(x, -h / 2 + 3, 2, h - 6);
  },
};
