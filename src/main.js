// Wires the simulation, renderer and UI together and owns the game loop.
// The sim advances in fixed 1/30 second ticks; drawing happens every frame.

import { CONFIG, RULES, SIDE_NAMES, ABILITY_HELP } from './config.js';
import { ABILITY_OF } from './sim/abilities.js';
import { createMatch, issue, advance } from './sim/match.js';
import { createAI } from './sim/ai.js';
import { fingerprint } from './sim/battle.js';
import { seedFrom } from './sim/rng.js';
import { wireAt } from './sim/map.js';
import { isActive, coverName, dist } from './sim/util.js';
import { createCamera, setViewport, toWorld, centreOn, clampCamera } from './render/camera.js';
import { buildTerrain } from './render/terrain.js';
import { createRenderer, drawFrame, drawMinimap } from './render/renderer.js';
import { createEffects, ingest, prune, shakeOffset } from './render/effects.js';
import { createAudio, unlockAudio, newFrame, playEvents, uiClick } from './render/audio.js';
import { attachMapInput, attachMinimapInput } from './ui/input.js';
import { createUI, updateUI, toast, flashOrderPoints, openOverlay, closeOverlay, showEnd, resetFeed } from './ui/ui.js';

const PLAYER = 0;
const STANCES = ['cautious', 'balanced', 'aggressive'];

const store = {
  get(k, d) { try { const v = localStorage.getItem('kz.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kz.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const mapCanvas = document.getElementById('map');
const miniCanvas = document.getElementById('minimap');
const g = mapCanvas.getContext('2d');
const mg = miniCanvas.getContext('2d');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const game = {
  match: null, seed: null, options: null, terrain: null, renderer: null, fxs: null, cam: null,
  watch: store.get('watch', false), labelsAll: store.get('labels', false), grid: store.get('grid', true), slowMo: store.get('slowMo', true), view: store.get('soldierStyle', 'pixel'), lengthSec: store.get('length', 600),
  replay: false, original: null, paused: false, speed: 1, selected: null, armed: null, marker: null, endShown: false,
  acc: 0, last: performance.now(), dpr: 1,
};
window.__kz = game; // handy for debugging and browser tests
const audio = createAudio();
audio.enabled = store.get('sound', true);
game.audio = audio; // for browser tests
// Sound can only start after a touch; buttons click.
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, () => unlockAudio(audio), { passive: true });
document.addEventListener('click', (e) => { if (e.target.closest('button')) uiClick(audio); });

const ui = createUI({
  selectCard(i) {
    const pl = game.match.state.platoons.filter((p) => p.side === PLAYER)[i];
    if (!pl || game.replay) return;
    if (game.watch) { focusPlatoon(pl); return; }
    game.selected = game.selected === pl.id ? null : pl.id;
    game.armed = null;
    if (game.selected !== null) focusPlatoon(pl);
  },
  action,
  ability(platoon, role) {
    if (game.replay || game.watch) return;
    if (order('ability', { platoon, role })) {
      const st = game.match.state;
      const key = ABILITY_OF[role];
      toast(ui, st.cfg.abilities[key].label, ABILITY_HELP[key]);
    }
  },
  togglePause() { game.paused = !game.paused; game.planning = false; },
  cycleSpeed() {
    const opts = game.watch || game.replay ? [1, 2, 4] : [1, 2];
    game.speed = opts[(opts.indexOf(game.speed) + 1) % opts.length] || 1;
  },
  openMenu,
});

function newSeed() {
  return String(Math.floor(Math.random() * 900000) + 100000);
}

function controllersFor(watch) {
  return watch ? [createAI(0), createAI(1)] : [createAI(1)];
}

function startBattle(seed, { replayLog = null } = {}) {
  game.seed = seed;
  game.options = replayLog ? replayLog.options : { config: { battle: { durationSec: game.lengthSec } } };
  game.replay = !!replayLog;
  game.match = createMatch({ seed, options: game.options, controllers: replayLog ? [] : controllersFor(game.watch), replayLog });
  const st = game.match.state;
  game.terrain = buildTerrain(st.map, seedFrom(seed));
  game.renderer = createRenderer(st.map);
  game.fxs = createEffects();
  game.fxs.terrain = game.terrain;
  game.fxs.reduced = reduceMotion.matches;
  game.cam = createCamera(st.map.width, st.map.height);
  game.selected = null;
  game.armed = null;
  game.marker = null;
  game.endShown = false;
  // Battles open paused for planning (not replays or watch mode): give your
  // opening orders, then press play.
  game.planning = !replayLog && !game.watch;
  game.paused = game.planning;
  game.acc = 0;
  if (!game.replay) game.speed = 1;
  resetFeed(ui);
  closeOverlay('overlay-end');
  resize();
  // Open on the ISA lines, a little zoomed in from the full height.
  // Open close enough to see the troopers, on the ISA lines.
  game.cam.z = Math.min(game.cam.maxZ, (game.cam.vh / st.map.height) * 2);
  clampCamera(game.cam);
  centreOn(game.cam, 260, st.map.height / 2);
  keepAwake(true);
  try { history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}`); } catch { /* file:// */ }
}

function resize() {
  const stage = mapCanvas.parentElement;
  const w = stage.clientWidth, h = stage.clientHeight;
  game.dpr = Math.min(2, window.devicePixelRatio || 1);
  mapCanvas.width = Math.round(w * game.dpr);
  mapCanvas.height = Math.round(h * game.dpr);
  miniCanvas.width = Math.round(miniCanvas.clientWidth * game.dpr);
  miniCanvas.height = Math.round(miniCanvas.clientHeight * game.dpr);
  if (game.renderer) game.renderer.thumb = null;
  if (game.cam) setViewport(game.cam, w, h);
}
new ResizeObserver(() => resize()).observe(mapCanvas.parentElement);

// ---- Orders -------------------------------------------------------------

function order(type, params) {
  const res = issue(game.match, PLAYER, type, params);
  if (!res.ok) {
    toast(ui, 'Order refused', res.reason, true);
    if (/order points/.test(res.reason)) flashOrderPoints(ui);
  }
  return res.ok;
}

function action(act) {
  if (game.replay || game.watch) return;
  const st = game.match.state;
  const pl = game.selected !== null ? st.platoons[game.selected] : null;
  if (act === 'artillery' || act === 'smoke') {
    game.armed = game.armed === act ? null : act;
    return;
  }
  if (!pl) { toast(ui, 'Select a platoon first', 'Tap one of the three platoon cards.'); return; }
  if (act === 'hold' || act === 'fallback') order(act, { platoon: pl.id });
  if (act === 'reinforce' && order('reinforce', { platoon: pl.id })) toast(ui, 'Reinforcements', `Fresh soldiers are on their way to ${pl.name}'s weakest squad.`);
  if (act === 'stance') {
    const nextStance = STANCES[(STANCES.indexOf(pl.stance) + 1) % STANCES.length];
    if (order('stance', { platoon: pl.id, stance: nextStance })) {
      const help = { cautious: 'Squads pause longer in cover and drop down early under fire. Slower, fewer losses.', balanced: 'A steady advance.', aggressive: 'Squads push through fire and barely pause. Fast, but costly.' };
      toast(ui, `${pl.name}: ${st.cfg.stances[nextStance].label}`, help[nextStance]);
    }
  }
}

function focusPlatoon(pl) {
  const st = game.match.state;
  const list = pl.squads.flatMap((id) => st.squads[id].soldiers.map((s) => st.soldiers[s])).filter(isActive);
  if (!list.length) return;
  const x = list.reduce((a, s) => a + s.x, 0) / list.length, y = list.reduce((a, s) => a + s.y, 0) / list.length;
  const cam = game.cam;
  const sx = (x - cam.x) * cam.z, sy = (y - cam.y) * cam.z;
  // Only move the view if the platoon is off screen.
  if (sx < 30 || sy < 30 || sx > cam.vw - 30 || sy > cam.vh - 30) centreOn(cam, x, y);
}

// In 2.5D a soldier's body is drawn above their feet, so aim taps at the chest.
function bodyLift() {
  if (game.view === 'top') return 0;
  if (game.view === 'pixel') return 30 * Math.max(0.42, 0.3 / game.cam.z);
  return 9 * Math.max(1, 0.7 / game.cam.z);
}

// The objective or post under a tap, measured on screen: each one can be hit
// within its ring or a finger-sized circle round its icon, and when icons
// overlap (zoomed right out) the one nearest the finger wins.
function siteAt(state, w) {
  const z = game.cam.z;
  let best = null, bd = Infinity;
  for (const s of state.sites) {
    const d = dist(s, w) * z; // screen pixels
    const reach = Math.max(s.r * z, s.kind === 'objective' ? 22 : 18);
    if (d <= reach && d < bd) { bd = d; best = s; }
  }
  return best;
}

function onTap(sx, sy) {
  const st = game.match.state;
  const w = toWorld(game.cam, sx, sy);
  const px = 1 / game.cam.z;
  if (!game.replay && !game.watch) {
    if (game.armed) {
      const type = game.armed;
      game.armed = null;
      if (order(type, { x: w.x, y: w.y })) game.marker = { x: w.x, y: w.y, t0: performance.now() / 1000, colour: type === 'artillery' ? '#ff4a3a' : '#e0e0e0' };
      return;
    }
    const badge = game.renderer.badges.find((b) => b.side === PLAYER && Math.hypot(b.x - sx, b.y - sy) < 20);
    if (badge) { game.selected = badge.platoon; return; }
    let near = null, nd = 18 * px;
    const lift = bodyLift();
    for (const s of st.soldiers) {
      if (s.side !== PLAYER || !isActive(s)) continue;
      const d = Math.hypot(s.x - w.x, s.y - lift - w.y);
      if (d < nd) { nd = d; near = s; }
    }
    if (near) {
      const pid = st.squads[near.squad].platoon;
      if (pid !== game.selected) { game.selected = pid; return; }
    }
    if (game.selected !== null) {
      const pl = st.platoons[game.selected];
      const site = siteAt(st, w);
      // Move orders snap to the centre of a grid tile (Bad North style), so
      // where the platoon will stand is clear and taps land cleanly.
      const t = CONFIG.ui.tile;
      const snap = game.grid ? { x: Math.floor(w.x / t) * t + t / 2, y: Math.floor(w.y / t) * t + t / 2 } : w;
      const ok = site ? order('take', { platoon: pl.id, site: site.id }) : order('move', { platoon: pl.id, x: snap.x, y: snap.y });
      if (ok && !site) { game.marker = { x: snap.x, y: snap.y, t0: performance.now() / 1000, colour: '#aaffaa' }; return; }
      if (ok) game.marker = { x: site ? site.x : w.x, y: site ? site.y : w.y, t0: performance.now() / 1000, colour: site ? '#ffe078' : '#aaffaa' };
      return;
    }
  }
  inspect(sx, sy);
}

// Explain whatever is under the finger: one clear rule per thing.
function inspect(sx, sy) {
  const st = game.match.state;
  const w = toWorld(game.cam, sx, sy);
  const px = 1 / game.cam.z;
  const reveal = game.watch || game.replay;
  let sol = null, sd = 16 * px;
  const lift = bodyLift();
  for (const s of st.soldiers) {
    if (!isActive(s) || (s.side !== PLAYER && !reveal && !st.sides[PLAYER].spotted[s.id])) continue;
    const d = Math.hypot(s.x - w.x, s.y - lift - w.y);
    if (d < sd) { sd = d; sol = s; }
  }
  if (sol) {
    const sq = st.squads[sol.squad];
    const pl = st.platoons[sq.platoon];
    toast(ui, `${SIDE_NAMES[sol.side]} ${st.cfg.roles[sq.role].label} squad, ${pl.name}`, `${sq.status}. Stance: ${st.cfg.stances[pl.stance].label}.`);
    return;
  }
  const tank = st.tanks.find((t) => Math.hypot(t.x - w.x, t.y - w.y) < Math.max(20, 22 * px));
  if (tank) {
    toast(ui, RULES.tank[0], tank.exploded ? 'Already burnt out.' : RULES.tank[1]);
    return;
  }
  const site = siteAt(st, w);
  if (site) {
    const [title, rule] = RULES[site.kind];
    const owner = site.owner === null ? 'Nobody holds it yet.' : `Held by ${SIDE_NAMES[site.owner]}.`;
    toast(ui, site.kind === 'objective' ? `Objective ${site.id}` : title, `${rule} ${owner}`);
    return;
  }
  if (wireAt(st.map, w.x, w.y) > 0) { toast(ui, ...RULES.wire); return; }
  toast(ui, ...RULES[coverName(st, w.x, w.y)]);
}

attachMapInput(mapCanvas, new Proxy({}, { get: (_, k) => game.cam[k], set: (_, k, v) => { game.cam[k] = v; return true; } }), {
  onTap,
  onLongPress: inspect,
});
attachMinimapInput(miniCanvas, new Proxy({}, { get: (_, k) => game.cam[k], set: (_, k, v) => { game.cam[k] = v; return true; } }), 3000, 1100);

// ---- Menu and end screen ----------------------------------------------------

let pausedBeforeMenu = false;
function openMenu() {
  pausedBeforeMenu = game.paused;
  game.paused = true;
  document.getElementById('seed-input').value = game.seed;
  document.getElementById('length-select').value = String(game.lengthSec);
  document.getElementById('watch-toggle').checked = game.watch;
  document.getElementById('labels-toggle').checked = game.labelsAll;
  document.getElementById('view-select').value = game.view;
  document.getElementById('slowmo-toggle').checked = game.slowMo;
  document.getElementById('sound-toggle').checked = audio.enabled;
  document.getElementById('grid-toggle').checked = game.grid;
  openOverlay('overlay-menu');
}
document.getElementById('overlay-menu').addEventListener('click', (e) => {
  if (e.target.matches('[data-close]')) game.paused = pausedBeforeMenu;
});
document.getElementById('overlay-help').addEventListener('click', (e) => {
  if (e.target.matches('[data-close]')) { store.set('seenHelp', true); game.paused = pausedBeforeMenu; }
});
document.getElementById('length-select').addEventListener('change', (e) => {
  game.lengthSec = Number(e.target.value);
  store.set('length', game.lengthSec);
});
document.getElementById('watch-toggle').addEventListener('change', (e) => {
  game.watch = e.target.checked;
  store.set('watch', game.watch);
  if (!game.replay) game.match.controllers = controllersFor(game.watch);
  game.selected = null;
  game.armed = null;
});
document.getElementById('grid-toggle').addEventListener('change', (e) => {
  game.grid = e.target.checked;
  store.set('grid', game.grid);
});
document.getElementById('sound-toggle').addEventListener('change', (e) => {
  audio.enabled = e.target.checked;
  store.set('sound', audio.enabled);
  unlockAudio(audio);
  uiClick(audio); // a click to confirm sound works
});
document.getElementById('slowmo-toggle').addEventListener('change', (e) => {
  game.slowMo = e.target.checked;
  store.set('slowMo', game.slowMo);
});
document.getElementById('view-select').addEventListener('change', (e) => {
  game.view = e.target.value;
  store.set('soldierStyle', game.view);
});
document.getElementById('labels-toggle').addEventListener('change', (e) => {
  game.labelsAll = e.target.checked;
  store.set('labels', game.labelsAll);
});
const menuSeed = () => document.getElementById('seed-input').value.trim() || newSeed();
document.getElementById('btn-new').addEventListener('click', () => { closeOverlay('overlay-menu'); startBattle(newSeed()); });
document.getElementById('btn-restart').addEventListener('click', () => { closeOverlay('overlay-menu'); startBattle(menuSeed()); });
document.getElementById('btn-help').addEventListener('click', () => { closeOverlay('overlay-menu'); openOverlay('overlay-help'); });
document.getElementById('btn-replay').addEventListener('click', () => {
  const src = game.replay ? game.original : { log: game.match.log, print: fingerprint(game.match.state) };
  game.original = src;
  startBattle(src.log.seed, { replayLog: JSON.parse(JSON.stringify(src.log)) });
  game.speed = 2;
});
document.getElementById('btn-end-restart').addEventListener('click', () => startBattle(game.replay ? game.original.log.seed : game.seed));
document.getElementById('btn-end-new').addEventListener('click', () => startBattle(newSeed()));

// ---- Screen wake lock -------------------------------------------------------

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* not supported or refused; harmless */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') game.paused = true;
  else if (game.match && !game.match.state.result) keepAwake(true);
});
document.addEventListener('pointerdown', () => { if (game.match && !game.match.state.result) keepAwake(true); }, { once: true });

// ---- Game loop --------------------------------------------------------------

function hintText() {
  if (game.replay || game.watch) return '';
  if (game.planning && game.selected === null && !game.armed) return 'Plan your opening: give your platoons orders, then press \u25B6 (top right) to begin.';
  if (game.armed === 'artillery') return 'Tap where the shells should land. They hit everyone, yours too.';
  if (game.armed === 'smoke') return 'Tap where to drop smoke. It blocks sight for a while.';
  if (game.selected !== null) return `${game.match.state.platoons[game.selected].name}: tap an objective to take it, or ground to move (slowed while you decide)`;
  return 'Tap a platoon card to command it. Press and hold anything to learn what it does.';
}

function frame(t) {
  const now = t / 1000;
  const dt = Math.min(0.25, now - game.last / 1000);
  game.last = t;
  const m = game.match;
  const st = m.state;
  const tickDt = 1 / st.cfg.tickRate;
  // Slow motion while giving orders, so there is time to think on a phone.
  newFrame(audio);
  const slow = game.slowMo && !game.watch && !game.replay && (game.selected !== null || game.armed !== null);
  document.getElementById('stage').classList.toggle('slowmo', slow && !game.paused);
  if (!game.paused && !st.result) {
    game.acc += dt * game.speed * (slow ? CONFIG.ui.slowMo : 1);
    let n = 0;
    while (game.acc >= tickDt && n < 16) {
      advance(m);
      ingest(game.fxs, st.events, now);
      playEvents(audio, st.events, game.cam, PLAYER);
      game.acc -= tickDt;
      n++;
    }
    if (n === 16) game.acc = 0; // slow device: drop time rather than spiral
  }
  if (st.result && !game.endShown) {
    game.endShown = true;
    keepAwake(false);
    let check = '';
    if (game.replay && game.original) {
      check = fingerprint(st) === game.original.print ? 'Replay check: identical to the original battle.' : 'Replay check: the replay drifted from the original.';
    }
    setTimeout(() => showEnd(ui, st, game.watch || game.replay ? null : PLAYER, check), 900);
  }
  if (game.selected !== null && st.platoons[game.selected].broken) game.selected = null;

  prune(game.fxs, now);
  const shake = shakeOffset(game.fxs, dt);
  const reveal = game.watch || game.replay;
  const view = { dpr: game.dpr, now, fxs: game.fxs, terrain: game.terrain, shake, selected: game.selected, playerSide: PLAYER, reveal, marker: game.marker, labelsAll: game.labelsAll, view: game.view, grid: game.grid && !game.watch && !game.replay && (game.selected !== null || game.armed !== null) };
  drawFrame(g, game.renderer, st, game.cam, view);
  drawMinimap(mg, game.renderer, st, game.cam, view);
  updateUI(ui, st, {
    now, playerSide: PLAYER, selected: game.selected, armed: game.armed, paused: game.paused, speed: game.speed,
    replay: game.replay, watch: game.watch, hint: hintText(),
    banner: game.replay ? 'REPLAY' : game.watch ? 'WATCH MODE' : game.planning ? 'PLANNING' : game.paused ? 'PAUSED' : '',
  });
  requestAnimationFrame(frame);
}

// Portrait: suggest turning sideways (once dismissed, never again).
const rotateHint = document.getElementById('rotate-hint');
const portrait = window.matchMedia('(orientation: portrait)');
const showRotateHint = () => { rotateHint.hidden = !portrait.matches || store.get('uprightOk', false); };
document.getElementById('rotate-ok').addEventListener('click', () => { store.set('uprightOk', true); showRotateHint(); });
portrait.addEventListener('change', showRotateHint);
showRotateHint();

const urlSeed = new URLSearchParams(location.search).get('seed');
startBattle(urlSeed || newSeed());
if (!store.get('seenHelp', false)) {
  pausedBeforeMenu = game.paused; // stay in planning after the help closes
  game.paused = true;
  openOverlay('overlay-help');
}
requestAnimationFrame((t) => { game.last = t; requestAnimationFrame(frame); });
