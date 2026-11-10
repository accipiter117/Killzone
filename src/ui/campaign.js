// The war map screens: the war table, the army panel, battle sheets (fight
// it yourself or let the AI), results with replays, the Helghast turn and
// the turn report. Every change to the war goes through issueCampaign (and
// so through applyCampaignCommand); this module only reads the state, draws
// it and asks.

import { SIDE_NAMES, SITE_RULES } from '../config.js';
import { createCampaignMatch, issueCampaign } from '../campaign/match.js';
import { nextCommand } from '../campaign/ai.js';
import {
  armyAt, armyById, capitalOf, connected, extrasFor, incomeOf, oddsOf, ordersFor, soldiers, fullStrength, strengthOf, held, pushIn,
} from '../campaign/state.js';
import { saveCampaign, exportCode, importCode } from '../campaign/save.js';
import { createResolver } from '../campaign/resolver.js';
import { createCamera, setViewport, toWorld, centreOn } from '../render/camera.js';
import { createWarmap, drawWarmap, pick, SITE_LABEL } from '../render/warmap.js';
import { attachMapInput } from './input.js';
import { CONFIG } from '../config.js';

const $ = (id) => document.getElementById(id);
const KIT_NAME = { trenches: 'Trenches', industrial: 'Industrial site', city: 'Ruined city' };
const roleName = (r) => CONFIG.roles[r]?.label || r;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (x) => `${Math.round(x * 100)}%`;
const armyName = (a) => `${a.side === 0 ? '' : 'Helghast '}${a.num} Army`;

export function createCampaignUI({ fightBattle, watchReplay, toMenu, toggleSound, soundOn }) {
  const canvas = $('warmap');
  const g = canvas.getContext('2d');
  const ui = { cm: null, wm: null, dpr: 1, selected: null, province: null, viewTall: null, resolver: null, busy: false, toastTimer: 0, codeMode: null };
  const st = () => ui.cm.state;
  const P = () => st().playerSide;

  // ---- Screen, camera and input ----------------------------------------------
  ui.cam = createCamera(1, 1);
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    ui.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * ui.dpr);
    canvas.height = Math.round(h * ui.dpr);
    setViewport(ui.cam, w, h);
    if (ui.cm && (h > w) !== ui.viewTall) defaultView();
  }
  new ResizeObserver(resize).observe(canvas);

  // The default view: the whole board filling the screen. Upright, the
  // board stands as drawn (your side at the bottom); sideways it is turned
  // a quarter so your side is on the left. Twisting still turns it freely.
  function defaultView() {
    const c = ui.cam;
    const tall = c.vh > c.vw;
    ui.viewTall = tall;
    c.rot = tall ? 0 : Math.PI / 2;
    const z = tall ? Math.min(c.vw / c.W, c.vh / c.H) : Math.min(c.vw / c.H, c.vh / c.W);
    c.z = Math.max(c.minZ, Math.min(c.maxZ, z));
    centreOn(c, c.W / 2, c.H / 2);
  }

  attachMapInput(canvas, ui.cam, {
    onTap,
    onLongPress(sx, sy) {
      if (!ui.cm || sheetOpen()) return;
      const hit = pick(ui.wm, st(), ui.cam, sx, sy, toWorld, g);
      if (hit && hit.province !== undefined) { ui.selected = null; ui.province = hit.province; renderAll(); }
    },
  });

  function onTap(sx, sy) {
    if (!ui.cm || sheetOpen() || ui.busy) return;
    const s = st();
    const hit = pick(ui.wm, s, ui.cam, sx, sy, toWorld, g);
    if (!hit) { deselect(); return; }
    if (hit.badge) { order(hit.badge.kind, hit.badge.to); return; }
    if (hit.army) {
      const a = armyById(s, hit.army);
      if (a.side === P()) { ui.selected = ui.selected === a.id ? null : a.id; ui.province = null; }
      else {
        // An enemy army next to the chosen one: attack it.
        const sel = ui.selected && armyById(s, ui.selected);
        const o = sel && ordersFor(s, sel).find((x) => x.to === a.at);
        if (o) { order(o.kind, o.to); return; }
        ui.selected = null; ui.province = a.at;
      }
      renderAll();
      return;
    }
    const sel = ui.selected && armyById(s, ui.selected);
    const o = sel && ordersFor(s, sel).find((x) => x.to === hit.province);
    if (o) { order(o.kind, o.to); return; }
    ui.selected = null;
    ui.province = hit.province;
    renderAll();
  }

  function deselect() { ui.selected = null; ui.province = null; renderAll(); }

  function issue(type, params, side = P()) {
    const res = issueCampaign(ui.cm, { side, type, params });
    if (!res.ok) toastMsg('Order refused', res.reason, true);
    else saveCampaign(ui.cm);
    return res.ok;
  }

  function toastMsg(title, body = '', bad = false) {
    const t = $('cp-toast');
    t.innerHTML = `<b>${esc(title)}</b>${body ? esc(body) : ''}`;
    t.classList.toggle('bad', bad);
    t.hidden = false;
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 3200 : 2600);
  }

  // ---- Orders ------------------------------------------------------------------
  function order(kind, to) {
    const s = st();
    const army = armyById(s, ui.selected);
    const prov = s.provinces[to];
    if (kind === 'march') {
      if (issue('march', { army: army.id, to })) toastMsg(`${armyName(army)} marches to ${prov.name}.`);
      ui.selected = null;
    } else if (kind === 'take') {
      if (issue('attack', { army: army.id, to })) toastMsg(`${prov.name} taken unopposed`, `+${prov.supply} supply a turn.`);
      ui.selected = null;
      if (s.phase === 'over') { renderAll(); showVictory(); return; }
    } else {
      battleSheet(army, to);
    }
    renderAll();
  }

  // ---- Bottom sheets -----------------------------------------------------------
  const sheetOpen = () => !$('cp-sheet').hidden;
  function openSheet(html, buttons) {
    $('cp-sheet-body').innerHTML = html;
    const box = $('cp-sheet-btns');
    box.innerHTML = '';
    for (const b of buttons) {
      const el = document.createElement('button');
      el.textContent = b.label;
      el.className = b.cls || '';
      el.addEventListener('click', b.go);
      box.appendChild(el);
    }
    $('cp-sheet').hidden = false;
    $('cp-shade').hidden = false;
    $('cp-tray').hidden = true;
  }
  function closeSheet() { $('cp-sheet').hidden = true; $('cp-shade').hidden = true; renderAll(); }

  function forcesHtml(s, army, extras, fortified) {
    const pls = army.platoons.map((pl) => `${esc(pl.sergeant)} (${pl.roles.map(roleName).join(', ')}) ${pl.alive.reduce((a, n) => a + n, 0)}/15`).join('<br>');
    const ex = [extras.tank && 'tank', extras.artillery && 'artillery', extras.opBonus && '+1 order point', fortified && 'dug in'].filter(Boolean);
    return `${pls}${ex.length ? `<br><span class="cp-ex">${ex.join(' · ')}</span>` : ''}`;
  }

  function battleSheet(army, to, defending = false) {
    const s = st();
    const prov = s.provinces[to];
    const foe = defending ? armyById(s, s.battle.attackerArmy) : armyAt(s, to);
    const att = defending ? foe : army, def = defending ? army : foe;
    const odds = defending ? 1 - oddsOf(s, att, to) : oddsOf(s, army, to);
    const verdict = odds >= 0.65 ? 'good odds' : odds >= 0.5 ? 'an even fight' : odds >= 0.35 ? 'risky' : 'long odds';
    const fortified = def.dug || prov.home === def.side;
    const mine = defending ? def : att, theirs = defending ? att : def;
    const html = `<h2>${defending ? `Helghast attack: ${esc(prov.name)}` : `Battle for ${esc(prov.name)}`}</h2>
      <p class="cp-sub">${KIT_NAME[prov.kit]} · ${defending ? `${esc(armyName(foe))} attacks` : `${esc(armyName(foe))} holds it`}${fortified ? ` · ${defending ? 'you fight' : 'they fight'} from trenches` : ''}</p>
      <div class="cp-odds"><span class="isa-text">ISA ${pct(odds)}</span><span>${verdict}</span><span class="hgh-text">${pct(1 - odds)} Helghast</span></div>
      <div class="cp-oddsbar"><i style="width:${Math.round(odds * 100)}%"></i></div>
      <div class="cp-forces"><div class="isa"><b>You bring</b>${forcesHtml(s, mine, extrasFor(s, mine.side), defending && fortified)}</div>
      <div class="hgh"><b>They have</b>${forcesHtml(s, theirs, extrasFor(s, theirs.side), !defending && fortified)}</div></div>`;
    const buttons = [
      { label: 'Fight it yourself', cls: 'primary red', go: () => startBattle(army, to, defending, true) },
      { label: 'Let the AI fight it', go: () => startBattle(army, to, defending, false) },
    ];
    if (!defending) buttons.push({ label: 'Back to the map', cls: 'quiet', go: closeSheet });
    openSheet(html, buttons);
  }

  // Attack (or defend), then fight it on the battle screen or in the background.
  async function startBattle(army, to, defending, byHand) {
    const s = st();
    if (!defending) {
      if (!issue('attack', { army: army.id, to })) { closeSheet(); return; }
      ui.selected = null;
    }
    const rec = s.battle;
    if (byHand) {
      closeSheet();
      hide();
      fightBattle(rec, { onEnd: (result, log) => afterHandBattle(rec, result, log) });
      return;
    }
    openSheet(`<h2>${esc(rec.provinceName)}</h2><p class="cp-sub">The battle is being fought...</p><div class="cp-working"><i></i></div>`, []);
    if (!ui.resolver) ui.resolver = createResolver();
    const r = await ui.resolver.run(rec);
    finishBattle(rec, r);
  }

  function afterHandBattle(rec, result, log) {
    show();
    if (!result) { openSheet(`<h2>${esc(rec.provinceName)}</h2><p class="cp-sub">The AI is fighting it out...</p><div class="cp-working"><i></i></div>`, []); (ui.resolver || (ui.resolver = createResolver())).run(rec).then((r) => finishBattle(rec, r)); return; }
    finishBattle(rec, { ...result, log }, log);
  }

  function finishBattle(rec, r, log = null) {
    issueCampaign(ui.cm, { side: rec.attacker, type: 'battleResult', params: { battle: rec.id, result: r, log } });
    saveCampaign(ui.cm);
    resultSheet(rec);
  }

  function resultSheet(rec) {
    const s = st();
    const done = s.history.find((b) => b.id === rec.id) || rec;
    const prov = s.provinces[done.province];
    const mineAttacked = done.attacker === P();
    const weWon = mineAttacked ? done.won : !done.won;
    const title = mineAttacked ? (done.won ? `Victory: ${prov.name} taken` : `Repulsed at ${prov.name}`) : (done.won ? `Lost: ${prov.name}` : `Held: ${prov.name} stands`);
    const lines = [];
    if (mineAttacked && done.won) lines.push(`${prov.name} is ours: +${prov.supply} supply a turn.`);
    if (!mineAttacked && done.won) lines.push(`${prov.name} fell: -${prov.supply} supply a turn.`);
    const turnLines = s.reports[s.reports.length - 1].filter((l) => l.includes(prov.name) || l.includes('fell back') || l.includes('surrounded') || l.includes('destroyed'));
    lines.push(...turnLines.slice(-3));
    lines.push(`Your losses: ${done.lost?.[P()] ?? 0} soldiers. Theirs: ${done.lost?.[1 - P()] ?? 0}.`);
    const html = `<h2 class="${weWon ? 'win' : 'lose'}">${esc(title)}</h2><p class="cp-sub">${KIT_NAME[done.mapType]} · ${done.result.margin === 'draw' ? 'stalemate' : `${done.result.margin} ${done.result.winner === P() ? 'win' : 'defeat'}`}</p>
      <ul class="cp-lines">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
    const buttons = [];
    if (done.log && done.log.length) buttons.push({ label: 'Watch replay', go: () => { closeSheet(); hide(); watchReplay(done, { onEnd: () => { show(); resultSheet(done); } }); } });
    buttons.push({ label: 'Continue', cls: 'primary', go: () => { closeSheet(); if (s.phase === 'over') showVictory(); else if (ui.waiting) { const w = ui.waiting; ui.waiting = null; w(); } } });
    openSheet(html, buttons);
  }

  // ---- The Helghast turn ------------------------------------------------------------
  $('cp-end').addEventListener('click', async () => {
    const s = st();
    if (ui.busy || s.phase !== 'turn' || s.active !== P()) return;
    ui.selected = null; ui.province = null;
    if (!issue('endTurn', {})) return;
    await enemyTurn();
  });

  async function enemyTurn() {
    const s = st();
    const foe = 1 - P();
    ui.busy = true;
    renderAll();
    const turn = s.turn;
    let guard = 0;
    while (s.phase !== 'over' && s.active === foe && guard++ < 200) {
      if (s.phase === 'battle') {
        // They attack one of our armies: we choose how to defend.
        const rec = s.battle;
        const mine = armyById(s, rec.defenderArmy);
        await new Promise((resolve) => { ui.waiting = resolve; battleSheet(mine, rec.province, true); });
        continue;
      }
      const cmd = nextCommand(s, foe);
      if (!cmd) break;
      const res = issueCampaign(ui.cm, cmd);
      if (!res.ok) { issueCampaign(ui.cm, { side: foe, type: 'endTurn', params: {} }); break; }
      saveCampaign(ui.cm);
      renderAll();
      if (cmd.type === 'march' || cmd.type === 'attack') await sleep(420);
    }
    ui.busy = false;
    renderAll();
    if (s.phase === 'over') { showVictory(); return; }
    turnReport(turn);
  }

  function turnReport(turn) {
    const s = st();
    const lines = s.reports[s.reports.length - 2] || [];
    const push = pushIn(s) === 0;
    const o = s.objective;
    const html = `<h2>Turn ${turn} report</h2><p class="cp-sub">Supply +${incomeOf(s, P())} this turn · provinces ISA ${held(s, 0)}, Helghast ${held(s, 1)}</p>
      <ul class="cp-lines">${lines.map((l) => `<li>${esc(l)}</li>`).join('') || '<li>A quiet turn on the front.</li>'}</ul>
      ${push ? '<p class="cp-warn">Intelligence: the Helghast are massing for a big push this turn.</p>' : ''}
      ${o && o.by >= s.turn && turn % s.cc.objective.every === 0 ? `<p class="cp-sub">New objective: ${esc(objectiveText(s))}</p>` : ''}`;
    openSheet(html, [{ label: `Start turn ${s.turn}`, cls: 'primary', go: closeSheet }]);
  }

  function showVictory() {
    const s = st();
    const won = s.winner === P();
    const fought = s.history.length;
    const mine = s.history.filter((b) => (b.attacker === P()) === b.won).length;
    openSheet(`<h2 class="${won ? 'win' : 'lose'}">${won ? 'Victory: the war is won' : 'Defeat: the war is lost'}</h2><p class="cp-sub">${esc(s.winReason || '')}</p>
      <ul class="cp-lines"><li>Turns: ${Math.min(s.turn, s.finalTurn)} of ${s.finalTurn}.</li><li>Battles: ${fought} (you won ${mine}).</li><li>Provinces at the end: ISA ${held(s, 0)}, Helghast ${held(s, 1)}.</li></ul>`,
    [{ label: 'Main menu', cls: 'primary', go: () => { closeSheet(); hide(); toMenu(); } }, { label: 'Look at the war table', go: closeSheet }]);
  }

  // ---- Bars, chips, tray and advice ----------------------------------------------------
  function objectiveText(s) {
    const o = s.objective;
    if (!o) return '';
    const names = o.targets.map((id) => s.provinces[id].name);
    return `take ${names.join(' and ')} by turn ${o.by} (+${o.reward} supply)`;
  }

  function renderAll() {
    if (!ui.cm) return;
    const s = st();
    const p = P();
    const push = pushIn(s);
    $('cp-when').innerHTML = `<b>TURN ${Math.min(s.turn, s.finalTurn)}</b><small>of ${s.finalTurn} · ${push === 0 ? 'Helghast push now' : `push in ${push}`}</small>`;
    $('cp-res').innerHTML = `<span class="res res-supply"><b>${s.supply[p]}</b><small>supply +${incomeOf(s, p)}</small></span><span class="res res-val"><span><b class="isa">${held(s, 0)}</b> / <b class="hgh">${held(s, 1)}</b></span><small>provinces</small></span>`;
    const o = s.objective;
    $('cp-obj').hidden = !o;
    if (o) $('cp-obj').innerHTML = `<b>Objective:</b> ${esc(objectiveText(s))} <span>${o.targets.filter((id) => s.provinces[id].owner === p).length}/${o.targets.length}</span>`;
    // Army chips.
    const chips = $('cp-chips');
    chips.innerHTML = '';
    for (const a of s.armies.filter((x) => x.side === p)) {
      const b = document.createElement('button');
      b.className = `cp-chip${ui.selected === a.id ? ' on' : ''}${a.moved ? ' done' : ''}`;
      b.innerHTML = `${a.num}<small>${a.moved ? 'done' : `${a.platoons.length} plt`}</small><i style="width:${Math.round(strengthOf(a) * 100)}%"></i>`;
      b.setAttribute('aria-label', `${armyName(a)}, ${a.platoons.length} platoons`);
      b.addEventListener('click', () => { if (ui.busy || sheetOpen()) return; ui.selected = ui.selected === a.id ? null : a.id; ui.province = null; renderAll(); });
      chips.appendChild(b);
    }
    $('cp-end').disabled = ui.busy || s.phase !== 'turn' || s.active !== p;
    // Advice.
    let hint;
    const mine = s.armies.filter((a) => a.side === p);
    const idle = mine.filter((a) => !a.moved).length;
    const sel = ui.selected && armyById(s, ui.selected);
    if (s.phase === 'over') hint = s.winReason || '';
    else if (ui.busy) hint = 'The Helghast are moving...';
    else if (sel && sel.moved) hint = 'This army has acted this turn. Pick another, or end the turn.';
    else if (sel) hint = 'Pale: march. Gold: take empty ground. Red: attack (the odds are shown).';
    else if (idle) hint = `${idle} arm${idle === 1 ? 'y has' : 'ies have'} not acted. Tap a standard (or a chip below) to give orders.`;
    else hint = 'Every army has acted. Spend supply in the army panel, then end the turn.';
    $('cp-hint').innerHTML = hint ? `<span>${esc(hint)}</span>` : '';
    renderTray();
  }

  function renderTray() {
    const s = st();
    const tray = $('cp-tray');
    if (sheetOpen()) { tray.hidden = true; return; }
    const body = $('cp-tray-body'), btns = $('cp-tray-btns');
    btns.innerHTML = '';
    const cc = s.cc;
    const myTurn = s.phase === 'turn' && s.active === P() && !ui.busy;
    const button = (label, sub, fn, disabled = false) => {
      const b = document.createElement('button');
      b.innerHTML = `${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
      b.disabled = disabled;
      b.addEventListener('click', () => { fn(); renderAll(); });
      btns.appendChild(b);
    };
    const sel = ui.selected && armyById(s, ui.selected);
    if (sel) {
      const prov = s.provinces[sel.at];
      $('cp-tray-title').textContent = `${armyName(sel)} · ${prov.name}`;
      const supplied = connected(s, sel.side).has(sel.at);
      body.innerHTML = sel.platoons.map((pl) => `<div class="cp-plt"><b>${esc(pl.sergeant)}</b> <span>${pl.roles.map((r, i) => `${esc(roleName(r))} ${pl.alive[i]}/5`).join(' · ')}</span></div>`).join('')
        + `<div class="cp-meta">${soldiers(sel)}/${fullStrength(sel)} soldiers${sel.dug ? ' · dug in' : ''}${supplied ? '' : ' · <span class="bad">cut off: losing men each turn</span>'}${sel.moved ? ' · has acted this turn' : ''}</div>`;
      if (sel.side === P() && myTurn) {
        const missing = fullStrength(sel) - soldiers(sel);
        button('Refill', missing ? `${Math.min(missing, s.supply[P()])} supply` : 'full', () => { if (issue('refill', { army: sel.id })) toastMsg('Refilled', `${armyName(sel)} is back to ${soldiers(sel)} soldiers.`); }, !missing || !supplied || !s.supply[P()]);
        button('Dig in', sel.dug ? 'dug in' : `${cc.costs.dig} supply, uses its turn`, () => { if (issue('dig', { army: sel.id })) toastMsg('Digging in', 'Attackers will face trenches here.'); }, sel.moved || sel.dug);
        const cap = capitalOf(s, P());
        if (sel.at === cap.id) button('Raise a platoon', `${cc.costs.recruit} supply`, () => { if (issue('recruit', {})) toastMsg('Platoon raised', `${armyName(sel)} now has ${sel.platoons.length} platoons.`); }, sel.platoons.length >= cc.maxPlatoons || s.supply[P()] < cc.costs.recruit);
      }
    } else if (ui.province !== null && ui.province >= 0) {
      const prov = s.provinces[ui.province];
      const there = armyAt(s, prov.id);
      $('cp-tray-title').textContent = `${prov.name} (${SIDE_NAMES[prov.owner]})`;
      body.innerHTML = `<div class="cp-meta"><b>${esc(SITE_LABEL[prov.site])}</b>: ${esc(SITE_RULES[prov.site][1])}</div>
        <div class="cp-meta">Pays ${prov.supply} supply a turn · battles here: ${KIT_NAME[prov.kit]}${prov.home === prov.owner ? ' · home ground (defenders fight from trenches)' : ''}</div>
        ${there ? `<div class="cp-meta">${esc(armyName(there))}: ${there.platoons.length} platoon${there.platoons.length > 1 ? 's' : ''}, ${soldiers(there)} soldiers${there.dug ? ', dug in' : ''}</div>` : '<div class="cp-meta">No army here.</div>'}`;
      const cap = capitalOf(s, P());
      if (myTurn && prov.id === cap.id && cap.owner === P() && !there) button('Raise a new army', `${cc.costs.recruit} supply`, () => { if (issue('recruit', {})) toastMsg('New army raised', 'It forms up at the capital this turn.'); }, s.supply[P()] < cc.costs.recruit || s.armies.filter((a) => a.side === P()).length >= cc.maxArmies);
    } else { tray.hidden = true; return; }
    tray.hidden = false;
  }
  $('cp-tray-close').addEventListener('click', deselect);

  // ---- Campaign menu and codes ------------------------------------------------------
  $('cp-menu').addEventListener('click', () => {
    const s = st();
    $('cm-info').textContent = `War seed ${s.seed}. Turn ${Math.min(s.turn, s.finalTurn)} of ${s.finalTurn}. ${s.history.length} battles fought so far.`;
    $('cm-sound').textContent = `Sound: ${soundOn() ? 'on' : 'off'}`;
    $('overlay-cmenu').hidden = false;
  });
  $('cm-help').addEventListener('click', () => { $('overlay-cmenu').hidden = true; $('overlay-chelp').hidden = false; });
  $('cm-main').addEventListener('click', () => { $('overlay-cmenu').hidden = true; hide(); toMenu(); });
  $('cm-sound').addEventListener('click', () => { $('cm-sound').textContent = `Sound: ${toggleSound() ? 'on' : 'off'}`; });
  $('cm-export').addEventListener('click', async () => {
    $('overlay-cmenu').hidden = true;
    openCode('export');
    $('code-box').value = 'Working...';
    $('code-box').value = await exportCode(ui.cm);
    $('code-box').select();
  });
  $('cm-import').addEventListener('click', () => { $('overlay-cmenu').hidden = true; openCode('import'); });
  function openCode(mode) {
    ui.codeMode = mode;
    $('code-title').textContent = mode === 'export' ? 'Save as a code' : 'Load from a code';
    $('code-text').textContent = mode === 'export' ? 'Copy this code and keep it somewhere safe (notes, a message to yourself). Paste it into "Load a campaign from a code" on any device to carry on.' : 'Paste a war code. It replaces the war saved in this browser.';
    $('code-go').textContent = mode === 'export' ? 'Copy' : 'Load';
    $('code-box').value = '';
    $('code-box').readOnly = mode === 'export';
    $('code-msg').textContent = '';
    $('overlay-code').hidden = false;
  }
  $('code-go').addEventListener('click', async () => {
    if (ui.codeMode === 'export') {
      try { await navigator.clipboard.writeText($('code-box').value); $('code-msg').textContent = 'Copied.'; } catch { $('code-box').select(); $('code-msg').textContent = 'Select the code and copy it.'; }
      return;
    }
    try {
      const cm = await importCode($('code-box').value);
      $('overlay-code').hidden = true;
      $('overlay-start').hidden = true;
      open(cm);
      saveCampaign(cm);
      toastMsg('War loaded', `Turn ${Math.min(cm.state.turn, cm.state.finalTurn)} of ${cm.state.finalTurn}.`);
    } catch (e) {
      $('code-msg').textContent = e.message || 'That code could not be read.';
    }
  });

  // ---- Showing and hiding --------------------------------------------------------
  function show() { $('campaign').hidden = false; resize(); }
  function hide() { $('campaign').hidden = true; }

  function open(cm) {
    ui.cm = cm;
    ui.selected = null;
    ui.province = null;
    ui.busy = false;
    ui.waiting = null;
    ui.wm = createWarmap(cm.state);
    Object.assign(ui.cam, createCamera(ui.wm.CW, ui.wm.CH), { canRotate: true });
    ui.viewTall = null;
    $('cp-sheet').hidden = true;
    $('cp-shade').hidden = true;
    show();
    defaultView();
    renderAll();
    const s = cm.state;
    if (s.phase === 'over') showVictory();
    else if (s.phase === 'battle') {
      // Saved mid-battle: settle it in the background.
      (ui.resolver || (ui.resolver = createResolver())).run(s.battle).then((r) => { finishBattle(s.battle, r); });
    } else if (s.active !== s.playerSide) enemyTurn();
  }

  function newCampaign(seed, turns) {
    const cm = createCampaignMatch(seed, { turns });
    open(cm);
    saveCampaign(cm);
    if (!localStorage.getItem('kz.seenWarHelp')) {
      try { localStorage.setItem('kz.seenWarHelp', '1'); } catch { /* private mode */ }
      $('overlay-chelp').hidden = false;
    }
  }

  function draw(now) {
    if (!ui.cm || $('campaign').hidden) return false;
    const s = st();
    const sel = ui.selected && armyById(s, ui.selected);
    const orders = sel && sel.side === P() && !ui.busy && !sheetOpen() ? ordersFor(s, sel) : [];
    // Where the enemy can strike next: our provinces next to their armies.
    const threats = new Set();
    for (const a of s.armies) if (a.side !== P()) for (const n of s.provinces[a.at].neighbours) if (s.provinces[n].owner === P()) threats.add(n);
    drawWarmap(g, ui.wm, s, ui.cam, { dpr: ui.dpr, now, selected: ui.selected, province: ui.province, orders, threats, objective: s.objective ? s.objective.targets : [], playerSide: P() });
    return true;
  }

  return { debug: ui, open, newCampaign, openImport: () => openCode('import'), draw, show, hide, visible: () => !$('campaign').hidden, get cm() { return ui.cm; } };
}
