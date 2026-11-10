// Wires the simulation, renderer and UI together and owns the game loop.
// The sim advances in fixed 1/30 second ticks; drawing happens every frame.

import { CONFIG, RULES, SIDE_NAMES, ABILITY_HELP } from './config.js';
import { ABILITY_OF, abilityCfg } from './sim/abilities.js';
import { createMatch, issue, advance } from './sim/match.js';
import { amendWindow, squadFreeWindow, followUpWindow } from './sim/commands.js';
import { createAI } from './sim/ai.js';
import { fingerprint } from './sim/battle.js';
import { seedFrom } from './sim/rng.js';
import { wireAt, heightAt } from './sim/map.js';
import { isActive, coverName, dist } from './sim/util.js';
import { createCamera, setViewport, toWorld, toScreen, centreOn, clampCamera, rotateAt, panBy } from './render/camera.js';
import { buildTerrain } from './render/terrain.js';
import { buildTiltTerrain, liftAt, LIFT } from './render/terrain-tilt.js';
import { createRenderer, drawFrame, drawMinimap } from './render/renderer.js';
import { loadUnitSprites } from './render/unit-sprites.js';
import { createEffects, ingest, prune, shakeOffset } from './render/effects.js';
import { createAudio, unlockAudio, newFrame, playEvents, uiClick } from './render/audio.js';
import { attachMapInput, attachMinimapInput } from './ui/input.js';
import { createUI, updateUI, toast, flashOrderPoints, openOverlay, closeOverlay, showEnd, resetFeed } from './ui/ui.js';
import { createCampaignUI } from './ui/campaign.js';
import { battleOptions } from './campaign/battles.js';
import { loadCampaign, hasSave } from './campaign/save.js';

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
  watch: store.get('watch', false), labelsAll: store.get('labels', false), grid: store.get('grid', true), slowMo: store.get('slowMo', true), view: store.get('soldierStyle', 'pixel'), tilt: store.get('tiltView', false), mapChoice: store.get('mapType', 'trenches'), mapType: 'trenches', lengthSec: store.get('length', 600),
  replay: false, original: null, paused: false, speed: 1, selected: null, scope: null, vehicle: false, armed: null, release: null, minimap: store.get('minimap', false), marker: null, endShown: false,
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
    if (i === 3) {
      const v = game.match.state.vehicles.find((o) => o.side === PLAYER);
      if (!v || game.replay) return;
      if (game.watch || !v.alive) { centreOn(game.cam, v.x, v.y); return; }
      game.vehicle = !game.vehicle;
      game.selected = null;
      game.scope = null;
      game.armed = null;
      game.release = null;
      if (game.vehicle) focusPoint(v.x, v.y);
      return;
    }
    game.vehicle = false;
    game.release = null;
    game.scope = null;
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
      const sq = st.platoons[platoon].squads.map((id) => st.squads[id]).find((q) => q.role === role);
      const key = sq.abilityUsed || ABILITY_OF[role];
      toast(ui, abilityCfg(st, key).label, ABILITY_HELP[key]);
    }
  },
  closeTray() { deselect(); },
  jump(x, y) { lookAt(x, y); },
  setScope(id) {
    game.scope = id;
    game.release = null;
  },
  rejoin() {
    if (game.replay || game.watch || game.scope === null) return;
    const st = game.match.state;
    const sq = st.squads[game.scope];
    if (order('squad', { platoon: sq.platoon, role: sq.role, what: 'rejoin' })) game.scope = null;
  },
  toggleMinimap() {
    game.minimap = !game.minimap;
    store.set('minimap', game.minimap);
    showMinimap();
  },
  tankAbility() {
    if (game.replay || game.watch) return;
    if (order('vability', {})) toast(ui, CONFIG.tank.overwatch.label, ABILITY_HELP.overwatch);
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

const MAP_KINDS = ['trenches', 'industrial', 'city'];
// campaign: { rec, onEnd } for a war map battle (rec is its battle record).
function startBattle(seed, { replayLog = null, mapType = null, campaign = null } = {}) {
  game.seed = seed;
  game.campaign = campaign;
  // Campaign battles are always yours to command (watch mode stays a
  // quick battle setting).
  game.watch = campaign ? false : store.get('watch', false);
  if (campaign) {
    game.mapType = campaign.rec.mapType;
  } else if (!replayLog) {
    const choice = mapType || game.mapChoice;
    game.mapType = choice === 'random' ? MAP_KINDS[Math.floor(Math.random() * MAP_KINDS.length)] : MAP_KINDS.includes(choice) ? choice : 'trenches';
  }
  const size = CONFIG.mapSizes[game.mapType];
  game.options = replayLog ? replayLog.options : campaign ? battleOptions(campaign.rec) : { config: { battle: { durationSec: game.lengthSec }, map: { type: game.mapType }, world: { width: size.width, height: size.height } } };
  game.replay = !!replayLog;
  game.match = createMatch({ seed, options: game.options, controllers: replayLog ? [] : controllersFor(game.watch), replayLog });
  closeOverlay('overlay-start');
  document.getElementById('stage').hidden = false;
  const st = game.match.state;
  game.renderer = createRenderer(st.map);
  game.fxs = createEffects();
  paintTerrain();
  game.fxs.reduced = reduceMotion.matches;
  game.cam = createCamera(st.map.width, st.map.height);
  miniCanvas.style.aspectRatio = `${st.map.width} / ${st.map.height}`;
  applyRotationRule();
  game.selected = null;
  game.vehicle = false;
  game.armed = null;
  game.release = null;
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
  showMinimap();
  // Open on the ISA lines, a little zoomed in from the full height.
  // Open close enough to see the troopers, on the ISA lines.
  game.cam.z = Math.min(game.cam.maxZ, (game.cam.vh / st.map.height) * 2);
  clampCamera(game.cam);
  centreOn(game.cam, 260, st.map.height / 2);
  keepAwake(true);
  if (!store.get('seenHelp', false) && !replayLog) {
    pausedBeforeMenu = game.paused; // stay in planning after the help closes
    game.paused = true;
    openOverlay('overlay-help');
  }
  if (campaign) return;
  try { history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}&map=${game.mapType}`); } catch { /* file:// */ }
}

// The tilted look only works with north up, so it locks turning.
function applyRotationRule() {
  if (!game.cam) return;
  game.cam.canRotate = true;
  if (game.tilt && game.cam.rot) rotateAt(game.cam, game.cam.vw / 2, game.cam.vh / 2, 0);
  game.cam.canRotate = !game.tilt;
}

// The battlefield picture: tilted three quarter view (default) or flat.
function paintTerrain() {
  const st = game.match.state;
  game.terrain = (game.tilt ? buildTiltTerrain : buildTerrain)(st.map, seedFrom(game.seed));
  game.fxs.terrain = game.terrain;
  game.fxs.ly = game.tilt ? (x, y) => y - liftAt(st.map, x, y) : null;
  if (game.renderer) game.renderer.thumb = null;
}

// A tap lands on the picture; in the tilted view raised ground is drawn
// higher up the screen, so find the ground point that is drawn there.
function tapToGround(sx, sy) {
  const w = toWorld(game.cam, sx, sy);
  if (!game.tilt) return w;
  const map = game.match.state.map;
  for (const k of [2, 1]) {
    const y = w.y + LIFT * k;
    if (heightAt(map, w.x, y) === k) return { x: w.x, y };
  }
  return w;
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
    // Aiming support fire puts the order tray away so the whole map is free.
    const next = game.armed === act ? null : act;
    deselect();
    game.armed = next;
    return;
  }
  if (!pl) { toast(ui, 'Select a platoon first', 'Tap one of the platoon chips, bottom left.'); return; }
  if (act === 'hold' && game.scope !== null) {
    const sq = st.squads[game.scope];
    if (order('squad', { platoon: pl.id, role: sq.role, what: 'hold' })) releaseAfterOrder('squad', sq.id);
    return;
  }
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

// Centre the view on a ground point (drawn lifted in the tilted view).
function lookAt(x, y) {
  const lift = game.tilt ? liftAt(game.match.state.map, x, y) : 0;
  centreOn(game.cam, x, y - lift);
}

function deselect() {
  game.selected = null;
  game.scope = null;
  game.vehicle = false;
  game.armed = null;
  game.release = null;
}

// After a move or take order the unit stays selected for the free change
// window (so a misplaced tap can be fixed), then lets go by itself so the
// tray gets out of the way of the map.
function releaseAfterOrder(kind, id) {
  game.release = { kind, id };
}

function showMinimap() {
  miniCanvas.hidden = !game.minimap;
  document.getElementById('btn-minimap').classList.toggle('on', game.minimap);
  if (game.minimap) resize();
}

function focusPlatoon(pl) {
  const st = game.match.state;
  const list = pl.squads.flatMap((id) => st.squads[id].soldiers.map((s) => st.soldiers[s])).filter(isActive);
  if (!list.length) return;
  focusPoint(list.reduce((a, s) => a + s.x, 0) / list.length, list.reduce((a, s) => a + s.y, 0) / list.length);
}

function focusPoint(x, y) {
  const cam = game.cam;
  const { x: sx, y: sy } = toScreen(cam, x, y);
  // Only move the view if the unit is off screen or would sit under the
  // order tray (which pops up along the bottom); then put it a little above
  // the middle.
  if (sx < 30 || sy < 60 || sx > cam.vw - 30 || sy > cam.vh - 170) centreOn(cam, x, y + (cam.vh * 0.12) / cam.z);
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

// A tank is big: a tap anywhere on its body counts (and at least a finger's width).
function tankHit(v, w) {
  const ps = Math.max(0.42, 0.3 / game.cam.z);
  const r = Math.max(22 / game.cam.z, 70 * ps);
  return Math.abs(w.x - v.x) < r && w.y < v.y + 12 * ps && w.y > v.y - 100 * ps;
}

// The visible enemy soldier under a tap (aimed at the chest, like your own).
function enemyAt(st, w) {
  const px = 1 / game.cam.z;
  const lift = bodyLift();
  let best = null, bd = 16 * px;
  for (const s of st.soldiers) {
    if (s.side === PLAYER || !isActive(s) || !st.sides[PLAYER].spotted[s.id]) continue;
    const d = Math.hypot(s.x - w.x, s.y - lift - w.y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function onTap(sx, sy) {
  const st = game.match.state;
  const w = tapToGround(sx, sy);
  const px = 1 / game.cam.z;
  // An off-screen alert arrow: jump there.
  const edge = (game.renderer.edges || []).find((a) => Math.hypot(a.x - sx, a.y - sy) < 24);
  if (edge) { lookAt(edge.wx, edge.wy); return; }
  if (!game.replay && !game.watch) {
    if (game.armed) {
      const type = game.armed;
      game.armed = null;
      if (order(type, { x: w.x, y: w.y })) game.marker = { x: w.x, y: w.y, t0: performance.now() / 1000, colour: type === 'artillery' ? '#ff4a3a' : '#e0e0e0' };
      return;
    }
    const badge = game.renderer.badges.find((b) => b.side === PLAYER && Math.hypot(b.x - sx, b.y - sy) < 20);
    if (badge) { game.selected = badge.platoon; game.scope = null; game.vehicle = false; game.release = null; return; }
    // Tapping your own tank selects it.
    const mine = st.vehicles.find((v) => v.side === PLAYER && v.alive);
    if (mine && !game.vehicle && tankHit(mine, w)) { game.vehicle = true; game.selected = null; game.scope = null; game.release = null; return; }
    let near = null, nd = 18 * px;
    const lift = bodyLift();
    for (const s of st.soldiers) {
      if (s.side !== PLAYER || !isActive(s)) continue;
      const d = Math.hypot(s.x - w.x, s.y - lift - w.y);
      if (d < nd) { nd = d; near = s; }
    }
    if (near) {
      const pid = st.squads[near.squad].platoon;
      if (pid !== game.selected) { game.selected = pid; game.scope = null; game.vehicle = false; game.release = null; return; }
      // A soldier of the selected platoon: pick their squad for squad orders.
      if (near.squad !== game.scope) { game.scope = near.squad; game.release = null; return; }
    }
    if (game.vehicle && mine) {
      const t = CONFIG.ui.tile;
      const snap = game.grid ? { x: Math.floor(w.x / t) * t + t / 2, y: Math.floor(w.y / t) * t + t / 2 } : w;
      if (order('vmove', { x: snap.x, y: snap.y })) { game.marker = { x: mine.order.x, y: mine.order.y, t0: performance.now() / 1000, colour: '#aaffaa' }; releaseAfterOrder('tank', mine.id); }
      return;
    }
    if (game.selected !== null) {
      const pl = st.platoons[game.selected];
      // Tapping an enemy soldier you can see: focus fire on their squad.
      const foe = enemyAt(st, w);
      if (foe) {
        if (order('focus', { platoon: pl.id, target: foe.squad })) {
          const role = st.cfg.roles[st.squads[foe.squad].role].label;
          toast(ui, `${pl.name}: focus fire`, `All three squads shoot the Helghast ${role} squad first while they can see it.`);
        }
        return;
      }
      const site = siteAt(st, w);
      // Move orders snap to the centre of a grid tile (Bad North style), so
      // where the platoon will stand is clear and taps land cleanly.
      const t = CONFIG.ui.tile;
      const snap = game.grid ? { x: Math.floor(w.x / t) * t + t / 2, y: Math.floor(w.y / t) * t + t / 2 } : w;
      const scoped = game.scope !== null ? st.squads[game.scope] : null;
      let ok;
      if (scoped) {
        ok = site ? order('squad', { platoon: pl.id, role: scoped.role, what: 'take', site: site.id }) : order('squad', { platoon: pl.id, role: scoped.role, what: 'move', x: snap.x, y: snap.y });
        if (ok) releaseAfterOrder('squad', scoped.id);
      } else {
        ok = site ? order('take', { platoon: pl.id, site: site.id }) : order('move', { platoon: pl.id, x: snap.x, y: snap.y });
        if (ok) releaseAfterOrder('platoon', pl.id);
      }
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
  const w = tapToGround(sx, sy);
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
  const veh = st.vehicles.find((v) => (v.side === PLAYER || reveal || v.spotted[PLAYER]) && tankHit(v, w));
  if (veh) {
    if (!veh.alive) toast(ui, ...RULES.wreck);
    else toast(ui, `${SIDE_NAMES[veh.side]} tank (${Math.ceil((100 * veh.hp) / veh.maxHp)}%)`, `${veh.side === PLAYER ? veh.status + '. ' : ''}${RULES.armour[1]}`);
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

document.getElementById('btn-compass').addEventListener('click', () => rotateAt(game.cam, game.cam.vw / 2, game.cam.vh / 2, 0));
attachMapInput(mapCanvas, new Proxy({}, { get: (_, k) => game.cam[k], set: (_, k, v) => { game.cam[k] = v; return true; } }), {
  onTap,
  onLongPress: inspect,
});
attachMinimapInput(miniCanvas, new Proxy({}, { get: (_, k) => game.cam[k], set: (_, k, v) => { game.cam[k] = v; return true; } }));

// ---- Menu and end screen ----------------------------------------------------

let pausedBeforeMenu = false;
function openMenu() {
  pausedBeforeMenu = game.paused;
  game.paused = true;
  // In a war map battle the menu offers a way back instead of new battles.
  const inCampaign = !!game.campaign;
  document.getElementById('btn-leave').hidden = !inCampaign;
  document.getElementById('btn-leave').textContent = game.campaign && game.campaign.replay ? 'Back to the war map' : 'Leave this battle (the AI fights it out)';
  for (const id of ['btn-new', 'btn-restart', 'btn-main']) document.getElementById(id).hidden = inCampaign;
  document.getElementById('seed-input').value = game.seed;
  document.getElementById('length-select').value = String(game.lengthSec);
  document.getElementById('watch-toggle').checked = game.watch;
  document.getElementById('labels-toggle').checked = game.labelsAll;
  document.getElementById('view-select').value = game.view;
  document.getElementById('map-select').value = game.mapChoice;
  document.getElementById('tilt-toggle').checked = game.tilt;
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
document.getElementById('map-select').addEventListener('change', (e) => {
  game.mapChoice = e.target.value;
  store.set('mapType', game.mapChoice);
});
document.getElementById('tilt-toggle').addEventListener('change', (e) => {
  game.tilt = e.target.checked;
  store.set('tiltView', game.tilt);
  paintTerrain();
  applyRotationRule();
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
document.getElementById('btn-restart').addEventListener('click', () => { closeOverlay('overlay-menu'); startBattle(menuSeed(), { mapType: game.mapType }); });
document.getElementById('btn-help').addEventListener('click', () => { closeOverlay('overlay-menu'); openOverlay('overlay-help'); });
document.getElementById('btn-replay').addEventListener('click', () => {
  const src = game.replay ? game.original : { log: game.match.log, print: fingerprint(game.match.state) };
  game.original = src;
  startBattle(src.log.seed, { replayLog: JSON.parse(JSON.stringify(src.log)) });
  game.speed = 2;
});
document.getElementById('btn-end-restart').addEventListener('click', () => startBattle(game.replay ? game.original.log.seed : game.seed, { mapType: game.replay ? game.original.log.options.config.map?.type : game.mapType }));
document.getElementById('btn-end-new').addEventListener('click', () => startBattle(newSeed()));

// ---- Campaign and the start menu ------------------------------------------------

const campaignUI = createCampaignUI({
  fightBattle(rec, { onEnd }) {
    startBattle(rec.seed, { campaign: { rec, onEnd } });
  },
  watchReplay(rec, { onEnd }) {
    game.original = null;
    startBattle(rec.seed, { replayLog: { seed: rec.seed, options: battleOptions(rec), commands: JSON.parse(JSON.stringify(rec.log)) }, campaign: { rec, onEnd, replay: true } });
    game.speed = 2;
  },
  toMenu: showStart,
  soundOn: () => audio.enabled,
  toggleSound() {
    audio.enabled = !audio.enabled;
    store.set('sound', audio.enabled);
    return audio.enabled;
  },
});
window.__kzCampaign = campaignUI; // for browser tests

// On a campaign battle's end screen, the only way on is back to the war map.
function endButtons() {
  const c = !!game.campaign;
  for (const id of ['btn-replay', 'btn-end-restart', 'btn-end-new']) document.getElementById(id).hidden = c;
  document.getElementById('btn-end-campaign').hidden = !c;
}

// Leave a campaign battle: result null means the AI should fight it out.
function backToCampaign(result) {
  const c = game.campaign;
  if (!c) return;
  const log = game.match.log.commands;
  game.campaign = null;
  game.match = null;
  game.watch = store.get('watch', false);
  keepAwake(false);
  closeOverlay('overlay-end');
  closeOverlay('overlay-menu');
  closeOverlay('overlay-help');
  c.onEnd(c.replay ? null : result, log);
}
document.getElementById('btn-end-campaign').addEventListener('click', () => backToCampaign(game.match.state.result));
document.getElementById('btn-leave').addEventListener('click', () => backToCampaign(null));
document.getElementById('btn-main').addEventListener('click', () => {
  closeOverlay('overlay-menu');
  game.match = null;
  keepAwake(false);
  showStart();
});

function showStart() {
  game.match = null;
  document.getElementById('stage').hidden = true;
  document.getElementById('st-continue').hidden = !hasSave();
  openOverlay('overlay-start');
}
document.getElementById('st-continue').addEventListener('click', () => {
  const cm = loadCampaign();
  if (!cm) { document.getElementById('st-continue').hidden = true; return; }
  closeOverlay('overlay-start');
  campaignUI.open(cm);
});
function startCampaign(turns) {
  if (hasSave()) {
    const old = loadCampaign();
    if (old && old.state.phase !== 'over' && !window.confirm('Start a new war? The one saved in this browser will be replaced.')) return;
  }
  closeOverlay('overlay-start');
  campaignUI.newCampaign(newSeed(), turns);
}
document.getElementById('st-new').addEventListener('click', () => startCampaign(18));
document.getElementById('st-new-short').addEventListener('click', () => startCampaign(12));
document.getElementById('st-quick').addEventListener('click', () => { closeOverlay('overlay-start'); startBattle(newSeed()); });
document.getElementById('st-import').addEventListener('click', () => campaignUI.openImport());
document.getElementById('st-help').addEventListener('click', () => openOverlay('overlay-chelp'));

// ---- Keyboard (browser play) ----------------------------------------------------

// Space pauses and resumes a battle, like the pause button. Ignored while
// typing, while a menu or sheet is open, on the war map, and once the
// battle is over.
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
  if (!game.match || game.match.state.result || campaignUI.visible()) return;
  if ([...document.querySelectorAll('.overlay')].some((o) => !o.hidden)) return;
  e.preventDefault(); // no page scroll, and no "click" on a focused button
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  ui.handlers.togglePause();
});

// Arrow keys pan the view (battle and war map) while held. Screen
// directions, so they still make sense when the map is turned.
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const held = new Set();
document.addEventListener('keydown', (e) => {
  if (!ARROWS[e.code] || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
  if ([...document.querySelectorAll('.overlay')].some((o) => !o.hidden)) return;
  e.preventDefault();
  held.add(e.code);
});
document.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());
function keyPan(cam, dt) {
  if (!cam || !held.size) return;
  let dx = 0, dy = 0;
  for (const k of held) { dx += ARROWS[k][0]; dy += ARROWS[k][1]; }
  const speed = 700 * dt; // screen pixels per second
  if (dx || dy) panBy(cam, -dx * speed, -dy * speed);
}

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
  if (game.planning && game.selected === null && !game.vehicle && !game.armed) return 'Planning: tap a unit, then the map. Press \u25B6 to start.';
  if (game.armed === 'artillery') return 'Tap where the shells should land. They hit everyone, yours too.';
  if (game.armed === 'smoke') return 'Tap where to drop smoke. It blocks sight for a while.';
  if (game.selected !== null) return `${game.match.state.platoons[game.selected].name}: tap an objective to take it, or ground to move (slowed while you decide)`;
  if (game.vehicle) return 'Tank: tap the ground to drive there (it cannot enter ruins). Overwatch fires a heavy aimed shell.';
  // The general tip only for the opening of a battle; after that the map is left clear.
  return game.match.state.tick < 40 * game.match.state.cfg.tickRate ? 'Tap a unit (bottom left) to command it. Press and hold anything to learn what it does.' : '';
}

function frame(t) {
  const now = t / 1000;
  const dt = Math.min(0.25, now - game.last / 1000);
  game.last = t;
  // The war map (or the start menu) is up: no battle to run or draw.
  if (campaignUI.visible() && campaignUI.cm) keyPan(campaignUI.debug.cam, dt);
  if (campaignUI.draw(now) || !game.match) { requestAnimationFrame(frame); return; }
  keyPan(game.cam, dt);
  const m = game.match;
  const st = m.state;
  const tickDt = 1 / st.cfg.tickRate;
  // Slow motion while giving orders, so there is time to think on a phone.
  newFrame(audio);
  const slow = game.slowMo && !game.watch && !game.replay && !game.release && (game.selected !== null || game.vehicle || game.armed !== null);
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
  // The compass: shows where north is when the map is turned; tap to reset.
  const compass = document.getElementById('btn-compass');
  compass.hidden = !game.cam.canRotate || !game.cam.rot;
  if (!compass.hidden) document.getElementById('compass-needle').style.transform = `rotate(${game.cam.rot}rad)`;
  if (st.result && !game.endShown) {
    game.endShown = true;
    keepAwake(false);
    let check = '';
    if (game.replay && game.original) {
      check = fingerprint(st) === game.original.print ? 'Replay check: identical to the original battle.' : 'Replay check: the replay drifted from the original.';
    }
    setTimeout(() => { showEnd(ui, st, game.watch || game.replay ? null : PLAYER, check); endButtons(); }, 900);
  }
  if (game.selected !== null && st.platoons[game.selected].broken) game.selected = null;
  if (game.vehicle && !st.vehicles.some((v) => v.side === PLAYER && v.alive)) game.vehicle = false;
  if (game.release) {
    const r = game.release;
    const target = r.kind === 'tank' ? st.vehicles[r.id] : r.kind === 'squad' ? st.squads[r.id] : st.platoons[r.id];
    const still = r.kind === 'tank' ? game.vehicle : r.kind === 'squad' ? game.scope === r.id : game.selected === r.id;
    if (!still) game.release = null;
    // The tray stays up while anything is still free to change: the order
    // itself, or (after a platoon order) placing its squads one by one.
    const left = r.kind === 'squad' ? squadFreeWindow(st, target) : r.kind === 'platoon' ? Math.max(amendWindow(st, target), followUpWindow(st, target)) : amendWindow(st, target);
    if (left <= 0) deselect();
  }

  prune(game.fxs, now);
  const shake = shakeOffset(game.fxs, dt);
  const reveal = game.watch || game.replay;
  const view = { dpr: game.dpr, now, fxs: game.fxs, terrain: game.terrain, shake, selected: game.selected, scope: game.scope, vehicleSelected: game.vehicle, playerSide: PLAYER, reveal, marker: game.marker, labelsAll: game.labelsAll, view: game.view, tilt: game.tilt, grid: game.grid && !game.watch && !game.replay && (game.selected !== null || game.vehicle || game.armed !== null) };
  drawFrame(g, game.renderer, st, game.cam, view);
  if (game.minimap && miniCanvas.width > 0) drawMinimap(mg, game.renderer, st, game.cam, view);
  updateUI(ui, st, {
    now, playerSide: PLAYER, selected: game.selected, scope: game.scope, vehicle: game.vehicle, armed: game.armed, paused: game.paused, speed: game.speed,
    replay: game.replay, watch: game.watch, hint: hintText(),
    banner: game.replay ? 'REPLAY' : game.watch ? 'WATCH MODE' : game.planning ? 'PLANNING' : game.paused ? 'PAUSED' : slow ? 'SLOW MOTION' : '',
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

// The infantry sprite sheets load in the background; the code-drawn
// troopers stand in until they are ready.
loadUnitSprites();
const params = new URLSearchParams(location.search);
const urlSeed = params.get('seed');
// A link with a seed opens that battle straight away; otherwise the start
// menu (campaign or quick battle).
if (urlSeed) startBattle(urlSeed, { mapType: params.get('map') });
else showStart();
requestAnimationFrame((t) => { game.last = t; requestAnimationFrame(frame); });
