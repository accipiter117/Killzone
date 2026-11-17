// Weather on screen (the rules are in src/sim/weather.js): cloud shadows
// drifting over the ground, rain or drizzle, wind-driven dust and ash, a
// tint for each kind, and lightning: a forked bolt down to whatever it hit,
// a white flash over the whole field, and, in a storm, distant flickers.
// All of it is picture only and uses the cosmetic random source.

import { fx } from './fx-random.js';

const TINT = {
  clear: 'rgba(40,34,26,0.08)',
  storm: 'rgba(14,20,34,0.30)',
  dust: 'rgba(120,96,62,0.22)',
  haze: 'rgba(150,104,36,0.16)',
};

// Bolts from strikes (fxs.bolts), and the flash level.
export function ingestWeather(fxs, e, now) {
  if (e.type !== 'lightning') return;
  const pts = [];
  let x = e.x + (fx() - 0.5) * 120, y = e.y - 900;
  while (y < e.y) { pts.push([x, y]); y += 40 + fx() * 50; x += (e.x - x) * 0.25 + (fx() - 0.5) * 50; }
  pts.push([e.x, e.y - 20]);
  (fxs.bolts || (fxs.bolts = [])).push({ pts, t0: now, x: e.x, y: e.y });
  fxs.flash = Math.max(fxs.flash || 0, 1);
  fxs.flashAt = now;
}

// World space, over the ground: drifting cloud shadows, and the bolts.
export function drawWeatherWorld(g, state, now, vb, fxs) {
  const w = state.weather;
  if (!w) return;
  const W = state.map.width, H = state.map.height;
  // Cloud shadows: big soft patches drifting with the wind.
  const n = w.kind === 'clear' ? 7 : 10, alpha = w.kind === 'storm' ? 0.2 : 0.12;
  for (let k = 0; k < n; k++) {
    const sx = ((k * 977) % 1000) / 1000, sy = ((k * 571) % 1000) / 1000;
    const x = ((sx * (W + 800) + now * (14 + (k % 3) * 6)) % (W + 800)) - 400;
    const y = sy * H, rx = 260 + (k % 4) * 90, ry = rx * 0.6;
    if (x + rx < vb.x0 || x - rx > vb.x1 || y + ry < vb.y0 || y - ry > vb.y1) continue;
    const gr = g.createRadialGradient(x, y, 0, x, y, rx);
    gr.addColorStop(0, `rgba(8,8,10,${alpha})`); gr.addColorStop(1, 'rgba(8,8,10,0)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0.2, 0, Math.PI * 2); g.fill();
  }
  // Lightning bolts: bright for a moment, then gone.
  if (fxs.bolts) {
    fxs.bolts = fxs.bolts.filter((b) => now - b.t0 < 0.45);
    for (const b of fxs.bolts) {
      const k = 1 - (now - b.t0) / 0.45, flick = (now * 30) % 2 < 1 ? 1 : 0.6;
      for (const [col, wid] of [[`rgba(150,190,255,${0.35 * k})`, 10], [`rgba(235,245,255,${k * flick})`, 3]]) {
        g.strokeStyle = col; g.lineWidth = wid; g.beginPath();
        b.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
      }
      const gr = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, 70);
      gr.addColorStop(0, `rgba(200,225,255,${0.5 * k})`); gr.addColorStop(1, 'rgba(200,225,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(b.x, b.y, 70, 0, Math.PI * 2); g.fill();
    }
  }
}

// Screen space, over everything but the HUD: tint, rain or dust, flash.
export function drawWeatherScreen(g, state, now, vw, vh, fxs) {
  const w = state.weather;
  if (!w) return;
  const s = w.strength;
  g.fillStyle = TINT[w.kind];
  g.globalAlpha = 0.5 + 0.5 * s;
  g.fillRect(0, 0, vw, vh);
  g.globalAlpha = 1;
  if (w.kind === 'storm' || w.kind === 'haze') {
    // Rain: short slanted streaks falling past, more as the storm builds.
    const heavy = w.kind === 'storm';
    const count = Math.round((heavy ? 260 : 90) * (0.3 + 0.7 * s) * (vw * vh) / (1280 * 800));
    g.strokeStyle = heavy ? 'rgba(190,205,225,0.32)' : 'rgba(210,190,140,0.22)';
    g.lineWidth = heavy ? 1.3 : 1;
    g.beginPath();
    const len = heavy ? 18 : 9, speed = heavy ? 900 : 380, slant = heavy ? 0.28 : 0.15;
    for (let i = 0; i < count; i++) {
      const a = ((i * 7919) % 10007) / 10007, b = ((i * 104729) % 10009) / 10009;
      const y = (b * (vh + 60) + now * speed * (0.8 + a * 0.4)) % (vh + 60) - 30;
      const x = (a * (vw + 100) + y * slant) % (vw + 100) - 50;
      g.moveTo(x, y); g.lineTo(x + len * slant, y + len);
    }
    g.stroke();
  }
  if (w.kind === 'dust') {
    // Dust and ash: a brown veil that thickens with each gust, and grit
    // streaming across on the wind.
    g.fillStyle = `rgba(122,100,70,${0.08 + 0.3 * s})`;
    g.fillRect(0, 0, vw, vh);
    const count = Math.round(180 * (0.3 + 0.7 * s) * (vw * vh) / (1280 * 800));
    g.fillStyle = 'rgba(190,170,130,0.45)';
    for (let i = 0; i < count; i++) {
      const a = ((i * 7919) % 10007) / 10007, b = ((i * 104729) % 10009) / 10009;
      const x = (a * (vw + 80) + now * (260 + b * 220)) % (vw + 80) - 40;
      const y = (b * vh + Math.sin(now * 2 + i) * 8) % vh;
      g.fillRect(x, y, 2 + (i % 3), 1.5);
    }
  }
  if (w.kind === 'storm' && (fxs.flash || 0) <= 0.01 && fx() < 0.004 * s) { fxs.flash = 0.35 + fx() * 0.3; fxs.flashAt = now; } // distant flicker
  if (fxs.flash > 0.01) {
    const k = fxs.flash * Math.max(0, 1 - (now - fxs.flashAt) / 0.35);
    g.fillStyle = `rgba(225,235,255,${0.4 * k})`;
    g.fillRect(0, 0, vw, vh);
    if (now - fxs.flashAt > 0.35) fxs.flash = 0;
  }
}
