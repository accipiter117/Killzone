// The campaign screens: the war map, the planning tray, the battle queue,
// results with replays, the night's dispatches and the end of the war.
// Every change to the campaign goes through issueCampaign (and so through
// applyCampaignCommand); this module only reads the state and draws it.

import { CONFIG, SIDE_NAMES, SITE_RULES } from '../config.js';
import { createCampaignMatch, issueCampaign, aiPlan } from '../campaign/match.js';
import { reachable, attackable, strengthOf, sectorOwner, incomeFor, siteValue } from '../campaign/state.js';
import { saveCampaign, exportCode, importCode } from '../campaign/save.js';
import { createResolver } from '../campaign/resolver.js';
import { createCamera, setViewport, toWorld, centreOn } from '../render/camera.js';
import { createWarmap, drawWarmap, pick, SITE_LABEL } from '../render/warmap.js';
import { attachMapInput } from './input.js';

const $ = (id) => document.getElementById(id);
const KIT_NAME = { trenches: 'Trenches', industrial: 'Industrial site', city: 'Ruined city' };
const RES = [['manpower', 'Manpower', 'Refills squads; raises platoons'], ['materiel', 'Materiel', 'Digs trenches; raises platoons'], ['power', 'Power', 'Artillery in battle; raises platoons']];
const roleName = (r) => CONFIG.roles[r]?.label || r;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const costText = (cost) => Object.entries(cost).map(([k, v]) => `${v} ${k}`).join(', ');

export function createCampaignUI({ fightBattle, watchReplay, toMenu, toggleSound, soundOn }) {
  const canvas = $('warmap');
  const g = canvas.getContext('2d');
  const ui = {
    cm: null, wm: null, cam: null, dpr: 1, selected: null, sector: null,
    resolving: new Set(), handed: new Set(), histFrom: 0, nightFrom: 1, resolver: null, overlay: null, toastTimer: 0,
  };
  const st = () => ui.cm.state;
  const P = () => st().playerSide;

  // ---- Screen and input --------------------------------------------------------
  function resize() {
    if (!ui.cam) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    ui.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * ui.dpr);
    canvas.height = Math.round(h * ui.dpr);
    setViewport(ui.cam, w, h);
    // Turning the phone resets to the default view for that way up.
    if (ui.cm && (h > w) !== ui.viewTall) defaultView();
  }

  // The default view: the whole map, filling the screen. On an upright
  // phone the map is turned so it runs top to bottom, with your (ISA) side
  // at the bottom; on a sideways phone it lies flat. Twisting two fingers
  // still turns it any way you like.
  function defaultView() {
    const c = ui.cam;
    const tall = c.vh > c.vw;
    ui.viewTall = tall;
    c.rot = tall ? Math.PI * 1.5 : 0;
    const z = tall ? Math.min(c.vw / c.H, c.vh / c.W) : Math.min(c.vw / c.W, c.vh / c.H);
    c.z = Math.max(c.minZ, Math.min(c.maxZ, z));
    centreOn(c, c.W / 2, c.H / 2);
  }
  new ResizeObserver(resize).observe(canvas);

  function onTap(sx, sy) {
    if (!ui.cm) return;
    const s = st();
    const hit = pick(ui.wm, s, ui.cam, sx, sy, toWorld);
    if (!hit) { deselect(); return; }
    const sel = ui.selected && s.platoons.find((p) => p.id === ui.selected);
    if (hit.platoon) {
      const pl = s.platoons.find((p) => p.id === hit.platoon);
      // Tapping an enemy platoon next to the chosen one attacks it.
      if (sel && s.phase === 'plan' && pl.side !== P() && attackable(s, sel).includes(pl.sector) && canAct(sel)) { attack(sel, pl.sector); return; }
      if (pl.side === P() && ui.selected === pl.id) { deselect(); return; }
      ui.selected = pl.id;
      ui.sector = null;
      renderTray();
      return;
    }
    if (sel && s.phase === 'plan' && canAct(sel)) {
      if (attackable(s, sel).includes(hit.sector) && !(hit.sector === sel.sector && !hasEnemyIn(hit.sector))) { attack(sel, hit.sector); return; }
      if (moveTargets(sel).has(hit.sector)) {
        if (issue('move', { platoon: sel.id, sector: hit.sector })) { toastMsg(`${sel.sergeant}'s platoon moves to the ${s.sectors[hit.sector].region}.`); }
        renderTray();
        return;
      }
    }
    ui.selected = null;
    ui.sector = hit.sector;
    renderTray();
  }
  // One camera for the life of the page (the map input holds on to it); a
  // new campaign resets it in place.
  ui.cam = createCamera(1, 1);
  ui.cam.canRotate = true;
  attachMapInput(canvas, ui.cam, {
    onTap,
    onLongPress(sx, sy) {
      const hit = ui.cm && pick(ui.wm, st(), ui.cam, sx, sy, toWorld);
      if (hit && hit.sector != null) { ui.selected = null; ui.sector = hit.sector; renderTray(); }
    },
  });

  function hasEnemyIn(sector) {
    const s = st();
    for (let i = 0; i < s.sector.length; i++) if (s.sector[i] === sector && s.owner[i] !== P()) return true;
    return false;
  }
  const canAct = (pl) => pl.side === P() && !(pl.order && pl.order.type === 'move') && !st().ended[P()];
  function moveTargets(pl) {
    if (pl.side !== P() || pl.order || st().ended[P()]) return new Set();
    return new Set(reachable(st(), pl).keys());
  }
  function attack(pl, sector) {
    const s = st();
    if (!issue('attack', { platoon: pl.id, sector })) return;
    // The first attack of the round becomes the key battle (the one you fight).
    if (s.key == null) issue('key', { sector });
    toastMsg(`${pl.sergeant}'s platoon will attack the ${s.sectors[sector].region}.`, s.key === sector ? 'Key battle: you will fight this one yourself.' : '');
    renderTray();
  }
  function deselect() {
    ui.selected = null;
    ui.sector = null;
    renderTray();
  }

  // ---- Orders --------------------------------------------------------------------
  function issue(type, params) {
    const res = issueCampaign(ui.cm, { side: P(), type, params });
    if (!res.ok) toastMsg('Order refused', res.reason, true);
    else saveCampaign(ui.cm);
    renderHud();
    return res.ok;
  }

  function toastMsg(title, body = '', bad = false) {
    const t = $('cp-toast');
    t.innerHTML = `<b>${esc(title)}</b>${body ? esc(body) : ''}`;
    t.classList.toggle('bad', bad);
    t.hidden = false;
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 3200 : 2400);
  }

  // ---- Top bar and hint ------------------------------------------------------------
  function renderHud() {
    const s = st();
    const p = P();
    $('cp-when').innerHTML = `<b>Night ${Math.min(s.night, s.finalNight)}</b><small>of ${s.finalNight}, round ${s.round} of ${s.cc.roundsPerNight}</small>`;
    const inc = incomeFor(s, p);
    $('cp-res').innerHTML = RES.map(([k, label, tip]) => `<span class="res res-${k}" title="${tip}"><i></i><b>${s.res[p][k]}</b><small>${label} +${inc[k]}</small></span>`).join('')
      + `<span class="res res-val" title="Total value of the sites each side holds"><span><b class="isa">${siteValue(s, 0)}</b> : <b class="hgh">${siteValue(s, 1)}</b></span><small>Site value</small></span>`;
    const planning = s.phase === 'plan' && !s.ended[p];
    $('cp-end').disabled = !planning;
    $('cp-recruit').disabled = !planning;
    const own = s.platoons.filter((x) => x.side === p);
    const idle = own.filter((x) => !x.order && strengthOf(x) >= s.cc.minStrength).length;
    let hint = '';
    if (s.phase === 'over') hint = s.winReason || '';
    else if (s.phase !== 'plan') hint = 'Battles are being fought...';
    else if (ui.selected) {
      const pl = s.platoons.find((x) => x.id === ui.selected);
      if (pl && pl.side === p) hint = pl.order && pl.order.type === 'move' ? 'This platoon has moved this round.' : 'Tap a pale sector to move, or a red one to attack.';
    } else hint = idle ? `${idle} platoon${idle === 1 ? '' : 's'} without orders. Tap a numbered chip to give orders.` : 'Every platoon has orders. Press End planning when ready.';
    $('cp-hint').innerHTML = hint ? `<span>${esc(hint)}</span>` : '';
  }

  // ---- The tray: a platoon or a sector ----------------------------------------------
  function renderTray() {
    renderHud();
    const s = st();
    const tray = $('cp-tray');
    const body = $('cp-tray-body'), btns = $('cp-tray-btns');
    btns.innerHTML = '';
    const button = (label, sub, fn, disabled = false, cls = '') => {
      const b = document.createElement('button');
      b.innerHTML = `${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
      b.disabled = disabled;
      if (cls) b.className = cls;
      b.addEventListener('click', fn);
      btns.appendChild(b);
    };
    const planning = s.phase === 'plan' && !s.ended[P()];
    const pl = ui.selected && s.platoons.find((x) => x.id === ui.selected);
    if (pl) {
      const mine = pl.side === P();
      $('cp-tray-title').textContent = `${SIDE_NAMES[pl.side]} platoon ${pl.id.split('-')[1]}: ${pl.sergeant}`;
      const squads = pl.roles.map((r, i) => `<span class="sq${pl.alive[i] === 0 ? ' gone' : ''}">${esc(roleName(r))} <b>${pl.alive[i]}/5</b></span>`).join('');
      const where = s.sectors[pl.sector];
      let status = pl.cut ? '<span class="bad">Cut off from supply: loses soldiers every round</span>' : 'In supply';
      let order = 'No orders (holds its ground)';
      if (pl.order && pl.order.type === 'move') order = 'Moved this round';
      if (pl.order && pl.order.type === 'attack') order = `Attacking the ${s.sectors[pl.order.sector].region}${s.key === pl.order.sector ? ' (key battle)' : ''}`;
      if (strengthOf(pl) < s.cc.minStrength) order += ' (too weak to attack)';
      body.innerHTML = `<div class="sqs">${squads}</div><div class="meta">${esc(where.region)} (${esc(KIT_NAME[where.kit])}). ${status}. ${mine ? esc(order) + '.' : ''} Battles ${pl.battles}, won ${pl.wins}.</div>`;
      if (mine && planning) {
        const missing = pl.alive.reduce((a, n) => a + (5 - n), 0);
        const per = s.cc.costs.refillPerSoldier.manpower;
        button('Refill', missing ? `${missing * per} manpower` : 'full', () => { if (issue('refill', { platoon: pl.id })) toastMsg('Refilled', `${pl.sergeant}'s squads are back up to ${pl.alive.join('/')}.`); renderTray(); }, !missing || pl.cut);
        if (pl.order && pl.order.type === 'attack') {
          const t = pl.order.sector;
          button(s.key === t ? 'Key battle ★' : 'Make key battle', s.key === t ? 'you fight it' : 'fight it yourself', () => { issue('key', { sector: s.key === t ? null : t }); renderTray(); }, false, s.key === t ? 'on' : '');
          button('Call off', 'stay put', () => { issue('hold', { platoon: pl.id }); renderTray(); });
        }
      }
    } else if (ui.sector != null && ui.sector >= 0) {
      const sec = s.sectors[ui.sector];
      const owner = sectorOwner(s, ui.sector);
      $('cp-tray-title').textContent = `${sec.region} (${SIDE_NAMES[owner]})`;
      const sites = s.sites.filter((x) => x.sector === ui.sector);
      const siteHtml = sites.map((x) => `<div class="site"><b>${esc(x.name)}</b>: ${esc(SITE_LABEL[x.kind])}, held by ${SIDE_NAMES[x.owner]}${x.connected ? '' : ' <span class="bad">(cut off: no bonus)</span>'}${x.maxDefence ? `, defences ${x.defence}/${x.maxDefence}` : ''}.<br><small>${esc(SITE_RULES[x.kind][1])}</small></div>`).join('');
      const here = s.platoons.filter((x) => x.sector === ui.sector);
      body.innerHTML = `<div class="meta">Battles here are fought on: <b>${esc(KIT_NAME[sec.kit])}</b>. ${here.length ? `Platoons: ${here.map((x) => `${SIDE_NAMES[x.side]} ${x.id.split('-')[1]}`).join(', ')}.` : 'No platoons.'}</div>${siteHtml}`;
      if (owner === P() && planning) {
        const dug = !!s.fort[`${ui.sector}:${P()}`];
        button(dug ? 'Dug in' : 'Dig in', dug ? 'this round' : `${s.cc.costs.fortify.materiel} materiel`, () => { if (issue('fortify', { sector: ui.sector })) toastMsg('Digging in', 'Defenders here fight from extra trenches this round.'); renderTray(); }, dug);
        if (here.some((x) => x.side === P())) {
          const on = s.key === ui.sector;
          button(on ? 'Key battle ★' : 'Fight here if attacked', on ? 'you fight it' : 'make it your key battle', () => { issue('key', { sector: on ? null : ui.sector }); renderTray(); }, false, on ? 'on' : '');
        }
      }
    } else {
      tray.hidden = true;
      return;
    }
    tray.hidden = false;
  }
  $('cp-tray-close').addEventListener('click', deselect);

  // ---- Recruiting --------------------------------------------------------------------
  $('cp-recruit').addEventListener('click', () => {
    const s = st();
    const own = s.platoons.filter((x) => x.side === P()).length;
    $('rc-cost').textContent = `Costs ${costText(s.cc.costs.recruit)}. You have ${costText(s.res[P()])}. Platoons: ${own} of ${s.cc.maxPlatoons}. New platoons start at your capital.`;
    const list = $('rc-list');
    list.innerHTML = '';
    s.cc.templates.forEach((roles, i) => {
      const b = document.createElement('button');
      b.textContent = roles.map(roleName).join(', ');
      b.addEventListener('click', () => {
        $('overlay-recruit').hidden = true;
        if (issue('recruit', { template: i, group: own % 2 ? 'south' : 'north' })) toastMsg('Platoon raised', `${roles.map(roleName).join(', ')} at your capital.`);
        renderTray();
      });
      list.appendChild(b);
    });
    $('overlay-recruit').hidden = false;
  });

  // ---- End of planning and the battles ---------------------------------------------
  $('cp-end').addEventListener('click', () => {
    const s = st();
    if (s.phase !== 'plan' || s.ended[P()]) return;
    ui.histFrom = s.history.length;
    ui.nightFrom = s.night;
    ui.roundFrom = s.round;
    deselect();
    aiPlan(ui.cm, [1 - P()]);
    issue('endPlanning', {});
    afterChange();
  });

  // Where the campaign is now, decide what to show.
  function afterChange() {
    const s = st();
    saveCampaign(ui.cm);
    renderHud();
    if (s.phase === 'battles') { showBattles(); startResolving(); return; }
    if (s.history.length > ui.histFrom) { showResults(); return; }
    if (s.phase === 'over') showVictory();
  }

  function startResolving() {
    const s = st();
    if (!ui.resolver) ui.resolver = createResolver();
    for (const rec of s.battles) {
      if (rec.result || isKey(rec) || ui.resolving.has(rec.id)) continue;
      resolveOne(rec);
    }
  }
  // The key battle waits for the player, unless they hand it to the AI.
  const isKey = (rec) => rec.key && !ui.handed.has(rec.id);
  function resolveOne(rec) {
    ui.resolving.add(rec.id);
    const cm = ui.cm;
    ui.resolver.run(rec).then((r) => {
      ui.resolving.delete(rec.id);
      if (ui.cm !== cm) return; // a different campaign was loaded meanwhile
      const live = cm.state.battles.find((b) => b.id === rec.id);
      if (!live || live.result) return;
      issueCampaign(cm, { side: live.attacker, type: 'battleResult', params: { battle: live.id, result: r } });
      if (cm.state.phase === 'battles') { saveCampaign(cm); showBattles(); } else afterChange();
    });
  }

  function forcesText(rec, side) {
    const f = rec.forces[side];
    const n = f.platoons.length;
    // The full kit is normal; say only what is missing (and trenches dug).
    const extras = [!f.tank && 'no tank', !f.artillery && 'no artillery', !f.opBonus && 'no comms bonus', f.fortified && 'dug in'].filter(Boolean);
    return `${n} platoon${n === 1 ? '' : 's'}${extras.length ? ` (${extras.join(', ')})` : ''}`;
  }

  function battleRow(rec, extra = '') {
    const att = SIDE_NAMES[rec.attacker];
    const what = rec.meeting ? 'Meeting engagement' : `${att} attack`;
    let status;
    if (rec.result) {
      const r = rec.result;
      status = r.walkover ? `${SIDE_NAMES[r.winner]} walk in unopposed` : r.winner == null ? 'Stalemate' : `${SIDE_NAMES[r.winner]} won (${r.margin})`;
    } else status = isKey(rec) ? 'Waiting for you' : ui.resolving.has(rec.id) ? 'Being fought...' : 'Waiting';
    const won = rec.result && rec.result.winner != null ? (rec.result.winner === P() ? ' won' : ' lost') : '';
    return `<div class="cb-row${isKey(rec) ? ' key' : ''}${won}"><div class="cb-head"><b>${esc(rec.sectorName)}</b><span>${esc(KIT_NAME[rec.mapType])}</span></div>
      <div class="cb-what">${esc(what)}: <span class="isa-text">ISA ${esc(forcesText(rec, 0))}</span> v <span class="hgh-text">Helghast ${esc(forcesText(rec, 1))}</span></div>
      <div class="cb-status">${isKey(rec) && !rec.result ? '★ ' : ''}${esc(status)}</div>${extra}</div>`;
  }

  function showBattles() {
    const s = st();
    ui.overlay = 'battles';
    $('cb-title').textContent = `Night ${s.night}, round ${s.round}: the battles`;
    const key = s.battles.find((b) => isKey(b) && !b.result);
    const left = s.battles.filter((b) => !b.result).length;
    $('cb-sub').textContent = key ? 'Fight your key battle yourself; the AI fights the rest for both sides.' : left ? 'The AI is fighting these out for both sides.' : '';
    $('cb-list').innerHTML = s.battles.map((b) => battleRow(b)).join('') || '<p class="small">No battles this round.</p>';
    const btns = $('cb-btns');
    btns.innerHTML = '';
    if (key) {
      const fight = document.createElement('button');
      fight.className = 'primary';
      fight.textContent = `Fight the key battle (${key.sectorName})`;
      fight.addEventListener('click', () => {
        $('overlay-cbattles').hidden = true;
        hide();
        fightBattle(key, { onEnd: (result, log) => backFromKey(key.id, result, log) });
      });
      const auto = document.createElement('button');
      auto.textContent = 'Let the AI fight it';
      auto.addEventListener('click', () => { ui.handed.add(key.id); startResolving(); showBattles(); });
      btns.append(fight, auto);
    }
    $('overlay-cbattles').hidden = false;
  }

  function backFromKey(id, result, log) {
    show();
    const s = st();
    const rec = s.battles.find((b) => b.id === id);
    if (!rec || rec.result) { afterChange(); return; }
    if (!result) { ui.handed.add(id); showBattles(); startResolving(); return; }
    issueCampaign(ui.cm, { side: P(), type: 'battleResult', params: { battle: id, result: { ...result, log }, log } });
    if (st().phase === 'battles') { saveCampaign(ui.cm); showBattles(); startResolving(); } else afterChange();
  }

  function showResults() {
    const s = st();
    ui.overlay = 'results';
    const recs = s.history.slice(ui.histFrom);
    $('cb-title').textContent = `Night ${ui.nightFrom}, round ${ui.roundFrom}: results`;
    const wins = recs.filter((r) => r.result.winner === P()).length;
    $('cb-sub').textContent = recs.length ? `${SIDE_NAMES[P()]} won ${wins} of ${recs.length}.` : 'No battles were fought.';
    $('cb-list').innerHTML = recs.map((rec, i) => {
      const changes = (rec.changes || []).map((c) => `<li>${esc(c)}</li>`).join('');
      const replay = rec.result.walkover || !rec.log ? '' : `<button class="cb-replay" data-i="${i}">Replay</button>`;
      return battleRow(rec, `${changes ? `<ul class="cb-changes">${changes}</ul>` : ''}${replay}`);
    }).join('');
    $('cb-list').querySelectorAll('.cb-replay').forEach((b) => b.addEventListener('click', () => {
      const rec = recs[Number(b.dataset.i)];
      $('overlay-cbattles').hidden = true;
      hide();
      watchReplay(rec, { onEnd: () => { show(); showResults(); } });
    }));
    const btns = $('cb-btns');
    btns.innerHTML = '';
    const go = document.createElement('button');
    go.className = 'primary';
    go.textContent = 'Continue';
    go.addEventListener('click', () => {
      const nightOver = s.phase === 'over' || s.night > ui.nightFrom;
      const night = ui.nightFrom;
      ui.histFrom = s.history.length;
      ui.nightFrom = s.night;
      ui.roundFrom = s.round;
      if (nightOver) showDispatches(night);
      else closeBattles();
    });
    btns.appendChild(go);
    $('overlay-cbattles').hidden = false;
  }

  function showDispatches(night) {
    const s = st();
    ui.overlay = 'dispatches';
    $('cb-title').textContent = `Dispatches: night ${night}`;
    const lines = s.dispatches[night - 1] || [];
    $('cb-sub').textContent = `Site value: ISA ${siteValue(s, 0)}, Helghast ${siteValue(s, 1)}.${s.phase === 'over' ? '' : ` Nights left: ${s.finalNight - s.night + 1}.`}`;
    $('cb-list').innerHTML = `<ul class="dispatch">${lines.map((l) => `<li>${esc(l)}</li>`).join('') || '<li>A quiet night on the front.</li>'}</ul>`;
    const btns = $('cb-btns');
    btns.innerHTML = '';
    const go = document.createElement('button');
    go.className = 'primary';
    go.textContent = s.phase === 'over' ? 'See how the war ended' : `On to night ${s.night}`;
    go.addEventListener('click', () => { if (s.phase === 'over') showVictory(); else closeBattles(); });
    btns.appendChild(go);
    $('overlay-cbattles').hidden = false;
  }

  function showVictory() {
    const s = st();
    ui.overlay = 'over';
    const won = s.winner === P();
    $('cb-title').textContent = won ? 'Victory: the war is won' : 'Defeat: the war is lost';
    $('cb-sub').textContent = s.winReason || '';
    const fought = s.history.filter((b) => !b.result.walkover);
    const mine = fought.filter((b) => b.result.winner === P()).length;
    $('cb-list').innerHTML = `<ul class="dispatch"><li>Nights fought: ${Math.min(s.night, s.finalNight)} of ${s.finalNight}.</li><li>Battles fought: ${fought.length} (${SIDE_NAMES[P()]} won ${mine}).</li><li>Site value at the end: ISA ${siteValue(s, 0)}, Helghast ${siteValue(s, 1)}.</li></ul>`;
    const btns = $('cb-btns');
    btns.innerHTML = '';
    const look = document.createElement('button');
    look.textContent = 'Look at the war map';
    look.addEventListener('click', closeBattles);
    const menu = document.createElement('button');
    menu.className = 'primary';
    menu.textContent = 'Main menu';
    menu.addEventListener('click', () => { closeBattles(); hide(); toMenu(); });
    btns.append(menu, look);
    $('overlay-cbattles').hidden = false;
  }

  function closeBattles() {
    ui.overlay = null;
    $('overlay-cbattles').hidden = true;
    renderTray();
  }

  // ---- Campaign menu and codes ------------------------------------------------------
  $('cp-menu').addEventListener('click', () => {
    const s = st();
    $('cm-info').textContent = `Campaign seed ${s.seed}. Night ${Math.min(s.night, s.finalNight)} of ${s.finalNight}. ${s.history.filter((b) => !b.result.walkover).length} battles fought so far.`;
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
    $('code-text').textContent = mode === 'export' ? 'Copy this code and keep it somewhere safe (notes, a message to yourself). Paste it into "Load a campaign from a code" on any device to carry on.' : 'Paste a campaign code. It replaces the campaign saved in this browser.';
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
      toastMsg('Campaign loaded', `Night ${Math.min(cm.state.night, cm.state.finalNight)} of ${cm.state.finalNight}.`);
    } catch (e) {
      $('code-msg').textContent = e.message || 'That code could not be read.';
    }
  });

  // ---- Showing and hiding --------------------------------------------------------
  function show() {
    $('campaign').hidden = false;
    resize();
  }
  function hide() { $('campaign').hidden = true; }

  function open(cm) {
    ui.cm = cm;
    ui.selected = null;
    ui.sector = null;
    ui.resolving = new Set();
    ui.handed = new Set();
    ui.wm = createWarmap(cm.state);
    Object.assign(ui.cam, createCamera(ui.wm.CW, ui.wm.CH), { canRotate: true });
    ui.viewTall = null;
    ui.histFrom = cm.state.history.length;
    ui.nightFrom = cm.state.night;
    ui.roundFrom = cm.state.round;
    show();
    defaultView();
    renderTray();
    if (cm.state.phase === 'battles') { showBattles(); startResolving(); } else if (cm.state.phase === 'over') showVictory();
  }

  function newCampaign(seed, nights) {
    const cm = createCampaignMatch(seed, { nights });
    open(cm);
    saveCampaign(cm);
    if (!localStorage.getItem('kz.seenCampaignHelp')) {
      try { localStorage.setItem('kz.seenCampaignHelp', '1'); } catch { /* private mode */ }
      $('overlay-chelp').hidden = false;
    }
  }

  function draw(now) {
    if (!ui.cm || $('campaign').hidden) return false;
    const s = st();
    const pl = ui.selected && s.platoons.find((x) => x.id === ui.selected);
    let move = null, att = null;
    if (pl && pl.side === P() && s.phase === 'plan' && !s.ended[P()]) {
      move = moveTargets(pl);
      att = canAct(pl) && strengthOf(pl) >= s.cc.minStrength ? attackable(s, pl).filter((x) => x !== pl.sector || hasEnemyIn(x)) : [];
      // Sectors you can attack are not move targets.
      for (const a of att) move.delete(a);
    }
    drawWarmap(g, ui.wm, s, ui.cam, { dpr: ui.dpr, now, selected: ui.selected, sector: ui.sector, move, attack: att, playerSide: P() });
    return true;
  }

  return { debug: ui, open, newCampaign, openImport: () => openCode('import'), draw, show, hide, visible: () => !$('campaign').hidden, get cm() { return ui.cm; } };
}
