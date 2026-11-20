// Aircraft drawn in code (painted art can replace these later, the way the
// props were): seen from above, nose along the heading, with a shadow on the
// ground that slides away and softens as they climb. Light from the upper
// left, so shadows fall down and to the right.

const LOOK = {
  0: { hull: '#8592a0', dark: '#55606c', light: '#b4c0cc', trim: '#3f6fa8', glass: '#9fd0ff' },
  1: { hull: '#4a4c4f', dark: '#2c2d2f', light: '#6d7074', trim: '#c2321c', glass: '#ff8a5a' },
};

function poly(g, pts) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

// Dropship: a broad troop hull, short swept wings, two big engine pods
// that tilt to land.
function dropship(g, c, now) {
  const L = LOOK[c.side];
  g.fillStyle = L.dark;
  poly(g, [[-30, -8], [-6, -30], [6, -30], [2, -10], [2, 10], [6, 30], [-6, 30], [-30, 8]]); // wings
  g.fill();
  g.fillStyle = L.hull;
  poly(g, [[38, 0], [28, -10], [-26, -13], [-36, -8], [-36, 8], [-26, 13], [28, 10]]); // hull
  g.fill();
  g.fillStyle = L.light;
  poly(g, [[28, -7], [-24, -9], [-24, -3], [26, -2]]);
  g.fill();
  g.fillStyle = L.trim;
  g.fillRect(-14, -13, 6, 26);
  g.fillStyle = L.glass;
  poly(g, [[37, 0], [29, -6], [24, -5], [24, 5], [29, 6]]);
  g.fill();
  for (const sy of [-1, 1]) {
    g.fillStyle = L.dark;
    g.fillRect(-10, sy * 30 - 7, 22, 14);
    // Spinning fan: a soft disc with a blade-blur that turns.
    g.save();
    g.translate(1, sy * 30);
    g.fillStyle = 'rgba(30,30,30,0.35)';
    g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill();
    g.rotate(now * 40 * sy);
    g.strokeStyle = 'rgba(220,220,220,0.35)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(-12, 0); g.lineTo(12, 0); g.moveTo(0, -12); g.lineTo(0, 12); g.stroke();
    g.restore();
  }
}

// Gunship: slimmer, a long nose with the cannon, stub wings with pods.
function gunship(g, c, now, firing) {
  const L = LOOK[c.side];
  g.fillStyle = L.dark;
  poly(g, [[-4, -24], [6, -24], [10, 24], [-4, 24], [-12, 6], [-12, -6]]);
  g.fill();
  g.fillStyle = L.hull;
  poly(g, [[34, 0], [24, -7], [-26, -8], [-34, -4], [-34, 4], [-26, 8], [24, 7]]);
  g.fill();
  g.fillStyle = L.light;
  poly(g, [[24, -4], [-22, -5], [-22, -1], [24, -1]]);
  g.fill();
  g.fillStyle = L.trim;
  g.fillRect(-30, -2, 8, 4);
  g.fillStyle = L.glass;
  poly(g, [[30, 0], [22, -5], [16, -4], [16, 4], [22, 5]]);
  g.fill();
  g.fillStyle = '#222';
  g.fillRect(34, -1.5, 12, 3); // cannon
  if (firing) {
    g.fillStyle = 'rgba(255,220,140,0.9)';
    g.beginPath(); g.arc(48, 0, 4 + Math.sin(now * 90) * 1.5, 0, Math.PI * 2); g.fill();
  }
  for (const sy of [-1, 1]) {
    g.save();
    g.translate(2, sy * 24);
    g.fillStyle = L.dark;
    g.fillRect(-8, -5, 16, 10);
    g.fillStyle = 'rgba(30,30,30,0.3)';
    g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.fill();
    g.rotate(now * 45 * sy);
    g.strokeStyle = 'rgba(220,220,220,0.35)';
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-9, 0); g.lineTo(9, 0); g.moveTo(0, -9); g.lineTo(0, 9); g.stroke();
    g.restore();
  }
}

// lift: how far up the screen to draw a body at this altitude (the tilted
// look raises things; top-down only shrinks the shadow).
export function drawAircraft(g, state, now, tilt) {
  if (!state.aircraft || !state.aircraft.length) return;
  for (const c of state.aircraft) {
    const alt = c.alt;
    const scale = 0.85 + alt * 0.25;
    // Shadow on the ground.
    g.save();
    g.translate(c.x + alt * 34, c.y + alt * 44);
    g.rotate(c.heading);
    g.scale(scale * 0.95, scale * 0.95);
    g.globalAlpha = 0.35 - alt * 0.15;
    g.fillStyle = '#000';
    g.beginPath(); g.ellipse(0, 0, 36, c.kind === 'dropship' ? 30 : 24, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    // Body.
    g.save();
    g.translate(c.x, c.y - (tilt ? alt * 50 : 0));
    g.rotate(c.heading);
    g.scale(scale, scale);
    if (c.kind === 'dropship') dropship(g, c, now);
    else gunship(g, c, now, c.firing);
    g.restore();
  }
}
