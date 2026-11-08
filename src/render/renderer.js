// Draws one frame of the battle: terrain, wire, sites, soldiers, effects and
// the labels that explain what is going on. Reads the sim state, never writes it.

import { isActive, members, centroid, coverName } from '../sim/util.js';
import { heightAt } from '../sim/map.js';
import { toScreen } from './camera.js';
import { sideColours, drawSmoke, drawEffects } from './effects.js';
import { getSprite, dirIndex, SPRITE_SIZE } from './sprites.js';
import { getSprite25, W25, H25, ANCHOR_X, ANCHOR_Y } from './sprites25d.js';
import { getPixelTrooper, PT_W, PT_H, PT_FOOT } from './pixel-troopers.js';
import { getTank, TANK_W, TANK_H, TANK_FOOT } from './tanks.js';
import { liftAt } from './terrain-tilt.js';

// In the tilted view, anything standing on raised ground is drawn higher up
// the screen. LY gives the screen y for a ground point (unchanged when flat).
let LY = (x, y) => y;
const lifted = (o) => ({ ...o, y: LY(o.x, o.y) });

// Detailed troopers: each faction and role has its own sprite set.
const FACTION = ['isa', 'hgh'];
export const spriteScalePixel = (px) => Math.max(0.42, 0.3 * px);
function drawTrooper(g, side, frame, ang, x, y, ps, role) {
  const facing = Math.cos(ang) >= 0 ? 1 : -1;
  const fx = facing === 1 ? PT_FOOT[0] : PT_W - 1 - PT_FOOT[0];
  g.drawImage(getPixelTrooper(FACTION[side], frame, facing, role), x - fx * ps, y - PT_FOOT[1] * ps, PT_W * ps, PT_H * ps);
}

export const OWNER = { 0: '#7fb6ff', 1: '#ff6a2a', null: '#d8d2c0' };
const ownerColour = (o) => OWNER[o === null || o === undefined ? 'null' : o];

export function createRenderer(map) {
  // Wire cells are few, so keep a list instead of scanning the whole grid.
  const wireCells = [];
  for (let i = 0; i < map.wire.length; i++) if (map.wire[i] > 0) wireCells.push(i);
  // facing, last drawn position and distance walked per soldier drive the animation.
  return { wireCells, facing: [], lastX: [], lastY: [], stride: [], badges: [], thumb: null, thumbAt: -1, vdist: [0, 0], vlast: [] };
}

const visible = (state, s, opts) => s.side === opts.playerSide || opts.reveal || state.sides[opts.playerSide].spotted[s.id];

export function drawFrame(g, r, state, cam, opts) {
  const { dpr, now, fxs, terrain } = opts;
  const z = cam.z;
  const px = 1 / z; // world units per screen pixel
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#1d1a15';
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  const sh = opts.shake || { x: 0, y: 0 };
  g.setTransform(dpr * z, 0, 0, dpr * z, (-cam.x * z + sh.x) * dpr, (-cam.y * z + sh.y) * dpr);

  LY = opts.tilt ? (x, y) => y - liftAt(state.map, x, y) : (x, y) => y;
  g.drawImage(terrain.canvas, 0, 0);
  drawWire(g, r, state, cam);
  drawSitesWorld(g, state, now, px, fxs);
  drawBodies(g, r, state, fxs, now, px, opts.view);
  drawTanks(g, state, now);
  drawGrid(g, state, cam, opts, px);
  drawOrderLine(g, state, opts, px);
  drawSoldiers(g, r, state, opts, px);
  drawSmoke(g, fxs, state.smokes, now, state.tick, state.cfg.tickRate);
  drawEffects(g, fxs, now, px);
  drawStrikes(g, state, now, px);
  drawMarker(g, opts, now, px);

  // Screen space: icons, badges and text stay the same size at any zoom.
  g.setTransform(dpr, 0, 0, dpr, sh.x * dpr, sh.y * dpr);
  drawSiteIcons(g, state, cam);
  r.badges = drawBadges(g, state, cam, opts);
  drawSquadLabels(g, state, cam, opts);
  drawMarks(g, state, cam, opts);
  drawFocus(g, state, cam, opts);
}

// Red brackets over enemies marked by recon.
// A red target over each enemy squad one of your platoons is focusing on.
function drawFocus(g, state, cam, opts) {
  const px = 1 / cam.z;
  const lift = opts.view === 'pixel' ? 40 * spriteScalePixel(px) : 12;
  for (const pl of state.platoons) {
    if (pl.side !== opts.playerSide || pl.focus < 0 || pl.broken || state.tick >= pl.focusUntil) continue;
    const list = state.squads[pl.focus].soldiers.map((id) => state.soldiers[id]).filter((e) => isActive(e) && visible(state, e, opts));
    if (!list.length) continue;
    const c = centroid(list);
    const p = toScreen(cam, c.x, LY(c.x, c.y) - lift);
    const r = 20 + 3 * Math.sin(opts.now * 5);
    g.strokeStyle = 'rgba(255,74,50,0.95)';
    g.lineWidth = 2.5;
    g.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.moveTo(p.x + sx * r, p.y + sy * (r - 7)); g.lineTo(p.x + sx * r, p.y + sy * r); g.lineTo(p.x + sx * (r - 7), p.y + sy * r);
    }
    g.stroke();
    g.fillStyle = 'rgba(255,74,50,0.95)';
    g.font = '700 10px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(pl.index + 1, p.x, p.y - r - 4);
  }
}

function drawMarks(g, state, cam, opts) {
  const px = 1 / cam.z;
  const lift = opts.view === 'pixel' ? 74 * spriteScalePixel(px) : opts.view === 'top' ? 10 : 26 * Math.max(1, 0.7 * px);
  g.strokeStyle = '#ff4a32';
  g.lineWidth = 2;
  for (const s of state.soldiers) {
    if (!isActive(s) || !(s.markUntil > state.tick) || !visible(state, s, opts)) continue;
    const p = toScreen(cam, s.x, LY(s.x, s.y) - lift);
    const r = 5;
    g.beginPath();
    g.moveTo(p.x - r, p.y - r + 3); g.lineTo(p.x - r, p.y - r); g.lineTo(p.x - r + 3, p.y - r);
    g.moveTo(p.x + r - 3, p.y - r); g.lineTo(p.x + r, p.y - r); g.lineTo(p.x + r, p.y - r + 3);
    g.moveTo(p.x, p.y + 1); g.lineTo(p.x - 3, p.y - 2); g.moveTo(p.x, p.y + 1); g.lineTo(p.x + 3, p.y - 2);
    g.stroke();
  }
}

function drawWire(g, r, state, cam) {
  const m = state.map;
  const x0 = cam.x - 20, x1 = cam.x + cam.vw / cam.z + 20;
  g.strokeStyle = '#1e1c19';
  g.lineWidth = 1.3;
  g.beginPath();
  for (const i of r.wireCells) {
    const hp = m.wire[i];
    if (hp <= 0) continue;
    const cx = (i % m.cols) * m.cell, cy = Math.floor(i / m.cols) * m.cell;
    if (cx < x0 || cx > x1) continue;
    const s = m.cell * (0.4 + 0.6 * hp);
    const ox = (i * 7) % 4, oy = (i * 13) % 4;
    g.moveTo(cx + ox, cy + oy); g.lineTo(cx + ox + s, cy + oy + s);
    g.moveTo(cx + ox + s, cy + oy); g.lineTo(cx + ox, cy + oy + s);
  }
  g.stroke();
  // Wire a tank has rolled flat: pressed into the mud, no longer a barrier.
  if (m.crushed) {
    g.strokeStyle = 'rgba(30,28,25,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    for (const i of r.wireCells) {
      if (!m.crushed[i]) continue;
      const cx = (i % m.cols) * m.cell, cy = Math.floor(i / m.cols) * m.cell;
      if (cx < x0 || cx > x1) continue;
      const oy = 3 + ((i * 13) % 5);
      g.moveTo(cx, cy + oy); g.lineTo(cx + m.cell, cy + oy + 1);
    }
    g.stroke();
  }
  // Posts.
  g.fillStyle = '#2c2925';
  for (const i of r.wireCells) {
    if (i % 5 || m.wire[i] <= 0) continue;
    const cx = (i % m.cols) * m.cell, cy = Math.floor(i / m.cols) * m.cell;
    if (cx < x0 || cx > x1) continue;
    g.fillRect(cx + 4, cy + 4, 3, 3);
  }
}

function drawSitesWorld(g, state, now, px, fxs) {
  for (const s0 of state.sites) {
    const s = lifted(s0);
    const col = ownerColour(s.owner);
    g.fillStyle = col;
    g.globalAlpha = s.kind === 'objective' ? 0.1 : 0.08;
    g.beginPath();
    g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = s.contested ? 0.6 + 0.4 * Math.sin(now * 10) : 0.85;
    g.strokeStyle = s.contested ? '#ffffff' : col;
    g.lineWidth = 2 * px;
    g.setLineDash([8 * px, 6 * px]);
    g.beginPath();
    g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    if (s.cap > 0 && s.capSide !== null) {
      g.strokeStyle = ownerColour(s.capSide);
      g.lineWidth = 5 * px;
      g.beginPath();
      g.arc(s.x, s.y, s.r, -Math.PI / 2, -Math.PI / 2 + s.cap * Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  for (const ring of fxs.rings) {
    const s = lifted(state.sites.find((x) => x.id === ring.site));
    const k = (now - ring.t0) / ring.life;
    g.strokeStyle = ownerColour(ring.side);
    g.globalAlpha = 1 - k;
    g.lineWidth = 4 * px;
    g.beginPath();
    g.arc(s.x, s.y, s.r * (1 + k * 0.6), 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
  }
}

function drawTanks(g, state, now) {
  for (const t0 of state.tanks) {
    const t = lifted(t0);
    if (t.exploded) {
      g.fillStyle = '#1a1612';
      g.beginPath();
      g.arc(t.x, t.y, 13, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#5c3a22';
      g.lineWidth = 2;
      g.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = k * 1.26 + 0.4;
        g.moveTo(t.x, t.y);
        g.lineTo(t.x + Math.cos(a) * 11, t.y + Math.sin(a) * 11);
      }
      g.stroke();
      continue;
    }
    const pulse = 0.5 + 0.5 * Math.sin(now * 3 + t.id);
    const glow = g.createRadialGradient(t.x, t.y, 2, t.x, t.y, 26);
    glow.addColorStop(0, `rgba(255,120,40,${0.35 + 0.25 * pulse})`);
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(t.x, t.y, 26, 0, Math.PI * 2);
    g.fill();
    // A squat cylinder seen from above and a little to the side.
    g.fillStyle = '#7a2c12';
    g.fillRect(t.x - 9, t.y - 6, 18, 12);
    g.fillStyle = '#c94a1c';
    g.beginPath();
    g.ellipse(t.x, t.y - 6, 9, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffb36b';
    g.fillRect(t.x - 2, t.y - 3, 4, 7);
    g.strokeStyle = '#2a1a10';
    g.lineWidth = 1.5;
    g.strokeRect(t.x - 9, t.y - 6, 18, 12);
  }
}

function platoonCentre(state, pl) {
  const list = [];
  for (const id of pl.squads) list.push(...members(state, state.squads[id]));
  return list.length ? centroid(list) : null;
}

// The order grid: faint tiles while a platoon is selected or a strike is
// being aimed, and the tiles the selected platoon's squads are heading for.
function drawGrid(g, state, cam, opts, px) {
  if (!opts.grid) return;
  const t = state.cfg.ui.tile;
  const x0 = Math.floor(cam.x / t) * t, y0 = Math.floor(cam.y / t) * t;
  const x1 = cam.x + cam.vw / cam.z, y1 = cam.y + cam.vh / cam.z;
  // Each tile sits at the height of its middle (so tiles on a hill rise with it).
  const ty = (x, y) => LY(x + t / 2, y + t / 2) - t / 2;
  g.strokeStyle = 'rgba(240,236,220,0.13)';
  g.lineWidth = px;
  g.beginPath();
  if (opts.tilt) {
    for (let x = Math.max(0, x0); x < Math.min(state.map.width, x1); x += t) for (let y = Math.max(0, y0); y < Math.min(state.map.height, y1 + 2 * t); y += t) g.rect(x, ty(x, y), t, t);
  } else {
    for (let x = x0; x <= x1; x += t) { g.moveTo(x, Math.max(0, y0)); g.lineTo(x, Math.min(state.map.height, y1)); }
    for (let y = y0; y <= y1; y += t) { g.moveTo(Math.max(0, x0), y); g.lineTo(Math.min(state.map.width, x1), y); }
  }
  g.stroke();
  // Cover preview: each tile is tinted by the best cover a squad could find
  // in it (green good, amber some), so you can see where to send them.
  const cov = state.cfg.cover;
  for (let x = Math.max(0, x0); x < Math.min(state.map.width, x1); x += t) {
    for (let y = Math.max(0, y0); y < Math.min(state.map.height, y1 + 2 * t); y += t) {
      let best = 0, high = false;
      for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.2, 0.5, 0.8]) {
        const name = coverName(state, x + t * fx, y + t * fy);
        best = Math.max(best, cov[name].hit);
        if (heightAt(state.map, x + t * fx, y + t * fy) > 0) high = true;
      }
      const level = best >= 0.5 ? 2 : best >= 0.3 || high ? 1 : 0;
      if (!level) continue;
      g.fillStyle = level === 2 ? 'rgba(120,230,120,0.16)' : 'rgba(240,200,80,0.12)';
      g.fillRect(x + px, ty(x, y) + px, t - 2 * px, t - 2 * px);
    }
  }
  const pl = opts.selected !== null && opts.selected !== undefined ? state.platoons[opts.selected] : null;
  if (!pl) return;
  const sq = opts.scope !== null && opts.scope !== undefined ? state.squads[opts.scope] : null;
  if (sq && sq.order && sq.order.type === 'move') {
    const cx = Math.floor(sq.order.x / t) * t, cy = ty(Math.floor(sq.order.x / t) * t, Math.floor(sq.order.y / t) * t);
    g.fillStyle = 'rgba(170,255,170,0.14)';
    g.fillRect(cx, cy, t, t);
    g.strokeStyle = 'rgba(170,255,170,0.65)';
    g.lineWidth = 1.5 * px;
    g.strokeRect(cx + px, cy + px, t - 2 * px, t - 2 * px);
    return;
  }
  if (pl.order.type !== 'move') return;
  // The platoon's tile and the ones above and below (one per squad).
  const cx = Math.floor(pl.order.x / t) * t, cy = Math.floor(pl.order.y / t) * t;
  for (const k of [-1, 0, 1]) {
    const yy = ty(cx, cy + k * t);
    g.fillStyle = 'rgba(170,255,170,0.14)';
    g.fillRect(cx, yy, t, t);
    g.strokeStyle = 'rgba(170,255,170,0.65)';
    g.lineWidth = 1.5 * px;
    g.strokeRect(cx + px, yy + px, t - 2 * px, t - 2 * px);
  }
}

function drawOrderLine(g, state, opts, px) {
  if (opts.selected === null || opts.selected === undefined) return;
  const pl = state.platoons[opts.selected];
  if (!pl) return;
  const line = (from, o, faint) => {
    if (!from || (o.type !== 'move' && o.type !== 'take')) return;
    g.strokeStyle = o.type === 'take' ? `rgba(255,224,120,${faint ? 0.45 : 0.8})` : `rgba(170,255,170,${faint ? 0.45 : 0.8})`;
    g.lineWidth = (faint ? 1.5 : 2) * px;
    g.setLineDash([10 * px, 8 * px]);
    g.beginPath();
    g.moveTo(from.x, LY(from.x, from.y));
    g.lineTo(o.x, LY(o.x, o.y));
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.arc(o.x, LY(o.x, o.y), 6 * px, 0, Math.PI * 2);
    g.stroke();
  };
  // The platoon's shared goal from the squads still following it, then a
  // line of its own for each squad sent somewhere else.
  const withPlatoon = pl.squads.map((id) => state.squads[id]).filter((q) => !q.order).flatMap((q) => members(state, q));
  line(withPlatoon.length ? centroid(withPlatoon) : null, pl.order, opts.scope !== null && opts.scope !== undefined);
  for (const id of pl.squads) {
    const q = state.squads[id];
    if (!q.order) continue;
    const ms = members(state, q);
    line(ms.length ? centroid(ms) : null, q.order, opts.scope !== null && opts.scope !== undefined && opts.scope !== q.id);
  }
}

// World units per sprite pixel: near true size close up, never smaller than
// about 0.7 of a screen pixel per sprite pixel when zoomed out, so soldiers stay visible.
const spriteScale = (px) => Math.max(1.1, 0.7 * px);
const WALK = ['walk1', 'stand', 'walk2', 'stand'];

const WALK25 = ['walk1', 'walk2', 'walk3', 'walk4'];
// 2.5D sprites are taller, so they use a slightly smaller pixel size.
const spriteScale25 = (px) => Math.max(1, 0.7 * px);

// Work out each soldier's facing and animation frame. Bookkeeping runs for
// everyone (seen or not) so animation stays in step when they come into view.
const vehicleSeen = (state, v, opts) => v.side === opts.playerSide || opts.reveal || v.spotted[opts.playerSide];

// One tank: sprite frame from how far it has driven, a firing frame just
// after a shot, a burnt wreck once destroyed, smoke when badly damaged.
function drawVehicle(g, r, state, v, ps, opts) {
  const last = r.vlast[v.id];
  if (last) r.vdist[v.id] += Math.hypot(v.x - last.x, v.y - last.y);
  r.vlast[v.id] = { x: v.x, y: v.y };
  const ticks = state.tick - v.lastFireTick;
  let frame = 'idle';
  if (!v.alive) frame = 'wreck';
  else if (ticks >= 0 && ticks < 5) frame = 'fire';
  else if (v.moved > 0) frame = 'move' + (1 + (Math.floor(r.vdist[v.id] / 4) % 4));
  const fx = v.facing === 1 ? TANK_FOOT[0] : TANK_W - TANK_FOOT[0];
  v = lifted(v);
  const x0 = v.x - fx * ps, y0 = v.y - TANK_FOOT[1] * ps;
  g.fillStyle = 'rgba(15,12,8,0.35)';
  g.beginPath();
  g.ellipse(v.x, v.y - 2 * ps, 96 * ps, 16 * ps, 0, 0, Math.PI * 2);
  g.fill();
  if (v.alive && opts.vehicleSelected && v.side === opts.playerSide) {
    g.strokeStyle = 'rgba(255,240,170,0.9)';
    g.lineWidth = 1.6 / Math.max(0.2, 1 / ps);
    g.beginPath();
    g.ellipse(v.x, v.y, 110 * ps, 26 * ps, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.drawImage(getTank(FACTION[v.side], frame, v.facing), x0, y0, TANK_W * ps, TANK_H * ps);
  if (opts.now - (opts.fxs.lastVehicleHit?.get(v.id) ?? -9) < 0.1) {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.6;
    g.drawImage(getTank(FACTION[v.side], frame, v.facing), x0, y0, TANK_W * ps, TANK_H * ps);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
  // Smoke from a damaged hull (thick and black from a wreck).
  const hurt = v.alive ? 1 - v.hp / v.maxHp : 1;
  if (hurt > 0.5) {
    const n = v.alive ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const k = ((opts.now * 0.45 + i / n) % 1);
      g.fillStyle = `rgba(${v.alive ? '70,66,60' : '35,32,30'},${(v.alive ? 0.45 : 0.55) * (1 - k)})`;
      g.beginPath();
      g.arc(v.x + (i % 2 ? 8 : -6) * ps * 2 + k * 18, v.y - 70 * ps - k * 60, (6 + k * 16) * Math.max(1, ps * 2), 0, Math.PI * 2);
      g.fill();
    }
  }
  if (v.alive) {
    // A slim health bar over the tank.
    const w = 84 * ps, h = Math.max(2, 6 * ps), bx = v.x - w / 2, by = y0 + 12 * ps;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(bx - 1, by - 1, w + 2, h + 2);
    g.fillStyle = v.hp / v.maxHp > 0.5 ? OWNER[v.side] : v.hp / v.maxHp > 0.25 ? '#e8c04a' : '#e0412a';
    g.fillRect(bx, by, w * Math.max(0, v.hp / v.maxHp), h);
  }
}

function animate(r, state, opts) {
  const out = [];
  const lastShot = opts.fxs.lastShot;
  const top = opts.view === 'top';
  for (const s of state.soldiers) {
    if (!isActive(s)) continue;
    const moved = r.lastX[s.id] === undefined ? 0 : Math.hypot(s.x - r.lastX[s.id], s.y - r.lastY[s.id]);
    r.lastX[s.id] = s.x;
    r.lastY[s.id] = s.y;
    r.stride[s.id] = (r.stride[s.id] || 0) + moved;
    // Face the target if shooting, otherwise the way they are walking.
    let ang = r.facing[s.id];
    if (s.target >= 0 && state.soldiers[s.target].alive) {
      const t = state.soldiers[s.target];
      ang = Math.atan2(t.y - s.y, t.x - s.x);
    } else if (Math.hypot(s.tx - s.x, s.ty - s.y) > 2) ang = Math.atan2(s.ty - s.y, s.tx - s.x);
    if (ang === undefined) ang = s.side === 0 ? 0 : Math.PI;
    r.facing[s.id] = ang;
    if (!visible(state, s, opts)) continue;
    const sq = state.squads[s.squad];
    const stride = r.stride[s.id];
    let frame = 'stand';
    if (sq.pinned && sq.mode !== 'rout') frame = sq.mode === 'crawl' && moved > 0.01 && Math.floor(stride / 3) % 2 ? 'prone2' : 'prone1';
    else if (opts.now - (lastShot.get(s.id) ?? -9) < 0.09) frame = 'fire';
    else if (moved > 0.01) frame = top ? WALK[Math.floor(stride / 3.5) % 4] : WALK25[Math.floor(stride / 3) % 4];
    // Jetpack troopers fly when moving (or diving): jets on, held aloft.
    if (!top && state.cfg.roles[s.role].flies && (moved > 0.01 || sq.mode === 'dive') && !frame.startsWith('prone')) frame = (Math.floor(opts.now * 12) % 2) ? 'fly2' : 'fly1';
    out.push({ s, sq, frame, dir: dirIndex(ang), ang });
  }
  return out;
}

function drawSoldiers(g, r, state, opts, px) {
  const list = animate(r, state, opts);
  const sel = opts.selected;
  g.imageSmoothingEnabled = false;
  if (opts.view === 'top') {
    const size = SPRITE_SIZE * spriteScale(px);
    for (const { s, sq, frame, dir } of list) {
      g.globalAlpha = sq.mode === 'rout' ? 0.6 : 1;
      const sy = LY(s.x, s.y);
      if (sel === sq.platoon) {
        g.strokeStyle = 'rgba(255,240,170,0.9)';
        g.lineWidth = 1.6 * px;
        g.beginPath();
        g.arc(s.x, sy, size * 0.42, 0, Math.PI * 2);
        g.stroke();
      }
      g.drawImage(getSprite(s.side, s.role, frame, dir), s.x - size / 2, sy - size / 2, size, size);
    }
    g.globalAlpha = 1;
    for (const v of state.vehicles || []) if (vehicleSeen(state, v, opts)) drawVehicle(g, r, state, v, spriteScalePixel(px), opts);
    return;
  }
  // 2.5D: soldiers stand up off the ground, so draw the ones further up the
  // screen first and let nearer ones overlap them. Feet sit on the position.
  const pixel = opts.view === 'pixel';
  const ps = pixel ? spriteScalePixel(px) : spriteScale25(px);
  const foot = pixel ? 2.4 : 1; // shadows and rings scale with the figure
  list.sort((a, b) => a.s.y - b.s.y || a.s.id - b.s.id);
  const tanks = (state.vehicles || []).filter((v) => vehicleSeen(state, v, opts)).sort((a, b) => a.y - b.y);
  for (const { s, sq } of list) {
    const sy = LY(s.x, s.y);
    g.fillStyle = 'rgba(15,12,8,0.35)';
    g.beginPath();
    g.ellipse(s.x, sy + 0.5 * ps, 6 * ps * foot, 2.6 * ps * foot, 0, 0, Math.PI * 2);
    g.fill();
    if (sel === sq.platoon) {
      const dim = opts.scope !== null && opts.scope !== undefined && opts.scope !== sq.id;
      g.strokeStyle = dim ? 'rgba(255,240,170,0.3)' : 'rgba(255,240,170,0.9)';
      g.lineWidth = (dim ? 1 : 1.6) * px;
      g.beginPath();
      g.ellipse(s.x, sy + 0.5 * ps, 8 * ps * foot, 3.6 * ps * foot, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  let ti = 0;
  for (const { s, sq, frame, dir, ang } of list) {
    while (ti < tanks.length && tanks[ti].y <= s.y) drawVehicle(g, r, state, tanks[ti++], pixel ? ps : ps * 1.4, opts);
    g.globalAlpha = sq.mode === 'rout' ? 0.6 : 1;
    const sy = LY(s.x, s.y);
    if (pixel) {
      // Jetpack troopers in the air are drawn above their shadow; infiltrators
      // still hidden from the enemy are drawn faded on their own side.
      const lift = frame.startsWith('fly') ? (sq.mode === 'dive' ? 34 : 16) * ps : 0;
      const role = state.cfg.roles[s.role];
      const hidden = role.hidden && (sq.vanishUntil > state.tick || state.tick - s.lastShotTick > role.revealSec * state.cfg.tickRate);
      if (hidden) g.globalAlpha = 0.5;
      drawTrooper(g, s.side, frame, ang, s.x, sy - lift, ps, s.role);
      if (hidden) g.globalAlpha = 1;
      // Hit flash: draw the soldier again, added on top, for a split second.
      if (opts.now - (opts.fxs.lastHit.get(s.id) ?? -9) < 0.1) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.7;
        drawTrooper(g, s.side, frame, ang, s.x, sy - lift, ps, s.role);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
      }
      continue;
    }
    g.drawImage(getSprite25(s.side, s.role, frame, dir), s.x - ANCHOR_X * ps, sy - ANCHOR_Y * ps, W25 * ps, H25 * ps);
  }
  g.globalAlpha = 1;
  while (ti < tanks.length) drawVehicle(g, r, state, tanks[ti++], pixel ? ps : ps * 1.4, opts);
}

// The fallen: a quick topple, then they stay where they dropped.
function drawBodies(g, r, state, fxs, now, px, view) {
  const top = view === 'top';
  const size = SPRITE_SIZE * spriteScale(px);
  const ps = spriteScale25(px);
  g.imageSmoothingEnabled = false;
  for (const b of fxs.bodies) {
    if (b.dir === null) {
      b.ang = r.facing[b.id] ?? (b.side === 0 ? 0 : Math.PI);
      b.dir = dirIndex(b.ang);
    }
    const t = now - b.t0;
    const frame = t < 0.12 ? 'fall1' : t < 0.26 ? 'fall2' : 'dead';
    const role = state.soldiers[b.id].role;
    if (top) g.drawImage(getSprite(b.side, role, frame, b.dir), b.x - size / 2, b.y - size / 2, size, size);
    else if (view === 'pixel') drawTrooper(g, b.side, frame, b.ang, b.x, b.y, spriteScalePixel(px), role);
    else g.drawImage(getSprite25(b.side, role, frame, b.dir), b.x - ANCHOR_X * ps, b.y - ANCHOR_Y * ps, W25 * ps, H25 * ps);
  }
}

function drawStrikes(g, state, now, px) {
  const a = state.cfg.artillery;
  for (const st0 of state.strikes) {
    const st = lifted(st0);
    const incoming = state.tick < st.start;
    const pulse = 0.5 + 0.5 * Math.sin(now * 12);
    g.strokeStyle = `rgba(255,60,40,${incoming ? 0.5 + 0.5 * pulse : 0.35})`;
    g.lineWidth = 2.5 * px;
    g.setLineDash([12 * px, 8 * px]);
    g.beginPath();
    g.arc(st.x, st.y, a.radius, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.moveTo(st.x - 12 * px, st.y); g.lineTo(st.x + 12 * px, st.y);
    g.moveTo(st.x, st.y - 12 * px); g.lineTo(st.x, st.y + 12 * px);
    g.stroke();
  }
}

function drawMarker(g, opts, now, px) {
  if (!opts.marker) return;
  const m = lifted(opts.marker);
  const k = (now - m.t0) / 0.7;
  if (k > 1) return;
  g.strokeStyle = m.colour;
  g.globalAlpha = 1 - k;
  g.lineWidth = 3 * px;
  g.beginPath();
  g.arc(m.x, m.y, (8 + 30 * k) * px, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
}

// Little drawn icons for the capturable features and objective letters.
function drawSiteIcons(g, state, cam) {
  for (const s of state.sites) {
    const p = toScreen(cam, s.x, LY(s.x, s.y));
    if (p.x < -40 || p.y < -40 || p.x > cam.vw + 40 || p.y > cam.vh + 40) continue;
    const col = ownerColour(s.owner);
    g.save();
    g.translate(p.x, p.y);
    if (s.kind === 'objective') {
      g.fillStyle = 'rgba(20,18,14,0.75)';
      g.beginPath();
      g.arc(0, 0, 15, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = col;
      g.lineWidth = 2.5;
      g.stroke();
      g.fillStyle = col;
      g.font = 'bold 16px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(s.id, 0, 1);
    } else {
      g.fillStyle = 'rgba(20,18,14,0.7)';
      g.beginPath();
      g.arc(0, 0, 13, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = col;
      g.fillStyle = col;
      g.lineWidth = 2;
      g.stroke();
      if (s.kind === 'mg') {
        g.beginPath(); g.arc(0, 3, 7, Math.PI, 0); g.stroke(); // sandbags
        g.fillRect(-1, -6, 2, 8); // gun
        g.fillRect(-1, -7, 8, 2);
      } else if (s.kind === 'arc') {
        g.beginPath(); g.moveTo(-5, 8); g.lineTo(0, -8); g.lineTo(5, 8); g.stroke();
        g.beginPath(); g.moveTo(-4, -3); g.lineTo(1, -1); g.lineTo(-2, 2); g.lineTo(4, 5); g.stroke();
      } else if (s.kind === 'comms') {
        g.beginPath(); g.moveTo(0, 8); g.lineTo(0, -6); g.stroke();
        g.beginPath(); g.arc(0, -6, 5, -2.6, -0.5); g.stroke();
        g.beginPath(); g.arc(0, -6, 9, -2.5, -0.6); g.stroke();
      }
    }
    g.restore();
  }
}

function drawBadges(g, state, cam, opts) {
  const out = [];
  g.font = 'bold 11px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const pl of state.platoons) {
    const list = [];
    for (const id of pl.squads) for (const s of members(state, state.squads[id])) if (visible(state, s, opts)) list.push(s);
    if (!list.length) continue;
    const c = centroid(list);
    const p = toScreen(cam, c.x, LY(c.x, c.y) - 40);
    const col = sideColours(pl.side);
    const isSel = opts.selected === pl.id;
    const w = 20, h = 16;
    g.fillStyle = pl.broken ? 'rgba(40,36,30,0.85)' : pl.side === 0 ? '#2b4a70' : '#2a1d18';
    const pinned = !pl.broken && pl.squads.some((id) => state.squads[id].pinned);
    g.strokeStyle = isSel ? '#fff0a8' : pinned ? '#ff5a4a' : col.light;
    g.lineWidth = isSel ? 2.5 : 1.5;
    g.beginPath();
    g.roundRect(p.x - w / 2, p.y - h / 2, w, h, 4);
    g.fill();
    g.stroke();
    g.fillStyle = pl.side === 0 ? '#e6f1ff' : '#ffb08a';
    g.fillText(pl.broken ? '\u2716' : String(pl.index + 1), p.x, p.y + 0.5);
    if (pinned) {
      // A small red warning tab: one of this platoon's squads is pinned.
      g.fillStyle = '#d93a2b';
      g.beginPath();
      g.arc(p.x + w / 2 + 1, p.y - h / 2, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = 'bold 9px system-ui, sans-serif';
      g.fillText('!', p.x + w / 2 + 1, p.y - h / 2 + 0.5);
      g.font = 'bold 11px system-ui, sans-serif';
    }
    out.push({ platoon: pl.id, side: pl.side, x: p.x, y: p.y });
  }
  return out;
}

function drawSquadLabels(g, state, cam, opts) {
  const show = (pl) => pl.id === opts.selected || (opts.labelsAll && !pl.broken);
  g.font = '10px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const pl of state.platoons) {
    if (!show(pl)) continue;
    for (const id of pl.squads) {
      const sq = state.squads[id];
      const list = members(state, sq).filter((s) => visible(state, s, opts));
      if (!list.length) continue;
      const c = centroid(list);
      const p = toScreen(cam, c.x, LY(c.x, c.y) + 18);
      const text = `${state.cfg.roles[sq.role].label}: ${sq.status}`;
      const w = g.measureText(text).width + 10;
      g.fillStyle = sq.pinned ? 'rgba(120,20,15,0.85)' : 'rgba(15,14,12,0.75)';
      g.beginPath();
      g.roundRect(p.x - w / 2, p.y - 7, w, 14, 7);
      g.fill();
      g.fillStyle = '#f2ede0';
      g.fillText(text, p.x, p.y + 0.5);
    }
  }
}

// Whole map in a strip: terrain thumbnail, sites, troops and the view box.
export function drawMinimap(g, r, state, cam, opts) {
  const { dpr, terrain } = opts;
  const cw = g.canvas.width / dpr, ch = g.canvas.height / dpr;
  const sx = cw / state.map.width, sy = ch / state.map.height;
  if (!r.thumb || opts.now - r.thumbAt > 2) {
    r.thumb = r.thumb || document.createElement('canvas');
    r.thumb.width = Math.round(cw * dpr);
    r.thumb.height = Math.round(ch * dpr);
    r.thumb.getContext('2d').drawImage(terrain.canvas, 0, 0, r.thumb.width, r.thumb.height);
    r.thumbAt = opts.now;
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(r.thumb, 0, 0);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 0, cw, ch);
  for (const s of state.sites) {
    g.fillStyle = ownerColour(s.owner);
    g.beginPath();
    g.arc(s.x * sx, s.y * sy, s.kind === 'objective' ? 4 : 2.5, 0, Math.PI * 2);
    g.fill();
  }
  for (const s of state.soldiers) {
    if (!isActive(s) || !visible(state, s, opts)) continue;
    g.fillStyle = s.side === 0 ? '#bcd9ff' : '#ff7a3a';
    g.fillRect(s.x * sx - 1, s.y * sy - 1, 2, 2);
  }
  for (const v of state.vehicles || []) {
    if (!vehicleSeen(state, v, opts)) continue;
    g.fillStyle = v.alive ? (v.side === 0 ? '#bcd9ff' : '#ff7a3a') : '#555';
    g.strokeStyle = '#000';
    g.lineWidth = 1;
    g.fillRect(v.x * sx - 3.5, v.y * sy - 2.5, 7, 5);
    g.strokeRect(v.x * sx - 3.5, v.y * sy - 2.5, 7, 5);
  }
  for (const st of state.strikes) {
    g.strokeStyle = '#ff3b2a';
    g.beginPath();
    g.arc(st.x * sx, st.y * sy, 4, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = '#ffffff';
  g.lineWidth = 1.5;
  g.strokeRect(cam.x * sx, cam.y * sy, (cam.vw / cam.z) * sx, (cam.vh / cam.z) * sy);
}
