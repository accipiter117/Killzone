// Turn-based battle controls: picking a platoon or the tank, the tiles it
// can reach, hit chances over the enemies it can shoot, the unit panel
// (actions, overwatch, grenades), the shot preview, End turn, and the
// Helghast turn played out a unit at a time. The rules live in
// src/tactics/tactics.js; this module only reads them, draws and asks.

import {
  reachable, unitAt, unitById, liveUnits, shotOdds, hitEffect, visibleTo, strength, soldiersLeft, coverOf,
  moveUnit, fireUnit, grenadeUnit, overwatchUnit, endTurn, aiStep,
} from '../tactics/tactics.js';
import { toScreen } from '../render/camera.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createTacticsUI({ toast, player = 0 }) {
  const ui = { sel: null, preview: null, grenade: false, busy: false, state: null, watch: false, run: 0 };

  function reset(state, { watch = false } = {}) {
    ui.state = state;
    ui.sel = null; ui.preview = null; ui.grenade = false; ui.busy = false; ui.watch = watch;
    ui.run++;
    render();
    if (watch || state.tb.active !== player) playAI();
  }

  const tileOf = (w) => ({ tx: Math.floor(w.x / ui.state.tb.c.tile), ty: Math.floor(w.y / ui.state.tb.c.tile) });

  // A tap on the battlefield (world point). True when it was handled.
  function tap(w) {
    const s = ui.state;
    if (!s || !s.tb || s.result || ui.busy || ui.watch || s.tb.active !== player) return true;
    const { tx, ty } = tileOf(w);
    const u = unitAt(s.tb, tx, ty);
    const sel = ui.sel && unitById(s.tb, ui.sel);
    if (u && u.side === player) { select(ui.sel === u.id ? null : u.id); return true; }
    if (u && sel && sel.ap > 0) {
      if (ui.grenade) { ui.preview = { target: u.id, grenade: true }; render(); return true; }
      if (visibleTo(s, player, u) && shotOdds(s, sel, u)) { ui.preview = { target: u.id }; render(); return true; }
      toast('No clear shot', 'Out of range, or something blocks the line of fire.', true);
      return true;
    }
    if (sel && sel.ap > 0) {
      const cost = reachable(s, sel).get(`${tx},${ty}`);
      if (cost) {
        const r = moveUnit(s, sel.id, tx, ty);
        if (r.ok) {
          const cov = coverOf(s, tx, ty);
          toast(`${sel.name} ${cost === 2 ? 'dashes' : 'moves'}`, cov.level ? `${cov.level === 2 ? 'Full' : 'Half'} cover here (${cov.name}).` : 'No cover here.');
          if (sel.ap <= 0 || sel.out) ui.sel = null;
        }
        render();
        return true;
      }
    }
    select(null);
    return true;
  }

  function select(id) {
    ui.sel = id; ui.preview = null; ui.grenade = false;
    render();
  }

  // ---- The panel -------------------------------------------------------------------
  function render() {
    const s = ui.state;
    if (!s || !s.tb) return;
    const tb = s.tb;
    const myTurn = tb.active === player && !ui.busy && !ui.watch && !s.result;
    $('tb-turn').textContent = `TURN ${Math.min(tb.turn, tb.c.turns)}/${tb.c.turns}`;
    $('tb-phase').textContent = ui.watch ? 'WATCHING' : tb.active === player ? 'YOUR TURN' : 'HELGHAST TURN';
    $('tb-phase').className = tb.active === player ? 'isa' : 'hgh';
    $('tb-end').disabled = !myTurn;
    const body = $('tb-body'), btns = $('tb-btns');
    btns.innerHTML = '';
    const button = (label, cls, fn, disabled = false) => {
      const b = document.createElement('button');
      b.innerHTML = label;
      if (cls) b.className = cls;
      b.disabled = disabled;
      b.addEventListener('click', () => { fn(); });
      btns.appendChild(b);
    };
    const sel = ui.sel && unitById(tb, ui.sel);
    if (ui.preview && sel) {
      const t = unitById(tb, ui.preview.target);
      const who = `${t.side === 0 ? '' : 'Helghast '}${t.name}`;
      if (ui.preview.grenade) {
        const inRange = Math.hypot(t.tx - sel.tx, t.ty - sel.ty) <= tb.c.grenade.range + 0.01;
        body.innerHTML = `<b class="tb-title">Grenades: ${esc(who)}</b><div class="tb-big">${inRange ? '100%' : 'Too far'}</div><div class="tb-line">Always lands and ignores cover.</div><div class="tb-fx">${tb.c.grenade.kills} soldiers, and pins them. One action.</div>`;
        button('Throw', 'red', () => act(grenadeUnit(s, sel.id, t.id)), !inRange);
      } else {
        const o = shotOdds(s, sel, t);
        const fx = hitEffect(s, sel, t);
        body.innerHTML = `<b class="tb-title">${esc(who)}</b><div class="tb-big">${o.chance}%</div><div class="tb-sub">to hit</div>${o.lines.map((l) => `<div class="tb-line">${esc(l)}</div>`).join('')}<div class="tb-fx">Hit: ${esc(fx.text)}. Miss: they are pinned.</div>`;
        button('Fire (ends its turn)', 'red', () => act(fireUnit(s, sel.id, t.id)));
      }
      button('Cancel', '', () => { ui.preview = null; ui.grenade = false; render(); });
    } else if (sel) {
      const cov = coverOf(s, sel.tx, sel.ty);
      const n = sel.kind === 'tank' ? `Armour ${Math.round(strength(s, sel) * 100)}%` : `${soldiersLeft(s, sel)} soldiers`;
      const pips = Array.from({ length: tb.c.ap }, (_, i) => `<i class="${i < sel.ap ? 'on' : ''}"></i>`).join('');
      const gReady = sel.kind === 'platoon' && tb.turn >= sel.grenadeReady;
      body.innerHTML = `<b class="tb-title">${esc(sel.name)}</b><div class="tb-sub">${n}</div><div class="tb-ap">${pips}<span>actions</span></div>
        <div class="tb-line">${sel.ow ? 'On overwatch. ' : ''}${sel.pinned ? 'Pinned. ' : ''}${cov.level ? `${cov.level === 2 ? 'Full' : 'Half'} cover (${esc(cov.name)}).` : 'In the open.'}</div>
        <div class="tb-hint">${sel.ap > 0 ? (ui.grenade ? 'Tap an enemy platoon within 2 tiles.' : 'Blue: move (1 action). Amber: dash (2). Tap a marked enemy to fire.') : 'No actions left this turn.'}</div>`;
      if (myTurn && sel.ap > 0) {
        if (sel.kind === 'platoon') button(ui.grenade ? 'Cancel grenade' : gReady ? 'Grenades (1 action)' : `Grenades: turn ${sel.grenadeReady}`, '', () => { ui.grenade = !ui.grenade; render(); }, !gReady);
        button('Overwatch', '', () => act(overwatchUnit(s, sel.id), `${sel.name} on overwatch: it fires at the first enemy to move in its sights.`));
      }
      button('Done', '', () => select(null));
    } else {
      const left = liveUnits(tb, player).filter((u) => u.ap > 0).length;
      body.innerHTML = `<b class="tb-title">${ui.watch ? 'Watching' : tb.active === player ? 'Your turn' : 'Helghast turn'}</b>
        <div class="tb-line">${s.result ? 'The battle is over.' : tb.active !== player || ui.watch ? 'Watch them move. Your overwatch fires on its own.' : left ? `${left} unit${left === 1 ? '' : 's'} can still act. Tap a platoon, its chip, or the tank.` : 'Everyone has acted: end the turn.'}</div>
        <div class="tb-sub">Objectives score ${tb.c.objectivePoints} points a round. Points: <b class="isa-text">${tb.points[0]}</b> to <b class="hgh-text">${tb.points[1]}</b>.</div>`;
    }
  }

  function act(r, msg) {
    if (!r.ok) { toast('Order refused', r.reason, true); return; }
    if (msg) toast(msg);
    const sel = ui.sel && unitById(ui.state.tb, ui.sel);
    ui.preview = null; ui.grenade = false;
    if (!sel || sel.ap <= 0 || sel.out) ui.sel = null;
    render();
  }

  $('tb-end').addEventListener('click', async () => {
    const s = ui.state;
    if (!s || ui.busy || s.tb.active !== player || s.result) return;
    ui.sel = null; ui.preview = null; ui.grenade = false;
    endTurn(s);
    render();
    playAI();
  });

  // The AI's turn (or both sides, watching), one unit at a time.
  async function playAI() {
    const s = ui.state, run = ui.run;
    ui.busy = true;
    render();
    await sleep(500);
    while (run === ui.run && !s.result && (ui.watch || s.tb.active !== player)) {
      const side = s.tb.active;
      const lines = aiStep(s, side);
      if (run !== ui.run) return;
      if (lines === null) { endTurn(s); render(); await sleep(600); continue; }
      render();
      await sleep(lines.length ? 1100 : 500);
    }
    if (run !== ui.run) return;
    ui.busy = false;
    render();
    if (!s.result) toast(`Turn ${s.tb.turn}: your move`, 'Pinned units have one action this turn.');
  }

  // Select by chip: platoon index (0 to 2) or the tank (3).
  function selectCard(i) {
    const s = ui.state;
    if (!s || ui.busy || ui.watch) return;
    const tb = s.tb;
    const u = i === 3 ? tb.units.find((x) => x.side === player && x.kind === 'tank' && !x.out) : tb.units.find((x) => x.side === player && x.kind === 'platoon' && !x.out && s.platoons[x.pl].index === i);
    if (u) select(ui.sel === u.id ? null : u.id);
  }

  // ---- Drawing over the battlefield (screen space) ------------------------------------
  function draw(g, cam, dpr, now) {
    const s = ui.state;
    if (!s || !s.tb) return;
    const tb = s.tb, t = tb.c.tile;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const quad = (tx, ty, inset = 0) => {
      const a = toScreen(cam, tx * t + inset, ty * t + inset), b = toScreen(cam, (tx + 1) * t - inset, ty * t + inset);
      const c = toScreen(cam, (tx + 1) * t - inset, (ty + 1) * t - inset), d = toScreen(cam, tx * t + inset, (ty + 1) * t - inset);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath();
    };
    const sel = ui.sel && unitById(tb, ui.sel);
    const myTurn = tb.active === player && !ui.busy && !ui.watch && !s.result;
    if (sel && myTurn && sel.ap > 0 && !ui.preview && !ui.grenade) {
      for (const [k, cost] of reachable(s, sel)) {
        const [x, y] = k.split(',').map(Number);
        quad(x, y, 4);
        g.fillStyle = cost === 1 ? 'rgba(100,170,255,0.22)' : 'rgba(232,180,60,0.18)';
        g.fill();
        g.strokeStyle = cost === 1 ? 'rgba(140,195,255,0.75)' : 'rgba(240,200,100,0.7)';
        g.lineWidth = 1.5; g.stroke();
      }
    }
    const pulse = 0.5 + 0.5 * Math.sin(now * 5);
    for (const u of liveUnits(tb)) {
      const seen = u.side === player || ui.watch || visibleTo(s, player, u);
      if (!seen) continue;
      quad(u.tx, u.ty, 2);
      g.lineWidth = u.id === ui.sel ? 3 : 1.6;
      g.strokeStyle = u.id === ui.sel ? `rgba(232,192,74,${0.6 + 0.4 * pulse})` : u.side === 0 ? 'rgba(127,182,255,0.75)' : 'rgba(255,138,82,0.75)';
      g.setLineDash(u.side === player ? [] : [6, 4]);
      g.stroke();
      g.setLineDash([]);
      const c = toScreen(cam, (u.tx + 0.5) * t, u.ty * t + 6);
      // Action pips, overwatch and pinned markers.
      if (u.side === tb.active && !s.result) {
        for (let i = 0; i < tb.c.ap; i++) {
          g.fillStyle = i < u.ap ? '#e8c04a' : 'rgba(236,230,214,0.25)';
          g.beginPath(); g.arc(c.x - 6 + i * 12, c.y, 4, 0, Math.PI * 2); g.fill();
        }
      }
      if (u.ow) { g.strokeStyle = '#e8c04a'; g.lineWidth = 2; g.beginPath(); g.ellipse(c.x + 22, c.y, 7, 4.5, 0, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#e8c04a'; g.beginPath(); g.arc(c.x + 22, c.y, 2, 0, Math.PI * 2); g.fill(); }
      if (u.pinned) { g.font = '700 10px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ff8a80'; g.fillText('PINNED', c.x, c.y + 14); }
      // Hit chance over enemies the selected unit can shoot.
      if (sel && myTurn && sel.ap > 0 && u.side !== player && !ui.preview) {
        const near = Math.hypot(u.tx - sel.tx, u.ty - sel.ty);
        const text = ui.grenade ? (u.kind === 'platoon' && near <= tb.c.grenade.range + 0.01 ? '100%' : null) : (() => { const o = shotOdds(s, sel, u); return o ? `${o.chance}%` : null; })();
        if (text) {
          const p = toScreen(cam, (u.tx + 0.5) * t, (u.ty + 0.5) * t);
          g.font = '700 13px Oswald, system-ui, sans-serif';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          const w = g.measureText(text).width + 14;
          const good = ui.grenade || parseInt(text, 10) >= 50;
          g.fillStyle = good ? '#d8432a' : '#7e2a1c';
          g.beginPath(); g.roundRect ? g.roundRect(p.x - w / 2, p.y - 11, w, 22, 11) : g.rect(p.x - w / 2, p.y - 11, w, 22); g.fill();
          g.fillStyle = good ? '#fff' : '#ffd9cc';
          g.fillText(text, p.x, p.y + 0.5);
        }
      }
    }
  }

  return { reset, tap, draw, render, selectCard, get selected() { return ui.sel; }, debug: ui };
}
