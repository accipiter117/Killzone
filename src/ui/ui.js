// DOM side of the game: top bar, platoon cards, squad lines, action buttons,
// event feed, toasts and the overlays. Reads the sim state; sends the player's
// choices back through callbacks (it never changes the battle itself).

import { platoonStrength } from '../sim/util.js';
import { platoonHeadline } from '../sim/squads.js';
import { ABILITY_OF, abilityHasTarget } from '../sim/abilities.js';

const $ = (sel) => document.querySelector(sel);

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
      actions: Object.fromEntries([...document.querySelectorAll('#actions button')].map((b) => [b.dataset.act, b])),
      stanceLabel: $('#stance-label'),
    },
  };
  const e = ui.els;
  for (let i = 0; i < 6; i++) e.opPips.appendChild(document.createElement('i')).appendChild(document.createElement('b'));
  for (let i = 0; i < 3; i++) {
    const b = document.createElement('button');
    b.className = 'card';
    b.innerHTML = '<div class="name"><span></span><em></em></div><div class="bar"><i></i></div><div class="status"></div>';
    b.addEventListener('click', () => handlers.selectCard(i));
    e.cards.appendChild(b);
    ui.cards.push(b);
  }
  for (const [act, btn] of Object.entries(e.actions)) btn.addEventListener('click', () => handlers.action(act));
  e.pause.addEventListener('click', handlers.togglePause);
  e.speed.addEventListener('click', handlers.cycleSpeed);
  $('#btn-menu').addEventListener('click', handlers.openMenu);
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
    const needsPlatoon = act === 'hold' || act === 'fallback' || act === 'stance';
    const cost = state.cfg.orders.cost[act];
    btn.disabled = view.replay || view.watch || (needsPlatoon && (!sel || sel.broken)) || op + 1e-9 < cost || (act === 'artillery' && state.tick < me.artReadyTick);
  }

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
  e.pause.innerHTML = view.paused ? '&#9654;' : '&#10074;&#10074;';
  e.speed.textContent = `${view.speed}x`;
  const art = state.tick < me.artReadyTick ? `${Math.ceil((me.artReadyTick - state.tick) / state.cfg.tickRate)}s` : `${state.cfg.orders.cost.artillery} pts`;
  e.actions.artillery.querySelector('small').textContent = art;

  // Platoon cards (the player's side, or ISA when watching).
  const mine = state.platoons.filter((p) => p.side === view.playerSide);
  mine.forEach((pl, i) => {
    const card = ui.cards[i];
    const str = platoonStrength(state, pl);
    card.classList.toggle('sel', view.selected === pl.id);
    card.classList.toggle('broken', pl.broken);
    card.querySelector('.name span').textContent = pl.name;
    card.querySelector('.name em').textContent = state.cfg.stances[pl.stance].label;
    const bar = card.querySelector('.bar i');
    bar.style.width = `${Math.round(str * 100)}%`;
    bar.classList.toggle('low', str < 0.5);
    const head = platoonHeadline(state, pl);
    const st = card.querySelector('.status');
    st.textContent = head;
    st.classList.toggle('pinned', head.startsWith('Pinned') || head === 'Routing');
  });

  // Squad lines for the selected platoon, each with its ability button.
  // Rows are built once per selection and then only updated, so a tap on a
  // button is never lost to a rebuild.
  const sel = view.selected !== null ? state.platoons[view.selected] : null;
  const key = sel ? `p${sel.id}` : view.replay ? 'replay' : view.watch ? 'watch' : 'none';
  if (ui.rowsFor !== key) {
    ui.rowsFor = key;
    e.squads.innerHTML = '';
    ui.rows = [];
    if (sel) {
      for (const id of sel.squads) {
        const sq = state.squads[id];
        const row = document.createElement('div');
        const b = document.createElement('b');
        b.textContent = state.cfg.roles[sq.role].label;
        const s = document.createElement('span');
        const btn = document.createElement('button');
        btn.className = 'ab';
        btn.addEventListener('click', () => ui.handlers.ability(sel.id, sq.role));
        row.append(b, s, btn);
        e.squads.appendChild(row);
        ui.rows.push({ sq, row, s, btn });
      }
    } else {
      const d = document.createElement('div');
      d.className = 'empty';
      d.textContent = view.replay ? 'Watching the replay.' : view.watch ? 'Watch mode: the AI is commanding both sides.' : 'Select a platoon card, then tap the map to give it an order.';
      e.squads.appendChild(d);
    }
  }
  e.stanceLabel.textContent = sel ? state.cfg.stances[sel.stance].label : '-';
  for (const r of ui.rows || []) {
    const { sq } = r;
    const dead = sq.mode === 'dead';
    r.row.className = sq.pinned ? 'pinned' : dead ? 'dead' : '';
    r.s.textContent = sq.status;
    const ab = state.cfg.abilities[ABILITY_OF[sq.role]];
    const wait = Math.ceil((sq.abilityReady - state.tick) / state.cfg.tickRate);
    r.btn.textContent = wait > 0 ? `${ab.label} ${wait}s` : ab.label;
    r.btn.disabled = dead || wait > 0 || view.replay || view.watch || sq.mode === 'rout';
    r.btn.classList.toggle('ready', !r.btn.disabled && abilityHasTarget(state, sq));
  }

  // Event feed: newest three, fading after a few seconds.
  while (ui.feedSeen < state.feed.length) {
    const f = state.feed[ui.feedSeen++];
    const div = document.createElement('div');
    div.textContent = f.text;
    if (f.side !== null && f.side !== undefined) div.className = `s${f.side}`;
    e.feed.prepend(div);
    setTimeout(() => div.classList.add('old'), 6000);
    setTimeout(() => div.remove(), 6800);
    while (e.feed.children.length > 3) e.feed.lastChild.remove();
  }

  e.hint.textContent = view.hint || '';
  e.banner.hidden = !view.banner;
  e.banner.textContent = view.banner || '';
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
  $('#end-replay-check').textContent = replayCheck || '';
  openOverlay('overlay-end');
}
