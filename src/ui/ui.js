// DOM side of the game: the floating HUD (corner pieces, unit chips, support
// buttons and the order tray that pops up for a selected unit), event feed,
// toasts and the overlays. Reads the sim state; sends the player's
// choices back through callbacks (it never changes the battle itself).

import { platoonStrength } from '../sim/util.js';
import { platoonHeadline } from '../sim/squads.js';
import { abilityKey, abilityHasTarget, abilityCfg } from '../sim/abilities.js';
import { mainGunTarget } from '../sim/vehicles.js';
import { amendWindow, squadFreeWindow, followUpWindow } from '../sim/commands.js';

const $ = (sel) => document.querySelector(sel);
const TANK_ICON = '<svg width="26" height="18" viewBox="0 0 26 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M2 11h22l-2 5H4z"/><path d="M6 11l2-4h9l2 4"/><path d="M17 8.5h8"/></svg>';

export function createUI(handlers) {
  const ui = {
    handlers,
    cards: [],
    feedSeen: 0,
    toastTimer: 0,
    lastText: 0,
    els: {
      timer: $('#timer'), objs: [...document.querySelectorAll('#objs span')], score0: $('#score .isa'), score1: $('#score .hgh'),
      opNum: $('#op-num'), opPips: $('#op-pips'), op: $('#op'), pause: $('#btn-pause'), speed: $('#btn-speed'),
      cards: $('#cards'), squads: $('#squads'), feed: $('#feed'), hint: $('#hint'), toast: $('#toast'), banner: $('#banner'),
      actions: Object.fromEntries([...document.querySelectorAll('#stage button[data-act]')].map((b) => [b.dataset.act, b])),
      stanceLabel: $('#stance-label'), stage: $('#stage'), strength: $('#strength'), strength0: $('#strength .s0'), strength1: $('#strength .s1'),
      tray: $('#tray'), trayTitle: $('#tray-title'), traySub: $('#tray-sub'), trayHint: $('#tray-hint'), trayCmds: $('#tray-cmds'), trayScope: $('#tray-scope'), trayRejoin: $('#tray-rejoin'),
    },
  };
  const e = ui.els;
  for (let i = 0; i < 6; i++) e.opPips.appendChild(document.createElement('i')).appendChild(document.createElement('b'));
  for (let i = 0; i < 4; i++) {
    const b = document.createElement('button');
    b.className = i === 3 ? 'card tank' : 'card';
    b.setAttribute('aria-label', i === 3 ? 'Tank' : `Platoon ${i + 1}`);
    b.innerHTML = `<span class="name">${i === 3 ? TANK_ICON : i + 1}</span><span class="bar"><i></i></span>`;
    b.addEventListener('click', () => handlers.selectCard(i));
    e.cards.appendChild(b);
    ui.cards.push(b);
  }
  for (const [act, btn] of Object.entries(e.actions)) btn.addEventListener('click', () => handlers.action(act));
  e.pause.addEventListener('click', handlers.togglePause);
  e.speed.addEventListener('click', handlers.cycleSpeed);
  $('#btn-menu').addEventListener('click', handlers.openMenu);
  $('#tray-close').addEventListener('click', handlers.closeTray);
  $('#tray-rejoin').addEventListener('click', handlers.rejoin);
  $('#btn-minimap').addEventListener('click', handlers.toggleMinimap);
  e.toast.addEventListener('click', () => { e.toast.hidden = true; });

  for (const ov of document.querySelectorAll('.overlay')) {
    ov.addEventListener('click', (ev) => {
      if (ev.target.matches('[data-close]')) closeOverlay(ov.id);
    });
  }
  return ui;
}

export function openOverlay(id) { document.getElementById(id).hidden = false; }
export function closeOverlay(id) { document.getElementById(id).hidden = true; }

const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export function toast(ui, title, body = '', bad = false) {
  const t = ui.els.toast;
  t.innerHTML = '';
  const b = document.createElement('b');
  b.textContent = title;
  t.appendChild(b);
  if (body) t.appendChild(document.createTextNode(body));
  t.classList.toggle('bad', bad);
  t.hidden = false;
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 2500 : 4500);
}

export function flashOrderPoints(ui) {
  ui.els.op.classList.remove('flash');
  void ui.els.op.offsetWidth;
  ui.els.op.classList.add('flash');
}

// Called every frame; heavier text updates are throttled.
export function updateUI(ui, state, view) {
  const e = ui.els;
  const me = state.sides[view.playerSide];
  const op = me.op;
  const cap = state.cfg.orders.cap;
  e.opNum.textContent = Math.floor(op + 1e-9);
  [...e.opPips.children].forEach((pip, i) => {
    const fill = Math.max(0, Math.min(1, op - i));
    pip.firstChild.style.transform = `scaleY(${fill})`;
    pip.style.opacity = i < cap ? 1 : 0.2;
  });
  for (const [act, btn] of Object.entries(e.actions)) {
    btn.classList.toggle('armed', view.armed === act);
    const sel = view.selected !== null ? state.platoons[view.selected] : null;
    const needsPlatoon = act === 'hold' || act === 'fallback' || act === 'stance' || act === 'reinforce' || act === 'holdfire' || act === 'route' || act === 'signal';
    const cost = state.cfg.orders.cost[act];
    btn.disabled = view.replay || view.watch || (needsPlatoon && (!sel || sel.broken)) || op + 1e-9 < cost || (act === 'artillery' && state.tick < me.artReadyTick) || (act === 'reinforce' && sel && state.tick < (sel.reinforceReadyTick || 0));
  }

  // Selecting or letting go of a unit redraws straight away (the tray must
  // pop up on the tap, not a moment later).
  const selKey = `${view.selected}|${view.vehicle}|${view.scope}`;
  if (ui.selKey !== selKey) { ui.selKey = selKey; ui.lastText = -1; }
  if (view.now - ui.lastText < 0.2) return;
  ui.lastText = view.now;
  const left = Math.max(0, (state.durationTicks - state.tick) / state.cfg.tickRate);
  e.timer.textContent = fmtTime(left);
  e.timer.classList.toggle('low', left < 60);
  const objectives = state.sites.filter((s) => s.kind === 'objective');
  objectives.forEach((s, i) => {
    const el = e.objs[i];
    el.className = s.owner === null ? '' : `o${s.owner}`;
    if (s.capSide !== null && s.cap > 0) el.classList.add('cap');
  });
  e.score0.textContent = state.sides[0].score;
  e.score1.textContent = state.sides[1].score;
  const alive = [0, 0];
  for (const s of state.soldiers) if (s.alive && !s.fled) alive[s.side]++;
  const tot = Math.max(1, alive[0] + alive[1]);
  e.strength0.style.width = `${(100 * alive[0]) / tot}%`;
  e.strength1.style.width = `${(100 * alive[1]) / tot}%`;
  e.strength.title = `Troops left: ISA ${alive[0]}, Helghast ${alive[1]}`;
  const pauseHtml = view.paused ? '&#9654;' : '&#10074;&#10074;';
  if (e.pause.dataset.p !== pauseHtml) { e.pause.innerHTML = pauseHtml; e.pause.dataset.p = pauseHtml; }
  e.speed.textContent = `${view.speed}x`;
  const art = me.noArtillery ? 'none' : state.tick < me.artReadyTick ? `${Math.ceil((me.artReadyTick - state.tick) / state.cfg.tickRate)}s` : `${state.cfg.orders.cost.artillery} pts`;
  e.actions.artillery.querySelector('small').textContent = art;
  // Reinforcements recharge per platoon: the button shows the selected one's.
  const rsel = view.selected !== null ? state.platoons[view.selected] : null;
  const rready = rsel ? rsel.reinforceReadyTick || 0 : 0;
  e.actions.reinforce.querySelector('small').textContent = state.tick < rready ? `${Math.ceil((rready - state.tick) / state.cfg.tickRate)}s` : `${state.cfg.orders.cost.reinforce} pts`;

  // Unit chips (the player's side, or ISA when watching): strength bar,
  // selection, broken, pinned, and a countdown badge while a fresh order can
  // still be changed for free.
  const live = !(view.replay || view.watch);
  const mine = state.platoons.filter((p) => p.side === view.playerSide);
  // Campaign battles can bring fewer than three platoons (or no tank).
  for (let i = 0; i < 3; i++) ui.cards[i].hidden = i >= mine.length;
  mine.forEach((pl, i) => {
    const card = ui.cards[i];
    const str = platoonStrength(state, pl);
    card.classList.toggle('sel', view.selected === pl.id);
    card.classList.toggle('broken', pl.broken);
    const bar = card.querySelector('.bar i');
    bar.style.width = `${Math.round(str * 100)}%`;
    bar.classList.toggle('low', str < 0.5);
    const head = platoonHeadline(state, pl);
    card.classList.toggle('pinned', head.startsWith('Pinned') || head === 'Routing');
    const free = live ? Math.ceil(amendWindow(state, pl) / state.cfg.tickRate) : 0;
    card.classList.toggle('amend', free > 0);
    card.dataset.free = free;
  });
  const tank = state.vehicles.find((v) => v.side === view.playerSide);
  if (tank) {
    const card = ui.cards[3];
    card.classList.toggle('sel', !!view.vehicle);
    card.hidden = !!tank.absent;
    card.classList.toggle('broken', !tank.alive);
    const bar = card.querySelector('.bar i');
    bar.style.width = `${Math.round((100 * tank.hp) / tank.maxHp)}%`;
    bar.classList.toggle('low', tank.hp < tank.maxHp * 0.5);
    const free = live && tank.alive ? Math.ceil(amendWindow(state, tank) / state.cfg.tickRate) : 0;
    card.classList.toggle('amend', free > 0);
    card.dataset.free = free;
  }

  // The order tray: only while a unit is selected. Its buttons are built once
  // per selection and then only updated, so a tap is never lost to a rebuild.
  const sel = view.selected !== null ? state.platoons[view.selected] : null;
  const open = !!sel || (!!view.vehicle && !!tank);
  e.tray.hidden = !open;
  e.stage.classList.toggle('tray-open', open);
  const key = sel ? `p${sel.id}` : open ? 'tank' : 'none';
  if (ui.rowsFor !== key) {
    ui.rowsFor = key;
    e.squads.innerHTML = '';
    e.trayScope.innerHTML = '';
    ui.rows = [];
    ui.pills = [];
    e.trayCmds.hidden = !sel;
    // Who the orders are for: the whole platoon, or one of its squads.
    if (sel) {
      const pill = (label, id) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.addEventListener('click', () => ui.handlers.setScope(id));
        e.trayScope.appendChild(b);
        ui.pills.push({ b, id });
      };
      pill('Platoon', null);
      for (const id of sel.squads) pill(state.cfg.roles[state.squads[id].role].label, id);
    }
    const add = (label, onClick, extra) => {
      const btn = document.createElement('button');
      btn.className = 'ab';
      btn.innerHTML = '<span></span><small></small>';
      btn.addEventListener('click', onClick);
      e.squads.appendChild(btn);
      ui.rows.push({ btn, name: btn.firstChild, sub: btn.lastChild, ...extra });
    };
    if (sel) for (const id of sel.squads) { const sq = state.squads[id]; add('', () => ui.handlers.ability(sel.id, sq.role), { sq }); }
    else if (open) add('', () => ui.handlers.tankAbility(), { tank });
    // A new selection starts the row at its left edge, where the abilities are.
    e.squads.parentElement.scrollLeft = 0;
  }
  const scoped = sel && view.scope !== null && view.scope !== undefined ? state.squads[view.scope] : null;
  for (const p of ui.pills || []) {
    p.b.classList.toggle('on', (p.id ?? null) === (view.scope ?? null));
    if (p.id !== null) {
      const q = state.squads[p.id];
      p.b.classList.toggle('away', !!q.order);
      p.b.disabled = q.mode === 'dead' || !live;
    }
  }
  // With one squad picked, only its orders and ability show.
  for (const act of ['fallback', 'stance', 'reinforce', 'holdfire', 'route', 'signal']) e.actions[act].hidden = !!scoped;
  e.trayRejoin.hidden = !(scoped && scoped.order);
  e.trayRejoin.disabled = !live;
  for (const r of ui.rows || []) if (r.sq) r.btn.hidden = !!scoped && r.sq !== scoped;
  if (scoped) {
    e.trayTitle.textContent = sel.name;
    e.traySub.textContent = `${state.cfg.roles[scoped.role].label} squad \u00b7 ${scoped.order ? 'own orders' : 'with the platoon'} \u00b7 ${scoped.status}`;
    e.traySub.classList.toggle('pinned', scoped.pinned);
    const free = Math.ceil(squadFreeWindow(state, scoped) / state.cfg.tickRate);
    e.trayHint.textContent = free > 0 ? `Place this squad, free (${free}s)` : `${state.cfg.roles[scoped.role].label} only: tap ground or an objective`;
  } else if (sel) {
    e.trayTitle.textContent = sel.name;
    const head = platoonHeadline(state, sel);
    const focus = sel.focus >= 0 && state.tick < sel.focusUntil ? ` \u00b7 Focus ${state.cfg.roles[state.squads[sel.focus].role].label}` : '';
    e.traySub.textContent = `${state.cfg.stances[sel.stance].label} \u00b7 ${Math.round(platoonStrength(state, sel) * 100)}% \u00b7 ${head}${focus}`;
    e.traySub.classList.toggle('pinned', head.startsWith('Pinned') || head === 'Routing');
    const free = Math.ceil(amendWindow(state, sel) / state.cfg.tickRate);
    const squadsFree = Math.ceil(followUpWindow(state, sel) / state.cfg.tickRate);
    e.trayHint.textContent = free > 0 ? `Tap again to change, free (${free}s)` : squadsFree > 0 ? `Pick a squad above to place it, free (${squadsFree}s)` : 'Tap ground, an objective or an enemy';
  } else if (open) {
    e.trayTitle.textContent = 'Tank';
    e.traySub.textContent = `${Math.ceil((100 * tank.hp) / tank.maxHp)}% \u00b7 ${tank.alive ? tank.status : 'Knocked out'}`;
    e.traySub.classList.remove('pinned');
    const free = Math.ceil(amendWindow(state, tank) / state.cfg.tickRate);
    e.trayHint.textContent = free > 0 ? `Tap again to change, free (${free}s)` : 'Tap ground to drive there';
  }
  e.stanceLabel.textContent = sel ? state.cfg.stances[sel.stance].label : '-';
  const hf = document.getElementById('holdfire-label');
  if (hf) hf.textContent = sel && sel.holdFire ? 'ON: ambush' : 'off';
  e.actions.holdfire.classList.toggle('ab', true);
  e.actions.holdfire.classList.toggle('ready', !!(sel && sel.holdFire));
  for (const r of ui.rows || []) {
    if (r.tank) {
      const v = r.tank, o = state.cfg.tank.overwatch;
      const wait = Math.ceil((v.abilityReady - state.tick) / state.cfg.tickRate);
      r.name.textContent = o.label;
      r.sub.textContent = wait > 0 ? `${wait}s` : 'Main gun';
      r.btn.disabled = !v.alive || wait > 0 || !live;
      r.btn.classList.toggle('ready', !r.btn.disabled && !!mainGunTarget(state, v));
      continue;
    }
    const { sq } = r;
    const dead = sq.mode === 'dead';
    const k = abilityKey(state, sq);
    const ab = abilityCfg(state, k);
    const wait = Math.ceil((sq.abilityReady - state.tick) / state.cfg.tickRate);
    r.name.textContent = ab.label;
    r.sub.textContent = dead ? 'Wiped out' : wait > 0 ? `${wait}s` : state.cfg.roles[sq.role].label;
    r.btn.classList.toggle('dead', dead);
    r.btn.classList.toggle('pinned', sq.pinned && !dead);
    r.btn.title = sq.status;
    r.btn.disabled = dead || wait > 0 || !live || sq.mode === 'rout';
    r.btn.classList.toggle('ready', !r.btn.disabled && abilityHasTarget(state, sq));
    // Ready abilities slide to the front, recharging ones behind, wiped out squads last.
    // CSS order rather than moving the buttons, so a tap never lands on a shuffled one.
    r.btn.style.order = r.btn.classList.contains('ready') ? 0 : !r.btn.disabled ? 1 : dead ? 3 : 2;
  }

  // Event feed: newest three, fading after a few seconds.
  while (ui.feedSeen < state.feed.length) {
    const f = state.feed[ui.feedSeen++];
    const div = document.createElement('div');
    div.textContent = f.text;
    if (f.side !== null && f.side !== undefined) div.className = `s${f.side}`;
    // Messages with a place can be tapped to look there.
    if (f.x !== null && f.x !== undefined) {
      div.classList.add('go');
      div.addEventListener('click', () => ui.handlers.jump(f.x, f.y));
    }
    e.feed.prepend(div);
    setTimeout(() => div.classList.add('old'), 6000);
    setTimeout(() => div.remove(), 6800);
    while (e.feed.children.length > 2) e.feed.lastChild.remove();
  }

  if (e.hint.dataset.t !== (view.hint || '')) {
    e.hint.dataset.t = view.hint || '';
    e.hint.innerHTML = '';
    if (view.hint) e.hint.appendChild(document.createElement('span')).textContent = view.hint;
  }
  e.banner.hidden = !view.banner;
  e.banner.textContent = view.banner || '';
  e.banner.classList.toggle('slow', view.banner === 'SLOW MOTION');
}

export function resetFeed(ui) {
  ui.feedSeen = 0;
  ui.els.feed.innerHTML = '';
}

const MARGIN_TEXT = {
  narrow: 'Narrow: the front line would barely move.',
  clear: 'Clear: the front line would push forward.',
  crushing: 'Crushing: the enemy line would collapse.',
  draw: 'Neither side gave ground.',
};

export function showEnd(ui, state, playerSide, replayCheck) {
  const r = state.result;
  const title = $('#end-title');
  const watching = playerSide === null;
  if (r.winner === null) title.textContent = 'Stalemate';
  else if (watching) title.textContent = r.winner === 0 ? 'ISA victory' : 'Helghast victory';
  else title.textContent = r.winner === playerSide ? 'Victory' : 'Defeat';
  title.className = r.winner === null || watching ? '' : r.winner === playerSide ? 'win' : 'lose';
  const how = r.reason === 'broken' ? 'Every platoon on the losing side broke and ran.' : 'Time ran out.';
  $('#end-margin').textContent = `${how} ${MARGIN_TEXT[r.margin]}`;
  const rows = [
    ['', 'ISA', 'Helghast'],
    ['Score', r.scores[0], r.scores[1]],
    ['Killed', r.casualties[0], r.casualties[1]],
    ['Ran off the field', r.fled[0], r.fled[1]],
    ['Objectives held', r.held[0].join(' ') || 'none', r.held[1].join(' ') || 'none'],
    ['Objectives and posts taken', r.captures[0], r.captures[1]],
    ['Abilities used', r.abilities[0], r.abilities[1]],
    ['Tanks lost', r.tanksLost?.[0] ?? 0, r.tanksLost?.[1] ?? 0],
    ['Platoons rallied', r.rallies[0], r.rallies[1]],
    ['Reinforcements called', r.reinforcements[0], r.reinforcements[1]],
    ['Revived by medics', r.revived?.[0] ?? 0, r.revived?.[1] ?? 0],
    ['Battle length', fmtTime(r.durationSec), ''],
  ];
  const table = $('#end-table');
  table.innerHTML = '';
  rows.forEach((row, i) => {
    const tr = document.createElement('tr');
    row.forEach((cell) => {
      const td = document.createElement(i === 0 ? 'th' : 'td');
      td.textContent = cell;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  // What did the killing: the biggest causes on either side.
  const causes = $('#end-causes');
  causes.innerHTML = '';
  const lb = r.lossBy || [{}, {}];
  const keys = [...new Set([...Object.keys(lb[0]), ...Object.keys(lb[1])])]
    .sort((a, b) => ((lb[0][b] || 0) + (lb[1][b] || 0)) - ((lb[0][a] || 0) + (lb[1][a] || 0))).slice(0, 6);
  const head = document.createElement('tr');
  for (const t of ['Killed by', 'ISA lost', 'Helghast lost']) head.appendChild(document.createElement('th')).textContent = t;
  causes.appendChild(head);
  for (const k of keys) {
    const tr = document.createElement('tr');
    const label = state.cfg.causes[k] || k;
    for (const t of [label[0].toUpperCase() + label.slice(1), lb[0][k] || 0, lb[1][k] || 0]) tr.appendChild(document.createElement('td')).textContent = t;
    causes.appendChild(tr);
  }
  $('#end-replay-check').textContent = replayCheck || '';
  openOverlay('overlay-end');
  drawEndChart($('#end-chart'), r.history || [], state);
}

// Troops still fighting on each side through the battle: where it turned.
function drawEndChart(c, hist, state) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = c.clientWidth || 300, h = c.clientHeight || 120;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  if (hist.length < 2) return;
  const max = state.soldiers.length / 2;
  const t1 = hist[hist.length - 1][0];
  const X = (t) => 28 + ((w - 34) * t) / t1, Y = (n) => 8 + (h - 26) * (1 - n / max);
  const css = getComputedStyle(document.documentElement);
  g.strokeStyle = css.getPropertyValue('--line') || '#888';
  g.fillStyle = css.getPropertyValue('--muted') || '#888';
  g.lineWidth = 1;
  g.font = '10px system-ui, sans-serif';
  g.beginPath(); g.moveTo(28, Y(0)); g.lineTo(w - 6, Y(0)); g.moveTo(28, Y(max)); g.lineTo(w - 6, Y(max)); g.stroke();
  g.textAlign = 'right';
  g.fillText(String(max), 24, Y(max) + 3);
  g.fillText('0', 24, Y(0) + 3);
  g.textAlign = 'left';
  g.fillText('0:00', 28, h - 4);
  g.textAlign = 'right';
  g.fillText(fmtTime(t1 / state.cfg.tickRate), w - 6, h - 4);
  for (const [side, col] of [[0, css.getPropertyValue('--isa') || '#3f7fd0'], [1, css.getPropertyValue('--hgh') || '#d9531c']]) {
    g.strokeStyle = col.trim();
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(X(0), Y(max));
    for (const row of hist) g.lineTo(X(row[0]), Y(row[1 + side]));
    g.stroke();
  }
}
